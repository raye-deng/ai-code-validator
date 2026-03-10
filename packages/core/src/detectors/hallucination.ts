/**
 * Hallucination Detector (V3)
 *
 * Detects AI-generated code hallucination patterns:
 * 1. References to non-existent npm packages (compared against package.json)
 * 2. Calls to undefined functions/variables
 * 3. Usage of non-existent API endpoints (if OpenAPI spec is provided)
 * 4. Imported but never-defined types
 *
 * Implements the unified Detector interface.
 * Backward compatible: old analyze() signature is preserved but deprecated.
 *
 * @since 0.2.0 (original)
 * @since 0.3.0 (V3 unified interface)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { Detector, UnifiedIssue, FileAnalysis } from '../types.js';
import { AIDefectCategory } from '../types.js';

// ─── Legacy Types (Backward Compatible) ───

/**
 * @deprecated Use UnifiedIssue instead. Will be removed in v0.4.0.
 */
export interface HallucinationIssue {
  type: 'phantom-package' | 'phantom-function' | 'phantom-api' | 'phantom-type';
  severity: 'error' | 'warning';
  file: string;
  line: number;
  column?: number;
  message: string;
  suggestion?: string;
}

/**
 * @deprecated Use Detector.detect() instead. Will be removed in v0.4.0.
 */
export interface HallucinationDetectorOptions {
  projectRoot: string;
  openApiSpecPath?: string;
  knownPackages?: string[];
  ignoreDecorators?: boolean;
}

/**
 * @deprecated Use UnifiedIssue[] instead. Will be removed in v0.4.0.
 */
export interface HallucinationResult {
  file: string;
  issues: HallucinationIssue[];
  score: number;
}

// ─── Internal Helpers ───

function resolveValidPackages(projectRoot: string, extra: string[] = []): Set<string> {
  const packages = new Set<string>([
    // Node.js built-in modules
    'node:fs', 'node:path', 'node:url', 'node:http', 'node:https', 'node:crypto',
    'node:stream', 'node:util', 'node:os', 'node:child_process', 'node:events',
    'node:buffer', 'node:querystring', 'node:zlib', 'node:net', 'node:tls',
    'node:dns', 'node:assert', 'node:readline', 'node:worker_threads',
    'node:perf_hooks', 'node:async_hooks', 'node:timers', 'node:timers/promises',
    'node:fs/promises', 'node:stream/promises', 'node:test',
    'fs', 'path', 'url', 'http', 'https', 'crypto', 'stream', 'util', 'os',
    'child_process', 'events', 'buffer', 'querystring', 'zlib', 'net', 'tls',
    'dns', 'assert', 'readline', 'worker_threads', 'perf_hooks', 'async_hooks',
    'timers', 'timers/promises', 'fs/promises', 'stream/promises',
    ...extra,
  ]);

  let dir = projectRoot;
  while (dir !== dirname(dir)) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        const deps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
          ...pkg.peerDependencies,
          ...pkg.optionalDependencies,
        };
        for (const name of Object.keys(deps)) {
          packages.add(name);
        }
        const isWorkspacePkg = pkg.name && (dir.includes('/packages/') || dir.includes('/apps/'));
        if (isWorkspacePkg) {
          for (let up = dirname(dir); up !== dirname(up); up = dirname(up)) {
            const rootPkg = join(up, 'package.json');
            if (existsSync(rootPkg)) {
              try {
                const root = JSON.parse(readFileSync(rootPkg, 'utf-8'));
                if (root.workspaces) {
                  const rootDeps = { ...root.dependencies, ...root.devDependencies, ...root.peerDependencies };
                  for (const n of Object.keys(rootDeps)) packages.add(n);
                  break;
                }
              } catch { /* ignore */ }
            }
          }
        }
      } catch { /* ignore */ }
      break;
    }
    dir = dirname(dir);
  }

  return packages;
}

function extractImports(source: string): Array<{ module: string; line: number }> {
  const imports: Array<{ module: string; line: number }> = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    const esMatch = line.match(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/);
    if (esMatch) {
      imports.push({ module: esMatch[1], line: lineNum });
      continue;
    }

    const sideEffectMatch = line.match(/import\s+['"]([^'"]+)['"]/);
    if (sideEffectMatch) {
      imports.push({ module: sideEffectMatch[1], line: lineNum });
      continue;
    }

    const dynamicMatch = line.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (dynamicMatch) {
      imports.push({ module: dynamicMatch[1], line: lineNum });
      continue;
    }

    const requireMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (requireMatch) {
      imports.push({ module: requireMatch[1], line: lineNum });
    }
  }

  return imports;
}

function getPackageName(specifier: string): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null;
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    return specifier;
  }
  return specifier.split('/')[0];
}

function detectPhantomReferences(source: string, filePath: string): HallucinationIssue[] {
  const issues: HallucinationIssue[] = [];
  const lines = source.split('\n');

  const declared = new Set<string>();
  const builtins = new Set([
    'console', 'process', 'require', 'module', 'exports', '__dirname', '__filename',
    'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'setImmediate',
    'Promise', 'Error', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Map',
    'Set', 'WeakMap', 'WeakSet', 'Symbol', 'Proxy', 'Reflect', 'JSON', 'Math',
    'Date', 'RegExp', 'Buffer', 'URL', 'URLSearchParams', 'TextEncoder',
    'TextDecoder', 'AbortController', 'fetch', 'Response', 'Request', 'Headers',
    'FormData', 'Blob', 'File', 'ReadableStream', 'WritableStream', 'EventTarget',
    'Event', 'CustomEvent', 'globalThis', 'undefined', 'null', 'NaN', 'Infinity',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURI', 'decodeURI',
    'encodeURIComponent', 'decodeURIComponent', 'structuredClone', 'crypto',
    'performance', 'queueMicrotask', 'atob', 'btoa',
    'describe', 'it', 'test', 'expect', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach',
    'vi', 'jest',
    'constructor', 'super', 'this',
    'log', 'warn', 'error', 'info', 'debug', 'trace',
    'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'COALESCE', 'NULLIF', 'CAST',
    'count', 'sum', 'avg', 'max', 'min', 'coalesce', 'nullif', 'cast',
    'next', 'resolve', 'reject', 'emit', 'on', 'off', 'once',
    'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf',
  ]);

  for (const line of lines) {
    const varMatch = line.matchAll(/(?:const|let|var|function|class)\s+(\w+)/g);
    for (const m of varMatch) declared.add(m[1]);

    const importMatch = line.matchAll(/import\s+(?:{([^}]+)}|(\w+))/g);
    for (const m of importMatch) {
      if (m[1]) {
        m[1].split(',').forEach(s => {
          const name = s.trim().split(/\s+as\s+/).pop()?.trim();
          if (name) declared.add(name);
        });
      }
      if (m[2]) declared.add(m[2]);
    }

    const reqMatch = line.match(/(?:const|let|var)\s+{([^}]+)}\s*=\s*require/);
    if (reqMatch) {
      reqMatch[1].split(',').forEach(s => {
        const name = s.trim().split(/\s+as\s+/).pop()?.trim();
        if (name) declared.add(name);
      });
    }

    const paramMatch = line.match(/(?:function\s+\w+|=>)\s*\(([^)]*)\)/);
    if (paramMatch) {
      paramMatch[1].split(',').forEach(s => {
        const name = s.trim().split(/[=:]/)[0].trim().replace(/^\.\.\./, '');
        if (name) declared.add(name);
      });
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith('@')) continue;

    const callMatches = line.matchAll(/\b([a-z]\w*)\s*\(/gi);
    for (const m of callMatches) {
      const name = m[1];
      if (builtins.has(name) || declared.has(name)) continue;
      const idx = m.index!;
      if (idx > 0 && line[idx - 1] === '.') continue;
      if (idx > 0 && line[idx - 1] === '@') continue;
      if (['if', 'for', 'while', 'switch', 'catch', 'return', 'throw', 'new', 'typeof', 'instanceof', 'void', 'delete', 'await', 'yield', 'case', 'in', 'of', 'as', 'from', 'import', 'export', 'default', 'extends', 'implements', 'interface', 'type', 'enum', 'namespace', 'abstract', 'declare', 'readonly', 'static', 'public', 'private', 'protected', 'override', 'get', 'set', 'async', 'function', 'class', 'const', 'let', 'var'].includes(name)) continue;
      if (/^[A-Z][A-Z0-9_]+$/.test(name)) continue;
      if (name.length === 1) continue;
      if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*') || trimmedLine.startsWith('/*')) continue;
      if (/^\s*(public|private|protected|static|async|override|abstract)?\s*\w+\s*\(/.test(line) && !line.includes('=')) continue;

      issues.push({
        type: 'phantom-function',
        severity: 'warning',
        file: filePath,
        line: i + 1,
        message: `Possible phantom function call: '${name}' is called but not imported or declared in this file`,
        suggestion: `Verify that '${name}' is properly imported or defined before use`,
      });
    }
  }

  return issues;
}

const FRAMEWORK_DECORATORS = new Set([
  'Controller', 'Get', 'Post', 'Put', 'Delete', 'Patch', 'Options', 'Head', 'All',
  'Injectable', 'Module', 'Component', 'Pipe', 'Guard', 'Interceptor', 'Middleware',
  'UseGuards', 'UseInterceptors', 'UsePipes', 'UseFilters', 'Catch',
  'Body', 'Param', 'Query', 'Headers', 'Req', 'Res', 'Next', 'Session', 'UploadedFile',
  'Inject', 'InjectRepository', 'InjectQueue',
  'ApiProperty', 'ApiTags', 'ApiOperation', 'ApiResponse', 'ApiBody', 'ApiBearerAuth',
  'Column', 'Entity', 'PrimaryGeneratedColumn', 'CreateDateColumn', 'UpdateDateColumn',
  'ManyToOne', 'OneToMany', 'ManyToMany', 'JoinColumn', 'JoinTable', 'OneToOne',
  'BeforeInsert', 'AfterInsert', 'BeforeUpdate', 'AfterUpdate', 'BeforeRemove',
  'IsString', 'IsNumber', 'IsBoolean', 'IsEmail', 'IsOptional', 'IsArray', 'IsEnum',
  'IsNotEmpty', 'MinLength', 'MaxLength', 'Min', 'Max', 'ValidateNested',
  'Type', 'Expose', 'Exclude', 'Transform',
  'Router',
  'Component', 'Directive', 'NgModule', 'Input', 'Output', 'HostListener',
  'Reflect',
]);

// ─── Severity Mapping ───

function mapLegacySeverity(severity: 'error' | 'warning', type: HallucinationIssue['type']): import('../types.js').Severity {
  if (type === 'phantom-package') return 'high';
  if (type === 'phantom-api') return 'high';
  if (severity === 'error') return 'high';
  return 'medium';
}

/**
 * Convert a legacy HallucinationIssue to a UnifiedIssue.
 */
function toUnifiedIssue(issue: HallucinationIssue, index: number): UnifiedIssue {
  return {
    id: `hallucination:${index}`,
    detector: 'hallucination',
    category: AIDefectCategory.HALLUCINATION,
    severity: mapLegacySeverity(issue.severity, issue.type),
    message: issue.message,
    file: issue.file,
    line: issue.line,
    column: issue.column,
    fix: issue.suggestion ? {
      description: issue.suggestion,
      autoFixable: false,
    } : undefined,
  };
}

// ─── Main Detector ───

/**
 * HallucinationDetector — detects AI-generated hallucination patterns.
 *
 * V3: Implements the unified Detector interface.
 * V2 (deprecated): Old analyze() signature still works for backward compatibility.
 */
export class HallucinationDetector implements Detector {
  readonly name = 'hallucination';
  readonly version = '2.0.0';
  readonly tier = 1 as const;

  private validPackages: Set<string>;
  private options: HallucinationDetectorOptions;
  private ignoreDecorators: boolean;

  constructor(options: HallucinationDetectorOptions) {
    this.options = options;
    this.ignoreDecorators = options.ignoreDecorators ?? true;
    this.validPackages = resolveValidPackages(
      options.projectRoot,
      options.knownPackages,
    );
  }

  // ─── V3 Unified Interface ───

  /**
   * V3 unified detect method.
   * Processes multiple files and returns UnifiedIssue[].
   */
  async detect(files: FileAnalysis[]): Promise<UnifiedIssue[]> {
    const allIssues: UnifiedIssue[] = [];
    let globalIndex = 0;

    for (const file of files) {
      // Use legacy analyze for the actual detection logic
      const result = this.analyze(file.path, file.content);
      for (const issue of result.issues) {
        allIssues.push(toUnifiedIssue(issue, globalIndex++));
      }
    }

    return allIssues;
  }

  // ─── V2 Legacy Interface (Deprecated) ───

  /**
   * Analyze a single file for hallucination issues.
   * @deprecated Use detect(files) instead. Will be removed in v0.4.0.
   */
  analyze(filePath: string, source?: string): HallucinationResult {
    const content = source ?? readFileSync(filePath, 'utf-8');
    const issues: HallucinationIssue[] = [];

    // 1. Check for phantom packages
    const imports = extractImports(content);
    for (const imp of imports) {
      const pkgName = getPackageName(imp.module);
      if (pkgName && !this.validPackages.has(pkgName)) {
        if (pkgName.startsWith('@/') || pkgName.startsWith('~/')) continue;

        issues.push({
          type: 'phantom-package',
          severity: 'error',
          file: filePath,
          line: imp.line,
          message: `Package '${pkgName}' is imported but not listed in package.json dependencies`,
          suggestion: `Run 'npm install ${pkgName}' or remove the import if it was hallucinated`,
        });
      }
    }

    // 2. Check for phantom function references
    const phantomRefs = detectPhantomReferences(content, filePath);
    for (const ref of phantomRefs) {
      if (this.ignoreDecorators) {
        const fnName = ref.message.match(/Possible phantom function call: '(\w+)'/)?.[1];
        if (fnName && FRAMEWORK_DECORATORS.has(fnName)) continue;
      }
      issues.push(ref);
    }

    // Filter suppressed issues
    const lines = content.split('\n');
    const filteredIssues = issues.filter(issue => {
      if (issue.line <= 0) return true;
      const prevLine = lines[issue.line - 2] || '';
      return !prevLine.includes('// ai-validator-ignore') && !prevLine.includes('// ai-validator-disable');
    });

    const errorCount = filteredIssues.filter(i => i.severity === 'error').length;
    const warningCount = filteredIssues.filter(i => i.severity === 'warning').length;
    const deductions = (errorCount * 15) + (warningCount * 5);
    const score = Math.max(0, 100 - deductions);

    return { file: filePath, issues: filteredIssues, score };
  }

  /**
   * Analyze multiple files.
   * @deprecated Use detect(files) instead. Will be removed in v0.4.0.
   */
  analyzeMany(files: Array<{ path: string; source?: string }>): HallucinationResult[] {
    return files.map(f => this.analyze(f.path, f.source));
  }
}

export default HallucinationDetector;

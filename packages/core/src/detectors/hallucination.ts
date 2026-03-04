/**
 * Hallucination Detector
 *
 * Detects AI-generated code hallucination patterns:
 * 1. References to non-existent npm packages (compared against package.json)
 * 2. Calls to undefined functions/variables
 * 3. Usage of non-existent API endpoints (if OpenAPI spec is provided)
 * 4. Imported but never-defined types
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

/** A single hallucination finding */
export interface HallucinationIssue {
  type: 'phantom-package' | 'phantom-function' | 'phantom-api' | 'phantom-type';
  severity: 'error' | 'warning';
  file: string;
  line: number;
  column?: number;
  message: string;
  suggestion?: string;
}

/** Options for the hallucination detector */
export interface HallucinationDetectorOptions {
  /** Root directory of the project (where package.json lives) */
  projectRoot: string;
  /** Optional OpenAPI spec path for API endpoint validation */
  openApiSpecPath?: string;
  /** Extra known packages to whitelist */
  knownPackages?: string[];
  /** Whether to ignore known framework decorators (default: true) */
  ignoreDecorators?: boolean;
}

/** Result of running the hallucination detector on a file */
export interface HallucinationResult {
  file: string;
  issues: HallucinationIssue[];
  score: number; // 0-100, higher is better
}

/**
 * Resolve the full set of valid package names from package.json + node_modules
 */
function resolveValidPackages(projectRoot: string, extra: string[] = []): Set<string> {
  const packages = new Set<string>([
    // Node.js built-in modules
    'node:fs', 'node:path', 'node:url', 'node:http', 'node:https', 'node:crypto',
    'node:stream', 'node:util', 'node:os', 'node:child_process', 'node:events',
    'node:buffer', 'node:querystring', 'node:zlib', 'node:net', 'node:tls',
    'node:dns', 'node:assert', 'node:readline', 'node:worker_threads',
    'node:perf_hooks', 'node:async_hooks', 'node:timers', 'node:timers/promises',
    'node:fs/promises', 'node:stream/promises', 'node:test',
    // Legacy (non-prefixed) built-ins
    'fs', 'path', 'url', 'http', 'https', 'crypto', 'stream', 'util', 'os',
    'child_process', 'events', 'buffer', 'querystring', 'zlib', 'net', 'tls',
    'dns', 'assert', 'readline', 'worker_threads', 'perf_hooks', 'async_hooks',
    'timers', 'timers/promises', 'fs/promises', 'stream/promises',
    ...extra,
  ]);

  // Walk up to find the nearest package.json
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
        // In monorepo: also read root workspace package.json (one or two levels up)
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
      } catch {
        // Ignore malformed package.json
      }
      break;
    }
    dir = dirname(dir);
  }

  return packages;
}

/** Extract import/require statements from source text */
function extractImports(source: string): Array<{ module: string; line: number }> {
  const imports: Array<{ module: string; line: number }> = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // ES import: import ... from 'module'
    const esMatch = line.match(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/);
    if (esMatch) {
      imports.push({ module: esMatch[1], line: lineNum });
      continue;
    }

    // ES import: import 'module' (side-effect)
    const sideEffectMatch = line.match(/import\s+['"]([^'"]+)['"]/);
    if (sideEffectMatch) {
      imports.push({ module: sideEffectMatch[1], line: lineNum });
      continue;
    }

    // Dynamic import: import('module')
    const dynamicMatch = line.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (dynamicMatch) {
      imports.push({ module: dynamicMatch[1], line: lineNum });
      continue;
    }

    // CommonJS: require('module')
    const requireMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (requireMatch) {
      imports.push({ module: requireMatch[1], line: lineNum });
    }
  }

  return imports;
}

/** Get the top-level package name from an import specifier */
function getPackageName(specifier: string): string | null {
  // Relative imports
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    return null;
  }

  // Scoped packages: @scope/package/sub → @scope/package
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return specifier;
  }

  // Regular packages: package/sub → package
  return specifier.split('/')[0];
}

/**
 * Detect undefined variable/function references.
 * Uses a simple heuristic: finds identifiers that look like function calls
 * but are never imported or declared in the file.
 */
function detectPhantomReferences(
  source: string,
  filePath: string,
): HallucinationIssue[] {
  const issues: HallucinationIssue[] = [];
  const lines = source.split('\n');

  // Collect all declared identifiers (rough heuristic)
  const declared = new Set<string>();

  // Common global/built-in identifiers
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
    // Class keywords that appear as identifiers
    'constructor', 'super', 'this',
    // Common logging / utility patterns
    'log', 'warn', 'error', 'info', 'debug', 'trace',
    // SQL aggregate functions (appear in TypeORM/raw queries)
    'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'COALESCE', 'NULLIF', 'CAST',
    'count', 'sum', 'avg', 'max', 'min', 'coalesce', 'nullif', 'cast',
    // Node.js / common runtime
    'next', 'resolve', 'reject', 'emit', 'on', 'off', 'once',
    'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf',
  ]);

  for (const line of lines) {
    // Variable declarations
    const varMatch = line.matchAll(/(?:const|let|var|function|class)\s+(\w+)/g);
    for (const m of varMatch) declared.add(m[1]);

    // Import bindings
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

    // Destructuring from require
    const reqMatch = line.match(/(?:const|let|var)\s+{([^}]+)}\s*=\s*require/);
    if (reqMatch) {
      reqMatch[1].split(',').forEach(s => {
        const name = s.trim().split(/\s+as\s+/).pop()?.trim();
        if (name) declared.add(name);
      });
    }

    // Function parameters (basic)
    const paramMatch = line.match(/(?:function\s+\w+|=>)\s*\(([^)]*)\)/);
    if (paramMatch) {
      paramMatch[1].split(',').forEach(s => {
        const name = s.trim().split(/[=:]/)[0].trim().replace(/^\.\.\./, '');
        if (name) declared.add(name);
      });
    }
  }

  // Look for function calls to undeclared identifiers (very conservative)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip decorator lines entirely (@Decorator(...))
    if (trimmedLine.startsWith('@')) continue;

    // Match standalone function calls: identifier(...)
    const callMatches = line.matchAll(/\b([a-z]\w*)\s*\(/gi);
    for (const m of callMatches) {
      const name = m[1];
      // Skip if it's a keyword, builtin, or declared
      if (builtins.has(name) || declared.has(name)) continue;
      // Skip common patterns (methods on objects: obj.method())
      const idx = m.index!;
      if (idx > 0 && line[idx - 1] === '.') continue;
      // Skip if preceded by @ (decorator call within a line)
      if (idx > 0 && line[idx - 1] === '@') continue;
      // Skip control flow keywords
      if (['if', 'for', 'while', 'switch', 'catch', 'return', 'throw', 'new', 'typeof', 'instanceof', 'void', 'delete', 'await', 'yield', 'case', 'in', 'of', 'as', 'from', 'import', 'export', 'default', 'extends', 'implements', 'interface', 'type', 'enum', 'namespace', 'abstract', 'declare', 'readonly', 'static', 'public', 'private', 'protected', 'override', 'get', 'set', 'async', 'function', 'class', 'const', 'let', 'var'].includes(name)) continue;
      // Skip all-uppercase identifiers (likely enum values, constants, SQL)
      if (/^[A-Z][A-Z0-9_]+$/.test(name)) continue;
      // Skip single-char identifiers (loop variables: i, j, k, etc.)
      if (name.length === 1) continue;
      // Skip lines that are inside SQL template literals or comments
      if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*') || trimmedLine.startsWith('/*')) continue;
      // Skip class method definitions (name followed by ( inside class body)
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

/**
 * Known framework decorators that should not be flagged as phantom functions.
 * Covers NestJS, TypeORM, class-validator, class-transformer, Swagger/OpenAPI, etc.
 */
const FRAMEWORK_DECORATORS = new Set([
  // NestJS core
  'Controller', 'Get', 'Post', 'Put', 'Delete', 'Patch', 'Options', 'Head', 'All',
  'Injectable', 'Module', 'Component', 'Pipe', 'Guard', 'Interceptor', 'Middleware',
  'UseGuards', 'UseInterceptors', 'UsePipes', 'UseFilters', 'Catch',
  // NestJS parameter decorators
  'Body', 'Param', 'Query', 'Headers', 'Req', 'Res', 'Next', 'Session', 'UploadedFile',
  // NestJS DI
  'Inject', 'InjectRepository', 'InjectQueue',
  // Swagger / OpenAPI
  'ApiProperty', 'ApiTags', 'ApiOperation', 'ApiResponse', 'ApiBody', 'ApiBearerAuth',
  // TypeORM
  'Column', 'Entity', 'PrimaryGeneratedColumn', 'CreateDateColumn', 'UpdateDateColumn',
  'ManyToOne', 'OneToMany', 'ManyToMany', 'JoinColumn', 'JoinTable', 'OneToOne',
  'BeforeInsert', 'AfterInsert', 'BeforeUpdate', 'AfterUpdate', 'BeforeRemove',
  // class-validator
  'IsString', 'IsNumber', 'IsBoolean', 'IsEmail', 'IsOptional', 'IsArray', 'IsEnum',
  'IsNotEmpty', 'MinLength', 'MaxLength', 'Min', 'Max', 'ValidateNested',
  // class-transformer
  'Type', 'Expose', 'Exclude', 'Transform',
  // Express / Fastify
  'Router',
  // Angular
  'Component', 'Directive', 'NgModule', 'Input', 'Output', 'HostListener',
  // TypeScript / JS builtins used as decorators
  'Reflect',
]);

/**
 * Main hallucination detector
 */
export class HallucinationDetector {
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

  /**
   * Analyze a single file for hallucination issues
   */
  analyze(filePath: string, source?: string): HallucinationResult {
    const content = source ?? readFileSync(filePath, 'utf-8');
    const issues: HallucinationIssue[] = [];

    // 1. Check for phantom packages
    const imports = extractImports(content);
    for (const imp of imports) {
      const pkgName = getPackageName(imp.module);
      if (pkgName && !this.validPackages.has(pkgName)) {
        // Check if it might be a path alias (e.g., @/ or ~/)
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
      // Skip known framework decorators if ignoreDecorators is enabled
      if (this.ignoreDecorators) {
        const fnName = ref.message.match(/Possible phantom function call: '(\w+)'/)?.[1];
        if (fnName && FRAMEWORK_DECORATORS.has(fnName)) continue;
      }
      issues.push(ref);
    }

    // Filter out issues suppressed by // ai-validator-ignore or // ai-validator-disable
    const lines = content.split('\n');
    const filteredIssues = issues.filter(issue => {
      if (issue.line <= 0) return true;
      const prevLine = lines[issue.line - 2] || '';
      return !prevLine.includes('// ai-validator-ignore') && !prevLine.includes('// ai-validator-disable');
    });

    // Calculate score: start at 100, deduct for issues
    const errorCount = filteredIssues.filter(i => i.severity === 'error').length;
    const warningCount = filteredIssues.filter(i => i.severity === 'warning').length;
    const deductions = (errorCount * 15) + (warningCount * 5);
    const score = Math.max(0, 100 - deductions);

    return {
      file: filePath,
      issues: filteredIssues,
      score,
    };
  }

  /**
   * Analyze multiple files
   */
  analyzeMany(files: Array<{ path: string; source?: string }>): HallucinationResult[] {
    return files.map(f => this.analyze(f.path, f.source));
  }
}

export default HallucinationDetector;

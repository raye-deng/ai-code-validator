/**
 * V4 Scan Orchestrator
 *
 * The top-level orchestrator that ties together parsing, detection, and scoring.
 * Supports multiple SLA levels (L1/L2/L3) and internationalization.
 *
 * @since 0.4.0
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import type { CodeUnit, SupportedLanguage } from '../ir/types.js';
import { ParserManager } from '../parser/manager.js';
import type { LanguageExtractor } from '../parser/extractor.js';
import { TypeScriptExtractor } from '../parser/extractors/typescript.js';
import { PythonExtractor } from '../parser/extractors/python.js';
import { JavaExtractor } from '../parser/extractors/java.js';
import { GoExtractor } from '../parser/extractors/go.js';
import { KotlinExtractor } from '../parser/extractors/kotlin.js';
import { RegistryManager } from '../registry/registry-manager.js';
import type { RegistryOptions } from '../registry/types.js';
import { createV4Detectors } from '../detectors/v4/index.js';
import type { V4Detector, DetectorResult, DetectorContext } from '../detectors/v4/types.js';
import { DefaultI18nProvider, type Locale, type I18nProvider } from '../i18n/index.js';
import type { AIConfig, LLMProviderType } from '../ai/v4/types.js';
import { AIScanPipeline } from '../ai/v4/pipeline.js';

// ─── Types ────────────────────────────────────────────────────────

/**
 * SLA level for scan depth.
 * - L1: Fast — Structural analysis only
 * - L2: Standard — Structural + Embedding + Local AI
 * - L3: Deep — Structural + Embedding + Remote AI
 */
export type SLALevel = 'L1' | 'L2' | 'L3';

/**
 * Configuration for V4 scan.
 */
export interface V4ScanConfig {
  /** Project root directory */
  projectRoot: string;
  /** Languages to scan (auto-detect if empty) */
  languages?: SupportedLanguage[];
  /** SLA level */
  sla?: SLALevel;
  /** Registry configuration */
  registry?: RegistryOptions;
  /** Locale for output */
  locale?: Locale;
  /** Custom detectors (overrides default set) */
  detectors?: V4Detector[];
  /** File patterns to include (globs) */
  include?: string[];
  /** File patterns to exclude (globs) */
  exclude?: string[];
  /** Scoring threshold (default: 70) */
  threshold?: number;
  /** AI pipeline configuration (for L2/L3) */
  ai?: {
    embedding?: {
      provider?: 'local' | 'openai' | 'ollama';
      model?: string;
      baseUrl?: string;
    };
    llm?: {
      provider?: 'ollama' | 'openai' | 'anthropic';
      model?: string;
      endpoint?: string;
    };
    remote?: {
      provider?: LLMProviderType;
      model?: string;
      apiKey?: string;
      baseUrl?: string;
    };
  };
}

/**
 * Result of a V4 scan.
 */
export interface V4ScanResult {
  /** All issues found */
  issues: DetectorResult[];
  /** Parsed code units */
  codeUnits: CodeUnit[];
  /** Files scanned (relative paths) */
  files: string[];
  /** Languages detected */
  languages: SupportedLanguage[];
  /** Total scan duration in ms */
  durationMs: number;
  /** Per-stage timing */
  stages: {
    discovery: number;
    parsing: number;
    detection: number;
    ai?: number;
  };
  /** Score (if scoring enabled) */
  score?: {
    total: number;
    grade: string;
    dimensions: Record<string, number>;
  };
  /** Project root */
  projectRoot: string;
  /** SLA level used */
  sla: SLALevel;
}

// ─── V4 Scanner ────────────────────────────────────────────────────

/**
 * V4 Scanner — orchestrates the full scan pipeline.
 *
 * Pipeline stages:
 * 1. File discovery — walk project root, respect include/exclude patterns
 * 2. Parsing — tree-sitter parse, extract CodeUnit IR
 * 3. Detection — run all structural detectors
 * 4. AI analysis (L2/L3 only) — embedding recall + LLM deep scan
 * 5. Scoring — compute quality score
 *
 * @example
 * ```ts
 * const scanner = new V4Scanner({
 *   projectRoot: '/path/to/project',
 *   sla: 'L1',
 *   locale: 'en',
 * });
 *
 * const result = await scanner.scan();
 * console.log(`Found ${result.issues.length} issues`);
 * ```
 */
export class V4Scanner {
  private parserManager: ParserManager;
  private registryManager?: RegistryManager;
  private detectors: V4Detector[];
  private i18n: I18nProvider;
  private extractors: Map<SupportedLanguage, LanguageExtractor>;

  constructor(private config: V4ScanConfig) {
    this.parserManager = new ParserManager();
    this.i18n = new DefaultI18nProvider(config.locale);
    this.detectors = config.detectors ?? createV4Detectors();

    // Initialize registry manager if config provided
    if (config.registry) {
      this.registryManager = new RegistryManager(config.registry);
    }

    // Initialize extractors for all supported languages
    this.extractors = new Map<SupportedLanguage, LanguageExtractor>([
      ['typescript', new TypeScriptExtractor()],
      ['javascript', new TypeScriptExtractor()], // JS uses TS extractor
      ['python', new PythonExtractor()],
      ['java', new JavaExtractor()],
      ['go', new GoExtractor()],
      ['kotlin', new KotlinExtractor()],
    ]);
  }

  /**
   * Run the full scan pipeline.
   */
  async scan(): Promise<V4ScanResult> {
    const startTime = Date.now();

    // 1. Initialize parser
    const initStart = Date.now();
    await this.parserManager.init();
    // Init time not tracked separately, included in parsing

    // 2. Discover files
    const discoveryStart = Date.now();
    const files = await this.discoverFiles();
    const discoveryDuration = Date.now() - discoveryStart;

    // 3. Parse all files → CodeUnits
    const parseStart = Date.now();
    const allUnits: CodeUnit[] = [];
    for (const file of files) {
      const language = this.detectLanguage(file);
      if (!language) continue;

      try {
        const absolutePath = join(this.config.projectRoot, file);
        const source = await readFile(absolutePath, 'utf-8');
        const tree = this.parserManager.parse(source, language);
        const extractor = this.extractors.get(language);
        if (extractor) {
          const units = extractor.extract(tree, file, source);
          allUnits.push(...units);
        }
      } catch {
        // Skip files that can't be parsed
        continue;
      }
    }
    const parseDuration = Date.now() - parseStart;

    // 4. Run structural detectors
    const detectStart = Date.now();
    const context: DetectorContext = {
      projectRoot: this.config.projectRoot,
      allFiles: files,
      registryManager: this.registryManager,
    };

    const allIssues: DetectorResult[] = [];
    for (const detector of this.detectors) {
      try {
        const issues = await detector.detect(allUnits, context);
        allIssues.push(...issues);
      } catch {
        // Skip detectors that fail
        continue;
      }
    }
    const detectDuration = Date.now() - detectStart;

    // 5. AI pipeline (L2/L3 only)
    let aiDuration: number | undefined;
    const sla = this.config.sla ?? 'L1';

    if (sla !== 'L1' && allUnits.length > 0) {
      const aiStartTime = Date.now();
      try {
        const aiConfig = this.buildAIConfig(sla);
        const pipeline = new AIScanPipeline(aiConfig);
        const aiResult = await pipeline.scan(allUnits, allIssues);

        // Merge AI issues (skip the structural stage which is duplicated)
        for (const stage of aiResult.stages) {
          if (stage.stage !== 'structural') {
            allIssues.push(...stage.issues);
          }
        }
      } catch {
        // Graceful degradation: AI pipeline failure doesn't block scan
      }
      aiDuration = Date.now() - aiStartTime;
    }

    // 6. Build result
    const result: V4ScanResult = {
      issues: allIssues,
      codeUnits: allUnits,
      files,
      languages: [...new Set(allUnits.map(u => u.language))],
      durationMs: Date.now() - startTime,
      stages: {
        discovery: discoveryDuration,
        parsing: parseDuration,
        detection: detectDuration,
        ai: aiDuration,
      },
      projectRoot: this.config.projectRoot,
      sla,
    };

    return result;
  }

  /**
   * Discover files to scan based on include/exclude patterns.
   */
  private async discoverFiles(): Promise<string[]> {
    const projectRoot = this.config.projectRoot;
    const include = this.config.include ?? DEFAULT_INCLUDE_PATTERNS;
    const exclude = this.config.exclude ?? DEFAULT_EXCLUDE_PATTERNS;

    const files: string[] = await this.walkDirectory(projectRoot, include, exclude);
    return files.map(f => relative(projectRoot, f));
  }

  /**
   * Walk directory recursively, filtering by include/exclude patterns.
   */
  private async walkDirectory(
    dir: string,
    include: string[],
    exclude: string[],
  ): Promise<string[]> {
    const files: string[] = [];
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Check if directory should be excluded
        if (this.shouldExcludeDir(entry.name, exclude)) {
          continue;
        }
        // Recurse into subdirectory
        const subFiles = await this.walkDirectory(fullPath, include, exclude);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        // Check if file should be included
        if (this.shouldIncludeFile(entry.name, include, exclude)) {
          files.push(fullPath);
        }
      }
    }

    return files;
  }

  /**
   * Check if a directory should be excluded.
   */
  private shouldExcludeDir(name: string, exclude: string[]): boolean {
    const excludeDirs = exclude
      .filter(p => p.includes('/**/') || p.endsWith('/**'))
      .map(p => p.replace('/**', '').replace('**/', '').replace('**', ''));

    return excludeDirs.includes(name) ||
      name === 'node_modules' ||
      name === 'dist' ||
      name === 'build' ||
      name === '.git' ||
      name === 'vendor' ||
      name === '__pycache__' ||
      name === 'target';
  }

  /**
   * Check if a file should be included based on patterns.
   */
  private shouldIncludeFile(name: string, include: string[], exclude: string[]): boolean {
    // Check extension against include patterns
    const ext = extname(name).toLowerCase();
    const includedExtensions = include
      .filter(p => p.startsWith('**/*.'))
      .map(p => p.replace('**/*', ''));

    const hasMatchingInclude = includedExtensions.length === 0 || includedExtensions.includes(ext);

    // Check exclusion patterns
    const isExcluded = exclude.some(pattern => {
      if (pattern.includes(name)) return true;
      if (pattern.startsWith('**/*') && pattern.endsWith(ext)) return true;
      return false;
    });

    return hasMatchingInclude && !isExcluded;
  }

  /**
   * Detect language from file extension.
   */
  private detectLanguage(filePath: string): SupportedLanguage | null {
    const ext = extname(filePath).toLowerCase();
    const mapping: Record<string, SupportedLanguage> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.kt': 'kotlin',
      '.kts': 'kotlin',
    };
    return mapping[ext] ?? null;
  }

  /**
   * Get the extractor for a language.
   */
  private getExtractor(language: SupportedLanguage): LanguageExtractor | undefined {
    return this.extractors.get(language);
  }

  /**
   * Build AIConfig from V4ScanConfig for the AI pipeline.
   */
  private buildAIConfig(sla: SLALevel): AIConfig {
    const ai = this.config.ai;

    const aiConfig: AIConfig = {
      sla,
      embedding: ai?.embedding ? {
        provider: ai.embedding.provider ?? 'local',
        model: ai.embedding.model,
        baseUrl: ai.embedding.baseUrl,
      } : { provider: 'local' },
    };

    // Wire up local LLM config from ai.llm
    if (ai?.llm?.provider === 'ollama' && ai.llm.model) {
      aiConfig.local = {
        provider: 'ollama',
        model: ai.llm.model,
        baseUrl: ai.llm.endpoint ?? 'http://localhost:11434',
      };
    }

    // Wire up remote LLM config
    if (ai?.remote?.provider && ai.remote.apiKey) {
      aiConfig.remote = {
        provider: ai.remote.provider,
        model: ai.remote.model ?? 'gpt-4o-mini',
        apiKey: ai.remote.apiKey,
        baseUrl: ai.remote.baseUrl,
      };
    }

    return aiConfig;
  }
}

// ─── Default Patterns ───────────────────────────────────────────────

export const DEFAULT_INCLUDE_PATTERNS = [
  '**/*.ts',
  '**/*.tsx',
  '**/*.js',
  '**/*.jsx',
  '**/*.mjs',
  '**/*.cjs',
  '**/*.py',
  '**/*.java',
  '**/*.go',
  '**/*.kt',
  '**/*.kts',
];

export const DEFAULT_EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/vendor/**',
  '**/__pycache__/**',
  '**/target/**',
  '**/*.test.*',
  '**/*.spec.*',
  '**/__tests__/**',
];

// ─── Factory ────────────────────────────────────────────────────────

/**
 * Create a V4 scanner with the given configuration.
 */
export function createV4Scanner(config: V4ScanConfig): V4Scanner {
  return new V4Scanner(config);
}

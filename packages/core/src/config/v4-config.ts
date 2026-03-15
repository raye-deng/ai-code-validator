/**
 * V4 Configuration Parser
 *
 * Parses .ocrrc.yml configuration file.
 * Falls back to .aicv.yml for backward compatibility.
 *
 * @since 0.4.0
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import type { V4ScanConfig, SLALevel } from '../scanner/v4-scanner.js';
import type { Locale } from '../i18n/types.js';
import type { RegistryOptions } from '../registry/types.js';
import type { LLMProviderType } from '../ai/v4/types.js';

// ─── V4 Config Types ────────────────────────────────────────────────

/**
 * Full V4 configuration structure.
 */
export interface V4Config {
  /** Scan settings */
  scan?: {
    include?: string[];
    exclude?: string[];
    languages?: string[];
  };
  /** SLA level */
  sla?: SLALevel;
  /** Locale for output */
  locale?: Locale;
  /** Registry configuration */
  registry?: RegistryOptions;
  /** Scoring settings */
  scoring?: {
    threshold?: number;
    failOn?: 'critical' | 'high' | 'medium' | 'low' | 'none';
  };
  /** AI configuration (for L2/L3) */
  ai?: {
    embedding?: {
      provider?: 'local' | 'openai' | 'ollama';
      model?: string;
      baseUrl?: string;
      thresholds?: Record<string, number>;
    };
    llm?: {
      provider?: 'ollama' | 'openai' | 'anthropic';
      model?: string;
      endpoint?: string;
      temperature?: number;
      maxTokensBudget?: number;
      topN?: number;
      timeoutMs?: number;
    };
    remote?: {
      provider?: LLMProviderType;
      model?: string;
      apiKey?: string;
      baseUrl?: string;
    };
  };
}

// ─── Default V4 Config ───────────────────────────────────────────────

export const DEFAULT_V4_CONFIG: V4Config = {
  scan: {
    include: [
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
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/vendor/**',
      '**/__pycache__/**',
      '**/target/**',
      '**/*.test.*',
      '**/*.spec.*',
    ],
  },
  sla: 'L1',
  locale: 'en',
  scoring: {
    threshold: 70,
    failOn: 'critical',
  },
};

// ─── Config File Discovery ───────────────────────────────────────────

const V4_CONFIG_FILENAMES = ['.ocrrc.yml', '.ocrrc.yaml'];
const V3_CONFIG_FILENAMES = ['.aicv.yml', '.aicv.yaml', 'aicv.yml', 'aicv.yaml'];

/**
 * Search for a V4 config file (.ocrrc.yml) starting from `startDir`.
 * Falls back to V3 config file (.aicv.yml) if V4 not found.
 */
function findConfigFile(startDir: string): { path: string; isV4: boolean } | null {
  let dir = resolve(startDir);
  const root = resolve('/');

  while (true) {
    // Try V4 config first
    for (const name of V4_CONFIG_FILENAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) {
        return { path: candidate, isV4: true };
      }
    }

    // Fall back to V3 config
    for (const name of V3_CONFIG_FILENAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) {
        return { path: candidate, isV4: false };
      }
    }

    const parent = resolve(dir, '..');
    if (parent === dir || dir === root) break;
    dir = parent;
  }

  return null;
}

/**
 * Read and parse a YAML config file.
 */
function readYamlConfig(filePath: string): Record<string, unknown> | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = parseYaml(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Config Parsing ──────────────────────────────────────────────────

/**
 * Parse raw YAML into V4Config.
 */
function parseConfig(raw: Record<string, unknown>): V4Config {
  const config: V4Config = {};

  // Scan section
  if (raw.scan && typeof raw.scan === 'object') {
    const s = raw.scan as Record<string, unknown>;
    config.scan = {
      include: toStringArray(s.include ?? s.paths),
      exclude: toStringArray(s.exclude),
      languages: toStringArray(s.languages),
    };
  }

  // SLA level (supports both .ocrrc.yml 'sla' and .aicv.yml 'slaLevel'/'sla_level')
  const slaRaw = raw.sla ?? raw.slaLevel ?? raw.sla_level;
  if (slaRaw && typeof slaRaw === 'string') {
    const sla = slaRaw.toUpperCase();
    if (sla === 'L1' || sla === 'L2' || sla === 'L3') {
      config.sla = sla as SLALevel;
    }
  }

  // Locale
  if (raw.locale && typeof raw.locale === 'string') {
    const locale = raw.locale.toLowerCase();
    if (locale === 'en' || locale === 'zh') {
      config.locale = locale as Locale;
    }
  }

  // Registry
  if (raw.registry && typeof raw.registry === 'object') {
    config.registry = raw.registry as RegistryOptions;
  }

  // Scoring
  if (raw.scoring && typeof raw.scoring === 'object') {
    const sc = raw.scoring as Record<string, unknown>;
    config.scoring = {
      threshold: typeof sc.threshold === 'number' ? sc.threshold : undefined,
      failOn: typeof sc.failOn === 'string' ? (sc.failOn as V4Config['scoring'] extends { failOn?: infer F } ? F : never) : undefined,
    };
  }

  // AI
  if (raw.ai && typeof raw.ai === 'object') {
    config.ai = raw.ai as V4Config['ai'];
  }

  return config;
}

/**
 * Merge two configs (b overrides a).
 */
function mergeConfigs(a: V4Config, b: V4Config): V4Config {
  return {
    scan: {
      include: b.scan?.include ?? a.scan?.include,
      exclude: b.scan?.exclude ?? a.scan?.exclude,
      languages: b.scan?.languages ?? a.scan?.languages,
    },
    sla: b.sla ?? a.sla,
    locale: b.locale ?? a.locale,
    registry: b.registry ?? a.registry,
    scoring: {
      threshold: b.scoring?.threshold ?? a.scoring?.threshold,
      failOn: b.scoring?.failOn ?? a.scoring?.failOn,
    },
    ai: b.ai ?? a.ai,
  };
}

// ─── Main Loader ────────────────────────────────────────────────────

export interface LoadV4ConfigOptions {
  /** Project root directory (default: process.cwd()) */
  projectRoot?: string;
  /** CLI overrides */
  overrides?: Partial<V4ScanConfig>;
}

/**
 * Load V4 configuration with the following priority:
 *   1. CLI overrides
 *   2. Environment variables
 *   3. Project .ocrrc.yml (or .aicv.yml fallback)
 *   4. User global ~/.ocr/config.yml
 *   5. Built-in defaults
 */
export function loadV4Config(options: LoadV4ConfigOptions = {}): V4ScanConfig {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());

  // Layer 5: defaults
  let config = DEFAULT_V4_CONFIG;

  // Layer 4: user global config
  const globalConfigPath = join(homedir(), '.ocr', 'config.yml');
  if (existsSync(globalConfigPath)) {
    const globalRaw = readYamlConfig(globalConfigPath);
    if (globalRaw) {
      config = mergeConfigs(config, parseConfig(globalRaw));
    }
  }

  // Layer 3: project config
  const found = findConfigFile(projectRoot);
  if (found) {
    const projectRaw = readYamlConfig(found.path);
    if (projectRaw) {
      config = mergeConfigs(config, parseConfig(projectRaw));
    }
  }

  // Layer 2: environment variables
  const envConfig = configFromEnv();
  if (envConfig) {
    config = mergeConfigs(config, envConfig);
  }

  // Layer 1: CLI overrides
  if (options.overrides) {
    const overrideConfig: V4Config = {
      sla: options.overrides.sla,
      locale: options.overrides.locale,
      registry: options.overrides.registry,
      scan: options.overrides.include || options.overrides.exclude ? {
        include: options.overrides.include,
        exclude: options.overrides.exclude,
      } : undefined,
      scoring: options.overrides.threshold ? {
        threshold: options.overrides.threshold,
      } : undefined,
    };
    config = mergeConfigs(config, overrideConfig);
  }

  // Convert to V4ScanConfig
  return {
    projectRoot,
    sla: config.sla ?? 'L1',
    locale: config.locale ?? 'en',
    registry: config.registry,
    include: config.scan?.include,
    exclude: config.scan?.exclude,
    languages: config.scan?.languages as SupportedLanguage[] | undefined,
    threshold: config.scoring?.threshold ?? 70,
    ai: config.ai,
  };
}

// ─── Environment Variables ──────────────────────────────────────────

function configFromEnv(): V4Config | null {
  const env = process.env;
  const config: V4Config = {};
  let hasEnv = false;

  // OCR_SLA or AICV_SLA_LEVEL
  const slaLevel = env.OCR_SLA ?? env.AICV_SLA_LEVEL;
  if (slaLevel) {
    const sla = slaLevel.toUpperCase();
    if (sla === 'L1' || sla === 'L2' || sla === 'L3') {
      config.sla = sla as SLALevel;
      hasEnv = true;
    }
  }

  // OCR_LOCALE
  if (env.OCR_LOCALE) {
    const locale = env.OCR_LOCALE.toLowerCase();
    if (locale === 'en' || locale === 'zh') {
      config.locale = locale as Locale;
      hasEnv = true;
    }
  }

  // OCR_THRESHOLD or AICV_THRESHOLD
  const thresholdStr = env.OCR_THRESHOLD ?? env.AICV_THRESHOLD;
  if (thresholdStr) {
    const num = parseInt(thresholdStr, 10);
    if (!isNaN(num)) {
      config.scoring = { threshold: num };
      hasEnv = true;
    }
  }

  // OCR_OFFLINE
  if (env.OCR_OFFLINE === 'true' || env.OCR_OFFLINE === '1') {
    // Offline mode affects registry behavior, not config structure
    // This is handled at runtime
    hasEnv = true;
  }

  return hasEnv ? config : null;
}

// ─── Helpers ─────────────────────────────────────────────────────────

import type { SupportedLanguage } from '../ir/types.js';

function toStringArray(val: unknown): string[] | undefined {
  if (val === undefined || val === null) return undefined;
  if (Array.isArray(val)) return val.filter((v): v is string => typeof v === 'string');
  if (typeof val === 'string') return [val];
  return undefined;
}

// ─── Write Default Config ────────────────────────────────────────────

/**
 * Generate a default .ocrrc.yml content string.
 */
export function generateDefaultConfigYaml(): string {
  return `# Open Code Review V4 Configuration
# https://github.com/raye-deng/open-code-review

# Scan settings
scan:
  include:
    - "**/*.ts"
    - "**/*.tsx"
    - "**/*.js"
    - "**/*.jsx"
    - "**/*.py"
    - "**/*.java"
    - "**/*.go"
    - "**/*.kt"
  exclude:
    - "**/node_modules/**"
    - "**/dist/**"
    - "**/build/**"
    - "**/.git/**"
    - "**/vendor/**"
    - "**/*.test.*"
    - "**/*.spec.*"

# SLA level: L1 (fast) | L2 (standard) | L3 (deep)
sla: L1

# Locale: en | zh
locale: en

# Scoring settings
scoring:
  threshold: 70
  failOn: critical

# Registry configuration (optional — defaults to public registries)
# registry:
#   npm:
#     url: https://registry.npmjs.org
#   pypi:
#     url: https://pypi.org
#   maven:
#     url: https://search.maven.org
#   go:
#     proxy: https://proxy.golang.org

# AI pipeline settings (for L2/L3)
# ai:
#   embedding:
#     provider: ollama         # local | openai | ollama
#     model: nomic-embed-text  # Ollama embedding model
#     baseUrl: http://localhost:11434
#   llm:
#     provider: ollama
#     model: deepseek-coder-v2:16b
#     endpoint: http://localhost:11434
`;
}

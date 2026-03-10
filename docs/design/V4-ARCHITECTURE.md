# Open Code Review V4 — Architecture Redesign

> **Version**: 4.0 | **Date**: 2026-03-11
> **Status**: Architecture Design
> **Author**: Open Code Review Architecture Team
> **Prior Art**: [V3 Architecture](./V3-ARCHITECTURE.md) | [V3 Demo Scan Results](../demo-reports/SUMMARY.md)

---

## 1. Executive Summary

### 1.1 Why V4: Lessons from V3 Scanning Results

V3 demo scans across 5 real-world repositories revealed **fundamental architectural flaws**:

| Repository | Language | Issues | Score | Grade | Root Cause of False Positives |
|-----------|----------|-------:|------:|:-----:|-------------------------------|
| create-t3-app | TypeScript | 509 | 25 | F | Package.json-based detection flags valid packages as hallucinations |
| typer | Python | 151 | 59 | F | `main()` flagged as "phantom" — no Python execution model understanding |
| java-design-patterns | Java | 257 | 51 | F | Method calls flagged as "phantom" — no class-scoped method understanding |
| chi | Go | 1,008 | 36 | F | `testing` stdlib flagged as hallucinated; `func`, `byte` flagged as phantom |
| moshi | Kotlin | 1,497 | 8 | F | `Buffer()` flagged as "deprecated since Node.js 6.0" — JS check on Kotlin |

**3,422 total issues** reported. Estimated **>95% are false positives**. The failures are **architectural**:

1. **Language-specific detection leaks**: TS-specific checks (package.json deps, Node.js deprecation DB) execute against all languages
2. **Fake parsing**: Only TS uses a real parser (oxc-parser). Python/Java/Go/Kotlin adapters return raw text disguised as AST
3. **Hardcoded whitelists**: Static `Set<string>` (55–100+ entries) as package verification. Unlisted package = hallucinated
4. **No semantic understanding**: "Phantom function" detector flags `main()`, `StringBuilder()`, `byte()` — no scope analysis

### 1.2 Key Changes from V3

| Aspect | V3 | V4 |
|--------|-----|-----|
| Parsing | oxc-parser (TS) + regex (others) | **tree-sitter for all 5 languages** |
| Analysis depth | AST (TS) vs line-by-line regex (others) | **Unified IR with identical capabilities** |
| Package verification | Hardcoded whitelists + package.json | **Live registry verification (npm/PyPI/Maven/Go proxy)** |
| Detection | Rule-based only | **Structural + embedding recall + LLM deep scan** |
| Lint overlap | Formatting, naming, dead code | **AI-unique defects only** |
| Localization | Chinese-only comments | **Full i18n (en/zh)** |
| Language isolation | All detectors run all checks | **Language-scoped detection via unified IR** |

---

## 2. System Architecture

### 2.1 Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Open Code Review V4                                  │
│                                                                              │
│  Entry Points                                                                │
│  ┌───────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐                  │
│  │  CLI  │  │ CI Action│  │  VS Code  │  │  Web Portal   │                  │
│  └───┬───┘  └────┬─────┘  └────┬─────┘  └──────┬────────┘                  │
│      └───────────┴──────────────┴───────────────┘                            │
│                            │                                                 │
│  ┌─────────────────────────▼───────────────────────────────────────────────┐ │
│  │                     Orchestrator (Pipeline Controller)                   │ │
│  │  Config → File Discovery → Language Detection → Pipeline Router         │ │
│  └─────────────────────────┬───────────────────────────────────────────────┘ │
│                            │                                                 │
│  ┌─────────────────────────▼───────────────────────────────────────────────┐ │
│  │              Unified Language Pipeline (tree-sitter)                     │ │
│  │  TS/JS │ Python │ Java │ Go │ Kotlin → Unified IR (CodeUnit[])         │ │
│  └─────────────────────────┬───────────────────────────────────────────────┘ │
│                            │                                                 │
│  ┌─────────────────────────▼───────────────────────────────────────────────┐ │
│  │  Detection Engine V4                                                     │ │
│  │  Stage 0: Structural (IR + Registry)  │ Always runs                     │ │
│  │  Stage 1: Embedding Recall            │ L2+ only                        │ │
│  │  Stage 2: LLM Deep Scan              │ L3 only                         │ │
│  └─────────────────────────┬───────────────────────────────────────────────┘ │
│                            │                                                 │
│  ┌─────────────────────────▼───────────────────────────────────────────────┐ │
│  │  Scoring V4 │ i18n Reports (Terminal/Markdown/HTML/JSON/SARIF/Badge)    │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Module Overview

```
packages/core/src/
├── pipeline/                    # [NEW] Orchestrator
│   ├── orchestrator.ts          #   Main scan pipeline
│   └── file-discovery.ts        #   Glob + language detection
├── parser/                      # [REWRITE] Unified tree-sitter
│   ├── tree-sitter-manager.ts   #   WASM init & grammar cache
│   └── grammars/*.wasm          #   Pre-built WASM grammars (6 files)
├── ir/                          # [NEW] Intermediate Representation
│   ├── types.ts                 #   CodeUnit, ImportDecl, FunctionDecl, etc.
│   ├── extractor.ts             #   Extractor interface + registry
│   └── extractors/              #   Per-language CST → IR
│       ├── typescript.ts / python.ts / java.ts / go.ts / kotlin.ts
├── registry/                    # [NEW] Dynamic registry verification
│   ├── types.ts                 #   PackageRegistry interface
│   ├── npm.ts / pypi.ts / maven.ts / go-proxy.ts
│   ├── cache.ts                 #   TTL-based local cache
│   └── registry-manager.ts      #   Language → registry routing
├── detectors/                   # [REWRITE] IR-based detectors
│   ├── import-verifier.ts       #   Package hallucination + registry
│   ├── context-coherence.ts     #   Context window artifacts
│   ├── over-engineering.ts      #   Complexity from IR metrics
│   ├── security-pattern.ts      #   AI security anti-patterns
│   ├── stale-api.ts             #   Language-scoped deprecation
│   └── incomplete-impl.ts       #   TODO/stub/empty-catch
├── ai/                          # [REWRITE] Two-stage AI pipeline
│   ├── embedder/                #   Stage 1: embedding recall
│   │   ├── types.ts / local.ts / remote.ts / chunker.ts / pattern-db.ts
│   ├── llm/                     #   Stage 2: LLM deep scan
│   │   ├── types.ts / ollama.ts / openai.ts / anthropic.ts / prompts/
│   └── fusion.ts                #   Result merging
├── scorer/                      #   Scoring engine (from V3, unchanged)
├── i18n/                        # [NEW] Internationalization
│   ├── types.ts / provider.ts
│   └── locales/ (en.json, zh.json)
├── report/                      #   i18n-updated reports
└── types.ts                     #   Core types
```

---

## 3. Unified Language Pipeline

### 3.1 Parser Selection (tree-sitter vs Alternatives)

**Decision: Use tree-sitter for ALL 5 languages, replacing oxc-parser for TypeScript.**

| Parser | Coverage | Speed (100 files) | Consistency | Verdict |
|--------|----------|:------------------:|:-----------:|---------|
| **tree-sitter** | 300+ langs, WASM | ~0.15s | Single API | ✅ **Selected** |
| **oxc-parser** | TS/JS only | ~0.05s | ESTree | ❌ Single-language |
| **ast-grep** | tree-sitter search | N/A (search tool) | Pattern DSL | ⚠️ Complementary |
| **LSP** | Per-language servers | Slow startup | Per-server | ❌ Too heavy |
| **Native parsers** | Per-language runtimes | Varies | 5 APIs | ❌ Fragmented |

The 0.05s → 0.15s slowdown for TypeScript is <1% of total scan time. The architectural benefit (identical depth for all 5 languages) far outweighs this.

**tree-sitter integration:**

```typescript
// packages/core/src/parser/tree-sitter-manager.ts
import Parser from 'web-tree-sitter';

class TreeSitterManager {
  private parser!: Parser;
  private languages = new Map<string, Parser.Language>();

  async init(): Promise<void> {
    await Parser.init();
    this.parser = new Parser();
  }

  async loadLanguage(langId: SupportedLanguage): Promise<void> {
    if (this.languages.has(langId)) return;
    const lang = await Parser.Language.load(resolveWasmPath(langId));
    this.languages.set(langId, lang);
  }

  parse(source: string, langId: SupportedLanguage): Parser.Tree {
    this.parser.setLanguage(this.languages.get(langId)!);
    return this.parser.parse(source);
  }
}

export const treeSitter = new TreeSitterManager();
```

### 3.2 Unified IR (Intermediate Representation)

tree-sitter CSTs are language-specific. The IR layer normalizes them:

```typescript
// packages/core/src/ir/types.ts

export interface CodeUnit {
  filePath: string;
  language: SupportedLanguage;
  source: string;
  cst: Parser.Tree;              // Raw CST for advanced detectors
  imports: ImportDecl[];          // All import statements
  functions: FunctionDecl[];     // All function/method declarations
  calls: CallSite[];             // All call sites
  classes: ClassDecl[];          // All class/struct/interface
  symbols: SymbolDecl[];         // All declared identifiers
  complexity: ComplexityMetrics;
}

export interface ImportDecl {
  module: string;                // 'lodash', 'os', 'java.util.List'
  bindings: string[];            // ['map', 'filter'] or ['*']
  location: SourceLocation;
  kind: 'value' | 'type' | 'side-effect' | 'static' | 'wildcard';
  isRelative: boolean;
  isBuiltin: boolean;
  resolvedPackage?: string;      // Registry-specific name for verification
}

export interface FunctionDecl {
  name: string;
  params: string[];
  location: SourceLocation;
  bodyLoc: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  maxNestingDepth: number;
  hasStubIndicators: boolean;    // TODO, FIXME, stub
  hasEmptyCatch: boolean;
  className?: string;
}

export interface CallSite {
  callee: string;
  receiver?: string;
  location: SourceLocation;
  isMethodCall: boolean;
  qualifiedName?: string;        // Resolved from imports
}

export interface SymbolDecl {
  name: string;
  kind: 'variable' | 'constant' | 'type' | 'function' | 'class' | 'parameter';
  location: SourceLocation;
}
```

### 3.3 Language-Specific Extractors

Each language implements `IRExtractor` — the **only** place language-specific CST node types appear:

```typescript
export interface IRExtractor {
  readonly language: SupportedLanguage;
  extract(tree: Parser.Tree, source: string, filePath: string): CodeUnit;
}
```

| Language | Import CST Node | Function CST Node | Built-in Detection | Package Resolution |
|----------|:-:|:-:|:-:|:-:|
| TS/JS | `import_statement` | `function_declaration`, `arrow_function` | `node:*` prefix | npm: `@scope/pkg` or first segment |
| Python | `import_from_statement` | `function_definition` | stdlib module set | PyPI: top-level module |
| Java | `import_declaration` | `method_declaration` | `java.*`, `javax.*` | Maven: groupId from path |
| Go | `import_spec` | `function_declaration` | No dot in first segment | Go proxy: full module path |
| Kotlin | `import_header` | `function_declaration` | `kotlin.*` prefix | Maven: same as Java |

### 3.4 Why This Unifies the Analysis

**Before (V3)**: Each detector re-implements regex extraction. `HallucinationDetector` checks `package.json` (TS-only) against all languages. `StaleAPIDetector` matches `Buffer()` in Kotlin.

**After (V4)**: By the time a detector runs:
1. **Imports are extracted and annotated** — `ImportDecl` carries `isBuiltin`, `resolvedPackage`. No detector reads `package.json`.
2. **Symbols are resolved** — `CallSite` checked against `symbols[]` + `imports[].bindings`. Python `main()` won't be flagged.
3. **Deprecation is language-scoped** — `StaleAPIDetector` loads only the DB for `CodeUnit.language`. No JS rules on Kotlin.
4. **Complexity is real** — Computed from tree-sitter nesting, not regex brace-counting.

---

## 4. Two-Stage AI Scan Pipeline

### 4.1 Stage 1: Embedding Recall

**Purpose**: Fast, high-recall scan identifying code blocks likely to contain AI defects.

#### Embedding Model Selection

| Model | Size | Speed | Local? | Recommendation |
|-------|------|:-----:|:------:|:-:|
| **all-MiniLM-L6-v2** | 80MB | ~5ms/chunk | ✅ ONNX | Default local (L2) |
| **jina-embeddings-v3** | 570MB | ~20ms/chunk | ✅ ONNX | Optional local upgrade |
| **text-embedding-3-small** (OpenAI) | Remote | ~50ms/batch | ❌ | Default for L3 |

Ship `all-MiniLM-L6-v2` as default local model. 80MB ONNX, fast enough for CI.

#### Code Block Chunking Strategy

Code is chunked at **function/method boundaries** from the IR:

```typescript
export interface CodeChunk {
  filePath: string;
  scopeName: string;          // 'MyClass.method' or 'main'
  text: string;               // Function body + import context
  startLine: number;
  endLine: number;
  imports: string[];
}

function chunkCodeUnit(unit: CodeUnit): CodeChunk[] {
  return unit.functions.map(fn => ({
    filePath: unit.filePath,
    scopeName: fn.className ? `${fn.className}.${fn.name}` : fn.name,
    text: buildChunkText(unit, fn),
    startLine: fn.location.line,
    endLine: fn.location.endLine ?? fn.location.line + fn.bodyLoc,
    imports: unit.imports.map(i => i.module),
  }));
}
```

#### Defect Pattern Database

~50 curated patterns with pre-computed embeddings, shipped as `pattern-db.json`:

- **Hallucination patterns**: Non-existent APIs, fabricated library names, impossible signatures
- **Stale knowledge patterns**: Deprecated APIs, old framework patterns
- **Context loss patterns**: Variable name inconsistency, mid-function style changes
- **Over-engineering patterns**: Factory-of-factory, unnecessary abstractions
- **Incomplete patterns**: TODO stubs, empty catch, placeholder returns

#### Threshold Tuning

| Category | Default Threshold | FP Target | FN Target |
|----------|:-:|:-:|:-:|
| Hallucination | 0.75 | <10% | <20% |
| Stale Knowledge | 0.70 | <15% | <25% |
| Context Loss | 0.65 | <15% | <30% |
| Over-Engineering | 0.60 | <20% | <30% |

### 4.2 Stage 2: LLM Deep Scan

**Purpose**: Top-N suspicious blocks from Stage 1 → LLM for precise confirmation/rejection.

#### Prompt Engineering

Three specialized prompts:

1. **Hallucination Check**: Verify package existence, API signatures, method availability
2. **Logic Verification**: Error handling, race conditions, null safety, dead code
3. **API Correctness**: Deprecated APIs, version mismatches, training data staleness

Each prompt outputs structured JSON:
```json
{
  "issues": [{
    "line": 42,
    "type": "phantom-package",
    "severity": "critical",
    "description": "Package 'nonexistent-lib' does not exist on npm",
    "suggestion": "Use 'established-lib' instead",
    "confidence": 0.95
  }]
}
```

#### Context Window Management

- **Max chunk size**: 4,000 tokens/block. Large functions split at logical boundaries.
- **Batching**: Up to 3 blocks per LLM request.
- **Token budget**: Configurable, default 100K tokens for L3. Highest-suspicion blocks first.

#### Result Validation

LLM outputs validated before merging:
- Parse JSON (handle markdown code fences)
- Verify line numbers within chunk range
- Reject issues with confidence < 0.3
- Deduplicate against Stage 0 issues (same file ±3 lines)

### 4.3 SLA Level Mapping

| SLA Level | Stage 0 | Stage 1 | Stage 2 | Speed | Cost |
|-----------|:-------:|:-------:|:-------:|:-----:|:----:|
| **L1 Fast** | ✅ | ❌ | ❌ | ≤10s/100 files | Free |
| **L2 Standard** | ✅ | ✅ Local | ❌ | ≤30s/100 files | Free |
| **L3 Deep** | ✅ | ✅ Remote | ✅ LLM | ≤120s/100 files | $$$ |

**L1** is the default. Even without AI, V4 L1 is far superior to V3 because it has real parsing and registry verification.

---

## 5. Dynamic Registry Verification

### 5.1 Registry Abstraction

```typescript
// packages/core/src/registry/types.ts

export interface PackageRegistry {
  readonly name: string;
  readonly language: SupportedLanguage;

  /** Check if a package exists */
  verify(packageName: string): Promise<PackageVerifyResult>;

  /** Check if a specific API/export exists (optional) */
  verifyAPI?(packageName: string, apiPath: string, version?: string): Promise<APIVerifyResult>;

  /** Check deprecation status (optional) */
  checkDeprecated?(packageName: string, version?: string): Promise<DeprecatedInfo | null>;
}

export interface PackageVerifyResult {
  name: string;
  exists: boolean;
  latestVersion?: string;
  deprecation?: string;
  checkedAt: number;
  fromCache: boolean;
}
```

### 5.2 Built-in Registries (npm/PyPI/Maven/Go)

| Registry | Language | API Endpoint | Method | Package Name Format |
|----------|----------|:-------------|:------:|:-:|
| **npm** | TS/JS | `https://registry.npmjs.org/{pkg}` | `HEAD` | `lodash`, `@scope/pkg` |
| **PyPI** | Python | `https://pypi.org/pypi/{pkg}/json` | `HEAD` | `requests`, `scikit-learn` |
| **Maven Central** | Java/Kotlin | `https://search.maven.org/solrsearch/select?q=g:{group}+AND+a:{artifact}` | `GET` | `groupId:artifactId` |
| **Go Proxy** | Go | `https://proxy.golang.org/{module}/@v/list` | `GET` | `github.com/gin-gonic/gin` |

Each registry client:
- Uses `HEAD` requests where possible (minimal bandwidth)
- Handles 404 → `exists: false`, 200 → `exists: true`
- On network error → `exists: true` (conservative, avoid false positives)
- Returns structured `PackageVerifyResult`

```typescript
// packages/core/src/registry/npm.ts
export class NpmRegistry implements PackageRegistry {
  readonly name = 'npm';
  readonly language = 'typescript' as SupportedLanguage;

  constructor(private config: { url?: string; token?: string } = {}) {}

  async verify(packageName: string): Promise<PackageVerifyResult> {
    const url = `${this.config.url ?? 'https://registry.npmjs.org'}/${encodeURIComponent(packageName)}`;
    try {
      const resp = await fetch(url, {
        method: 'HEAD',
        headers: this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {},
        signal: AbortSignal.timeout(5000),
      });
      return {
        name: packageName,
        exists: resp.status !== 404,
        checkedAt: Date.now(),
        fromCache: false,
      };
    } catch {
      // Network error → assume exists (conservative)
      return { name: packageName, exists: true, checkedAt: Date.now(), fromCache: false };
    }
  }
}
```

### 5.3 Enterprise Configuration (Nexus/Artifactory)

Organizations using private registries can override URLs:

```yaml
# .ocrrc.yml
registry:
  npm:
    url: https://nexus.company.com/repository/npm-group/
    token: ${NPM_TOKEN}
  pypi:
    url: https://nexus.company.com/repository/pypi-group/simple/
    token: ${PYPI_TOKEN}
  maven:
    url: https://nexus.company.com/service/rest/v1/search
    token: ${MAVEN_TOKEN}
  go:
    proxy: https://goproxy.company.com
    token: ${GOPROXY_TOKEN}
```

### 5.4 Caching Strategy

```typescript
// packages/core/src/registry/cache.ts

export class RegistryCache {
  private store: Map<string, CacheEntry> = new Map();
  private persistPath: string;  // ~/.ocr/cache/registry.json
  private ttlMs: number;        // default 24 hours

  constructor(config: { ttlMs?: number; persistPath?: string }) {
    this.ttlMs = config.ttlMs ?? 24 * 60 * 60 * 1000;
    this.persistPath = config.persistPath ?? defaultCachePath();
    this.loadFromDisk();
  }

  get(key: string): PackageVerifyResult | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.checkedAt > this.ttlMs) {
      this.store.delete(key);
      return null;
    }
    return { ...entry.result, fromCache: true };
  }

  set(key: string, result: PackageVerifyResult): void {
    this.store.set(key, { result, checkedAt: Date.now() });
  }

  async persist(): Promise<void> {
    // Write to ~/.ocr/cache/registry.json
    // Prune expired entries before writing
  }
}
```

Cache hierarchy:
1. **In-memory** (per scan run) — instant lookup
2. **Disk** (`~/.ocr/cache/registry.json`) — persists across runs, TTL 24h default
3. **Network** — only when cache miss

### 5.5 Offline Mode

When network is unavailable:

1. **Disk cache available** — use cached results regardless of TTL (stale > unknown)
2. **No cache** — assume all packages exist (conservative). Log warning:
   ```
   ⚠ Registry verification unavailable (offline). Package existence checks skipped.
   ```
3. **User can force offline**: `--offline` flag or `OCR_OFFLINE=true`

---

## 6. Detection Engine Redesign

### 6.1 What We Detect (AI-Unique Only)

| Priority | Defect Type | Severity | Detector | Why AI-Unique |
|:--------:|-------------|:--------:|----------|---------------|
| 🔴 P0 | Hallucinated packages/APIs | critical | ImportVerifier | AI invents plausible-sounding packages |
| 🔴 P0 | Stale/deprecated API usage | high | StaleAPIDetector | Training data cutoff causes outdated suggestions |
| 🔴 P0 | Context window artifacts | medium | ContextCoherence | Long outputs lose consistency |
| 🟡 P1 | Over-engineering | medium | OverEngineering | AI adds unnecessary abstraction layers |
| 🟡 P1 | Incomplete implementation | medium | IncompleteImpl | AI leaves stubs/TODOs that look complete |
| 🟡 P1 | AI security anti-patterns | high | SecurityPattern | AI generates insecure-by-default code |
| 🟢 P2 | Training data leakage | low | (Stage 1 embedding) | Copied training examples verbatim |

### 6.2 What We DON'T Detect (Traditional Lint Territory)

| Type | Tool That Handles It | V4 Action |
|------|---------------------|-----------|
| Code formatting | Prettier, Black, gofmt | ❌ **Removed** |
| Naming conventions | ESLint, pylint, checkstyle | ❌ **Removed** |
| Basic type errors | tsc, mypy, javac | ❌ **Removed** |
| Import ordering | eslint-plugin-import, isort | ❌ **Removed** |
| Simple dead code | ESLint no-unused-vars, deadcode | ❌ **Removed** |
| Basic `any` usage (TS) | @typescript-eslint | ℹ️ **Info only, 0 score impact** |
| Simple duplicate code | SonarQube, jscpd | ❌ **Removed** |
| Generic security scanning | Snyk, Semgrep, CodeQL | ❌ **Removed** (unless AI-specific pattern) |

### 6.3 Detector Categories and Design

All V4 detectors implement:

```typescript
export interface DetectorV4 {
  readonly name: string;
  readonly version: string;

  /**
   * Analyze a CodeUnit (unified IR) and return issues.
   * The detector NEVER accesses the filesystem directly.
   * All needed info is in the CodeUnit or injected via context.
   */
  detect(unit: CodeUnit, ctx: DetectionContext): Promise<UnifiedIssue[]>;
}

export interface DetectionContext {
  /** Registry manager for package verification */
  registry: RegistryManager;
  /** i18n provider for issue messages */
  i18n: I18nProvider;
  /** User configuration */
  config: OCRConfig;
  /** Shared cache across detectors in a single run */
  cache: Map<string, unknown>;
}
```

**ImportVerifier** (replaces HallucinationDetector + DeepHallucinationDetector):
- Reads `unit.imports` (already extracted, annotated with `isBuiltin`, `isRelative`)
- For non-builtin, non-relative imports: calls `ctx.registry.verify(import.resolvedPackage)`
- Registry returns `exists: true/false`. No whitelists. No package.json reading.
- Also checks `unit.calls` against `unit.symbols` + `unit.imports[].bindings` for phantom function detection

**ContextCoherence** (replaces ContextBreakDetector):
- Analyzes `unit.functions` for naming consistency (variable naming style changes within a function)
- Checks for contradictory comments vs code logic (via CST comment nodes)
- Detects abrupt style shifts mid-file (indentation, brace style within same language)

**OverEngineering** (replaces OverEngineeringDetector):
- Uses pre-computed `FunctionDecl.cyclomaticComplexity`, `.cognitiveComplexity`, `.maxNestingDepth`
- No regex brace-counting. Metrics computed from tree-sitter CST.

**StaleAPIDetector** (rewritten):
- Loads deprecation DB **only for `unit.language`**. TypeScript file → JS deprecation DB. Kotlin file → Kotlin deprecation DB.
- Never applies cross-language deprecations.

**SecurityPattern** (rewritten):
- Pattern matching on CST nodes, not regex on raw text
- Language-aware: knows that `Buffer()` in Kotlin is not `Buffer()` in Node.js

---

## 7. Scoring Engine (Unchanged from V3)

The 4-dimension scoring model from V3 is preserved:

| Dimension | Weight | Maps From |
|-----------|:------:|-----------|
| **AI Faithfulness** | 35 | ImportVerifier, SecurityPattern |
| **Code Freshness** | 25 | StaleAPIDetector |
| **Context Coherence** | 20 | ContextCoherence |
| **Implementation Quality** | 20 | OverEngineering, IncompleteImpl |

Severity deductions remain:
- critical: -15, high: -10, medium: -5, low: -2, info: 0

Grade scale: A+ (95-100), A (90-94), B (80-89), C (70-79), D (60-69), F (0-59)

Default quality gate: C (70) = Pass.

---

## 8. i18n Framework

### 8.1 Architecture

```typescript
// packages/core/src/i18n/types.ts

export interface I18nProvider {
  /** Translate a message key with optional interpolation */
  t(key: string, params?: Record<string, string>): string;
  /** Current locale */
  readonly locale: 'en' | 'zh';
}
```

```typescript
// packages/core/src/i18n/provider.ts

import en from './locales/en.json';
import zh from './locales/zh.json';

const catalogs: Record<string, Record<string, string>> = { en, zh };

export class I18n implements I18nProvider {
  readonly locale: 'en' | 'zh';
  private catalog: Record<string, string>;

  constructor(locale: 'en' | 'zh' = 'en') {
    this.locale = locale;
    this.catalog = catalogs[locale] ?? catalogs.en;
  }

  t(key: string, params?: Record<string, string>): string {
    let msg = this.catalog[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        msg = msg.replaceAll(`{{${k}}}`, v);
      }
    }
    return msg;
  }
}
```

All user-visible strings pass through `i18n.t()`:
- Detector issue messages
- Report titles, headers, summaries
- CLI output (help text, progress, errors)
- Score descriptions and grade explanations

### 8.2 Supported Locales

| Locale | Code | Status |
|--------|:----:|:------:|
| English | `en` | ✅ Default |
| Chinese (Simplified) | `zh` | ✅ Supported |

Configuration:
```yaml
# .ocrrc.yml
locale: en  # or 'zh'
```

CLI flag: `--locale zh`

Environment variable: `OCR_LOCALE=zh`

### 8.3 Message Catalog Structure

```json
// packages/core/src/i18n/locales/en.json
{
  "detector.import-verifier.phantom-package": "Package '{{package}}' does not exist in the {{registry}} registry",
  "detector.import-verifier.phantom-function": "Function '{{name}}' is called but not declared or imported in this file",
  "detector.stale-api.deprecated": "API '{{api}}' is deprecated since {{language}} {{since}}. Use '{{replacement}}' instead",
  "detector.context-coherence.style-shift": "Code style changes abruptly at line {{line}} — possible context window boundary",
  "detector.over-engineering.high-complexity": "Function '{{name}}' has cyclomatic complexity {{value}} (threshold: {{threshold}})",
  "detector.security.hardcoded-secret": "Hardcoded secret detected ({{type}})",
  "report.title": "Open Code Review — Scan Report",
  "report.summary.files": "{{count}} files scanned",
  "report.summary.issues": "{{count}} issues found",
  "report.grade.description.A+": "Excellent — no AI-specific issues detected",
  "report.grade.description.F": "Critical — severe AI hallucinations or defects found",
  "cli.scan.start": "Scanning {{count}} files...",
  "cli.scan.complete": "Scan complete in {{duration}}",
  "cli.error.no-files": "No files matched the scan patterns"
}
```

```json
// packages/core/src/i18n/locales/zh.json
{
  "detector.import-verifier.phantom-package": "包 '{{package}}' 在 {{registry}} 注册表中不存在",
  "detector.import-verifier.phantom-function": "函数 '{{name}}' 被调用但未在此文件中声明或导入",
  "detector.stale-api.deprecated": "API '{{api}}' 自 {{language}} {{since}} 起已废弃，请使用 '{{replacement}}'",
  "detector.context-coherence.style-shift": "代码风格在第 {{line}} 行突然改变 — 可能是上下文窗口边界",
  "detector.over-engineering.high-complexity": "函数 '{{name}}' 圈复杂度为 {{value}}（阈值：{{threshold}}）",
  "detector.security.hardcoded-secret": "检测到硬编码密钥（{{type}}）",
  "report.title": "Open Code Review — 扫描报告",
  "report.summary.files": "已扫描 {{count}} 个文件",
  "report.summary.issues": "发现 {{count}} 个问题",
  "cli.scan.start": "正在扫描 {{count}} 个文件...",
  "cli.scan.complete": "扫描完成，耗时 {{duration}}",
  "cli.error.no-files": "没有文件匹配扫描模式"
}
```

---

## 9. Report System (Updated for New Pipeline)

Reports are updated to reflect the three-stage pipeline:

### Report Content Changes

| Section | V3 | V4 |
|---------|-----|-----|
| Pipeline info | Tier 1/2/3 | Stage 0/1/2 with SLA level |
| Issue source | `static` or `ai` | `structural`, `embedding`, `llm`, or `fused` |
| Registry status | N/A | Per-import verification result shown |
| Language coverage | Implied | Explicit per-language breakdown |
| Confidence scores | Optional | Always shown for embedding/LLM issues |
| i18n | Chinese hardcoded | Locale-driven via `I18nProvider` |

### Report Format Updates

All format renderers (Terminal, Markdown, HTML, JSON, SARIF, Badge) updated to:
1. Use `i18n.t()` for all user-visible text
2. Include SLA level and stage information
3. Show registry verification summary
4. Display confidence scores for AI-detected issues
5. Group issues by detection stage

---

## 10. Configuration

### 10.1 .ocrrc.yml Schema

```yaml
# .ocrrc.yml — project root

# Scan configuration
scan:
  paths:
    - src/**/*.ts
    - src/**/*.py
    - src/**/*.java
    - src/**/*.go
    - src/**/*.kt
  exclude:
    - "**/*.test.*"
    - "**/*.spec.*"
    - "**/node_modules/**"
    - "**/vendor/**"
    - "**/__pycache__/**"
    - "**/target/**"
  threshold: 70              # Quality gate score

# SLA level: L1 (fast) | L2 (standard) | L3 (deep)
sla: L1

# Locale: en | zh
locale: en

# Detectors
detectors:
  import-verifier:
    enabled: true
  context-coherence:
    enabled: true
  over-engineering:
    enabled: true
    cyclomaticThreshold: 15
    cognitiveThreshold: 20
    maxFunctionLength: 80
    maxNestingDepth: 5
  security-pattern:
    enabled: true
    skipTestFiles: true
  stale-api:
    enabled: true
  incomplete-impl:
    enabled: true
```

### 10.2 Registry Configuration

```yaml
# Registry settings (optional — defaults to public registries)
registry:
  npm:
    url: https://registry.npmjs.org
    token: ${NPM_TOKEN}
  pypi:
    url: https://pypi.org
    token: ${PYPI_TOKEN}
  maven:
    url: https://search.maven.org
    token: ${MAVEN_TOKEN}
  go:
    proxy: https://proxy.golang.org
    token: ${GOPROXY_TOKEN}
  cache:
    ttlMs: 86400000            # 24 hours
    persistPath: ~/.ocr/cache/registry.json
  offline: false               # Force offline mode
```

### 10.3 AI Configuration

```yaml
# AI pipeline settings (for L2/L3)
ai:
  # Stage 1: Embedding
  embedding:
    model: all-MiniLM-L6-v2   # Local ONNX model
    # model: text-embedding-3-small  # Remote (OpenAI)
    thresholds:
      hallucination: 0.75
      stale-knowledge: 0.70
      context-loss: 0.65
      over-engineering: 0.60

  # Stage 2: LLM
  llm:
    provider: ollama           # ollama | openai | anthropic
    model: deepseek-coder-v2:16b
    endpoint: http://localhost:11434
    temperature: 0.1
    maxTokensBudget: 100000
    topN: 20                   # Analyze top-20 suspicious blocks
    timeoutMs: 30000

  # Remote LLM (for L3)
  remote:
    provider: openai
    model: gpt-4o-mini
    apiKey: ${OPENAI_API_KEY}
```

### 10.4 Language Configuration

```yaml
# Language-specific overrides (optional)
languages:
  typescript:
    extensions: [.ts, .tsx, .js, .jsx, .mts, .cts]
  python:
    extensions: [.py, .pyi]
  java:
    extensions: [.java]
  go:
    extensions: [.go]
  kotlin:
    extensions: [.kt, .kts]
```

Configuration priority (highest to lowest):
1. CLI flags (`--sla L3`, `--locale zh`, `--threshold 80`)
2. Environment variables (`OCR_SLA=L3`, `OCR_LOCALE=zh`)
3. Project `.ocrrc.yml`
4. User global `~/.ocr/config.yml`
5. Built-in defaults

---

## 11. Migration from V3

### What Changes

| Component | V3 | V4 | Migration |
|-----------|-----|-----|-----------|
| Parser | oxc-parser + regex | tree-sitter (all langs) | Replace `packages/core/src/ast/` with `parser/` + `ir/` |
| Language adapters | `languages/*.ts` with regex | `ir/extractors/*.ts` with tree-sitter | Full rewrite |
| Hallucination detector | `hallucination.ts` + `deep-hallucination.ts` | `import-verifier.ts` | Merge into single detector |
| Package verification | Hardcoded whitelists | `registry/*.ts` | Delete all `Set<string>` whitelists |
| Stale API | Single JS deprecation DB | Per-language DBs | Split `deprecated-apis-js.json` → per-lang |
| Config file | `.aicv.yml` | `.ocrrc.yml` | Rename + new schema |
| AI pipeline | Provider abstraction only | Embedding + LLM stages | Major rewrite of `ai/` |
| i18n | None | Full i18n | Add `i18n/` module, wrap all strings |
| Dependencies | oxc-parser, ts-morph | web-tree-sitter, onnxruntime-node | Update `package.json` |

### What Stays

- **Scoring engine**: 4-dimension model, grade scale, quality gate — unchanged
- **Report formats**: Terminal, Markdown, HTML, JSON, SARIF, Badge — updated but same formats
- **CLI commands**: `scan`, `login`, `config` — same UX, updated flags
- **CI integration**: GitHub Action + GitLab Component — same interface
- **License system**: AICV key verification — unchanged
- **Web Portal**: Dashboard, auth — unchanged

### Breaking Changes

1. **Config file renamed**: `.aicv.yml` → `.ocrrc.yml` (auto-migration provided)
2. **Detector names changed**: `hallucination` → `import-verifier`, `deep-hallucination` removed
3. **`--fast` / `--deep` / `--ai` flags** → `--sla L1/L2/L3`
4. **`--ai-provider` / `--ai-model`** → moved to `.ocrrc.yml` `ai:` section
5. **Whitelist-based verification removed**: Custom `knownPackages` config no longer needed
6. **Minimum Node.js version**: 20+ (for `web-tree-sitter` WASM support)

---

## 12. Implementation Roadmap

### Phase 1 (Week 1–2): Foundation — tree-sitter + IR + Registry

| Task | Description | Priority |
|------|------------|:--------:|
| tree-sitter integration | `TreeSitterManager`, WASM grammar loading, unified `parse()` | P0 |
| IR types | `CodeUnit`, `ImportDecl`, `FunctionDecl`, `CallSite`, `SymbolDecl` | P0 |
| TS/JS extractor | tree-sitter CST → CodeUnit for TypeScript/JavaScript | P0 |
| Python extractor | tree-sitter CST → CodeUnit for Python | P0 |
| Registry abstraction | `PackageRegistry` interface, cache layer | P0 |
| npm registry | Live npm verification (HEAD requests) | P0 |
| PyPI registry | Live PyPI verification | P0 |
| ImportVerifier detector | Merge hallucination + deep-hallucination, use IR + registry | P0 |
| Delete old adapters | Remove `languages/` regex adapters, `ast/` oxc-parser wrapper | P1 |

**Deliverable**: TS/JS + Python scanning with real parsing, live registry verification, zero false positives from whitelists.

### Phase 2 (Week 3): Java/Go/Kotlin + Remaining Detectors

| Task | Description | Priority |
|------|------------|:--------:|
| Java extractor | tree-sitter CST → CodeUnit | P0 |
| Go extractor | tree-sitter CST → CodeUnit | P0 |
| Kotlin extractor | tree-sitter CST → CodeUnit | P0 |
| Maven registry | Maven Central verification | P0 |
| Go proxy registry | pkg.go.dev verification | P0 |
| StaleAPIDetector rewrite | Language-scoped deprecation DBs | P0 |
| ContextCoherence rewrite | IR-based analysis | P0 |
| OverEngineering rewrite | Use IR complexity metrics | P1 |
| SecurityPattern rewrite | CST-based pattern matching | P1 |
| IncompleteImpl | TODO/stub/empty-catch from IR | P1 |

**Deliverable**: All 5 languages × all structural detectors working. Rescan V3 demo repos — target <5% false positive rate.

### Phase 3 (Week 4): AI Pipeline + i18n

| Task | Description | Priority |
|------|------------|:--------:|
| Embedding pipeline | ONNX model loading, chunking, similarity search | P0 |
| Pattern DB | Curate 50 defect patterns, pre-compute embeddings | P0 |
| LLM integration | Ollama + OpenAI providers, prompt templates | P0 |
| Result fusion | Merge structural + embedding + LLM results | P0 |
| i18n framework | `I18nProvider`, en.json, zh.json catalogs | P0 |
| Report i18n | Update all report renderers to use `i18n.t()` | P1 |
| SLA framework | L1/L2/L3 pipeline routing, timing, degradation | P1 |

**Deliverable**: Full three-stage pipeline working. L1/L2/L3 SLA levels. English + Chinese output.

### Phase 4 (Week 5): Polish + Release

| Task | Description | Priority |
|------|------------|:--------:|
| Config migration | `.aicv.yml` → `.ocrrc.yml` auto-migration | P0 |
| CLI updates | New flags (`--sla`, `--locale`, `--offline`) | P0 |
| Benchmark suite | Automated false positive rate testing against demo repos | P0 |
| Documentation | Updated installation, configuration, CI guides | P0 |
| CI integration update | GitHub Action + GitLab Component for V4 | P1 |
| npm publish v0.4.0 | Release | P0 |

**Deliverable**: V4 released. Demo repos rescan: all Grade B or above. False positive rate <5%.

---

## Appendix: Technology Selection Summary

| Component | V3 Selection | V4 Selection | Reason for Change |
|-----------|:-------------|:-------------|:-------------------|
| Parser (all langs) | oxc-parser (TS) + regex (others) | **web-tree-sitter** | Unified parsing for all 5 languages |
| IR | None (raw text) | **Custom CodeUnit IR** | Language-neutral detector input |
| Package verification | Hardcoded `Set<string>` | **Live registry HTTP** | Eliminates false positives from whitelists |
| Embedding model | None | **all-MiniLM-L6-v2** (ONNX) | Local, fast, good quality for code similarity |
| ONNX runtime | None | **onnxruntime-node** | Run embedding models locally |
| i18n | None | **Custom I18nProvider** | Lightweight, no external deps |
| Config format | `.aicv.yml` | **`.ocrrc.yml`** | Cleaner name, expanded schema |
| Terminal colors | picocolors | picocolors (unchanged) | Still the best option |
| Scoring | V3 4-dimension | V3 4-dimension (unchanged) | Proven model |

---

> **Summary**: V4 is a **ground-up redesign of the analysis pipeline** while preserving the scoring model, report formats, and infrastructure (License, Portal, CI). The core insight: you cannot build a multi-language code analysis tool by combining a TypeScript-specific AST parser with regex for everything else and static whitelists. V4 fixes this with three pillars: **unified tree-sitter parsing**, **live registry verification**, and a **two-stage AI pipeline** (embedding recall + LLM precision). The result is architecturally sound multi-language support with <5% false positive rate — down from >95% in V3.

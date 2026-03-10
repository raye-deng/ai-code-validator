# New Detectors Technical Design

> Version: 1.0 | Date: 2026-03-10 | Author: AI Code Validator Team

## Overview

Three major upgrades for `@ai-code-validator/core`:
1. **AST-level detection** — replacing regex/string matching with AST traversal
2. **Five new detectors** — StaleAPI, SecurityPattern, TypeSafety, OverEngineering, DeepHallucination
3. **AI analysis integration** — local (Ollama) and remote (GPT-4o/Claude) AI-assisted review

---

## 一、AST Tool Selection

### 1.1 Evaluation Matrix

| Tool | Parse Speed (100 files) | Type Info | Pkg Size | Deps | TS Support | API Ease | Score |
|------|------------------------|-----------|----------|------|-----------|----------|-------|
| **TypeScript Compiler API** | ~2.5s | ✅ Full | 0 (bundled) | 0 | ★★★★★ | ★★☆☆☆ | ⭐⭐⭐⭐ |
| **ts-morph** v27 | ~3.0s | ✅ Full | ~1.8MB | 1 | ★★★★★ | ★★★★★ | ⭐⭐⭐⭐⭐ |
| **@swc/core** v1.15 | ~0.3s | ❌ | ~35MB | 2 | ★★★★☆ | ★★★☆☆ | ⭐⭐⭐ |
| **oxc-parser** v0.117 | ~0.1s | ❌ | ~15MB | 1 | ★★★★☆ | ★★★☆☆ | ⭐⭐⭐⭐ |
| **tree-sitter-typescript** v0.23 | ~0.4s | ❌ | ~8MB | 3 | ★★★☆☆ | ★★☆☆☆ | ⭐⭐ |
| **@babel/parser** v7.29 | ~1.5s | ❌ | ~2MB | 1 | ★★★★☆ | ★★★★☆ | ⭐⭐⭐ |

### 1.2 Key Findings

- **oxc-parser**: 3x faster than SWC (per oxc.rs benchmarks), ESTree-compatible, production-ready, passes 99% Babel/TS parser tests. Best syntax-only parser available.
- **ts-morph**: Best developer experience for type-aware analysis. Wraps TS Compiler API with ergonomic navigation/manipulation. ~20% overhead over raw TS API.
- **@swc/core**: Fast but non-ESTree AST format, large binary, no type info. Better suited for transpilation than analysis.
- **tree-sitter**: CST-based, requires node-gyp, unfamiliar API. Best for editors, not CLI tools.
- **@babel/parser**: Mature, pure JS (no native deps), good fallback option but slower.

### 1.3 Recommended Architecture: Two-Tier Parsing

```
┌──────────────────────────────────────────────────────┐
│  Tier 1: Fast Parse (oxc-parser) — always runs       │
│  ┌────────────────────────────────────────────┐      │
│  │ StaleAPIDetector                           │      │
│  │ SecurityPatternDetector                    │      │
│  │ OverEngineeringDetector                    │      │
│  │ Existing 4 detectors (AST-upgraded)        │      │
│  │ Speed: ~0.1s / 100 files                   │      │
│  └────────────────────────────────────────────┘      │
│                                                       │
│  Tier 2: Type-Aware (ts-morph) — opt-in              │
│  ┌────────────────────────────────────────────┐      │
│  │ TypeSafetyDetector                         │      │
│  │ DeepHallucinationDetector (type checks)    │      │
│  │ Speed: ~3s / 100 files                     │      │
│  │ Skip with --fast flag                      │      │
│  └────────────────────────────────────────────┘      │
│                                                       │
│  Tier 3: AI Analysis — opt-in (--ai flag)            │
│  ┌────────────────────────────────────────────┐      │
│  │ Local AI (Ollama) or Remote (GPT-4o/Claude)│      │
│  │ Runs on flagged files only                 │      │
│  │ Speed: ~10-30s per file                    │      │
│  └────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────┘
```

**Dependency impact**:
```json
{
  "dependencies": {
    "oxc-parser": "^0.117.0",
    "@oxc-project/types": "^0.117.0"
  },
  "optionalDependencies": {
    "ts-morph": "^27.0.0"
  }
}
```
Replaces current `acorn` + `acorn-walk`. ts-morph is optional — tool works without it, skipping Tier 2 detectors.

**AST Walker** (lightweight ESTree traversal for oxc-parser output):
```typescript
// src/ast/walker.ts
type VisitorMap = Partial<Record<string, (node: any, parent: any) => void>>;

function walkAST(node: any, visitors: VisitorMap, parent?: any): void {
  if (!node || typeof node !== 'object') return;
  if (node.type) {
    const visit = visitors[node.type];
    if (visit) visit(node, parent);
  }
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (child && typeof child === 'object') {
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item?.type) walkAST(item, visitors, node);
        }
      } else if (child.type) {
        walkAST(child, visitors, node);
      }
    }
  }
}
```

---

## 二、New Detector Detailed Design

### 2.1 StaleAPIDetector

**Purpose**: Detect deprecated/removed APIs from Node.js, browser, and npm packages.

**Algorithm**:
1. Parse source → ESTree AST (oxc-parser)
2. Walk for `CallExpression`, `NewExpression`, `ImportDeclaration`
3. Resolve callee to qualified name (e.g., `fs.exists`, `new Buffer`)
4. Lookup in embedded deprecated-api JSON database
5. Emit issue with replacement suggestion and reference URL

**Data structures**:
```typescript
interface DeprecatedAPIEntry {
  pattern: string;               // "fs.exists", "new Buffer"
  deprecatedSince?: string;      // "Node.js 10.0"
  removedIn?: string;            // "Node.js 16.0"
  replacement: string;           // "fs.access()"
  severity: 'error' | 'warning';
  source: 'nodejs' | 'mdn' | 'npm' | 'custom';
  reference?: string;
}
```

**Database maintenance**: Weekly GitHub Actions cron scrapes Node.js DEP list + MDN deprecated APIs → merges → outputs `src/data/deprecated-apis.json` (~50KB) → auto-PR.

**Priority entries**: `Buffer()`, `fs.exists()`, `crypto.createCipher()`, `url.parse()`, `domain`, `util.puts`, `document.write()`, `KeyboardEvent.keyCode`.

**Pseudocode**:
```typescript
class StaleAPIDetector {
  private lookup: Map<string, DeprecatedAPIEntry>;

  constructor() {
    const db = loadEmbeddedJSON('deprecated-apis.json');
    this.lookup = new Map(db.entries.map(e => [e.pattern, e]));
  }

  analyze(filePath: string, source: string): DetectorResult {
    const { program } = parseSync(filePath, source);
    const issues: Issue[] = [];
    walkAST(program, {
      CallExpression: (node) => {
        const name = resolveCallee(node.callee); // "fs.exists"
        const entry = this.lookup.get(name);
        if (entry) issues.push(makeIssue(node, entry));
      },
      NewExpression: (node) => {
        const name = resolveCallee(node.callee); // "Buffer"
        const entry = this.lookup.get(`new ${name}`) || this.lookup.get(name);
        if (entry) issues.push(makeIssue(node, entry));
      },
    });
    return { file: filePath, issues, score: computeScore(issues) };
  }
}
```

---

### 2.2 SecurityPatternDetector

**Purpose**: Hardcoded secrets, SQL injection, unsafe eval, insecure crypto.

**Sub-detectors**:

| Check | AST Nodes | CWE |
|-------|----------|-----|
| Hardcoded secrets | VariableDeclarator, Property | CWE-798 |
| SQL injection | TemplateLiteral with expressions | CWE-89 |
| eval/Function | CallExpression, NewExpression | CWE-95 |
| Insecure crypto | CallExpression (createHash) | CWE-328 |
| Math.random in security | MemberExpression | CWE-338 |

**Algorithm**:
```
1. Parse → AST
2. Skip test files for secret detection
3. Walk AST:
   - VariableDeclarator: name matches /password|secret|api_?key|token/i
     + value is StringLiteral with length >= 4
     + exclude process.env references → emit hardcoded-secret
   - TemplateLiteral: quasis contains SQL keywords
     + has expressions (${}) → emit sql-injection
     + exclude tagged templates (sql``, Prisma.$queryRaw)
   - CallExpression: callee === 'eval' → emit unsafe-eval
   - CallExpression: crypto.createHash('md5'|'sha1') → emit insecure-crypto
   - MemberExpression: Math.random in security context → emit insecure-crypto
```

**Pseudocode**:
```typescript
class SecurityPatternDetector {
  private secretNames = /(?:password|passwd|pwd|api_?key|secret|token|credential|private_?key)$/i;
  private sqlKeywords = /\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i;

  analyze(filePath: string, source: string): DetectorResult {
    const isTest = /\.(test|spec)\.[jt]sx?$/.test(filePath);
    const { program } = parseSync(filePath, source);
    const issues: Issue[] = [];

    walkAST(program, {
      VariableDeclarator: (node) => {
        if (isTest) return;
        if (node.init?.type !== 'Literal' || typeof node.init.value !== 'string') return;
        const name = node.id?.name || '';
        if (this.secretNames.test(name) && node.init.value.length >= 4) {
          issues.push({ type: 'hardcoded-secret', severity: 'error', cweId: 'CWE-798', /*...*/ });
        }
      },
      TemplateLiteral: (node) => {
        if (node.expressions.length === 0) return;
        const raw = node.quasis.map(q => q.value.raw).join(' ');
        if (this.sqlKeywords.test(raw)) {
          issues.push({ type: 'sql-injection', severity: 'error', cweId: 'CWE-89', /*...*/ });
        }
      },
      CallExpression: (node) => {
        if (node.callee?.name === 'eval') {
          issues.push({ type: 'unsafe-eval', severity: 'error', cweId: 'CWE-95', /*...*/ });
        }
        // crypto.createHash('md5'|'sha1')
        if (node.callee?.property?.name === 'createHash') {
          const algo = node.arguments[0]?.value;
          if (algo === 'md5' || algo === 'sha1') {
            issues.push({ type: 'insecure-crypto', severity: 'warning', cweId: 'CWE-328', /*...*/ });
          }
        }
      },
    });
    return { file: filePath, issues, score: computeScore(issues) };
  }
}
```

---

### 2.3 TypeSafetyDetector

**Purpose**: Detect `any` abuse, missing return types, unsafe assertions. **Requires ts-morph (Tier 2).**

**Algorithm**:
```
1. Create/reuse ts-morph Project
2. Add source file
3. Scan all type nodes → count "any" vs total → any-ratio
4. Find exported functions without return type annotation → flag if >5 lines
5. Find AsExpression with "as any" / "as unknown" → flag
6. Compute metrics: anyRatio, missingReturnTypes, unsafeAssertions
```

**Thresholds**:
| Metric | Warning | Error |
|--------|---------|-------|
| any-ratio | >10% | >25% |
| missing return types | any exported fn >5 lines | — |
| `as any` assertion | — | always error |

**Key data**:
```typescript
interface TypeSafetyMetrics {
  totalTypeAnnotations: number;
  anyCount: number;
  anyRatio: number;
  missingReturnTypes: number;
  unsafeAssertions: number;
}
```

**Pseudocode**:
```typescript
class TypeSafetyDetector {
  private project: Project | null = null;

  analyze(filePath: string, source: string, projectRoot: string): TypeSafetyResult {
    const project = this.getProject(projectRoot);
    const sf = project.createSourceFile(filePath, source, { overwrite: true });
    const issues: Issue[] = [];
    let anyCount = 0, totalTypes = 0, unsafeAsserts = 0;

    sf.forEachDescendant(node => {
      // Count type annotations
      if (Node.isKeywordTypeNode(node)) {
        totalTypes++;
        if (node.getText() === 'any') {
          anyCount++;
          issues.push({ type: 'any-usage', severity: 'warning', /*...*/ });
        }
      }
      // Unsafe assertions
      if (Node.isAsExpression(node) && node.getTypeNode()?.getText() === 'any') {
        unsafeAsserts++;
        issues.push({ type: 'unsafe-assertion', severity: 'error', /*...*/ });
      }
    });

    // Missing return types
    for (const fn of sf.getFunctions().filter(f => f.isExported())) {
      if (!fn.getReturnTypeNode()) {
        const lines = (fn.getBody()?.getEndLineNumber() ?? 0) - (fn.getBody()?.getStartLineNumber() ?? 0);
        if (lines > 5) {
          issues.push({
            type: 'missing-return-type', severity: 'warning',
            suggestion: `Add: ${fn.getReturnType().getText()}`,
          });
        }
      }
    }

    return { file: filePath, issues, metrics: { anyRatio: anyCount/totalTypes, ... }, score };
  }

  static isAvailable(): boolean {
    try { require.resolve('ts-morph'); return true; } catch { return false; }
  }
}
```

---

### 2.4 OverEngineeringDetector

**Purpose**: Detect excessive complexity — cyclomatic complexity, cognitive complexity, nesting, function length, parameter count.

**Algorithms**:

**Cyclomatic Complexity (CC)**:
```
CC = 1
   + count(if | else if | for | while | do | case | catch)
   + count(&& || ?? in conditions)
   + count(ternary ?)
```

**Cognitive Complexity (CoC)** per SonarSource:
```
For each control flow break:
  +1 base for: if, else if, else, switch, for, while, do, catch, ternary, logical ops
  +nesting_level penalty for: if, for, while, do, catch, switch, ternary
Nesting increases on entering: if/else/for/while/do/switch/catch/lambda bodies
Consecutive logical ops (a && b && c) = +1 total
```

**Thresholds**:

| Metric | Warning | Error |
|--------|---------|-------|
| Cyclomatic Complexity | >10 | >20 |
| Cognitive Complexity | >15 | >30 |
| Function Length | >50 lines | >100 lines |
| Nesting Depth | >4 | >6 |
| Parameters | >5 | >8 |

**Pseudocode**:
```typescript
class OverEngineeringDetector {
  analyze(filePath: string, source: string): DetectorResult {
    const { program } = parseSync(filePath, source);
    const issues: Issue[] = [];
    const functions = extractFunctions(program); // FunctionDeclaration, ArrowFunction, Method

    for (const fn of functions) {
      const cc = computeCyclomaticComplexity(fn.body);
      const coc = computeCognitiveComplexity(fn.body);
      const lines = fn.end.line - fn.start.line;
      const depth = computeMaxNesting(fn.body);
      const params = fn.params.length;

      if (cc > 20)     issues.push({ type: 'high-complexity', severity: 'error', metrics: { cc } });
      else if (cc > 10) issues.push({ type: 'high-complexity', severity: 'warning', metrics: { cc } });

      if (coc > 30)    issues.push({ type: 'high-complexity', severity: 'error', metrics: { coc } });
      else if (coc > 15) issues.push({ type: 'high-complexity', severity: 'warning', metrics: { coc } });

      if (lines > 100) issues.push({ type: 'long-function', severity: 'error' });
      else if (lines > 50) issues.push({ type: 'long-function', severity: 'warning' });

      if (depth > 6) issues.push({ type: 'deep-nesting', severity: 'error' });
      else if (depth > 4) issues.push({ type: 'deep-nesting', severity: 'warning' });

      if (params > 8) issues.push({ type: 'too-many-params', severity: 'error' });
      else if (params > 5) issues.push({ type: 'too-many-params', severity: 'warning' });
    }

    return { file: filePath, issues, score: computeScore(issues) };
  }
}

function computeCyclomaticComplexity(body: ASTNode): number {
  let cc = 1;
  walkAST(body, {
    IfStatement: () => { cc++; },
    ForStatement: () => { cc++; },
    ForInStatement: () => { cc++; },
    ForOfStatement: () => { cc++; },
    WhileStatement: () => { cc++; },
    DoWhileStatement: () => { cc++; },
    SwitchCase: (node) => { if (node.test) cc++; }, // skip default
    CatchClause: () => { cc++; },
    ConditionalExpression: () => { cc++; },
    LogicalExpression: () => { cc++; },
  });
  return cc;
}

function computeMaxNesting(body: ASTNode): number {
  let max = 0, current = 0;
  const NESTING_NODES = new Set([
    'IfStatement','ForStatement','ForInStatement','ForOfStatement',
    'WhileStatement','DoWhileStatement','SwitchStatement','CatchClause',
  ]);
  walkAST(body, {
    enter: (node) => {
      if (NESTING_NODES.has(node.type)) { current++; max = Math.max(max, current); }
    },
    leave: (node) => {
      if (NESTING_NODES.has(node.type)) current--;
    },
  });
  return max;
}
```

---

### 2.5 DeepHallucinationDetector

**Purpose**: Verify AI-hallucinated code at a deeper level than the existing HallucinationDetector:
- Verify npm packages actually exist (registry API)
- Verify imported names are actually exported by the package
- Detect non-existent method calls (requires type info)

**Algorithm**:
```
Phase 1: Package Existence (network, cacheable)
1. Extract all import specifiers from AST
2. Filter to npm packages (skip relative, node: builtins)
3. Query npm registry: GET https://registry.npmjs.org/{package}
4. Cache results locally (TTL: 24h, file: .ai-validator-cache/npm-registry.json)
5. If 404 → phantom-package (error)

Phase 2: Export Verification (network, cacheable)
1. For packages that exist, get exported names
2. Strategy: download package tarball index.d.ts or read local node_modules
3. Compare imported names against actual exports
4. If mismatch → phantom-export (error)

Phase 3: Method Existence (ts-morph, Tier 2)
1. Get type of imported object via ts-morph type checker
2. List available methods/properties on the type
3. Walk CallExpression nodes on imported objects
4. If method not in type → phantom-method (error)
```

**Data structures**:
```typescript
interface DeepHallucinationIssue {
  type: 'phantom-package' | 'phantom-export' | 'phantom-method';
  severity: 'error';
  file: string;
  line: number;
  packageName?: string;
  exportName?: string;
  methodName?: string;
  message: string;
  suggestion: string;
}

interface NpmRegistryCache {
  [packageName: string]: {
    exists: boolean;
    exports?: string[];
    checkedAt: number; // timestamp
  };
}
```

**npm Registry Verification**:
```typescript
async function verifyPackageExists(name: string, cache: NpmRegistryCache): Promise<boolean> {
  if (cache[name] && Date.now() - cache[name].checkedAt < 86400000) {
    return cache[name].exists;
  }
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
      method: 'HEAD', // lightweight check
      signal: AbortSignal.timeout(5000),
    });
    cache[name] = { exists: res.ok, checkedAt: Date.now() };
    return res.ok;
  } catch {
    return true; // assume exists on network error (conservative)
  }
}
```

**Export Verification Strategy**:
```typescript
async function verifyExports(pkgName: string, importedNames: string[]): Promise<string[]> {
  const missing: string[] = [];

  // Strategy 1: Read from local node_modules
  const typesPath = resolveTypesPath(pkgName); // node_modules/@types/pkg or pkg/index.d.ts
  if (typesPath) {
    const exports = parseExportsFromDTS(typesPath);
    for (const name of importedNames) {
      if (!exports.has(name)) missing.push(name);
    }
    return missing;
  }

  // Strategy 2: Fetch from npm (fallback)
  // Download package tarball, extract index.d.ts, parse exports
  // This is expensive — only for CI, cached aggressively
  return missing;
}
```

**Pseudocode**:
```typescript
class DeepHallucinationDetector {
  private cache: NpmRegistryCache = {};

  async analyze(filePath: string, source: string, projectRoot: string): Promise<DetectorResult> {
    const { program } = parseSync(filePath, source);
    const issues: Issue[] = [];
    const imports = extractImportSpecifiers(program);

    // Phase 1: Package existence
    for (const imp of imports) {
      const pkg = getPackageName(imp.source);
      if (!pkg || isBuiltin(pkg) || isRelative(imp.source)) continue;
      const exists = await verifyPackageExists(pkg, this.cache);
      if (!exists) {
        issues.push({
          type: 'phantom-package', severity: 'error',
          line: imp.line, packageName: pkg,
          message: `Package '${pkg}' does not exist on npm registry`,
          suggestion: 'This import was likely hallucinated by AI. Remove or replace.',
        });
      }
    }

    // Phase 2: Export verification
    for (const imp of imports) {
      if (imp.specifiers.length === 0) continue;
      const pkg = getPackageName(imp.source);
      if (!pkg || issues.some(i => i.packageName === pkg)) continue;
      const missing = await verifyExports(pkg, imp.specifiers.map(s => s.imported));
      for (const name of missing) {
        issues.push({
          type: 'phantom-export', severity: 'error',
          line: imp.line, packageName: pkg, exportName: name,
          message: `'${name}' is not exported from '${pkg}'`,
          suggestion: 'Check the package documentation for correct export names.',
        });
      }
    }

    // Phase 3: Method existence (only if ts-morph available)
    if (TypeSafetyDetector.isAvailable()) {
      // Use type checker to verify method calls on imported objects
      // ... (delegated to ts-morph type resolution)
    }

    this.persistCache();
    return { file: filePath, issues, score: computeScore(issues) };
  }
}
```

---

## 三、AI Analysis Integration Design

### 3.1 Local AI Integration (Ollama)

**Configuration**:
```typescript
interface LocalAIConfig {
  provider: 'ollama';
  baseUrl: string;        // default: "http://localhost:11434"
  model: string;          // e.g., "deepseek-coder-v2:16b", "codellama:13b"
  maxTokens: number;      // default: 4096
  temperature: number;    // default: 0.1 (low for deterministic analysis)
  timeoutMs: number;      // default: 30000
}
```

**Prompt Templates**:

#### Code Review Prompt
```
You are a senior TypeScript code reviewer. Analyze the following code for quality issues.

## File: {{filePath}}

```typescript
{{sourceCode}}
```

## Context
- Project type: {{projectType}} (e.g., Node.js API, React frontend)
- Existing issues found by static analysis: {{staticIssuesSummary}}

## Task
Review this code and identify:
1. Logic errors or edge cases not handled
2. Security vulnerabilities
3. Performance anti-patterns
4. AI-generated code patterns (hallucinations, placeholder code, incomplete logic)

## Output Format
Respond ONLY with valid JSON:
```json
{
  "issues": [
    {
      "line": <number>,
      "severity": "error" | "warning" | "info",
      "category": "logic" | "security" | "performance" | "hallucination" | "style",
      "message": "<description>",
      "suggestion": "<fix suggestion>",
      "confidence": <0.0-1.0>
    }
  ],
  "summary": "<one-line summary>",
  "overallRisk": "low" | "medium" | "high"
}
```
```

#### Security Analysis Prompt
```
You are a security specialist reviewing TypeScript code. Focus ONLY on security issues.

## File: {{filePath}}

```typescript
{{sourceCode}}
```

## Check for:
1. Injection vulnerabilities (SQL, NoSQL, command, XSS)
2. Hardcoded credentials or secrets
3. Insecure cryptographic usage
4. Authentication/authorization bypasses
5. Unsafe deserialization
6. Path traversal vulnerabilities
7. Insecure randomness

## Output Format
Respond ONLY with valid JSON:
```json
{
  "vulnerabilities": [
    {
      "line": <number>,
      "severity": "critical" | "high" | "medium" | "low",
      "cweId": "CWE-XXX",
      "title": "<vulnerability title>",
      "description": "<what's wrong>",
      "remediation": "<how to fix>",
      "confidence": <0.0-1.0>
    }
  ],
  "securityScore": <0-100>
}
```
```

#### Logic Consistency Prompt
```
You are analyzing code for logical consistency and completeness.

## File: {{filePath}}

```typescript
{{sourceCode}}
```

## Check for:
1. Functions that declare behavior but don't implement it
2. Error handling that swallows errors silently
3. Missing null/undefined checks before property access
4. Async operations without proper error boundaries
5. State mutations without proper synchronization
6. Incomplete switch/case coverage
7. Variables assigned but never used meaningfully

## Output Format
Respond ONLY with valid JSON:
```json
{
  "issues": [
    {
      "line": <number>,
      "type": "incomplete-logic" | "error-swallow" | "null-risk" | "race-condition" | "dead-code",
      "message": "<description>",
      "suggestion": "<fix>",
      "confidence": <0.0-1.0>
    }
  ]
}
```
```

**Response Parsing**:
```typescript
interface AIAnalysisResult {
  provider: 'ollama' | 'openai' | 'anthropic';
  model: string;
  issues: AIIssue[];
  rawResponse: string;
  latencyMs: number;
  tokenUsage?: { input: number; output: number };
}

function parseAIResponse(raw: string): AIIssue[] {
  // 1. Extract JSON from response (handle markdown code blocks)
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    const issues = parsed.issues || parsed.vulnerabilities || [];
    // 2. Validate each issue has required fields
    return issues.filter(i => i.line && i.message && i.confidence >= 0.5);
  } catch {
    return []; // unparseable response = no issues (conservative)
  }
}
```

### 3.2 Remote AI Integration (OpenAI / Anthropic)

**Configuration**:
```typescript
interface RemoteAIConfig {
  provider: 'openai' | 'anthropic';
  apiKey: string;              // from env: OPENAI_API_KEY or ANTHROPIC_API_KEY
  model: string;               // "gpt-4o", "claude-sonnet-4-20250514"
  maxTokens: number;           // default: 4096
  temperature: number;         // default: 0.1
  timeoutMs: number;           // default: 60000
  maxFileSizeBytes: number;    // default: 50000 (skip large files)
}
```

**API call strategy**:
- Batch files with combined context when total size < 8000 tokens
- Single file per request for larger files
- Rate limiting: max 10 requests/minute (configurable)
- Retry with exponential backoff on 429/500 errors
- Budget cap: configurable max spend per run

**Same prompt templates as local AI** (section 3.1), with these adjustments for remote:
- Higher `maxTokens` (remote models handle longer output)
- Add system message for role definition
- Use structured output / JSON mode when available (OpenAI `response_format: { type: "json_object" }`)

### 3.3 Result Fusion Strategy

**Problem**: Static analysis and AI analysis produce overlapping but complementary results. Need a strategy to merge without duplicates and assign unified confidence scores.

**Fusion Algorithm**:

```
Input: StaticResults[], AIResults[]

1. Normalize all issues to common format:
   { file, line, category, message, severity, source, confidence }

2. Deduplication:
   For each AI issue:
     Find matching static issue (same file + line ± 3 lines + same category)
     If match found:
       - Keep static issue (higher precision)
       - Boost confidence: final_confidence = max(static.confidence, ai.confidence)
       - Append AI suggestion to static issue if more detailed
     If no match:
       - Add AI issue with its own confidence
       - Apply AI confidence discount: final_confidence = ai.confidence * 0.8

3. Confidence scoring:
   - Static analysis issues: base confidence = 0.9 (high precision)
   - AI issues confirmed by static: confidence = 0.95
   - AI-only issues: confidence = ai.confidence * 0.8
   - AI issues contradicting static: confidence = ai.confidence * 0.5

4. Final filtering:
   - Remove issues with confidence < 0.3
   - Sort by severity (error > warning) then confidence (descending)
```

**Implementation**:
```typescript
interface UnifiedIssue {
  file: string;
  line: number;
  category: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
  confidence: number;         // 0.0 - 1.0
  sources: ('static' | 'ai')[];
  aiModel?: string;
  cweId?: string;
}

function fuseResults(
  staticResults: DetectorResult[],
  aiResults: AIAnalysisResult[],
): UnifiedIssue[] {
  const unified: UnifiedIssue[] = [];

  // Add all static issues with high confidence
  for (const sr of staticResults) {
    for (const issue of sr.issues) {
      unified.push({
        ...issue,
        confidence: 0.9,
        sources: ['static'],
      });
    }
  }

  // Merge AI issues
  for (const ar of aiResults) {
    for (const aiIssue of ar.issues) {
      const match = unified.find(u =>
        u.file === aiIssue.file &&
        Math.abs(u.line - aiIssue.line) <= 3 &&
        u.category === aiIssue.category
      );

      if (match) {
        // Boost existing static issue
        match.confidence = Math.max(match.confidence, aiIssue.confidence);
        match.sources.push('ai');
        if (aiIssue.suggestion && !match.suggestion) {
          match.suggestion = aiIssue.suggestion;
        }
      } else {
        // New AI-only issue
        unified.push({
          ...aiIssue,
          confidence: aiIssue.confidence * 0.8,
          sources: ['ai'],
          aiModel: ar.model,
        });
      }
    }
  }

  return unified
    .filter(u => u.confidence >= 0.3)
    .sort((a, b) => {
      const sevOrder = { error: 0, warning: 1, info: 2 };
      const sevDiff = sevOrder[a.severity] - sevOrder[b.severity];
      return sevDiff !== 0 ? sevDiff : b.confidence - a.confidence;
    });
}
```

**Scoring integration with existing ScoringEngine**:
```typescript
// New dimension added to scoring
const WEIGHTS_V3 = {
  completeness: 25,   // was 30 — reduced to make room
  coherence: 20,      // was 25
  consistency: 20,    // was 25
  conciseness: 15,    // was 20
  security: 10,       // NEW
  complexity: 10,     // NEW
} as const;
```

---

## 四、Performance Budget

### 4.1 Target Performance

| Mode | 100 Files | 500 Files | Description |
|------|-----------|-----------|-------------|
| `--fast` (Tier 1 only) | <0.5s | <2s | oxc-parser + syntax-only detectors |
| Default (Tier 1 + 2) | <5s | <15s | + ts-morph type-aware detectors |
| `--ai local` | <30s | <120s | + Ollama analysis on flagged files |
| `--ai remote` | <60s | <180s | + OpenAI/Claude on flagged files |
| `--deep` (all + npm verify) | <10s | <30s | + npm registry checks (cached) |

### 4.2 Optimization Strategies

1. **Parallel file processing**: Use `Promise.all` with concurrency limit (os.cpus().length) for Tier 1
2. **AST caching**: Cache parsed ASTs within a single run (Map<filePath, AST>)
3. **Lazy Tier 2 loading**: Only `require('ts-morph')` when Tier 2 detectors are enabled
4. **npm registry caching**: File-based cache (`.ai-validator-cache/npm.json`, TTL: 24h)
5. **AI batch optimization**: Group small files into single AI prompts (under token limit)
6. **Early termination**: If a file scores <20 after Tier 1, skip Tier 2 (it's already failing)
7. **Incremental analysis**: Only analyze changed files (via git diff integration)

### 4.3 Memory Budget

| Component | Estimated Memory |
|-----------|-----------------|
| oxc-parser (100 files) | ~50MB peak |
| ts-morph Project (100 files) | ~200MB peak |
| Deprecated API database | ~5MB |
| npm registry cache | ~1MB |
| Total (default mode) | ~256MB |

### 4.4 Benchmarking Plan

```typescript
// bench/performance.bench.ts
import { bench, describe } from 'vitest';

describe('Parser Performance', () => {
  const files = loadTestFiles(100); // 100 real TS files

  bench('oxc-parser (Tier 1)', () => {
    for (const f of files) parseSync(f.path, f.source);
  });

  bench('ts-morph (Tier 2)', () => {
    const project = new Project();
    for (const f of files) project.createSourceFile(f.path, f.source, { overwrite: true });
  });

  bench('Full pipeline (Tier 1 + 2)', () => {
    runFullAnalysis(files);
  });
});
```

---

## 五、Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Integrate oxc-parser, replace acorn/acorn-walk
- [ ] Build AST walker utility
- [ ] Upgrade existing 4 detectors to use AST
- [ ] Benchmark: verify <0.5s for 100 files

### Phase 2: New Detectors (Week 3-5)
- [ ] StaleAPIDetector + deprecated API database
- [ ] SecurityPatternDetector (all sub-detectors)
- [ ] OverEngineeringDetector (CC + CoC + metrics)
- [ ] TypeSafetyDetector (ts-morph integration)
- [ ] DeepHallucinationDetector (npm registry + export verification)

### Phase 3: AI Integration (Week 6-7)
- [ ] AI analysis framework (prompt builder, response parser)
- [ ] Ollama local integration
- [ ] OpenAI/Anthropic remote integration
- [ ] Result fusion engine
- [ ] CLI flags: `--ai`, `--ai-provider`, `--ai-model`

### Phase 4: Polish (Week 8)
- [ ] Updated scoring engine (6 dimensions)
- [ ] Performance optimization + benchmarks
- [ ] Documentation + migration guide
- [ ] v3.0.0 release

---

## 六、Appendix: Scoring Engine V3

### Updated Dimensions

| Dimension | Weight | Detectors |
|-----------|--------|-----------|
| Completeness | 25 | HallucinationDetector, DeepHallucinationDetector |
| Coherence | 20 | LogicGapDetector |
| Consistency | 20 | ContextBreakDetector |
| Conciseness | 15 | DuplicationDetector |
| Security | 10 | SecurityPatternDetector, StaleAPIDetector |
| Complexity | 10 | OverEngineeringDetector, TypeSafetyDetector |

### Grade Thresholds (unchanged)

| Grade | Score Range |
|-------|------------|
| A | 90-100 |
| B | 80-89 |
| C | 70-79 |
| D | 60-69 |
| F | 0-59 |
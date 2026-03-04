# 🛡️ AI Code Validator

[![CI](https://github.com/raye-deng/ai-code-validator/actions/workflows/ci.yml/badge.svg)](https://github.com/raye-deng/ai-code-validator/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/ai-code-validator.svg)](https://www.npmjs.com/package/ai-code-validator)
[![npm downloads](https://img.shields.io/npm/dm/ai-code-validator.svg)](https://www.npmjs.com/package/ai-code-validator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)

**The first CI/CD quality gate built specifically for AI-generated code.**

AI coding assistants (Copilot, Cursor, Claude) are writing more code than ever — but they introduce failure modes that traditional linters completely miss. AI Code Validator catches hallucinated packages, logic gaps, architectural inconsistencies, and more before they reach production.

## ✨ Why AI Code Validator?

| Problem | Traditional Linters | AI Code Validator |
|---------|-------------------|-------------------|
| Hallucinated npm packages | ❌ Not detected | ✅ Caught |
| Logic gaps from context limits | ❌ Not detected | ✅ Caught |
| Empty catch blocks (AI pattern) | ⚠️ Sometimes | ✅ AI-aware detection |
| Mixed coding styles (context switch) | ❌ Not detected | ✅ Caught |
| Feedback to AI assistant | ❌ None | ✅ Self-heal prompts |

## 🚀 Quick Start

### CLI

```bash
# Scan your project
npx ai-code-validator scan ./src

# With options
npx ai-code-validator scan ./src --threshold 80 --format json

# Generate AI self-heal prompt
npx ai-code-validator scan ./src --heal
```

### GitHub Actions

```yaml
# .github/workflows/ci.yml
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: raye-deng/ai-code-validator@v1
        with:
          threshold: 70
          paths: 'src/**/*.ts,src/**/*.js'
          fail-on-low-score: true
```

### GitLab CI Component

```yaml
# .gitlab-ci.yml
include:
  - component: INTERNAL_REGISTRY/fengsen.deng/ai-code-validator/validate@main
    inputs:
      threshold: 70
      paths: src
```

## 🔍 What It Detects

### 👻 Hallucination Detection
- **Phantom packages**: Imports of npm packages that don't exist in `package.json`
- **Undefined functions**: Calls to functions never imported or declared
- **Non-existent APIs**: Usage of API endpoints that don't match your spec

### 🧩 Logic Gap Analysis
- **Empty catch blocks**: Silently swallowed errors (common AI pattern)
- **TODO/FIXME markers**: Incomplete implementations left by AI
- **Unreachable code**: Dead code after return/throw statements
- **Missing error handling**: Async functions without try-catch

### 📋 Duplication Detection
- **Near-identical functions**: Copy-paste with minor changes
- **Duplicate imports**: Multiple imports from the same module

### 🎨 Context Break Detection
- **Mixed naming conventions**: camelCase ↔ snake_case switches
- **Mixed module systems**: ESM `import` mixed with CJS `require()`
- **Mixed async patterns**: async/await mixed with .then() chains

## 📊 Scoring System

Every scan produces a **0-100 quality score** across 4 dimensions:

| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| **Completeness** | 30 | No hallucinated variables/functions/packages |
| **Coherence** | 25 | No logic gaps, meaningful control flow |
| **Consistency** | 25 | Consistent style and patterns |
| **Conciseness** | 20 | No obvious duplication or redundancy |

Grades: **A** (90+) · **B** (80+) · **C** (70+) · **D** (60+) · **F** (<60)

## 🔄 AI Self-Heal Loop

AI Code Validator can generate structured fix prompts that feed directly back to your AI assistant:

```bash
npx ai-code-validator scan ./src --heal
# → Generates ai-heal-prompt.md with specific fix instructions
```

The generated prompt includes:
- Prioritized list of issues
- File-specific fix instructions
- Guidelines for maintaining project conventions
- Compatible with Copilot, Cursor, and Claude workflows

## 📦 Packages

| Package | Description |
|---------|------------|
| `@ai-code-validator/core` | Core detection engine |
| `ai-code-validator` | CLI tool |
| `@ai-code-validator/github-action` | GitHub Actions integration |
| GitLab Component | GitLab CI/CD Component |
| `@ai-code-validator/web` | Marketing website |

## 🏗️ Development

```bash
# Clone
git clone https://github.com/raye-deng/ai-code-validator.git
cd ai-code-validator

# Install
pnpm install

# Build all
pnpm build

# Test
pnpm test

# Dev website
pnpm dev
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for more.

## 🎉 Early Access

**Be among the first 50 teams to validate AI code quality.**

Lock in **50% off forever** — $9.50/month instead of $19/month.

👉 [**Join Early Access**](https://codes.evallab.ai/early-access)

No credit card required. We'll email you access details within 24 hours.

## 📄 License

MIT © [Raye Deng](https://github.com/raye-deng)

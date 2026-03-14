# Open Code Review

> The first CI/CD quality gate built for AI-generated code.
> Free. Self-hostable. Not another linter.

![Open Code Review](.github/social-preview.png)

[![npm version](https://img.shields.io/npm/v/@opencodereview/cli?style=flat-square)](https://www.npmjs.com/package/@opencodereview/cli)
[![npm downloads](https://img.shields.io/npm/dw/@opencodereview/cli?style=flat-square)](https://www.npmjs.com/package/@opencodereview/cli)
[![License: BUSL-1.1](https://img.shields.io/badge/License-BUSL--1.1-blue.svg)](LICENSE)
[![CI](https://github.com/raye-deng/open-code-review/actions/workflows/ci.yml/badge.svg)](https://github.com/raye-deng/open-code-review/actions/workflows/ci.yml)
[![GitHub Stars](https://img.shields.io/github/stars/raye-deng/open-code-review?style=flat-square)](https://github.com/raye-deng/open-code-review)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

<!-- SEO keywords: code review, AI code quality, CI/CD, code analysis, hallucination detection, static analysis, AI-generated code, code security, quality gate, SARIF -->

## Why?

AI coding assistants (Copilot, Cursor, Claude) generate code with **defects that traditional tools miss entirely**:

| Defect | Example | ESLint / SonarQube |
|--------|---------|-------------------|
| **Hallucinated imports** | `import { x } from 'non-existent-pkg'` | ❌ Miss |
| **Stale APIs** | Using deprecated APIs from training data | ❌ Miss |
| **Context window artifacts** | Logic contradictions across files | ❌ Miss |
| **Over-engineered patterns** | Unnecessary abstractions, dead code | ❌ Miss |
| **Security anti-patterns** | Hardcoded example secrets, `eval()` | ⚠️ Partial |

Open Code Review detects all of them — in **under 10 seconds**, for **free**, running **100% locally**.

## Demo

> 📺 **[See it in action — full terminal recording coming soon]**

### Quick Preview

```bash
$ npx @opencodereview/cli scan src/ --sla L1

╔══════════════════════════════════════════════════════════════╗
║           Open Code Review V4 — Quality Report              ║
╚══════════════════════════════════════════════════════════════╝

  Project: packages/core/src
  SLA: L2 Standard — Structural + Embedding + Local AI

  📊 112 issues found in 110 files

  Overall Score: 67/100  🟠 D
  Threshold: 70  |  Status: ❌ FAILED
  Files Scanned: 110  |  Languages: typescript  |  Duration: 8.7s
```

### L2 HTML Report Sample

![L2 HTML Report Screenshot](docs/images/l2-html-report-screenshot.png)

**Features of HTML Report:**
- Interactive issue browser with severity filters
- Detailed code snippets with context
- Scoring breakdown by dimension
- Export to JSON/SARIF

📄 [View full HTML report](docs/demo-reports/v4-l2/self-scan.html)

## How It Compares

| | Open Code Review | Claude Code Review | CodeRabbit | GitHub Copilot |
|---|---|---|---|---|
| **Price** | **Free** | $15–25/PR | $24/mo/seat | $10–39/mo |
| **Open Source** | ✅ | ❌ | ❌ | ❌ |
| **Self-hosted** | ✅ | ❌ | Enterprise | ❌ |
| **AI Hallucination Detection** | ✅ | ❌ | ❌ | ❌ |
| **Stale API Detection** | ✅ Specialized | General | ❌ | ❌ |
| **Local AI (Ollama)** | ✅ | ❌ | ❌ | ❌ |
| **Registry Verification** | ✅ npm/PyPI | ❌ | ❌ | ❌ |
| **SARIF Output** | ✅ | ❌ | ❌ | ❌ |
| **GitHub + GitLab** | ✅ Both | GitHub only | Both | GitHub only |
| **Review Speed** | <10s (L1) | ~20 min | ~30s | ~30s |
| **Data Privacy** | ✅ 100% local | ❌ Cloud | ❌ Cloud | ❌ Cloud |

## Who Is This For?

- **Teams using AI coding assistants** — Copilot, Cursor, Claude Code, Codex, or any LLM-based tool that generates production code
- **Open-source maintainers** — Review AI-generated PRs for hallucinated imports, stale APIs, and security anti-patterns before merging
- **DevOps / Platform engineers** — Add a quality gate to CI/CD pipelines without sending code to cloud services
- **Security-conscious teams** — Run everything locally (Ollama), keep your code on your machines
- **Solo developers** — Free, fast, and works with zero configuration (`npx @opencodereview/cli scan src/`)

## Why Open Code Review?

Traditional linters (ESLint, SonarQube, Pylint) check **code style** and **known patterns**. They were built for human-written code. AI-generated code has a completely different class of defects:

- **Hallucinated packages** — AI invents import paths that don't exist on npm/PyPI/Maven
- **Training data staleness** — AI uses APIs deprecated years ago because they were in its training cutoff
- **Context window artifacts** — Logic contradictions when a conversation generates code across multiple files
- **Over-engineering** — AI adds unnecessary abstractions, dead code, and excessive error handling
- **Security anti-patterns** — Hardcoded example secrets, `eval()`, SQL injection patterns

Open Code Review catches these **before they reach production**, in under 10 seconds, running 100% locally.

## Quick Start

```bash
# Install
npm install -g @opencodereview/cli

# Scan your project (L1 — fast, no AI needed)
ocr scan src/ --sla L1

# Scan with AI analysis (L2 — requires Ollama or OpenAI)
ocr scan src/ --sla L2
```

## Two-Stage Pipeline (L1 + L2)

```
L1: Pattern Detection (fast, local, free)
├── Hallucinated import detection (npm/PyPI registry check)
├── Deprecated API detection (AST-based)
├── Security anti-pattern matching
├── Over-engineering heuristics
├── Code duplication analysis
└── Score: 0-100 with letter grade

L2: AI Deep Analysis (Embedding + LLM)
├── Embedding recall → risk scoring → Top-N suspicious blocks
├── LLM analysis (Ollama local or OpenAI/Anthropic cloud)
├── Cross-file context coherence
├── Semantic duplication detection
└── Enhanced scoring with AI confidence
```

## CI/CD Integration

### Add to Your Repo in 30 Seconds

Copy this snippet into your `.github/workflows/ci.yml`:

```yaml
name: Code Review
on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: raye-deng/open-code-review@v1
        with:
          sla: L1
          threshold: 60
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

That's it. Every PR will now be checked for AI-generated code quality issues.

### GitHub Action

```yaml
- uses: raye-deng/open-code-review@v1
  with:
    sla: L1
    threshold: 60
    scan-mode: diff
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### GitLab CI

```yaml
code-review:
  script:
    - npx @opencodereview/cli scan src/ --sla L1 --threshold 60 --format json --output ocr-report.json
  artifacts:
    reports:
      codequality: ocr-report.json
```

### CLI

```bash
ocr scan src/ --sla L1 --format terminal    # Pretty output
ocr scan src/ --sla L1 --format json        # JSON for CI
ocr scan src/ --sla L1 --format sarif       # SARIF for GitHub
ocr scan src/ --sla L1 --format html        # HTML report
```

## L2 Configuration (Ollama)

```yaml
# .ocrrc.yml
sla: L2
ai:
  embedding:
    provider: ollama
    model: nomic-embed-text
    baseUrl: http://localhost:11434
  llm:
    provider: ollama
    model: qwen3-coder
    endpoint: http://localhost:11434
```

## Project Structure

```
packages/
  core/              # Detection engine + scoring (@opencodereview/core)
  cli/               # CLI tool — ocr command (@opencodereview/cli)
  github-action/     # GitHub Action wrapper
```

## Supported Languages

TypeScript, JavaScript, Python, Go, Java, Kotlin (more coming)

## License

[BSL-1.1](LICENSE) — Free for personal and non-commercial use.
Converts to Apache 2.0 on 2030-03-11.
Commercial use requires a [Team or Enterprise license](https://codes.evallab.ai/pricing).

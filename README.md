# Open Code Review

> **The first open-source CI/CD quality gate built specifically for AI-generated code.**
> Detects hallucinated imports, stale APIs, over-engineering, and security anti-patterns — in under 10 seconds.
> Free. Self-hostable. 6 languages. 8 LLM providers.

![Open Code Review](.github/social-preview.png)

[![npm version](https://img.shields.io/npm/v/@opencodereview/cli?style=flat-square&label=v2.1.0)](https://www.npmjs.com/package/@opencodereview/cli)
[![npm downloads](https://img.shields.io/npm/dw/@opencodereview/cli?style=flat-square)](https://www.npmjs.com/package/@opencodereview/cli)
[![License: BUSL-1.1](https://img.shields.io/badge/License-BUSL--1.1-blue.svg)](LICENSE)
[![CI](https://github.com/raye-deng/open-code-review/actions/workflows/ci.yml/badge.svg)](https://github.com/raye-deng/open-code-review/actions/workflows/ci.yml)
[![GitHub Stars](https://img.shields.io/github/stars/raye-deng/open-code-review?style=social)](https://github.com/raye-deng/open-code-review)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

## What AI Linters Miss

AI coding assistants (Copilot, Cursor, Claude) generate code with **defects that traditional tools miss entirely**:

| Defect | Example | ESLint / SonarQube |
|--------|---------|-------------------|
| **Hallucinated imports** | `import { x } from 'non-existent-pkg'` | ❌ Miss |
| **Stale APIs** | Using deprecated APIs from training data | ❌ Miss |
| **Context window artifacts** | Logic contradictions across files | ❌ Miss |
| **Over-engineered patterns** | Unnecessary abstractions, dead code | ❌ Miss |
| **Security anti-patterns** | Hardcoded example secrets, `eval()` | ⚠️ Partial |

Open Code Review detects all of them — across **6 languages**, in **under 10 seconds**, for **free**.

## Demo

![L2 HTML Report Screenshot](docs/images/l2-html-report-screenshot.png)

📄 [View full interactive HTML report](docs/demo-reports/v4-l2/self-scan.html)

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

## Three-Stage Pipeline

```
L1 Fast (free, <10s)          L2 Standard (local AI)        L3 Deep (remote LLM)
├── Structural detection       ├── + Embedding recall        ├── + Remote LLM analysis
├── Hallucinated imports       ├── + Risk scoring             ├── + Deep code analysis
├── Stale API detection        ├── + Local LLM (Ollama)       ├── + Cross-file coherence
├── Security patterns          ├── + Cross-file coherence     └── + Confidence scoring
├── Over-engineering           └── + Enhanced scoring
└── Score: A+ → F
```

### Feature Comparison

| | L1 Fast | L2 Standard | L3 Deep Scan |
|---|---------|-------------|--------------|
| **AI required** | ❌ None | 🏠 Local (Ollama) | ☁️ Remote LLM |
| **Hallucinated imports** | ✅ | ✅ | ✅ |
| **Stale API detection** | ✅ | ✅ | ✅ |
| **Security patterns** | ✅ | ✅ | ✅ |
| **Over-engineering** | ✅ | ✅ | ✅ |
| **Embedding analysis** | — | ✅ | ✅ |
| **Risk scoring** | — | ✅ | ✅ |
| **Cross-file coherence** | — | ✅ | ✅ |
| **Deep LLM analysis** | — | — | ✅ |
| **Confidence scoring** | — | — | ✅ |
| **AI Auto-Fix (`ocr heal`)** | — | — | ✅ |
| **Cost** | Free | Free (local) | Provider-dependent |
| **Speed** | <10s | ~30s | ~60s |

## L3 Deep Scan — Remote LLM Analysis

L3 sends suspicious code blocks to a remote LLM for **deep semantic analysis** — catching subtle logic bugs, security vulnerabilities, and design anti-patterns that pattern matching alone cannot detect.

**8 LLM providers supported:**

```bash
# Free with GLM (Zhipu AI)
ocr scan src/ --sla L3 --provider glm --model pony-alpha-2 --api-key YOUR_KEY

# OpenAI
ocr scan src/ --sla L3 --provider openai --model gpt-4o --api-key YOUR_KEY

# DeepSeek (free tier available)
ocr scan src/ --sla L3 --provider deepseek --model deepseek-chat --api-key YOUR_KEY

# Any OpenAI-compatible service
ocr scan src/ --sla L3 --provider openai-compatible --api-base https://your-server/v1 --model your-model
```

## AI Auto-Fix — `ocr heal`

Let AI automatically fix the issues it finds. Review changes before applying.

```bash
# Preview fixes without changing files
ocr heal src/ --dry-run --provider glm

# Apply fixes + generate IDE rules
ocr heal src/ --provider glm --model pony-alpha-2 --api-key YOUR_KEY --setup-ide

# Only generate IDE rules (Cursor, Copilot, Augment)
ocr setup src/
```

## Multi-Language Detection

Language-specific detectors for **6 languages**, plus hallucinated package databases (npm, PyPI, Maven, Go modules):

| Language | Specific Detectors |
|----------|-------------------|
| **TypeScript / JavaScript** | Hallucinated imports (npm), stale APIs, over-engineering |
| **Python** | Bare `except`, `eval()`, mutable default args, hallucinated imports (PyPI) |
| **Java** | `System.out.println` leaks, deprecated `Date/Calendar`, hallucinated imports (Maven) |
| **Go** | Unhandled errors, deprecated `ioutil`, `panic` in library code |
| **Kotlin** | `!!` abuse, `println` leaks, null-safety anti-patterns |

## Provider Gallery

| Provider | Free Tier | Protocol |
|----------|-----------|----------|
| **GLM / ZAI** | ✅ Yes | OpenAI-compatible |
| **Ollama (local)** | ✅ Yes | Ollama |
| **OpenAI** | Limited | OpenAI |
| **DeepSeek** | Free tier | OpenAI-compatible |
| **Together AI** | Free tier | OpenAI-compatible |
| **Fireworks** | Free tier | OpenAI-compatible |
| **Anthropic** | No | Anthropic |
| **Custom endpoint** | — | OpenAI-compatible |

## How It Compares

| | Open Code Review | Claude Code Review | CodeRabbit | GitHub Copilot |
|---|---|---|---|---|
| **Price** | **Free** | $15–25/PR | $24/mo/seat | $10–39/mo |
| **Open Source** | ✅ | ❌ | ❌ | ❌ |
| **Self-hosted** | ✅ | ❌ | Enterprise | ❌ |
| **AI Hallucination Detection** | ✅ | ❌ | ❌ | ❌ |
| **Stale API Detection** | ✅ | ❌ | ❌ | ❌ |
| **Deep LLM Analysis (L3)** | ✅ | ❌ | ❌ | ❌ |
| **AI Auto-Fix** | ✅ | ❌ | ❌ | ❌ |
| **Multi-Language** | ✅ 6 langs | ❌ | JS/TS | JS/TS |
| **Registry Verification** | ✅ npm/PyPI/Maven | ❌ | ❌ | ❌ |
| **SARIF Output** | ✅ | ❌ | ❌ | ❌ |
| **GitHub + GitLab** | ✅ Both | GitHub only | Both | GitHub only |
| **Review Speed** | <10s (L1) | ~20 min | ~30s | ~30s |
| **Data Privacy** | ✅ 100% local | ❌ Cloud | ❌ Cloud | ❌ Cloud |

## Quick Start

```bash
# Install
npm install -g @opencodereview/cli

# L1 — Fast scan, no AI needed (FREE)
ocr scan src/

# L2 — Local AI analysis (Ollama)
ocr scan src/ --sla L2

# L3 — Deep analysis with any LLM (GLM is free!)
ocr scan src/ --sla L3 --provider glm --model pony-alpha-2 --api-key YOUR_KEY
```

## CI/CD Integration

### GitHub Actions (30 seconds)

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

### GitLab CI

```yaml
code-review:
  script:
    - npx @opencodereview/cli scan src/ --sla L1 --threshold 60 --format json --output ocr-report.json
  artifacts:
    reports:
      codequality: ocr-report.json
```

### CLI Formats

```bash
ocr scan src/ --sla L1 --format terminal    # Pretty output
ocr scan src/ --sla L1 --format json        # JSON for CI
ocr scan src/ --sla L1 --format sarif       # SARIF for GitHub
ocr scan src/ --sla L1 --format html        # HTML report
```

### L2 Configuration (Ollama)

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

## Who Is This For?

- **Teams using AI coding assistants** — Copilot, Cursor, Claude Code, Codex, or any LLM-based tool that generates production code
- **Open-source maintainers** — Review AI-generated PRs for hallucinated imports, stale APIs, and security anti-patterns before merging
- **DevOps / Platform engineers** — Add a quality gate to CI/CD pipelines without sending code to cloud services
- **Security-conscious teams** — Run everything locally (Ollama), keep your code on your machines
- **Solo developers** — Free, fast, and works with zero configuration (`npx @opencodereview/cli scan src/`)

## License

[BSL-1.1](LICENSE) — Free for personal and non-commercial use. Converts to Apache 2.0 on 2030-03-11.
Commercial use requires a [Team or Enterprise license](https://codes.evallab.ai/pricing).

---

**⭐ Star this repo if you find it useful — it helps more than you think!**

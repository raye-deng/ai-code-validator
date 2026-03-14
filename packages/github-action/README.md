# Open Code Review — GitHub Action

> **AI-powered code review for your pull requests** — Detect hallucinated packages, phantom dependencies, stale APIs, logic gaps, and context coherence issues. Free, open-source, and runs in your CI with zero API cost.

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Open%20Code%20Review-blue?logo=github)](https://github.com/marketplace/actions/open-code-review)
[![npm version](https://img.shields.io/npm/v/@opencodereview/cli.svg?logo=npm)](https://www.npmjs.com/package/@opencodereview/cli)
[![License: BSL 1.1](https://img.shields.io/badge/License-BSL%201.1-blue.svg)](LICENSE)

**Why Open Code Review?** AI code assistants (Copilot, Cursor, ChatGPT) generate code fast — but they also hallucinate packages, reference outdated APIs, and leave logic gaps. Open Code Review catches these AI-specific defects **automatically in your CI pipeline**, before they reach production.

---

## ✨ Features

- 🔍 **3 Scan Levels** — Choose your speed vs. accuracy trade-off:
  - **L1**: Structural analysis (AST-based, ~5s per PR)
  - **L2**: + Embedding recall (local Ollama or TF-IDF fallback, ~30s)
  - **L3**: + LLM deep scan (Ollama / OpenAI / Anthropic, ~2min)
- 🎯 **AI-Specific Defect Detection**:
  - Hallucinated packages & APIs (imports that don't exist)
  - Phantom / stale dependencies
  - Context coherence issues (dead code, broken refs)
  - Logic gaps in AI-generated code
- 📊 **PR Comments**: Automated quality score + issue breakdown on every PR
- ⚡ **Diff Mode**: Scan only changed files — blazing fast
- 🔒 **100% Local Option**: L1 and L2 (TF-IDF) run entirely in your CI runner — no data leaves your server
- 📄 **SARIF Support**: Integrates with GitHub Code Scanning

---

## 📦 Quick Start

Add this to your workflow (`.github/workflows/code-review.yml`):

```yaml
name: Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write
  checks: write          # Required for SARIF upload

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Open Code Review
        uses: raye-deng/open-code-review@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

That's it! The action will:
1. Scan changed files in your PR (diff mode)
2. Post a quality report as a PR comment
3. Fail the workflow if the score is below the default threshold (70)

---

## 📋 Examples

### Basic — L1 Fast Scan (recommended for most projects)

```yaml
- name: Open Code Review
  uses: raye-deng/open-code-review@v1
  with:
    sla: L1                # Structural analysis (~5s)
    threshold: 70          # Fail if score < 70
    scan-mode: diff        # Only scan changed files
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Advanced — L2 with Self-Hosted Ollama

```yaml
- name: Open Code Review (L2)
  uses: raye-deng/open-code-review@v1
  with:
    sla: L2
    threshold: 80
    scan-mode: diff
    ollama-url: ${{ secrets.OLLAMA_URL }}   # e.g. http://your-ollama:11434
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Full Repo Scan — L3 Deep Analysis

```yaml
- name: Open Code Review (L3 Full)
  uses: raye-deng/open-code-review@v1
  with:
    sla: L3
    threshold: 85
    scan-mode: full               # Scan entire repo
    ollama-url: ${{ secrets.OLLAMA_URL }}
    fail-on-low-score: false      # Don't block PRs, just report
    exclude: '**/test/**,**/*.test.*,**/vendor/**'
    report-path: reports/ocr-report.json
    github-token: ${{ secrets.GITHUB_TOKEN }}
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}   # Optional: for L3 without Ollama
```

### Access Outputs in Later Steps

```yaml
- name: Open Code Review
  id: review
  uses: raye-deng/open-code-review@v1
  with:
    sla: L1

- name: Use review results
  if: steps.review.outputs.score < 80
  run: |
    echo "Score: ${{ steps.review.outputs.score }}"
    echo "Grade: ${{ steps.review.outputs.grade }}"
    echo "Issues: ${{ steps.review.outputs.issues-count }}"
    echo "Low quality detected — notify team"
```

---

## ⚙️ Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `sla` | Scan level: `L1` (structural), `L2` (+ embedding), `L3` (+ LLM) | No | `L1` |
| `threshold` | Minimum quality score to pass (0–100) | No | `70` |
| `scan-mode` | `diff` (changed files only) or `full` | No | `diff` |
| `ollama-url` | Ollama API URL for L2/L3 (e.g. `http://localhost:11434`) | No | _(TF-IDF fallback)_ |
| `fail-on-low-score` | Fail the workflow when score < threshold | No | `true` |
| `github-token` | GitHub token for PR comments | No | `${{ github.token }}` |
| `exclude` | Glob patterns to exclude (comma-separated) | No | _(none)_ |
| `report-path` | Path for the JSON report file | No | `ocr-report.json` |

## 📤 Outputs

| Output | Description |
|--------|-------------|
| `score` | Overall quality score (0–100) |
| `grade` | Letter grade (A through F) |
| `issues-count` | Total number of issues found |

---

## 📊 Scan Levels Comparison

| Level | Speed | AI Required | Best For |
|-------|-------|-------------|----------|
| **L1** | ⚡ ~5s | No | Quick PR checks on every push |
| **L2** | 🚀 ~30s | Optional (Ollama) | Team projects, higher accuracy |
| **L3** | 🐢 ~2min | Yes (Ollama / Cloud) | Critical code, security review |

---

## 🎯 Example PR Comment

After each PR, you'll see an automated comment like this:

```markdown
## 🛡️ Open Code Review — L1 Report

**Score: 78/100 (C)** ✅ Passed (threshold: 70)

### Summary
| Metric | Value |
|--------|-------|
| Files scanned | 4 (diff mode) |
| Issues found | 3 |
| Critical | 1 |
| Warnings | 1 |
| Info | 1 |

### Issues

#### 🔴 Critical: Package `@supabase/auth-helpers` not found in registry
`src/auth.ts:12` — `hallucination-pkg` (confidence: 92%)

#### ⚠️ Warning: Deprecated API `moment().format()` used
`src/utils/date.ts:5` — `stale-api` (confidence: 87%)

#### ℹ️ Info: Unused variable `tempResult`
`src/api/handler.ts:23` — `dead-code` (confidence: 74%)
```

---

## 🔒 Privacy & Security

- **L1**: 100% local — no external API calls, no data leaves your runner
- **L2/L3**: Use self-hosted Ollama for full local processing, or cloud APIs (OpenAI / Anthropic)
- **No code storage**: Scans run in your ephemeral CI runner, results are not persisted by us
- **Open source**: Full source code available for audit on GitHub

## 🛠️ Requirements

- **GitHub Actions runner**: Ubuntu, macOS, or Windows with Node.js 20+
- **For L2 (optional)**: Ollama server with `nomic-embed-text` model
- **For L3 (optional)**: Ollama with `qwen3-coder` model, or OpenAI / Anthropic API key

---

## 📜 License

- **Personal & Open-source**: Free under [BSL 1.1](LICENSE)
- **Commercial**: License required — see [codes.evallab.ai](https://codes.evallab.ai)
- Converts to Apache 2.0 on 2030-03-11

---

## 🐛 Issues & Support

- **Bug reports**: [GitHub Issues](https://github.com/raye-deng/open-code-review/issues)
- **Discussions**: [GitHub Discussions](https://github.com/raye-deng/open-code-review/discussions)
- **CLI tool**: `npx @opencodereview/cli scan .` — run locally too!

---

## 🏷️ Versioning

We use [SemVer](https://semver.org/):

- `@v1` → Latest stable (recommended, auto-updates within major)
- `@v1.2.3` → Pin to a specific version
- `@main` → Development branch (not recommended for production)

---

**Made with ❤️ by [EvalLab](https://evallab.ai)**

*⭐ Star this repo if you find it useful!*

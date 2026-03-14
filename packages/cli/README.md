# @opencodereview/cli

> **AI code quality scanner for the terminal** — Detect hallucinated packages, phantom dependencies, stale APIs, and logic gaps in seconds. Open-source, runs locally, zero API cost.

[![npm version](https://img.shields.io/npm/v/@opencodereview/cli.svg?logo=npm)](https://www.npmjs.com/package/@opencodereview/cli)
[![GitHub](https://img.shields.io/badge/GitHub-open--code--review-181717?logo=github)](https://github.com/raye-deng/open-code-review)
[![License: BSL 1.1](https://img.shields.io/badge/License-BSL%201.1-blue.svg)](https://github.com/raye-deng/open-code-review/blob/main/LICENSE)

---

## ✨ Why?

AI code assistants generate code fast — but they **hallucinate packages**, reference **outdated APIs**, and leave **logic gaps**. `open-code-review` catches these AI-specific defects before they ship.

---

## 🚀 Quick Start

```bash
# Run directly — no install needed
npx @opencodereview/cli scan .

# Or install globally
npm install -g @opencodereview/cli
ocr scan .
```

That's it. Scans your project and prints a quality report to the terminal.

---

## 📦 Installation

```bash
# Global install
npm install -g @opencodereview/cli

# Or use npx (no install)
npx @opencodereview/cli scan .
```

The CLI provides two binary names: `open-code-review` and `ocr` (shorthand).

---

## 📋 Commands

### `scan [path]` — Scan for AI-generated defects (V4, default)

```bash
# Basic scan (L1, structural analysis)
ocr scan .

# Scan a specific directory
ocr scan ./src

# Higher accuracy with L2 (embedding + Ollama)
ocr scan . --sla L2

# Deep analysis with L3 (LLM)
ocr scan . --sla L3

# Diff-only mode (scan changed files vs main)
ocr scan . --diff

# Output as JSON
ocr scan . --format json --output report.json

# Output as SARIF (GitHub Code Scanning compatible)
ocr scan . --format sarif --output report.sarif

# Output as HTML report
ocr scan . --format html --output report.html

# Output as Markdown
ocr scan . --format markdown

# Chinese output
ocr scan . --locale zh

# Exclude test files
ocr scan . --exclude "**/test/**,**/*.test.*"

# Offline mode (skip registry checks)
ocr scan . --offline

# Skip scoring, just list issues
ocr scan . --no-score
```

### `scan-v3 [paths...]` — Legacy V3 scan

```bash
ocr scan-v3 ./src --threshold 80 --format json
ocr scan-v3 ./src --heal    # Generate AI self-heal prompt
```

### `init` — Create configuration file

```bash
ocr init    # Creates .ocrrc.yml in current directory
```

### `login` — Set up license key

```bash
ocr login   # Opens registration page and prompts for key
```

### `config` — View or update configuration

```bash
ocr config show                        # Show current config
ocr config set license AICV-XXXX-...   # Set license key
ocr config set cloud-url https://...   # Set cloud URL
ocr config set api-key your-key        # Set API key
```

---

## ⚙️ V4 Scan Options

| Option | Description | Default |
|--------|-------------|---------|
| `--sla <level>` | SLA level: `L1` (fast), `L2` (standard), `L3` (deep) | `L1` |
| `--locale <locale>` | Output language: `en`, `zh` | `en` |
| `--format <fmt>` | Output format: `terminal`, `json`, `sarif`, `markdown`, `html` | `terminal` |
| `--diff` | Scan only changed files (vs `origin/main`) | off |
| `--base <ref>` | Base branch for diff | `origin/main` |
| `--head <ref>` | Head branch for diff | `HEAD` |
| `--config <path>` | Custom config file path | `.ocrrc.yml` |
| `--offline` | Skip registry verification | off |
| `--include <patterns>` | File patterns to include (comma-separated) | _(auto-detect)_ |
| `--exclude <patterns>` | File patterns to exclude (comma-separated) | _(none)_ |
| `--ai-local-model <name>` | Ollama model for L2/L3 | _(default)_ |
| `--ai-local-url <url>` | Ollama base URL | `http://localhost:11434` |
| `--ai-remote-provider` | Remote AI provider: `openai`, `anthropic` | — |
| `--ai-remote-model <name>` | Remote AI model name | — |
| `--ai-remote-key <key>` | Remote AI API key | — |
| `--no-score` | Skip scoring, just list issues | off |
| `--json` | Shorthand for `--format json` | off |
| `--output <path>` | Write report to file | _(stdout)_ |
| `--license <key>` | License key | — |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `OCR_API_KEY` | Remote AI API key |
| `OCR_SLA` | Default SLA level |
| `OCR_LOCALE` | Default locale |
| `OCR_OLLAMA_URL` | Ollama base URL |
| `OCR_OLLAMA_MODEL` | Ollama model name |

---

## 📊 Output Formats

### Terminal (default)

```
  Open Code Review V4
  SLA: L1 | Locale: en

  Scanning...
  Found 3 issue(s) in 12 file(s)

  🔴 error    src/auth.ts:12     Package `@supabase/auth-helpers` not found in registry
  ⚠️ warning  src/date.ts:5      Deprecated API `moment().format()` used
  ℹ️ info     src/api.ts:23       Unused variable `tempResult`

  Score: 78/100 (C) — Threshold: 70 ✅ Passed
```

### JSON

```bash
ocr scan . --format json
# Outputs structured JSON with version, issues, score, dimensions, and metadata
```

### SARIF

```bash
ocr scan . --format sarif --output report.sarif
# Compatible with GitHub Code Scanning — upload as a check
```

### HTML

```bash
ocr scan . --format html --output report.html
# Generates a visual HTML report with score breakdown and issue details
```

---

## 🔗 GitHub Action Integration

Open Code Review works great as a [GitHub Action](https://github.com/marketplace/actions/open-code-review) too. Use it in CI to automatically review every PR:

```yaml
- name: Open Code Review
  uses: raye-deng/open-code-review@v1
  with:
    sla: L1
    threshold: 70
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

Or use the CLI directly in your workflow:

```yaml
- name: Scan with CLI
  run: npx @opencodereview/cli scan . --format json --output report.json
```

---

## 📋 Scan Levels

| Level | What it does | Speed | AI Required |
|-------|-------------|-------|-------------|
| **L1** | AST analysis: hallucinated packages, stale APIs, dead code, logic gaps | ⚡ ~5s | No |
| **L2** | L1 + embedding recall for deeper pattern matching | 🚀 ~30s | Optional (Ollama) |
| **L3** | L2 + LLM deep analysis for nuanced code review | 🐢 ~2min | Yes (Ollama / Cloud) |

---

## 🔒 Privacy

- **L1 & L2 (TF-IDF)**: 100% local — no external API calls
- **L2 (Ollama) / L3**: Your code only goes to your own Ollama server or your chosen cloud API
- **We never see your code**

---

## 📜 License

- **Personal & Open-source**: Free under [BSL 1.1](https://github.com/raye-deng/open-code-review/blob/main/LICENSE)
- **Commercial**: License required — see [codes.evallab.ai](https://codes.evallab.ai)
- Converts to Apache 2.0 on 2030-03-11

---

## Links

- **GitHub**: [raye-deng/open-code-review](https://github.com/raye-deng/open-code-review)
- **GitHub Action**: [Marketplace](https://github.com/marketplace/actions/open-code-review)
- **npm**: [@opencodereview/cli](https://www.npmjs.com/package/@opencodereview/cli)
- **Issues**: [GitHub Issues](https://github.com/raye-deng/open-code-review/issues)
- **Website**: [codes.evallab.ai](https://codes.evallab.ai)

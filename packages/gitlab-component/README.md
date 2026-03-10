# Open Code Review — GitLab CI Component

A GitLab CI/CD component that runs Open Code Review (OCR) as part of your pipeline, with support for **MR diff scanning**, **L1/L2/L3 analysis levels**, and **CodeQuality integration**.

## Quick Start

### MR Diff Scanning (Recommended)

Only scan files changed in a Merge Request — fast feedback on what matters:

```yaml
include:
  - component: git.makesall.cn/fengsen.deng/open-code-review/validate@main
    inputs:
      sla: L1
      scan-mode: diff
      threshold: 60
```

### Full Scan

Scan entire directories on every pipeline run:

```yaml
include:
  - component: git.makesall.cn/fengsen.deng/open-code-review/validate@main
    inputs:
      sla: L1
      scan-mode: full
      paths: 'src,lib'
      threshold: 70
```

### As a Regular Include

```yaml
include:
  - project: 'fengsen.deng/open-code-review'
    file: '/packages/gitlab-component/templates/validate.yml'
    inputs:
      sla: L2
      threshold: 70
```

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `sla` | `L1` | Scan level: `L1` (structural), `L2` (+ embedding similarity), `L3` (+ LLM deep analysis) |
| `threshold` | `70` | Minimum quality score (0-100) to pass the pipeline |
| `paths` | `src` | Paths to scan, comma-separated (used in `full` mode) |
| `scan-mode` | `diff` | `diff` — only scan files changed in MR; `full` — scan all paths |
| `ollama-url` | _(empty)_ | Ollama API URL for L2/L3 embedding & LLM analysis |
| `node-image` | `node:20-slim` | Docker image for the job |

## Scan Levels

### L1 — Structural Analysis (Default)

Fast, zero-dependency scan using AST pattern matching:

- 🔍 Hallucinated imports (non-existent packages/functions)
- 🧩 Logic gaps (empty catch blocks, TODO markers, unreachable code)
- 📋 Code duplication (near-identical functions)
- 🎨 Style inconsistencies (mixed naming conventions)

**Best for**: CI gatekeeping, fast MR feedback.

### L2 — Embedding Similarity

Everything in L1 plus semantic analysis via embedding models:

- 🧠 Semantic code similarity detection
- 📐 Pattern matching against known anti-patterns
- 🔄 Cross-file relationship analysis

**Requires**: Ollama or compatible embedding API. Falls back to local TF-IDF if unavailable.

### L3 — LLM Deep Analysis

Everything in L2 plus LLM-powered reasoning:

- 🤖 AI-powered code review comments
- 🏗️ Architecture-level suggestions
- 🔐 Security vulnerability detection
- 📊 Complexity & maintainability insights

**Requires**: Ollama or compatible LLM API.

## Self-Hosted Ollama Configuration

For L2/L3 scanning with a self-hosted Ollama instance:

```yaml
include:
  - component: git.makesall.cn/fengsen.deng/open-code-review/validate@main
    inputs:
      sla: L2
      ollama-url: 'http://your-ollama-host:11434'
      scan-mode: diff
      threshold: 65
```

**Supported models**:

- **Embedding (L2)**: `nomic-embed-text`, `mxbai-embed-large`
- **LLM (L3)**: `qwen3-coder`, `codellama`, `deepseek-coder`

Make sure the Ollama instance is reachable from your GitLab Runner network.

## CodeQuality Integration

The component automatically produces a **GitLab CodeQuality artifact** (`ocr-report.json`). This integrates with:

- **Merge Request widget**: Shows code quality changes inline
- **Pipeline artifacts**: Download the full JSON report
- **Quality trends**: Track score over time in project analytics

The report includes:

```json
{
  "score": 82,
  "grade": "B",
  "issues": [
    {
      "type": "issue",
      "check_name": "hallucination/phantom-import",
      "description": "Import 'nonExistentFn' not found in package 'lodash'",
      "severity": "major",
      "location": { "path": "src/utils.ts", "lines": { "begin": 3 } }
    }
  ]
}
```

## Scan Modes

### `diff` Mode (Default)

- Only scans files changed in the current MR
- Compares against the MR target branch
- Skips non-code files automatically
- Produces a clean report if no scannable files changed
- **Fastest** option for MR pipelines

### `full` Mode

- Scans all files in the specified `paths`
- Good for scheduled pipelines or default branch runs
- Use comma-separated paths: `src,lib,packages/*/src`

## Examples

### Minimal (L1 diff scan)

```yaml
include:
  - component: git.makesall.cn/fengsen.deng/open-code-review/validate@main
```

### Strict L2 with Ollama

```yaml
include:
  - component: git.makesall.cn/fengsen.deng/open-code-review/validate@main
    inputs:
      sla: L2
      threshold: 80
      ollama-url: 'http://ollama.internal:11434'
```

### Full scan on default branch, diff on MRs

```yaml
include:
  - component: git.makesall.cn/fengsen.deng/open-code-review/validate@main
    inputs:
      sla: L1
      scan-mode: full
      paths: 'packages/*/src'
      threshold: 60
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| L2 falls back to TF-IDF | Ollama unreachable — check `ollama-url` and network |
| Score is 0 | No scannable files found — check `paths` or `scan-mode` |
| Job fails immediately | Check `node-image` has Node.js 18+ |
| CodeQuality widget empty | Ensure `ocr-report.json` format matches GitLab schema |

## What It Detects

- 🔍 **Hallucinated packages/functions** — imports that don't exist
- 🧩 **Logic gaps** — empty catch blocks, TODO markers, unreachable code
- 📋 **Code duplication** — near-identical functions, redundant imports
- 🎨 **Style inconsistencies** — mixed naming conventions, module systems
- 🧠 **Semantic issues** (L2+) — anti-pattern similarity, cross-file problems
- 🤖 **Deep analysis** (L3) — AI-powered review, security, architecture

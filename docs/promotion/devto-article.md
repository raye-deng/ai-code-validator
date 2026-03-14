# Platform: Dev.to
## Title: I Built a Tool That Catches AI Hallucinated npm Packages — Here's How It Works
## URL: (发布后填写)
## Tags: ai, javascript, npm, security, opensource, ci
## Content:

---

# I Built a Tool That Catches AI Hallucinated npm Packages — Here's How It Works

## The $0 Supply Chain Attack Nobody Talks About

Last month, a junior developer on my team ran `npm install` and unknowingly tried to pull in 3 packages that **don't exist on the npm registry**. They weren't malicious — they were **hallucinated by an AI coding assistant**.

This is the new class of supply chain risk that nobody is talking about.

When ChatGPT, Copilot, or Cursor generate code, they sometimes reference packages from their training data that were:
- Deleted from the registry
- Never published in the first place
- Private packages they saw in code snippets
- Subtly misspelled versions of real packages (typosquatting magnets)

These hallucinated imports silently break builds or, worse, leave your project vulnerable to dependency confusion attacks where attackers register the "phantom" package name.

## So I Built a Detector

[Open Code Review](https://github.com/raye-deng/open-code-review) is an open-source CLI that scans your codebase specifically for these AI-generated failure modes. It's not a linter — it's a **registry-aware code quality gate**.

Here's what it caught on its own codebase during a self-scan:

```
╔══════════════════════════════════════════════════════════════╗
║           Open Code Review V4 — Quality Report              ║
╚══════════════════════════════════════════════════════════════╝

  Project: packages/core/src
  SLA: L2 Standard — Structural + Embedding + Local AI

  📊 112 issues found in 110 files
  Overall Score: 67/100  🟠 D
  Files Scanned: 110  |  Duration: 8.7s
```

## How Hallucination Detection Works

The detection pipeline has three levels, each progressively deeper:

### L1: Structural Pattern Matching (no AI needed)

```typescript
// The detector parses every import/require statement
// and checks against the actual registry

import { something } from 'lodash-utils-extra'    // ❌ Not on npm
import { validate } from 'email-validator-pro'      // ❌ Not on npm
import express from 'express'                        // ✅ Real package
import { z } from 'zod'                             // ✅ Real package
```

The L1 scanner runs in **under 3 seconds** for a 100-file project. It hits the npm/PyPI registry API to verify existence, caches results, and flags any phantom references.

### L2: Embedding-Based Semantic Analysis

For deeper analysis, L2 uses embedding models (running locally via Ollama) to:
1. Embed each function body against the project's known API surface
2. Detect calls to methods that don't exist on the imported objects
3. Identify suspicious patterns that look AI-generated but have no real-world counterpart

```yaml
# .ocrrc.yml — L2 config with local Ollama (zero API cost)
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

### L3: Full LLM Code Review (coming soon)

The deepest level uses a full LLM pass to analyze cross-file coherence, detect logic gaps, and identify over-engineered patterns.

## The Phantom Package Database

One of the more interesting features is the **Phantom Package DB** — a growing collection of commonly hallucinated package names. When the scanner encounters a package like `react-dom-utils` or `express-middleware-helper`, it cross-references against known patterns:

```json
{
  "phantomPatterns": [
    "express-*helper*",
    "react-dom-utils",
    "mongoose-*plugin*",
    "axios-*wrapper*"
  ],
  "stats": {
    "totalHallucinationsCaught": 1247,
    "topHallucinatedPrefixes": ["react", "express", "mongoose", "lodash"]
  }
}
```

This is particularly dangerous because these phantom package names are **prime targets for namespace squatting**. An attacker could register `react-dom-utils` on npm, and suddenly every AI-generated project that hallucinated this import is pulling in attacker-controlled code.

## Integrating with CI/CD

The whole point is catching these issues before they land. Here's the GitHub Action:

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

It also outputs SARIF format for GitHub Code Scanning:

```bash
ocr scan src/ --sla L1 --format sarif --output results.sarif
```

And GitLab CI:

```yaml
code-review:
  script:
    - npx @opencodereview/cli scan src/ --sla L1 --format json --output ocr-report.json
  artifacts:
    reports:
      codequality: ocr-report.json
```

## What It Catches That ESLint Doesn't

| Issue | ESLint | OCR |
|-------|--------|-----|
| `import x from 'nonexistent-pkg'` | ❌ | ✅ Registry check |
| `deprecatedApi()` from training data | ❌ | ✅ AST-aware |
| Hardcoded example secrets | ⚠️ Partial | ✅ Pattern match |
| Over-engineered abstractions | ❌ | ✅ Heuristic |
| Cross-file logic contradictions | ❌ | ✅ L2/L3 |

## Zero Cost, 100% Local

The L1 scanner needs **no API keys, no cloud services**. Install and run:

```bash
npm install -g @opencodereview/cli
ocr scan src/ --sla L1
```

L2 uses Ollama locally (also free):

```bash
# Start Ollama in background
ollama serve

# Pull the embedding model (one-time, ~270MB)
ollama pull nomic-embed-text

# Run L2 scan
ocr scan src/ --sla L2
```

Your code never leaves your machine. No data sent to any server.

## Try It

```bash
npx @opencodereview/cli scan . --sla L1
```

I'd love to hear what it finds in your codebase. The project is [on GitHub](https://github.com/raye-deng/open-code-review) — PRs welcome, issues welcome, stars welcome.

**What hallucinated packages has your team accidentally imported?** I'm genuinely curious about the patterns.

---

*If this was useful, follow me for more on AI code quality and security.*

# Platform: Hacker News
## Title: Show HN: Open Code Review — Detect AI-Hallucinated npm Packages Before They Reach Production
## URL: https://github.com/raye-deng/open-code-review
## Tags: show hn
## Content:

AI coding assistants (Copilot, Cursor, Claude) sometimes generate imports to npm packages that don't exist. These "phantom packages" are a new supply chain risk — the names become targets for namespace squatting.

Open Code Review is a CLI tool that scans your codebase against the actual npm/PyPI registry to detect:

- Hallucinated imports (package doesn't exist)
- Deprecated API usage (worked in training data, broken now)
- Security anti-patterns (hardcoded secrets, eval(), SQL injection)
- Over-engineered abstractions
- Cross-file logic contradictions

Two scanning levels:
- L1: Pattern matching + registry checks. No AI needed. ~3s for 100 files.
- L2: Embedding + LLM analysis via local Ollama. Zero API cost.

Outputs SARIF for GitHub Code Scanning. GitHub Action + GitLab CI ready. 100% local — code never leaves your machine.

Install: `npm install -g @opencodereview/cli`
Scan: `ocr scan src/ --sla L1`

Open source (BSL-1.1, free for personal use). Feedback welcome.

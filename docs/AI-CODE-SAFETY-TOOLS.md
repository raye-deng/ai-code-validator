# Awesome AI Code Safety Tools

A curated list of tools that detect security risks, quality issues, and supply chain vulnerabilities in AI-generated code.

## 🔍 Detection & Scanning

| Tool | Stars | Description | License |
|------|-------|-------------|---------|
| [Open Code Review](https://github.com/raye-deng/open-code-review) | ⭐ 4 | AI code quality gate — hallucinated packages, phantom deps, stale APIs. CI/CD integration with GitHub Actions & GitLab. 3-level scanning (structural, embedding, LLM). | BSL-1.1 |
| [SlopWatch](https://github.com/loicguillois/slopwatch) | ⭐ 1 | Detect slopsquatting attacks — AI-hallucinated package names that become attack vectors. | MIT |
| [CodeGuard Action](https://github.com/koilabsio/codeguard-action) | - | GitHub Action to catch hallucinated packages, secrets, and AI-specific issues. | MIT |
| [Prompt Injection Scanner](https://github.com/dgershman/prompt-injection-scanner) | - | Scans AI-generated code for prompt injection vulnerabilities. | - |
| [PR Guardian](https://github.com/rogueagi/pr-guardian) | - | AI-aware code review for GitHub PRs. Catches hallucinated imports. | - |
| [PackageCheck](https://github.com/Sync-Pro/packagecheck) | - | AI hallucinates packages. We catch them. | - |

## 🤖 LLM Code Review Assistants

| Tool | Stars | Description |
|------|-------|-------------|
| [PR Agent](https://github.com/qodo-ai/pr-agent) | ⭐ 12k+ | Open-source PR reviewer — descriptions, reviews, labels. |
| [AI Code Review Agent](https://github.com/smirk-dev/CodeReview-AI-Agent) | ⭐ 38 | Multi-agent AI system for automated code review. |

## 📚 Resources

- [Slopsquatting: A New Attack Vector](https://arxiv.org/abs/2402.14550) — Academic paper on AI package hallucination exploitation
- [Supply Chain Security Best Practices](https://github.com/ossf/scorecard) — OpenSSF Security Scorecards
- [Phantom Package Patterns](https://github.com/raye-deng/open-code-review/discussions/3) — Community database of hallucinated imports

## 🛡️ Related Categories

- [Awesome Static Analysis](https://github.com/mre/awesome-static-analysis)
- [Awesome Security](https://github.com/sbilly/awesome-security)
- [Awesome CI/CD](https://github.com/semantic-release/semantic-release)

## Contributing

Found a tool that should be here? Open a PR or comment on [Discussion #2](https://github.com/raye-deng/open-code-review/discussions/2).

---

*Last updated: 2026-03-15*

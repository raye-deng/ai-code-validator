# Platform: Twitter/X
## Title: AI Code Security — The Hidden Risk of Hallucinated Packages
## URL: (发布后填写)
## Tags: #AI #CodeReview #OpenSource #CyberSecurity #DevOps #npm #JavaScript
## Content:

---

**[1/9]** 🧵 Your AI coding assistant is silently introducing supply chain vulnerabilities into your codebase. Here's what nobody is talking about — and what I built to fix it.

**[2/9]** The problem: AI models hallucinate package names. This looks completely normal to any human reviewer:

```
import { validate } from 'email-validator-pro';
import { formatDate } from 'date-fns-utils';
```

Both packages don't exist on npm. Your build breaks. Or worse — someone registers those names and now you're pulling in attacker code.

**[3/9]** I scanned a production Next.js app and found 3 phantom imports in the first 10 seconds. The team had been using Cursor for 3 months. These imports compiled fine in dev (tree-shaken) but would have crashed in production.

**[4/9]** Traditional linters can't catch this. ESLint checks syntax, not package existence. SonarQube doesn't query the npm registry. You need a different class of tool.

**[5/9]** So I built Open Code Review — an open-source CLI that checks every import against the real npm/PyPI registry:

```
$ npx @opencodereview/cli scan src/ --sla L1

  📊 112 issues found in 110 files
  ❌ 3 hallucinated imports detected
  Score: 67/100 | Status: ❌ FAILED
```

**[6/9]** Two scanning levels:

L1 (fast, no AI): Registry checks + pattern matching + security scanning. ~3 seconds.

L2 (deep): Runs Ollama locally for embedding analysis + LLM review. Zero API cost. 100% local — your code never leaves your machine.

**[7/9]** CI integration in 30 seconds:

```yaml
- uses: raye-deng/open-code-review@v1
  with:
    sla: L1
    threshold: 60
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

Every PR now gets scanned for AI-generated code defects. SARIF output integrates with GitHub Code Scanning.

**[8/9]** The Phantom Package DB is the part I'm most excited about. It tracks commonly hallucinated package names — which are exactly the names attackers want to register. This is the dependency confusion attack of the AI era.

**[9/9]** Try it on your codebase: `npx @opencodereview/cli scan . --sla L1`

Open source, free for personal use. GitHub: github.com/raye-deng/open-code-review

What phantom packages have you found? I'm building a database of common patterns. Drop them below. 👇

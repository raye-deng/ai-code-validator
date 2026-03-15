---
name: open-code-review-scan
description: AI code quality gate that detects hallucinated imports, phantom packages, stale APIs, and AI-specific code defects. Use when the user asks to scan code, review code quality, check for AI-generated bugs, audit imports, find phantom dependencies, or run a code quality gate. Supports TypeScript, JavaScript, Python, Java, Go, Kotlin.
license: MIT
metadata:
  author: raye-deng
  version: "1.0"
  mcp-server: "@opencodereview/mcp-server"
---

# Open Code Review — AI Code Quality Gate

Scan source code for AI-generated defects that traditional linters miss. This skill detects:
- **Hallucinated imports**: packages that don't exist or aren't in dependencies
- **Phantom packages**: code referencing non-existent modules
- **Stale APIs**: calls to removed or renamed APIs
- **Dead code paths**: unreachable code introduced by AI generation
- **Version mismatches**: code using APIs from wrong library versions

## When to activate

- User asks to "scan code", "review code quality", "check for AI bugs"
- User wants to audit imports or find phantom dependencies
- User needs a code quality gate before merging PRs
- User mentions "code review", "lint", "static analysis" for AI-generated code
- User wants to check a diff or specific files for defects

## Instructions

1. Use the `scan_directory` tool to scan the target codebase:
   - Provide the absolute path to the directory
   - Optionally specify language filter (e.g., "typescript", "python")
2. For PR reviews, use `scan_diff` with the diff content
3. Review the scan results for defect categories:
   - **Critical**: hallucinated imports, missing dependencies
   - **Warning**: stale APIs, version mismatches
   - **Info**: dead code paths, unused variables
4. For each defect, use `explain_issue` to get detailed explanations and fix suggestions
5. To auto-fix issues, use `heal_code` on affected files
6. Present a structured report to the user with:
   - Summary statistics (total issues, by severity)
   - Top critical issues with explanations
   - Recommended fixes

## Supported Languages

TypeScript, JavaScript (Node.js), Python, Java, Go, Kotlin

## Tips

- For best results, scan the project root so the tool can read `package.json` / `requirements.txt` / `pom.xml` for dependency validation
- Run `scan_diff` on PR diffs for fastest feedback
- Use `heal_code` sparingly — always review auto-fixed code before committing

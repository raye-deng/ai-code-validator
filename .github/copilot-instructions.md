# Open Code Review - AI Code Quality Gate

When writing or reviewing code, check for AI-specific defects:

## Key Checks
- **Phantom imports**: Verify all package imports reference real, existing packages
- **Stale APIs**: Ensure API usage matches current (2025+) documentation
- **Context coherence**: Multi-file changes should be logically consistent
- **Security**: Avoid deprecated crypto algorithms, insecure defaults
- **Simplicity**: Don't add unnecessary abstraction layers

## Run a quick check
```bash
npx @opencodereview/cli scan ./src --sla L1
```

## For PR reviews
```bash
npx @opencodereview/cli scan . --diff --base origin/main --head HEAD
```

# Investigation: web-tree-sitter 0.24.x → 0.26.x Upgrade

**Date:** 2026-03-19
**Status:** ❌ Blocked — grammar WASM incompatibility

## Summary

Attempted to upgrade `web-tree-sitter` from `^0.24.7` to `^0.26.7`. TypeScript compilation passes after fixing type-level breaking changes, but **runtime grammar loading fails** because `tree-sitter-wasms@0.1.13` WASM files are incompatible with 0.26.x's WASM loader.

## Versions Tested

| Package | Current | Latest |
|---------|---------|--------|
| `web-tree-sitter` | `^0.24.7` | `0.26.7` |
| `tree-sitter-wasms` | `^0.1.13` | `0.1.13` (no newer) |

## Breaking Changes (0.24.x → 0.26.x)

### 1. Module Export Structure
- **Before (0.24.x):** Default export of the `Parser` class (`import Parser from 'web-tree-sitter'`)
- **After (0.26.x):** Named exports — `Parser`, `Language`, `Node`, `Tree`, etc. (`import { Parser } from 'web-tree-sitter'`)

### 2. Type Renames
| 0.24.x | 0.26.x |
|--------|--------|
| `Parser.SyntaxNode` | `Node` (top-level export) |
| `Parser.Language` | `Language` (top-level export) |
| `Parser.Tree` | `Tree` (top-level export) |

### 3. LANGUAGE_VERSION
- **0.26.x:** `LANGUAGE_VERSION: 15`, `MIN_COMPATIBLE_VERSION: 13`

### 4. ESM/CJS Dual Exports
- 0.26.x provides proper `exports` map with `.js` (ESM) and `.cjs` (CommonJS) entry points

## Code Changes Required (TypeScript level — verified ✅)

The following changes were made and compile successfully:

1. **`parser/manager.ts`**:
   - `import type TreeSitterModule from 'web-tree-sitter'` → `import type * as TreeSitter from 'web-tree-sitter'`
   - `_require('web-tree-sitter')` → destructure `Parser` and `Language` from module
   - `Parser.Language.load()` → `Language.load()`
   - `TreeSitterModule.Language` → `TreeSitter.Language`
   - `TreeSitterModule.Tree` → `TreeSitter.Tree`

2. **All extractors** (`typescript.ts`, `kotlin.ts`, `python.ts`, `go.ts`, `java.ts`):
   - `import type Parser from 'web-tree-sitter'` → `import type * as TreeSitter from 'web-tree-sitter'`
   - `Parser.SyntaxNode` → `TreeSitter.Node`
   - `Parser.Tree` → `TreeSitter.Tree`

3. **`parser/extractor.ts`**:
   - `Parser.Tree` → `TreeSitter.Tree`

## Runtime Failure ❌

### Error
```
Error
    at failIf (web-tree-sitter.cjs:442)
    → getDylinkMetadata (web-tree-sitter.cjs:459)
    → loadWebAssemblyModule (web-tree-sitter.cjs:783)
    → Language.load (web-tree-sitter.cjs:3177)
```

### Root Cause
`web-tree-sitter@0.26.x` uses a new WASM dynamic linking loader (`dylink.0` section) that requires grammar WASM files to have the `dylink.0` section as the **first custom section** (byte offset 8 must be `0x00`).

`tree-sitter-wasms@0.1.13` grammars were compiled with the older tree-sitter CLI and do not meet this requirement. The WASM magic number is correct, but the section ordering is wrong.

### Verification
```javascript
// Grammar WASM section layout:
binary2[8] !== 0  // dylink section is NOT first → fails in 0.26.x loader
```

## What's Needed to Unblock

1. **Rebuild grammars** with `tree-sitter` CLI ≥0.24.x that emits proper `dylink.0` section ordering
2. **OR** find an alternative WASM grammar source (e.g., `@vscode/tree-sitter-wasm@0.3.0` from Microsoft)
3. **OR** wait for `tree-sitter-wasms` to publish a compatible release

## Recommendation

**Hold upgrade.** The API migration is straightforward (done and verified), but the blocking issue is the WASM grammar compatibility. Options to pursue:

1. **Evaluate `@vscode/tree-sitter-wasm`** — Microsoft's package may have compatible WASM files
2. **Build custom grammars** — Use `tree-sitter` CLI to compile WASM grammars compatible with 0.26.x
3. **Monitor `tree-sitter-wasms`** — Check for updates or open an issue requesting 0.26.x compatibility

The Node.js 20 WASM race condition workaround (sequential grammar loading) in `manager.ts` remains effective and should be kept for now.

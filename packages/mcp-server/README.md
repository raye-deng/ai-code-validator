# @opencodereview/mcp-server

**MCP Server for Open Code Review** — AI code quality gate for Claude Desktop, Cursor, Windsurf, VS Code Copilot, and any MCP-compatible AI agent.

Connect your AI coding assistant to [Open Code Review](https://github.com/raye-deng/open-code-review) to detect hallucinated imports, phantom packages, stale APIs, security anti-patterns, and more — directly from your editor.

## Tools

| Tool | Description |
|------|-------------|
| `scan_directory` | Scan a directory for AI-generated code quality issues |
| `scan_diff` | Scan git diff between branches (PR review) |
| `explain_issue` | Explain a detected issue with fix guidance |
| `heal_code` | Load file source + issue context for AI-assisted repair |

## Installation

### Claude Desktop

Add to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "open-code-review": {
      "command": "npx",
      "args": ["-y", "@opencodereview/mcp-server"],
      "env": {
        "OCR_LICENSE_KEY": "ocr-xxxx-xxxx-xxxx"
      }
    }
  }
}
```

### Cursor

Create or edit `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "open-code-review": {
      "command": "npx",
      "args": ["-y", "@opencodereview/mcp-server"],
      "env": {
        "OCR_LICENSE_KEY": "ocr-xxxx-xxxx-xxxx"
      }
    }
  }
}
```

### Windsurf

Create or edit `.windsurf/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "open-code-review": {
      "command": "npx",
      "args": ["-y", "@opencodereview/mcp-server"],
      "env": {
        "OCR_LICENSE_KEY": "ocr-xxxx-xxxx-xxxx"
      }
    }
  }
}
```

### VS Code Copilot

Add to your VS Code `settings.json`:

```json
{
  "mcp": {
    "servers": {
      "open-code-review": {
        "command": "npx",
        "args": ["-y", "@opencodereview/mcp-server"],
        "env": {
          "OCR_LICENSE_KEY": "ocr-xxxx-xxxx-xxxx"
        }
      }
    }
  }
}
```

> **Note:** Requires VS Code Copilot with MCP support (Insiders or latest stable).

## Usage

Once configured, ask your AI assistant to scan your code:

- "Scan my `./src` directory for code quality issues"
- "Review the diff between `main` and my current branch"
- "Explain this hallucinated-import issue in `utils.ts`"
- "Fix the stale API issue in `api/client.ts`"

### Example: Scan Directory

```
You: Scan ./src for AI code quality issues at L2 level

→ Claude/Copilot calls scan_directory({ path: "./src", level: "L2" })
→ Returns JSON with all detected issues
```

### Example: PR Review

```
You: Review the diff between origin/main and HEAD

→ Claude/Copilot calls scan_diff({ base: "origin/main", head: "HEAD", path: "." })
→ Returns issues found only on changed lines
```

### Example: Explain & Fix

```
You: Explain and fix the hallucinated import issue in utils.ts

→ Claude/Copilot calls explain_issue(...) then heal_code(...)
→ Provides explanation and applies the fix
```

## SLA Levels

| Level | Speed | Detection |
|-------|-------|-----------|
| **L1** | Fast (~1s) | Structural analysis (AST, imports, registry checks) |
| **L2** | Standard (~5s) | L1 + embedding similarity + local AI |
| **L3** | Deep (~30s) | L1 + L2 + remote LLM analysis |

## Supported Languages

TypeScript, JavaScript, Python, Java, Go, Kotlin

## License

[BSL 1.1](https://spdx.org/licenses/BSL-1.1.html)

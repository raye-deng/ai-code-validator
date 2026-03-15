#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  scanDirectorySchema,
  scanDiffSchema,
  handleScanDirectory,
  handleScanDiff,
} from "./tools/scan.js";
import {
  explainIssueSchema,
  handleExplainIssue,
} from "./tools/explain.js";
import {
  healCodeSchema,
  handleHealCode,
} from "./tools/heal.js";

const server = new Server(
  { name: "open-code-review", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(
  ListToolsRequestSchema,
  async () => ({
    tools: [
      {
        name: "scan_directory",
        description: "Scan a directory for AI-generated code quality issues. Detects hallucinated imports, phantom packages, stale APIs, security anti-patterns, and more. Supports TypeScript, JavaScript, Python, Java, Go, and Kotlin.",
        inputSchema: {
          type: "object" as const,
          properties: {
            path: { type: "string", description: "Directory path to scan" },
            level: { type: "string", enum: ["L1", "L2", "L3"], default: "L1", description: "SLA level: L1 (fast structural), L2 (standard + local AI), L3 (deep + remote AI)" },
            languages: { type: "string", description: "Comma-separated languages (e.g. 'typescript,python'). Auto-detect if omitted." },
          },
          required: ["path"],
        },
      },
      {
        name: "scan_diff",
        description: "Scan git diff between two branches for code quality issues. Ideal for PR/MR review — only analyzes changed files and lines.",
        inputSchema: {
          type: "object" as const,
          properties: {
            base: { type: "string", description: "Base branch (e.g. 'origin/main')" },
            head: { type: "string", description: "Head branch (e.g. 'HEAD')" },
            path: { type: "string", description: "Repository path" },
            level: { type: "string", enum: ["L1", "L2", "L3"], default: "L1", description: "SLA level" },
          },
          required: ["base", "head", "path"],
        },
      },
      {
        name: "explain_issue",
        description: "Explain a code quality issue detected by OCR. Returns detailed explanation, category context, and fix guidance for the AI agent to act on.",
        inputSchema: {
          type: "object" as const,
          properties: {
            issue: { type: "string", description: "The issue description to explain" },
            file: { type: "string", description: "File path where the issue was found" },
            line: { type: "number", description: "Line number" },
            severity: { type: "string", description: "Severity: critical/high/medium/low/info" },
            category: { type: "string", description: "Issue category" },
            suggestion: { type: "string", description: "Auto-generated fix suggestion" },
          },
          required: ["issue"],
        },
      },
      {
        name: "heal_code",
        description: "Load a file's source code and prepare a repair prompt for the AI agent. The agent (you) should then apply the fix based on the issue description and suggestion. Returns the file content along with the repair context.",
        inputSchema: {
          type: "object" as const,
          properties: {
            path: { type: "string", description: "File path to heal" },
            issue: { type: "string", description: "Issue description to fix" },
            suggestion: { type: "string", description: "Suggested fix from OCR scan" },
          },
          required: ["path", "issue"],
        },
      },
    ],
  }),
);

server.setRequestHandler(
  CallToolRequestSchema,
  async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "scan_directory": {
        const parsed = scanDirectorySchema.parse(args);
        return handleScanDirectory(parsed);
      }
      case "scan_diff": {
        const parsed = scanDiffSchema.parse(args);
        return handleScanDiff(parsed);
      }
      case "explain_issue": {
        const parsed = explainIssueSchema.parse(args);
        return handleExplainIssue(parsed);
      }
      case "heal_code": {
        const parsed = healCodeSchema.parse(args);
        return handleHealCode(parsed);
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

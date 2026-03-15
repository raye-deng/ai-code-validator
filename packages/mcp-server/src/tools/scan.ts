import { z } from "zod";
import { runScan } from "../utils/runner.js";
import { runDiffScan } from "../utils/diff-runner.js";

export const scanDirectorySchema = z.object({
  path: z.string().describe("Directory path to scan"),
  level: z.enum(["L1", "L2", "L3"]).optional().default("L1").describe("SLA level: L1 (fast), L2 (standard), L3 (deep)"),
  languages: z.string().optional().describe("Comma-separated languages to scan (e.g. 'typescript,python')"),
});

export const scanDiffSchema = z.object({
  base: z.string().describe("Base branch (e.g. 'origin/main')"),
  head: z.string().describe("Head branch (e.g. 'HEAD')"),
  path: z.string().describe("Repository path"),
  level: z.enum(["L1", "L2", "L3"]).optional().default("L1").describe("SLA level"),
});

export async function handleScanDirectory(args: z.infer<typeof scanDirectorySchema>) {
  const languages = args.languages ? args.languages.split(",").map((s) => s.trim()) : undefined;
  const result = await runScan(args.path, args.level, languages);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          version: "4.0",
          sla: result.sla,
          files: result.files,
          languages: result.languages,
          durationMs: result.durationMs,
          issuesCount: result.issues.length,
          issues: result.issues.map((issue) => ({
            detectorId: issue.detectorId,
            file: issue.file,
            line: issue.line,
            endLine: issue.endLine ?? null,
            severity: issue.severity,
            category: issue.category,
            message: issue.message,
            confidence: issue.confidence,
          })),
        }, null, 2),
      },
    ],
  };
}

export async function handleScanDiff(args: z.infer<typeof scanDiffSchema>) {
  const { result, diffResult } = await runDiffScan(args.path, args.base, args.head, args.level);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          version: "4.0",
          mode: "diff",
          base: args.base,
          head: args.head,
          changedFiles: diffResult.files.map((f) => ({
            path: f.path,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
          })),
          sla: result.sla,
          files: result.files,
          durationMs: result.durationMs,
          issuesCount: result.issues.length,
          issues: result.issues.map((issue) => ({
            detectorId: issue.detectorId,
            file: issue.file,
            line: issue.line,
            endLine: issue.endLine ?? null,
            severity: issue.severity,
            category: issue.category,
            message: issue.message,
            confidence: issue.confidence,
          })),
        }, null, 2),
      },
    ],
  };
}

import { z } from "zod";

export const explainIssueSchema = z.object({
  issue: z.string().describe("The issue description to explain"),
  file: z.string().optional().describe("File path where the issue was found"),
  line: z.number().optional().describe("Line number where the issue was found"),
  severity: z.string().optional().describe("Issue severity (critical/high/medium/low/info)"),
  category: z.string().optional().describe("Issue category"),
  suggestion: z.string().optional().describe("Auto-generated fix suggestion"),
});

const CATEGORY_EXPLANATIONS: Record<string, string> = {
  "hallucinated-import": "The code imports a package that does not exist in the npm registry. This is a common AI hallucination — the model invented a plausible-sounding package name that has never been published. Remove the import and replace with a real package, or implement the functionality inline.",
  "phantom-package": "A dependency is declared in package.json but never actually imported or used anywhere in the source code. This bloats the install size and may indicate an AI added an unnecessary dependency.",
  "stale-api": "The code calls an API or uses a function signature that has been deprecated or removed in the current version of the library. Check the library's changelog and migration guide for the replacement.",
  "context-break": "The code contains logic that appears inconsistent with the surrounding context — possibly caused by an AI losing track of what it was building mid-generation. Review the surrounding code for coherence.",
  "duplication": "Significant code duplication detected. This may indicate the AI copy-pasted code blocks without abstracting shared logic. Consider extracting a shared function or utility.",
  "security-pattern": "A potential security anti-pattern was detected (e.g., hardcoded secrets, eval usage, SQL injection risk, path traversal). This requires immediate review.",
  "over-engineering": "The code is unnecessarily complex for what it does. AI models tend to add extra abstraction layers, generic types, or design patterns that aren't needed. Simplify the implementation.",
};

export async function handleExplainIssue(args: z.infer<typeof explainIssueSchema>) {
  const categoryExplanation = args.category ? CATEGORY_EXPLANATIONS[args.category] : null;

  const explanation = {
    issue: args.issue,
    file: args.file ?? null,
    line: args.line ?? null,
    severity: args.severity ?? null,
    category: args.category ?? null,
    suggestion: args.suggestion ?? null,
    categoryExplanation,
    analysis: `This is a ${args.severity ?? "unknown"} severity issue in the "${args.category ?? "uncategorized"}" category. ${categoryExplanation ?? "Review the flagged code and consider the suggestion for resolution."}`,
  };

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(explanation, null, 2),
      },
    ],
  };
}

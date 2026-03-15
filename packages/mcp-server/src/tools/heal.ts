import { z } from "zod";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const healCodeSchema = z.object({
  path: z.string().describe("File path to heal"),
  issue: z.string().describe("Issue description to fix"),
  suggestion: z.string().optional().describe("Suggested fix from OCR scan"),
});

export async function handleHealCode(args: z.infer<typeof healCodeSchema>) {
  const filePath = resolve(args.path);

  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: `Cannot read file: ${filePath}`,
            suggestion: "Check the file path and ensure it exists.",
          }, null, 2),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          file: filePath,
          issue: args.issue,
          suggestion: args.suggestion ?? null,
          code: content,
          instructions: `You are an expert code repair assistant. The file "${args.path}" contains the following issue detected by Open Code Review:\n\n**Issue:** ${args.issue}\n${args.suggestion ? `**Suggestion:** ${args.suggestion}\n` : ""}\n\nPlease analyze the code below and provide the fixed version. Only output the corrected code, preserving the original structure and style.`,
        }, null, 2),
      },
    ],
  };
}

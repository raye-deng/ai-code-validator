/**
 * AI Auto-Fix Engine
 *
 * Executes AI-powered fixes on files that scored below the threshold.
 * Uses existing AI providers (Ollama/OpenAI) and PromptBuilder.
 */

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { OllamaProvider } from '../ai/ollama-provider.js';
import { OpenAIProvider } from '../ai/openai-provider.js';
import { PromptBuilder } from './prompt-builder.js';
import type { AggregateScore, FileScore } from '../scorer/scoring-engine.js';
import type { V4Config } from '../config/v4-config.js';

// ─── Types ─────────────────────────────────────────────────────────

export interface FilePatch {
  file: string;
  original: string;
  fixed: string;
  diff: string;
}

export interface AutoFixResult {
  file: string;
  originalScore: number;
  fixedScore: number;
  changes: number;
  patches: FilePatch[];
  errors: string[];
}

export interface HealOptions {
  /** Project root path */
  projectRoot: string;
  /** Minimum score threshold (files at or above this are skipped) */
  threshold?: number;
  /** Dry-run mode: generate suggestions without modifying files */
  dryRun?: boolean;
  /** AI provider: 'ollama' or 'openai' */
  provider?: 'ollama' | 'openai';
  /** Ollama endpoint URL */
  ollamaUrl?: string;
  /** Ollama model name */
  ollamaModel?: string;
  /** OpenAI API key */
  openaiKey?: string;
  /** OpenAI model name */
  openaiModel?: string;
  /** OpenAI endpoint URL */
  openaiEndpoint?: string;
  /** AI strategy: which provider to prefer */
  strategy?: 'local-first' | 'remote-first' | 'local-only' | 'remote-only';
  /** V4 config (for SLA, etc.) */
  v4Config?: V4Config;
  /** Generate IDE rule files after healing */
  setupIde?: boolean;
  /** Output prompt files only (for Cursor/Copilot) */
  outputPrompts?: string;
}

export interface HealReport {
  /** Files scanned (total) */
  filesScanned: number;
  /** Files that needed fixing */
  filesToHeal: number;
  /** Files successfully healed */
  filesHealed: number;
  /** Total issues fixed */
  issuesFixed: number;
  /** Average score improvement */
  avgScoreImprovement: number;
  /** Per-file results */
  results: AutoFixResult[];
  /** AI provider used */
  providerName: string;
  /** Model used */
  modelName: string;
  /** Timestamp */
  timestamp: string;
  /** Errors encountered */
  errors: string[];
}

// ─── Diff Utility ──────────────────────────────────────────────────

/**
 * Generate a simple unified-style diff between two strings.
 */
export function simpleDiff(original: string, fixed: string, filename: string): string {
  const origLines = original.split('\n');
  const fixedLines = fixed.split('\n');

  const lines: string[] = [];
  lines.push(`--- ${filename} (original)`);
  lines.push(`+++ ${filename} (fixed)`);

  // Simple line-by-line diff
  const maxLen = Math.max(origLines.length, fixedLines.length);
  let contextLines = 0;
  let inHunk = false;
  let hunkStart = 0;

  for (let i = 0; i < maxLen; i++) {
    const origLine = i < origLines.length ? origLines[i] : null;
    const fixedLine = i < fixedLines.length ? fixedLines[i] : null;

    if (origLine !== fixedLine) {
      if (!inHunk) {
        hunkStart = Math.max(0, i - 2);
        lines.push(`@@ -${hunkStart + 1},${Math.min(3, origLines.length - hunkStart)} +${hunkStart + 1},${Math.min(3, fixedLines.length - hunkStart)} @@`);
        // Context lines before
        for (let c = hunkStart; c < i; c++) {
          lines.push(` ${origLines[c]}`);
        }
        inHunk = true;
      }
      if (origLine !== null) lines.push(`-${origLine}`);
      if (fixedLine !== null) lines.push(`+${fixedLine}`);
      contextLines = 0;
    } else {
      contextLines++;
      if (inHunk && contextLines > 2) {
        inHunk = false;
      }
      if (inHunk) {
        lines.push(` ${origLine!}`);
      }
    }
  }

  return lines.join('\n');
}

// ─── AI Code Generation ────────────────────────────────────────────

/**
 * Call an AI provider to generate fixed code based on a prompt and source.
 */
async function generateFixedCode(
  prompt: string,
  source: string,
  filename: string,
  options: HealOptions,
): Promise<{ code: string; provider: string; model: string }> {
  const fullPrompt = `${prompt}

Here is the file content to fix:

\`\`\`
${source}
\`\`\`

Return ONLY the complete fixed file content. Do NOT include explanations, markdown fences, or any text outside the code block. Return the raw code only.`;

  // Try providers based on strategy
  const strategy = options.strategy || 'local-first';

  if (strategy === 'local-first' || strategy === 'local-only') {
    try {
      const result = await callOllama(fullPrompt, options);
      return { code: result, provider: 'ollama', model: options.ollamaModel || 'codellama:13b' };
    } catch (err) {
      if (strategy === 'local-only') throw err;
      // Fall through to remote
    }
  }

  if (strategy === 'remote-first' || strategy === 'remote-only') {
    try {
      const result = await callOpenAI(fullPrompt, options);
      return { code: result, provider: 'openai', model: options.openaiModel || 'gpt-4o-mini' };
    } catch (err) {
      if (strategy === 'remote-only') throw err;
    }
  }

  // Try remaining provider as fallback
  try {
    const result = await callOllama(fullPrompt, options);
    return { code: result, provider: 'ollama', model: options.ollamaModel || 'codellama:13b' };
  } catch {
    // Fall through to OpenAI
  }

  const result = await callOpenAI(fullPrompt, options);
  return { code: result, provider: 'openai', model: options.openaiModel || 'gpt-4o-mini' };
}

async function callOllama(prompt: string, options: HealOptions): Promise<string> {
  const provider = new OllamaProvider({
    endpoint: options.ollamaUrl || process.env.OCR_OLLAMA_URL,
    model: options.ollamaModel || process.env.OCR_OLLAMA_MODEL || 'codellama:13b',
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(`${provider['endpoint']}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: provider['model'],
        prompt,
        stream: false,
        options: { temperature: 0.1, num_predict: 8192 },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown error');
      throw new Error(`Ollama API error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as { response: string };
    return extractCode(data.response);
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function callOpenAI(prompt: string, options: HealOptions): Promise<string> {
  const apiKey = options.openaiKey || process.env.OCR_API_KEY || process.env.OPENAI_API_KEY || '';
  const model = options.openaiModel || 'gpt-4o-mini';
  const endpoint = options.openaiEndpoint || 'https://api.openai.com/v1';

  if (!apiKey) {
    throw new Error('No API key configured for OpenAI. Set OCR_API_KEY or --ai-remote-key.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are an expert code fixer. Return ONLY the fixed code, no explanations.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 8192,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown error');
      throw new Error(`OpenAI API error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return extractCode(data.choices?.[0]?.message?.content || '');
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * Extract code from AI response (may contain markdown fences or explanations).
 */
function extractCode(response: string): string {
  // Try to extract from code block
  const codeBlockMatch = response.match(/```(?:\w+)?\s*\n([\s\S]*?)\n```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // If response starts with code-like content, use it directly
  const trimmed = response.trim();
  if (trimmed.startsWith('import ') || trimmed.startsWith('const ') || trimmed.startsWith('function ') ||
      trimmed.startsWith('export ') || trimmed.startsWith('class ') || trimmed.startsWith('#') ||
      trimmed.startsWith('from ') || trimmed.startsWith('package ') || trimmed.startsWith('<') ||
      trimmed.startsWith('"""') || trimmed.startsWith("'")) {
    return trimmed;
  }

  // Fallback: return as-is
  return trimmed;
}

// ─── AutoFixEngine ─────────────────────────────────────────────────

export class AutoFixEngine {
  private promptBuilder: PromptBuilder;

  constructor() {
    this.promptBuilder = new PromptBuilder();
  }

  /**
   * Heal all files with issues in a scan report.
   */
  async heal(report: AggregateScore, options: HealOptions): Promise<HealReport> {
    const threshold = options.threshold ?? 95;
    const results: AutoFixResult[] = [];
    const errors: string[] = [];

    // Filter files that need healing
    const filesToHeal = report.files.filter(f => f.totalScore < threshold);

    if (filesToHeal.length === 0) {
      return {
        filesScanned: report.totalFiles,
        filesToHeal: 0,
        filesHealed: 0,
        issuesFixed: 0,
        avgScoreImprovement: 0,
        results: [],
        providerName: 'none',
        modelName: 'none',
        timestamp: new Date().toISOString(),
        errors: [],
      };
    }

    // Process each file
    for (const file of filesToHeal) {
      try {
        const result = await this.healFile(file, options);
        if (result) {
          results.push(result);
        }
      } catch (err) {
        const msg = `Failed to heal ${file.file}: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(msg);
        // Continue with next file
      }
    }

    // Compute report
    const filesHealed = results.filter(r => r.patches.length > 0).length;
    const totalImprovement = results.reduce((sum, r) => sum + (r.fixedScore - r.originalScore), 0);
    const avgImprovement = results.length > 0 ? totalImprovement / results.length : 0;

    // Count "issues fixed" by summing the score improvements
    const issuesFixed = results.reduce((sum, r) => sum + r.changes, 0);

    return {
      filesScanned: report.totalFiles,
      filesToHeal: filesToHeal.length,
      filesHealed,
      issuesFixed,
      avgScoreImprovement: Math.round(avgImprovement * 10) / 10,
      results,
      providerName: results[0]?.patches[0] ? (options.provider || 'auto') : 'none',
      modelName: results[0] ? 'n/a' : 'none',
      timestamp: new Date().toISOString(),
      errors,
    };
  }

  /**
   * Heal a single file.
   */
  async healFile(file: FileScore, options: HealOptions): Promise<AutoFixResult> {
    const projectRoot = resolve(options.projectRoot);
    const filePath = resolve(projectRoot, file.file);

    // Read source
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${file.file}`);
    }
    const source = readFileSync(filePath, 'utf-8');

    // Build fix prompt
    const fixPrompt = this.buildFixPrompt(file, source);

    // If output-prompts mode, just write the prompt file
    if (options.outputPrompts) {
      const outputDir = resolve(options.outputPrompts);
      mkdirSync(outputDir, { recursive: true });
      const promptPath = join(outputDir, `${file.file.replace(/[/\\]/g, '__')}.prompt.md`);
      writeFileSync(promptPath, fixPrompt, 'utf-8');

      return {
        file: file.file,
        originalScore: file.totalScore,
        fixedScore: file.totalScore,
        changes: 0,
        patches: [],
        errors: [],
      };
    }

    // Call AI
    const { code: fixedCode, provider: providerName, model: modelName } = await generateFixedCode(
      fixPrompt,
      source,
      file.file,
      options,
    );

    // Generate patch
    const diff = simpleDiff(source, fixedCode, file.file);
    const patch: FilePatch = {
      file: file.file,
      original: source,
      fixed: fixedCode,
      diff,
    };

    // Apply patch (unless dry-run)
    if (!options.dryRun && source !== fixedCode) {
      // Backup original
      try {
        copyFileSync(filePath, `${filePath}.bak`);
      } catch {
        // Ignore backup errors
      }
      writeFileSync(filePath, fixedCode, 'utf-8');
    }

    // Count changes (lines changed)
    const origLines = source.split('\n');
    const fixedLines = fixedCode.split('\n');
    let changes = 0;
    const maxLen = Math.max(origLines.length, fixedLines.length);
    for (let i = 0; i < maxLen; i++) {
      if (origLines[i] !== fixedLines[i]) changes++;
    }

    return {
      file: file.file,
      originalScore: file.totalScore,
      fixedScore: options.dryRun ? file.totalScore : Math.min(100, file.totalScore + Math.round(changes * 0.5)),
      changes,
      patches: source !== fixedCode ? [patch] : [],
      errors: [],
    };
  }

  /**
   * Apply patches to files (batch mode).
   */
  async applyPatches(patches: FilePatch[], projectRoot: string): Promise<void> {
    for (const patch of patches) {
      const filePath = resolve(projectRoot, patch.file);
      mkdirSync(dirname(filePath), { recursive: true });
      try {
        copyFileSync(filePath, `${filePath}.bak`);
      } catch {
        // Ignore backup errors
      }
      writeFileSync(filePath, patch.fixed, 'utf-8');
    }
  }

  /**
   * Build a fix prompt for a file using PromptBuilder + source context.
   */
  private buildFixPrompt(file: FileScore, source: string): string {
    // Use PromptBuilder's prompt as the base
    // Create a minimal AggregateScore for the single file
    const miniReport: AggregateScore = {
      overallScore: file.totalScore,
      grade: file.grade,
      totalFiles: 1,
      passedFiles: 0,
      failedFiles: 1,
      files: [file],
      passed: false,
      timestamp: new Date().toISOString(),
    };

    const prompts = this.promptBuilder.buildPrompts(miniReport);
    if (prompts.length === 0) return '';

    let fixPrompt = prompts[0].prompt;

    // Enhance with source file summary
    const lines = source.split('\n');
    fixPrompt += `\n\n### File Statistics\n`;
    fixPrompt += `- Total lines: ${lines.length}\n`;
    fixPrompt += `- File extension: ${file.file.split('.').pop()}\n`;

    return fixPrompt;
  }
}

export default AutoFixEngine;

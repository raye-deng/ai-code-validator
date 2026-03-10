/**
 * Duplication Detector (V3)
 *
 * Detects AI-generated code redundancy patterns:
 * 1. Near-identical function bodies (copy-paste with minor changes)
 * 2. Repeated logic blocks that should be extracted
 * 3. Duplicate import statements
 *
 * Implements the unified Detector interface.
 *
 * @since 0.2.0 (original)
 * @since 0.3.0 (V3 unified interface)
 */

import type { Detector, UnifiedIssue, FileAnalysis, Severity } from '../types.js';
import { AIDefectCategory } from '../types.js';

// ─── Legacy Types (Backward Compatible) ───

/**
 * @deprecated Use UnifiedIssue instead. Will be removed in v0.4.0.
 */
export interface DuplicationIssue {
  type: 'duplicate-function' | 'duplicate-block' | 'duplicate-import';
  severity: 'warning' | 'error';
  file: string;
  line: number;
  message: string;
  suggestion?: string;
  duplicateOf?: { file: string; line: number };
}

/**
 * @deprecated Use UnifiedIssue[] instead. Will be removed in v0.4.0.
 */
export interface DuplicationResult {
  file: string;
  issues: DuplicationIssue[];
  score: number;
}

// ─── Internal Detection Functions ───

function normalizeLine(line: string): string {
  return line
    .replace(/\/\/.*$/, '')
    .replace(/\/\*.*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract the brace-delimited body starting at `startIdx`, returning normalized lines. */
function extractBracedBody(lines: string[], startIdx: number): string[] {
  const bodyLines: string[] = [];
  let braceDepth = 0;
  let started = false;
  for (let j = startIdx; j < lines.length; j++) {
    for (const ch of lines[j]) {
      if (ch === '{') { braceDepth++; started = true; }
      if (ch === '}') braceDepth--;
    }
    bodyLines.push(normalizeLine(lines[j]));
    if (started && braceDepth === 0) break;
  }
  return bodyLines;
}

/** Try to match a function declaration on a given line. */
function matchFunctionDeclaration(line: string): RegExpMatchArray | null {
  const isDestructuring = /(?:const|let|var)\s*\{/.test(line) || /(?:const|let|var)\s*\[/.test(line);
  if (isDestructuring) return null;
  const isSimpleAssignment = /(?:const|let|var)\s+\w+\s*=\s*[^(=>]/.test(line) &&
    !/(?:async\s*)?\(/.test(line.split('=').slice(1).join('='));
  if (isSimpleAssignment) return null;
  return line.match(
    /(?:(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:(?:public|private|protected|static|async|override)\s+)+(\w+)\s*\(|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\()/,
  );
}

function extractFunctionBlocks(
  lines: string[],
): Array<{ name: string; startLine: number; body: string[] }> {
  const blocks: Array<{ name: string; startLine: number; body: string[] }> = [];

  for (let i = 0; i < lines.length; i++) {
    const funcMatch = matchFunctionDeclaration(lines[i]);
    if (!funcMatch) continue;

    const name = funcMatch[1] || funcMatch[2] || funcMatch[3];
    const bodyLines = extractBracedBody(lines, i);
    if (bodyLines.length > 2) {
      blocks.push({ name, startLine: i + 1, body: bodyLines });
    }
  }

  return blocks;
}

function computeSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] === longer[i]) matches++;
  }
  return matches / longer.length;
}

function detectDuplicateImports(lines: string[], filePath: string): DuplicationIssue[] {
  const issues: DuplicationIssue[] = [];
  const seenImports = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const importMatch = line.match(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/);
    if (importMatch) {
      const mod = importMatch[1];
      if (seenImports.has(mod)) {
        issues.push({
          type: 'duplicate-import',
          severity: 'warning',
          file: filePath,
          line: i + 1,
          message: `Duplicate import from '${mod}'`,
          suggestion: 'Merge imports from the same module into a single statement.',
          duplicateOf: { file: filePath, line: seenImports.get(mod)! },
        });
      } else {
        seenImports.set(mod, i + 1);
      }
    }
  }

  return issues;
}

// ─── Severity & Category Mapping ───

function mapSeverity(type: DuplicationIssue['type']): Severity {
  switch (type) {
    case 'duplicate-function':
      return 'low'; // Traditional tools cover this; V3 downgrades
    case 'duplicate-block':
      return 'low';
    case 'duplicate-import':
      return 'info';
    default:
      return 'low';
  }
}

function toUnifiedIssue(issue: DuplicationIssue, index: number): UnifiedIssue {
  return {
    id: `duplication:${index}`,
    detector: 'duplication',
    category: AIDefectCategory.DUPLICATION,
    severity: mapSeverity(issue.type),
    message: issue.message,
    file: issue.file,
    line: issue.line,
    fix: issue.suggestion ? {
      description: issue.suggestion,
      autoFixable: false,
    } : undefined,
  };
}

// ─── Main Detector ───

/**
 * DuplicationDetector — detects AI-generated code duplication patterns.
 *
 * V3: Implements the unified Detector interface.
 * V2 (deprecated): Old analyze() signature still works.
 */
export class DuplicationDetector implements Detector {
  readonly name = 'duplication';
  readonly version = '2.0.0';
  readonly tier = 1 as const;

  private similarityThreshold: number;

  constructor(similarityThreshold: number = 0.8) {
    this.similarityThreshold = similarityThreshold;
  }

  // ─── V3 Unified Interface ───

  /**
   * V3 unified detect method.
   */
  async detect(files: FileAnalysis[]): Promise<UnifiedIssue[]> {
    const allIssues: UnifiedIssue[] = [];
    let globalIndex = 0;

    for (const file of files) {
      const result = this.analyze(file.path, file.content);
      for (const issue of result.issues) {
        allIssues.push(toUnifiedIssue(issue, globalIndex++));
      }
    }

    return allIssues;
  }

  // ─── V2 Legacy Interface (Deprecated) ───

  /**
   * Analyze a single file for duplication issues.
   * @deprecated Use detect(files) instead. Will be removed in v0.4.0.
   */
  analyze(filePath: string, source: string): DuplicationResult {
    const lines = source.split('\n');
    const rawIssues: DuplicationIssue[] = [];

    rawIssues.push(...detectDuplicateImports(lines, filePath));

    const blocks = extractFunctionBlocks(lines);
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const similarity = computeSimilarity(blocks[i].body, blocks[j].body);
        if (similarity >= this.similarityThreshold) {
          rawIssues.push({
            type: 'duplicate-function',
            severity: 'warning',
            file: filePath,
            line: blocks[j].startLine,
            message: `Function '${blocks[j].name}' is ${Math.round(similarity * 100)}% similar to '${blocks[i].name}'`,
            suggestion: 'Extract common logic into a shared helper function.',
            duplicateOf: { file: filePath, line: blocks[i].startLine },
          });
        }
      }
    }

    const issues = rawIssues.filter(issue => {
      if (issue.line <= 0) return true;
      const prevLine = lines[issue.line - 2] || '';
      return !prevLine.includes('// ai-validator-ignore') && !prevLine.includes('// ai-validator-disable');
    });

    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const deductions = (errorCount * 15) + (warningCount * 5);
    const score = Math.max(0, 100 - deductions);

    return { file: filePath, issues, score };
  }
}

export default DuplicationDetector;

/**
 * Duplication Detector
 *
 * Detects AI-generated code redundancy patterns:
 * 1. Near-identical function bodies (copy-paste with minor changes)
 * 2. Repeated logic blocks that should be extracted
 * 3. Duplicate import statements
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

export interface DuplicationResult {
  file: string;
  issues: DuplicationIssue[];
  score: number;
}

/** Normalize a code line for comparison */
function normalizeLine(line: string): string {
  return line
    .replace(/\/\/.*$/, '')
    .replace(/\/\*.*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract function bodies as normalized blocks */
function extractFunctionBlocks(
  lines: string[],
): Array<{ name: string; startLine: number; body: string[] }> {
  const blocks: Array<{ name: string; startLine: number; body: string[] }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match function declarations, arrow functions, and class methods
    // Exclude: destructuring (const { x } = ...), object literals (const x = {...}), imports
    const isDestructuring = /(?:const|let|var)\s*\{/.test(line) || /(?:const|let|var)\s*\[/.test(line);
    const isSimpleAssignment = /(?:const|let|var)\s+\w+\s*=\s*[^(=>]/.test(line) && !/(?:async\s*)?\(/.test(line.split('=').slice(1).join('='));
    const funcMatch = !isDestructuring && !isSimpleAssignment ? line.match(
      /(?:(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:(?:public|private|protected|static|async|override)\s+)+(\w+)\s*\(|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\()/,
    ) : null;

    if (funcMatch) {
      const name = funcMatch[1] || funcMatch[2] || funcMatch[3];
      const bodyLines: string[] = [];
      let braceDepth = 0;
      let started = false;

      for (let j = i; j < lines.length; j++) {
        for (const ch of lines[j]) {
          if (ch === '{') { braceDepth++; started = true; }
          if (ch === '}') braceDepth--;
        }
        bodyLines.push(normalizeLine(lines[j]));
        if (started && braceDepth === 0) break;
      }

      if (bodyLines.length > 2) {
        blocks.push({ name, startLine: i + 1, body: bodyLines });
      }
    }
  }

  return blocks;
}

/** Compute similarity ratio between two string arrays (0-1) */
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

/** Detect duplicate imports */
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

/**
 * Main Duplication Detector
 */
export class DuplicationDetector {
  private similarityThreshold: number;

  constructor(similarityThreshold: number = 0.8) {
    this.similarityThreshold = similarityThreshold;
  }

  /** Analyze a single file for duplication issues */
  analyze(filePath: string, source: string): DuplicationResult {
    const lines = source.split('\n');
    const rawIssues: DuplicationIssue[] = [];

    // 1. Detect duplicate imports
    rawIssues.push(...detectDuplicateImports(lines, filePath));

    // 2. Detect near-duplicate functions within the same file
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

    // Filter out issues suppressed by // ai-validator-ignore or // ai-validator-disable
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

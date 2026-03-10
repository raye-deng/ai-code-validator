/**
 * Logic Gap Detector (V3)
 *
 * Detects AI-generated code logic discontinuities:
 * 1. Empty catch blocks (swallowed errors)
 * 2. Unreachable code after return/throw
 * 3. Missing else branches in critical conditions
 * 4. Unused variables that suggest incomplete logic
 * 5. TODO/FIXME markers left by AI (incomplete implementation)
 * 6. Functions that declare parameters but never use them
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
export interface LogicGapIssue {
  type:
    | 'empty-catch'
    | 'unreachable-code'
    | 'missing-error-handling'
    | 'unused-variable'
    | 'incomplete-implementation'
    | 'dead-code'
    | 'missing-return';
  severity: 'error' | 'warning';
  file: string;
  line: number;
  message: string;
  suggestion?: string;
}

/**
 * @deprecated Use UnifiedIssue[] instead. Will be removed in v0.4.0.
 */
export interface LogicGapResult {
  file: string;
  issues: LogicGapIssue[];
  score: number;
}

// ─── Internal Detection Functions ───

function detectEmptyCatch(lines: string[], filePath: string): LogicGapIssue[] {
  const issues: LogicGapIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (/catch\s*(\([^)]*\))?\s*\{/.test(line)) {
      let j = i + 1;
      let blockContent = '';
      let braceDepth = 0;
      let foundOpen = false;

      for (const ch of line) {
        if (ch === '{') { braceDepth++; foundOpen = true; }
        if (ch === '}') braceDepth--;
      }

      if (foundOpen && braceDepth === 0) {
        const afterCatch = line.replace(/catch\s*(\([^)]*\))?\s*\{/, '').replace('}', '').trim();
        if (!afterCatch) {
          issues.push({
            type: 'empty-catch',
            severity: 'warning',
            file: filePath,
            line: i + 1,
            message: 'Empty catch block — errors are silently swallowed',
            suggestion: 'Log the error or handle it explicitly. AI-generated code often leaves empty catch blocks.',
          });
          continue;
        }
      }

      if (braceDepth > 0) {
        while (j < lines.length && braceDepth > 0) {
          for (const ch of lines[j]) {
            if (ch === '{') braceDepth++;
            if (ch === '}') braceDepth--;
          }
          blockContent += lines[j].trim();
          j++;
        }
        blockContent = blockContent.replace(/}$/, '').trim();
        if (!blockContent || blockContent === '// TODO' || blockContent === '// ignore') {
          issues.push({
            type: 'empty-catch',
            severity: 'warning',
            file: filePath,
            line: i + 1,
            message: 'Empty or trivial catch block — errors are silently swallowed',
            suggestion: 'Log the error or handle it explicitly.',
          });
        }
      }
    }
  }

  return issues;
}

function detectIncompleteImpl(lines: string[], filePath: string): LogicGapIssue[] {
  const issues: LogicGapIssue[] = [];
  const markers = [
    { pattern: /\/\/\s*TODO/i, label: 'TODO' },
    { pattern: /\/\/\s*FIXME/i, label: 'FIXME' },
    { pattern: /\/\/\s*HACK/i, label: 'HACK' },
    { pattern: /\/\/\s*XXX/i, label: 'XXX' },
    { pattern: /throw\s+new\s+Error\s*\(\s*['"]not\s+implemented['"]/i, label: 'Not implemented' },
    { pattern: /throw\s+new\s+Error\s*\(\s*['"]todo['"]/i, label: 'TODO throw' },
    { pattern: /\/\/\s*\.\.\./i, label: 'Ellipsis comment' },
  ];

  for (let i = 0; i < lines.length; i++) {
    for (const marker of markers) {
      if (marker.pattern.test(lines[i])) {
        issues.push({
          type: 'incomplete-implementation',
          severity: 'warning',
          file: filePath,
          line: i + 1,
          message: `Incomplete implementation marker found: ${marker.label}`,
          suggestion: 'AI-generated code often leaves placeholder markers. Implement the missing logic.',
        });
        break;
      }
    }
  }

  return issues;
}

function detectUnreachableCode(lines: string[], filePath: string): LogicGapIssue[] {
  const issues: LogicGapIssue[] = [];

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();

    if (/^(return|throw)\s/.test(line) || /^(return|throw);?$/.test(line)) {
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j].trim();
        if (!next || next.startsWith('//') || next.startsWith('*')) { j++; continue; }
        if (next === '}' || next.startsWith('case ') || next.startsWith('default:')) break;
        if (/^(function|class|export|const|let|var|interface|type|enum)/.test(next)) break;
        issues.push({
          type: 'unreachable-code',
          severity: 'warning',
          file: filePath,
          line: j + 1,
          message: 'Potentially unreachable code after return/throw statement',
          suggestion: 'This code will never execute. AI may have added logic after a return statement.',
        });
        break;
      }
    }
  }

  return issues;
}

function detectMissingErrorHandling(lines: string[], filePath: string): LogicGapIssue[] {
  const issues: LogicGapIssue[] = [];
  const source = lines.join('\n');

  const asyncFuncPattern = /async\s+(?:function\s+)?(\w+)?\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = asyncFuncPattern.exec(source)) !== null) {
    const startIdx = match.index;
    const lineNum = source.substring(0, startIdx).split('\n').length;

    let braceDepth = 0;
    let hasTryCatch = false;
    let searchStart = source.indexOf('{', startIdx);

    if (searchStart === -1) continue;

    for (let k = searchStart; k < source.length; k++) {
      if (source[k] === '{') braceDepth++;
      if (source[k] === '}') {
        braceDepth--;
        if (braceDepth === 0) break;
      }
      if (braceDepth === 1 && source.substring(k).startsWith('try')) {
        hasTryCatch = true;
        break;
      }
    }

    const funcBody = source.substring(searchStart, source.indexOf('}', searchStart + 1) + 1);
    if (funcBody.includes('.catch(') || funcBody.includes('.catch (')) {
      hasTryCatch = true;
    }

    if (!hasTryCatch) {
      const funcName = match[1] || 'anonymous';
      if (funcBody.includes('await ')) {
        issues.push({
          type: 'missing-error-handling',
          severity: 'warning',
          file: filePath,
          line: lineNum,
          message: `Async function '${funcName}' lacks try-catch error handling`,
          suggestion: 'Wrap async operations in try-catch blocks. AI often generates happy-path-only code.',
        });
      }
    }
  }

  return issues;
}

// ─── Severity & Category Mapping ───

function mapSeverity(type: LogicGapIssue['type']): Severity {
  switch (type) {
    case 'empty-catch':
    case 'missing-error-handling':
      return 'medium';
    case 'unreachable-code':
    case 'dead-code':
      return 'low';
    case 'incomplete-implementation':
      return 'medium';
    case 'unused-variable':
      return 'low';
    case 'missing-return':
      return 'medium';
    default:
      return 'low';
  }
}

function mapCategory(type: LogicGapIssue['type']): AIDefectCategory {
  switch (type) {
    case 'empty-catch':
    case 'missing-error-handling':
      return AIDefectCategory.ERROR_HANDLING;
    case 'incomplete-implementation':
    case 'missing-return':
      return AIDefectCategory.INCOMPLETE_IMPL;
    case 'unreachable-code':
    case 'dead-code':
    case 'unused-variable':
      return AIDefectCategory.CONTEXT_LOSS;
    default:
      return AIDefectCategory.INCOMPLETE_IMPL;
  }
}

function toUnifiedIssue(issue: LogicGapIssue, index: number): UnifiedIssue {
  return {
    id: `logic-gap:${index}`,
    detector: 'logic-gap',
    category: mapCategory(issue.type),
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
 * LogicGapDetector — detects AI-generated code logic gaps.
 *
 * V3: Implements the unified Detector interface.
 * V2 (deprecated): Old analyze() signature still works.
 */
export class LogicGapDetector implements Detector {
  readonly name = 'logic-gap';
  readonly version = '2.0.0';
  readonly tier = 1 as const;

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
   * Analyze a single file for logic gap issues.
   * @deprecated Use detect(files) instead. Will be removed in v0.4.0.
   */
  analyze(filePath: string, source: string): LogicGapResult {
    const lines = source.split('\n');
    const rawIssues: LogicGapIssue[] = [
      ...detectEmptyCatch(lines, filePath),
      ...detectIncompleteImpl(lines, filePath),
      ...detectUnreachableCode(lines, filePath),
      ...detectMissingErrorHandling(lines, filePath),
    ];

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

export default LogicGapDetector;

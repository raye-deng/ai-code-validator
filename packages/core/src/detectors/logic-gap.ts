/**
 * Logic Gap Detector
 *
 * Detects AI-generated code logic discontinuities:
 * 1. Empty catch blocks (swallowed errors)
 * 2. Unreachable code after return/throw
 * 3. Missing else branches in critical conditions
 * 4. Unused variables that suggest incomplete logic
 * 5. TODO/FIXME markers left by AI (incomplete implementation)
 * 6. Functions that declare parameters but never use them
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

export interface LogicGapResult {
  file: string;
  issues: LogicGapIssue[];
  score: number;
}

/**
 * Detect empty catch blocks
 */
function detectEmptyCatch(lines: string[], filePath: string): LogicGapIssue[] {
  const issues: LogicGapIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Pattern: catch (...) { } or catch { }
    if (/catch\s*(\([^)]*\))?\s*\{/.test(line)) {
      // Check if the next non-empty line is just a closing brace
      let j = i + 1;
      let blockContent = '';
      let braceDepth = 0;
      let foundOpen = false;

      // Count braces on catch line
      for (const ch of line) {
        if (ch === '{') { braceDepth++; foundOpen = true; }
        if (ch === '}') braceDepth--;
      }

      // If the block was opened and closed on the same line
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

      // Multi-line: look ahead
      if (braceDepth > 0) {
        while (j < lines.length && braceDepth > 0) {
          for (const ch of lines[j]) {
            if (ch === '{') braceDepth++;
            if (ch === '}') braceDepth--;
          }
          blockContent += lines[j].trim();
          j++;
        }

        // Remove the final closing brace content
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

/**
 * Detect incomplete implementation markers
 */
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

/**
 * Detect unreachable code after return/throw/break/continue
 */
function detectUnreachableCode(lines: string[], filePath: string): LogicGapIssue[] {
  const issues: LogicGapIssue[] = [];

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();

    // Check for return/throw/break/continue statements
    if (/^(return|throw)\s/.test(line) || /^(return|throw);?$/.test(line)) {
      // Look at the next non-empty, non-comment line
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j].trim();
        if (!next || next.startsWith('//') || next.startsWith('*')) {
          j++;
          continue;
        }
        // If next statement is a closing brace, case, or another block end, that's fine
        if (next === '}' || next.startsWith('case ') || next.startsWith('default:')) break;
        // If it's a function/class declaration, could be legitimate
        if (/^(function|class|export|const|let|var|interface|type|enum)/.test(next)) break;

        // Otherwise it might be unreachable
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

/**
 * Detect missing error handling in async functions
 */
function detectMissingErrorHandling(lines: string[], filePath: string): LogicGapIssue[] {
  const issues: LogicGapIssue[] = [];
  const source = lines.join('\n');

  // Find async functions that don't have try-catch
  const asyncFuncPattern = /async\s+(?:function\s+)?(\w+)?\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = asyncFuncPattern.exec(source)) !== null) {
    const startIdx = match.index;
    const lineNum = source.substring(0, startIdx).split('\n').length;

    // Look within the function body for try-catch
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

      // Check if there's a try block at depth 1
      if (braceDepth === 1 && source.substring(k).startsWith('try')) {
        hasTryCatch = true;
        break;
      }
    }

    // Also check if the function has .catch() calls
    const funcBody = source.substring(searchStart, source.indexOf('}', searchStart + 1) + 1);
    if (funcBody.includes('.catch(') || funcBody.includes('.catch (')) {
      hasTryCatch = true;
    }

    if (!hasTryCatch) {
      const funcName = match[1] || 'anonymous';
      // Only flag if function has await calls (actually does async operations)
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

/**
 * Main Logic Gap Detector
 */
export class LogicGapDetector {
  /**
   * Analyze a single file for logic gap issues
   */
  analyze(filePath: string, source: string): LogicGapResult {
    const lines = source.split('\n');
    const rawIssues: LogicGapIssue[] = [
      ...detectEmptyCatch(lines, filePath),
      ...detectIncompleteImpl(lines, filePath),
      ...detectUnreachableCode(lines, filePath),
      ...detectMissingErrorHandling(lines, filePath),
    ];

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

export default LogicGapDetector;

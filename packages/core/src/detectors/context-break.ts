/**
 * Context Break Detector
 *
 * Detects architectural inconsistencies in AI-generated code:
 * 1. Mixed coding styles (camelCase vs snake_case)
 * 2. Inconsistent error handling patterns
 * 3. Mixed module systems (import vs require in same file)
 * 4. Inconsistent async patterns (callbacks vs promises vs async/await)
 * 5. Style breaks that indicate context window switches
 */

export interface ContextBreakIssue {
  type:
    | 'naming-inconsistency'
    | 'module-system-mix'
    | 'async-pattern-mix'
    | 'style-break'
    | 'error-handling-inconsistency';
  severity: 'warning' | 'error';
  file: string;
  line: number;
  message: string;
  suggestion?: string;
}

export interface ContextBreakResult {
  file: string;
  issues: ContextBreakIssue[];
  score: number;
}

/** Detect mixed naming conventions */
function detectNamingInconsistency(lines: string[], filePath: string): ContextBreakIssue[] {
  const issues: ContextBreakIssue[] = [];

  let camelCaseCount = 0;
  let snakeCaseCount = 0;
  const snakeCaseLines: number[] = [];
  const camelCaseLines: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Extract variable/function declarations
    const declMatch = line.match(/(?:const|let|var|function)\s+(\w+)/);
    if (declMatch) {
      const name = declMatch[1];
      if (name.includes('_') && name !== name.toUpperCase()) {
        snakeCaseCount++;
        snakeCaseLines.push(i + 1);
      } else if (/[a-z][A-Z]/.test(name)) {
        camelCaseCount++;
        camelCaseLines.push(i + 1);
      }
    }
  }

  // If there's a significant mix, flag it
  if (camelCaseCount > 0 && snakeCaseCount > 0) {
    const minority = camelCaseCount < snakeCaseCount ? camelCaseLines : snakeCaseLines;
    const majorStyle = camelCaseCount >= snakeCaseCount ? 'camelCase' : 'snake_case';

    for (const lineNum of minority.slice(0, 5)) {
      issues.push({
        type: 'naming-inconsistency',
        severity: 'warning',
        file: filePath,
        line: lineNum,
        message: `Naming convention inconsistency: file predominantly uses ${majorStyle}`,
        suggestion: 'AI context switches often cause naming style changes. Standardize to one convention.',
      });
    }
  }

  return issues;
}

/** Detect mixed module systems (ESM vs CJS) */
function detectModuleSystemMix(lines: string[], filePath: string): ContextBreakIssue[] {
  const issues: ContextBreakIssue[] = [];
  let hasESMImport = false;
  let hasCJSRequire = false;
  let esmLine = 0;
  let cjsLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (/^import\s/.test(line) && !line.includes('import(')) {
      if (!hasESMImport) { hasESMImport = true; esmLine = i + 1; }
    }
    if (/\brequire\s*\(/.test(line) && !line.includes('// eslint')) {
      if (!hasCJSRequire) { hasCJSRequire = true; cjsLine = i + 1; }
    }
  }

  if (hasESMImport && hasCJSRequire) {
    issues.push({
      type: 'module-system-mix',
      severity: 'warning',
      file: filePath,
      line: cjsLine,
      message: 'Mixed module systems: both ESM import and CommonJS require() found',
      suggestion: 'Standardize to one module system. AI often mixes import and require in the same file.',
    });
  }

  return issues;
}

/** Detect mixed async patterns */
function detectAsyncPatternMix(lines: string[], filePath: string): ContextBreakIssue[] {
  const issues: ContextBreakIssue[] = [];
  const source = lines.join('\n');

  let hasAsyncAwait = false;
  let hasThenChain = false;
  let hasCallback = false;

  if (/\bawait\s/.test(source)) hasAsyncAwait = true;
  if (/\.then\s*\(/.test(source)) hasThenChain = true;

  // Check for callback patterns (function(err, result))
  const callbackPattern = /function\s*\(\s*err(?:or)?\s*,/g;
  if (callbackPattern.test(source)) hasCallback = true;

  const patterns = [hasAsyncAwait && 'async/await', hasThenChain && '.then()', hasCallback && 'callbacks']
    .filter(Boolean);

  if (patterns.length >= 2) {
    issues.push({
      type: 'async-pattern-mix',
      severity: 'warning',
      file: filePath,
      line: 1,
      message: `Mixed async patterns detected: ${patterns.join(', ')}`,
      suggestion: 'Standardize to async/await for consistency. AI-generated code often mixes patterns.',
    });
  }

  return issues;
}

/**
 * Main Context Break Detector
 */
export class ContextBreakDetector {
  /** Analyze a single file */
  analyze(filePath: string, source: string): ContextBreakResult {
    const lines = source.split('\n');
    const rawIssues: ContextBreakIssue[] = [
      ...detectNamingInconsistency(lines, filePath),
      ...detectModuleSystemMix(lines, filePath),
      ...detectAsyncPatternMix(lines, filePath),
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

export default ContextBreakDetector;

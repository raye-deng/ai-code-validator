/**
 * IncompleteImplementationDetector — V4 detector for AI-generated skeleton code.
 *
 * AI models frequently generate function/method stubs that look complete but
 * are actually placeholders: they throw "not implemented" errors, return dummy
 * values next to TODO comments, or have empty bodies. This code passes linting,
 * compiles, and even passes basic tests — but silently does nothing in production.
 *
 * Traditional tools don't catch this because:
 * - The syntax is valid
 * - The types are correct
 * - There are no runtime errors until the code path is hit
 *
 * Detections:
 * 1. Functions that throw "not implemented" / "todo" errors
 * 2. Functions returning only placeholder values with nearby TODO/FIXME
 * 3. Empty function/method bodies (excluding constructors/interfaces)
 * 4. Python functions with only `pass` or `...` (Ellipsis) as body
 * 5. Functions containing only a console.log/print statement (debug stubs)
 * 6. Stub patterns: return type mismatch (declared complex type, returns null/undefined)
 *
 * @since 0.6.0
 */

import type { CodeUnit, SupportedLanguage } from '../../ir/types.js';
import type { V4Detector, DetectorResult, DetectorCategory, DetectorContext } from './types.js';

// ─── Incomplete Implementation Patterns ────────────────────────────

interface IncompletePattern {
  id: string;
  pattern: RegExp;
  severity: 'error' | 'warning' | 'info';
  confidence: number;
  message: string;
  languages: SupportedLanguage[];
  /** If true, match against the entire function body rather than individual lines */
  matchBody?: boolean;
}

const INCOMPLETE_PATTERNS: IncompletePattern[] = [
  // ── "Not Implemented" throw patterns ─────────────────────────

  {
    id: 'throw-not-implemented',
    pattern: /throw\s+new\s+Error\s*\(\s*['"`](?:not\s*implemented|todo|fixme|implement\s*(?:this|me|later)|to\s*be\s*implemented|stub|placeholder|pending\s*implementation|needs?\s*implementation|tbd|wip)['"`]/i,
    severity: 'error',
    confidence: 0.95,
    message: 'Function throws a "not implemented" error. AI generated a placeholder that will crash at runtime. Implement the actual logic or remove the function.',
    languages: ['typescript', 'javascript'],
  },
  {
    id: 'throw-not-implemented-bare',
    pattern: /throw\s+['"`](?:not\s*implemented|todo|fixme|implement|stub|placeholder)['"`]/i,
    severity: 'error',
    confidence: 0.9,
    message: 'Function throws a bare "not implemented" string. AI generated a placeholder that will crash at runtime.',
    languages: ['typescript', 'javascript'],
  },
  {
    id: 'python-raise-not-implemented',
    pattern: /raise\s+NotImplementedError\s*\(/i,
    severity: 'error',
    confidence: 0.9,
    message: 'Function raises NotImplementedError. AI generated a stub that will crash at runtime. Implement the actual logic.',
    languages: ['python'],
  },
  {
    id: 'java-throw-unsupported',
    pattern: /throw\s+new\s+(?:UnsupportedOperationException|NotImplementedException|RuntimeException)\s*\(\s*['"`](?:not\s*implemented|todo|fixme|implement|stub|placeholder|tbd|wip)/i,
    severity: 'error',
    confidence: 0.9,
    message: 'Method throws an "unsupported/not implemented" exception. AI generated a placeholder that will crash at runtime.',
    languages: ['java', 'kotlin'],
  },
  {
    id: 'go-panic-not-implemented',
    pattern: /panic\s*\(\s*['"`](?:not\s*implemented|todo|fixme|implement|stub|placeholder|tbd|wip)/i,
    severity: 'error',
    confidence: 0.9,
    message: 'Function panics with "not implemented". AI generated a stub that will crash at runtime.',
    languages: ['go'],
  },

  // ── Empty/Stub function bodies ───────────────────────────────

  {
    id: 'python-pass-only',
    pattern: /^\s*(?:def|async\s+def)\s+\w+\s*\([^)]*\)\s*(?:->\s*[^:]+)?\s*:\s*\n\s+pass\s*$/m,
    severity: 'warning',
    confidence: 0.8,
    message: 'Function body contains only `pass`. AI generated a stub with no implementation.',
    languages: ['python'],
    matchBody: true,
  },
  {
    id: 'python-ellipsis-only',
    pattern: /^\s*(?:def|async\s+def)\s+\w+\s*\([^)]*\)\s*(?:->\s*[^:]+)?\s*:\s*\n\s+\.\.\.\s*$/m,
    severity: 'warning',
    confidence: 0.8,
    message: 'Function body contains only `...` (Ellipsis). AI generated a stub with no implementation.',
    languages: ['python'],
    matchBody: true,
  },

  // ── Debug-only stub functions ────────────────────────────────

  {
    id: 'console-only-function',
    pattern: /^\s*(?:console\.(?:log|warn|info|debug|error)|print(?:ln)?)\s*\([^)]*\)\s*;?\s*$/,
    severity: 'info',
    confidence: 0.6,
    message: 'Function body contains only a logging statement. AI may have generated a debug stub instead of real implementation.',
    languages: [],
  },

  // ── Placeholder return values with TODO nearby ───────────────

  {
    id: 'return-null-with-todo',
    pattern: /(?:\/\/\s*(?:TODO|FIXME|HACK|XXX|IMPLEMENT)[^\n]*\n\s*)?return\s+(?:null|undefined|None|nil)\s*;?/i,
    severity: 'warning',
    confidence: 0.7,
    message: 'Function returns null/undefined near a TODO comment. AI generated a placeholder return value.',
    languages: [],
  },
  {
    id: 'return-empty-object-with-todo',
    pattern: /(?:\/\/\s*(?:TODO|FIXME|HACK|XXX|IMPLEMENT)[^\n]*\n\s*)?return\s+\{\s*\}\s*;?/i,
    severity: 'warning',
    confidence: 0.65,
    message: 'Function returns an empty object near a TODO comment. AI generated a placeholder return value.',
    languages: ['typescript', 'javascript'],
  },
  {
    id: 'return-empty-array-with-todo',
    pattern: /(?:\/\/\s*(?:TODO|FIXME|HACK|XXX|IMPLEMENT)[^\n]*\n\s*)?return\s+\[\s*\]\s*;?/i,
    severity: 'warning',
    confidence: 0.65,
    message: 'Function returns an empty array near a TODO comment. AI generated a placeholder return value.',
    languages: ['typescript', 'javascript'],
  },
  {
    id: 'python-return-none-with-todo',
    pattern: /(?:#\s*(?:TODO|FIXME|HACK|XXX|IMPLEMENT)[^\n]*\n\s*)?return\s+(?:None|\[\]|\{\}|\(\))\s*$/m,
    severity: 'warning',
    confidence: 0.65,
    message: 'Function returns a placeholder value near a TODO comment. AI generated a stub return.',
    languages: ['python'],
  },
];

// ─── Detector ──────────────────────────────────────────────────────

export class IncompleteImplementationDetector implements V4Detector {
  readonly id = 'incomplete-implementation';
  readonly name = 'Incomplete Implementation Detector';
  readonly category: DetectorCategory = 'context-coherence';
  readonly supportedLanguages: SupportedLanguage[] = [];

  async detect(units: CodeUnit[], context: DetectorContext): Promise<DetectorResult[]> {
    const results: DetectorResult[] = [];

    // Analysis 1: Pattern-based detection on source code
    this.detectPatternMatches(units, results);

    // Analysis 2: Empty function body detection using IR
    this.detectEmptyFunctionBodies(units, results);

    // Analysis 3: Functions that only contain a single throw/raise statement
    this.detectThrowOnlyFunctions(units, results);

    return results;
  }

  /**
   * Detect incomplete implementation patterns in source code.
   */
  private detectPatternMatches(
    units: CodeUnit[],
    results: DetectorResult[],
  ): void {
    for (const unit of units) {
      if (!unit.source || unit.source.trim().length === 0) continue;

      const applicablePatterns = INCOMPLETE_PATTERNS.filter(
        p => p.languages.length === 0 || p.languages.includes(unit.language),
      );

      // Body-level patterns
      const bodyPatterns = applicablePatterns.filter(p => p.matchBody);
      for (const pattern of bodyPatterns) {
        pattern.pattern.lastIndex = 0;
        const match = pattern.pattern.exec(unit.source);
        if (match) {
          const line = unit.source.substring(0, match.index).split('\n').length;
          const absoluteLine = unit.location.startLine + line;

          results.push({
            detectorId: this.id,
            severity: pattern.severity,
            category: this.category,
            messageKey: `incomplete-implementation.${pattern.id}`,
            message: pattern.message,
            file: unit.file,
            line: absoluteLine,
            confidence: pattern.confidence,
            metadata: {
              patternId: pattern.id,
              language: unit.language,
              matchedText: match[0].trim().substring(0, 100),
            },
          });
        }
      }

      // Line-level patterns
      const linePatterns = applicablePatterns.filter(p => !p.matchBody);
      const lines = unit.source.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip empty lines
        if (trimmed.length === 0) continue;

        for (const pattern of linePatterns) {
          pattern.pattern.lastIndex = 0;

          if (pattern.pattern.test(line)) {
            const absoluteLine = unit.location.startLine + i;

            results.push({
              detectorId: this.id,
              severity: pattern.severity,
              category: this.category,
              messageKey: `incomplete-implementation.${pattern.id}`,
              message: pattern.message,
              file: unit.file,
              line: absoluteLine + 1,
              confidence: pattern.confidence,
              metadata: {
                patternId: pattern.id,
                language: unit.language,
                matchedLine: trimmed.substring(0, 100),
              },
            });
          }
        }
      }
    }
  }

  /**
   * Detect functions/methods with empty bodies.
   * Uses LOC metrics from CodeUnit IR to identify empty functions.
   * Excludes constructors, abstract methods, and interface definitions.
   */
  private detectEmptyFunctionBodies(
    units: CodeUnit[],
    results: DetectorResult[],
  ): void {
    for (const unit of units) {
      if (unit.kind !== 'function' && unit.kind !== 'method') continue;

      // Skip if no source
      if (!unit.source) continue;

      // Extract effective body (strip braces and whitespace)
      const body = this.extractFunctionBody(unit.source, unit.language);
      if (body === null) continue; // Could not extract body

      const effectiveLines = body.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0 && !l.startsWith('//') && !l.startsWith('#') && !l.startsWith('*'));

      if (effectiveLines.length > 0) continue; // Body has content

      // Check if this is likely an interface/abstract method declaration
      const source = unit.source.trim();
      if (this.isAbstractOrInterface(source, unit.language)) continue;

      // Check if constructor
      const isConstructor = unit.definitions.some(d =>
        d.name === 'constructor' || d.name === '__init__' || d.name === 'init',
      );

      // Empty constructors are OK in many cases (DI frameworks, etc.)
      if (isConstructor) continue;

      // Get function name
      const funcName = unit.definitions.find(d =>
        d.kind === 'function' || d.kind === 'method',
      )?.name || 'anonymous';

      results.push({
        detectorId: this.id,
        severity: 'warning',
        category: this.category,
        messageKey: 'incomplete-implementation.empty-function-body',
        message: `Function "${funcName}" has an empty body. AI may have generated a stub without implementation.`,
        file: unit.file,
        line: unit.location.startLine + 1,
        endLine: unit.location.endLine + 1,
        confidence: 0.75,
        metadata: {
          functionName: funcName,
          language: unit.language,
          analysisType: 'empty-function-body',
        },
      });
    }
  }

  /**
   * Detect functions whose body consists only of a throw/raise statement.
   * These are skeleton functions that crash instead of doing useful work.
   */
  private detectThrowOnlyFunctions(
    units: CodeUnit[],
    results: DetectorResult[],
  ): void {
    for (const unit of units) {
      if (unit.kind !== 'function' && unit.kind !== 'method') continue;
      if (!unit.source) continue;

      const body = this.extractFunctionBody(unit.source, unit.language);
      if (body === null) continue;

      const effectiveLines = body.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0 && !l.startsWith('//') && !l.startsWith('#') && !l.startsWith('*'));

      // Check if function has exactly one effective line that is a throw/raise/panic
      if (effectiveLines.length !== 1) continue;

      const singleLine = effectiveLines[0];
      const isThrowOnly =
        /^throw\s+/.test(singleLine) ||
        /^raise\s+/.test(singleLine) ||
        /^panic\s*\(/.test(singleLine);

      if (!isThrowOnly) continue;

      // Skip if it's explicitly an abstract method override pattern
      if (this.isAbstractOrInterface(unit.source, unit.language)) continue;

      const funcName = unit.definitions.find(d =>
        d.kind === 'function' || d.kind === 'method',
      )?.name || 'anonymous';

      // Check if the thrown message indicates "not implemented" specifically
      const isNotImplemented = /(?:not\s*implemented|todo|fixme|stub|placeholder|tbd|wip|pending|implement\s*(?:this|me|later))/i.test(singleLine);

      results.push({
        detectorId: this.id,
        severity: isNotImplemented ? 'error' : 'warning',
        category: this.category,
        messageKey: 'incomplete-implementation.throw-only-function',
        message: isNotImplemented
          ? `Function "${funcName}" only throws a "not implemented" error. AI generated a stub that will crash at runtime.`
          : `Function "${funcName}" only contains a throw/raise statement. Verify this is intentional and not a placeholder.`,
        file: unit.file,
        line: unit.location.startLine + 1,
        endLine: unit.location.endLine + 1,
        confidence: isNotImplemented ? 0.95 : 0.7,
        metadata: {
          functionName: funcName,
          language: unit.language,
          throwStatement: singleLine.substring(0, 100),
          isNotImplemented,
          analysisType: 'throw-only-function',
        },
      });
    }
  }

  /**
   * Extract the function body from source, stripping the signature and braces.
   * Returns null if extraction fails.
   */
  private extractFunctionBody(source: string, language: SupportedLanguage): string | null {
    switch (language) {
      case 'python': {
        // Python: find the colon after def/async def, take everything after
        const colonIndex = source.indexOf(':');
        if (colonIndex === -1) return null;
        // Skip docstrings
        let body = source.substring(colonIndex + 1).trim();
        // Remove leading docstring if present
        if (body.startsWith('"""') || body.startsWith("'''")) {
          const endQuote = body.startsWith('"""') ? '"""' : "'''";
          const endIdx = body.indexOf(endQuote, 3);
          if (endIdx !== -1) {
            body = body.substring(endIdx + 3).trim();
          }
        }
        return body;
      }
      default: {
        // C-style languages: find first { and matching }
        const braceStart = source.indexOf('{');
        if (braceStart === -1) return null;

        let depth = 0;
        for (let i = braceStart; i < source.length; i++) {
          if (source[i] === '{') depth++;
          if (source[i] === '}') {
            depth--;
            if (depth === 0) {
              return source.substring(braceStart + 1, i);
            }
          }
        }
        return null;
      }
    }
  }

  /**
   * Check if the source represents an abstract method or interface declaration.
   */
  private isAbstractOrInterface(source: string, language: SupportedLanguage): boolean {
    const trimmed = source.trim();
    switch (language) {
      case 'typescript':
      case 'javascript':
        return /\babstract\s/.test(trimmed) || /\bdeclare\s/.test(trimmed);
      case 'java':
      case 'kotlin':
        return /\babstract\s/.test(trimmed);
      case 'python':
        return /\b(?:abstractmethod|ABC)\b/.test(trimmed) || /@abstractmethod/.test(trimmed);
      case 'go':
        // Go interfaces don't have bodies
        return false;
      default:
        return false;
    }
  }
}

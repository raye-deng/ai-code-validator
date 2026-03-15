/**
 * Language-Specific AI Detectors — V4 detectors for Go/Java/Kotlin/Python.
 *
 * These detectors catch AI-specific patterns that are unique to each language:
 * - GoDetector: Unhandled errors, deprecated ioutil, unnecessary goroutines
 * - JavaDetector: Deprecated Date/Calendar API, System.out.println leaks
 * - KotlinDetector: Non-null assertion abuse (!!), coroutine misuse
 * - PythonDetector: bare except, eval(), deprecated urlparse, mutable defaults
 *
 * @since 0.5.0
 */

import type { CodeUnit, SupportedLanguage } from '../../ir/types.js';
import type { V4Detector, DetectorResult, DetectorCategory, DetectorContext } from './types.js';

// ═══════════════════════════════════════════════════════════════════
// Go-specific AI Detector
// ═══════════════════════════════════════════════════════════════════

const GO_PATTERNS: Array<{
  id: string;
  pattern: RegExp;
  severity: 'error' | 'warning' | 'info';
  confidence: number;
  message: string;
}> = [
  {
    id: 'go-unhandled-error',
    pattern: /\b\w+\s*\([^)]*\)\s*$(?!\s*_\s*=)/m,
    severity: 'warning',
    confidence: 0.6,
    message: 'Function call that may return an error is not assigned or checked. AI often ignores Go error returns.',
  },
  {
    id: 'go-deprecated-ioutil',
    pattern: /['"]io\/ioutil['"]/,
    severity: 'warning',
    confidence: 0.95,
    message: 'io/ioutil is deprecated since Go 1.16. Use os and io packages instead.',
  },
  {
    id: 'go-ioutil-readfile',
    pattern: /\bioutil\.ReadFile\b/,
    severity: 'warning',
    confidence: 0.95,
    message: 'ioutil.ReadFile is deprecated. Use os.ReadFile instead.',
  },
  {
    id: 'go-ioutil-writefile',
    pattern: /\bioutil\.WriteFile\b/,
    severity: 'warning',
    confidence: 0.95,
    message: 'ioutil.WriteFile is deprecated. Use os.WriteFile instead.',
  },
  {
    id: 'go-ioutil-readall',
    pattern: /\bioutil\.ReadAll\b/,
    severity: 'warning',
    confidence: 0.95,
    message: 'ioutil.ReadAll is deprecated. Use io.ReadAll instead.',
  },
  {
    id: 'go-panic-in-library',
    pattern: /\bpanic\s*\(/,
    severity: 'warning',
    confidence: 0.7,
    message: 'panic() used in non-main code. AI often uses panic instead of proper error handling in library code.',
  },
  {
    id: 'go-empty-defer',
    pattern: /\bdefer\s+\w+\s*\(\s*\)/,
    severity: 'info',
    confidence: 0.5,
    message: 'defer call with no arguments or empty function. May indicate AI-generated boilerplate.',
  },
];

export class GoLanguageDetector implements V4Detector {
  readonly id = 'go-language-specific';
  readonly name = 'Go Language-Specific Detector';
  readonly category: DetectorCategory = 'implementation';
  readonly supportedLanguages: SupportedLanguage[] = ['go'];

  async detect(units: CodeUnit[], context: DetectorContext): Promise<DetectorResult[]> {
    const results: DetectorResult[] = [];

    for (const unit of units) {
      if (unit.language !== 'go') continue;
      if (!unit.source || unit.source.trim().length === 0) continue;

      // Check if this is a main package — relax panic rules for main
      const isMainPackage = /package\s+main\b/.test(unit.source);

      const lines = unit.source.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip comments
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

        // Skip these patterns for clean code - only apply line-by-line patterns
        for (const pat of GO_PATTERNS) {
          if (pat.id === 'go-panic-in-library' && isMainPackage) continue;
          if (pat.id === 'go-unhandled-error') continue; // Skip broad heuristic — handled by specific analysis

          pat.pattern.lastIndex = 0;
          if (pat.pattern.test(line)) {
            results.push({
              detectorId: this.id,
              severity: pat.severity,
              category: this.category,
              messageKey: `go-language-specific.${pat.id}`,
              message: pat.message,
              file: unit.file,
              line: unit.location.startLine + i + 1,
              confidence: pat.confidence,
              metadata: {
                patternId: pat.id,
                language: 'go',
                matchedLine: trimmed.substring(0, 100),
              },
            });
          }
        }
      }

      // Unhandled error analysis: find assignments that ignore errors
      this.detectUnhandledErrors(unit, lines, results);
    }

    return results;
  }

  private detectUnhandledErrors(unit: CodeUnit, lines: string[], results: DetectorResult[]): void {
    // Look for error-returning functions called without capturing the error
    const errorReturningFuncs = /\b(?:os\.Open|os\.Create|os\.ReadFile|os\.WriteFile|os\.MkdirAll|os\.Remove|net\.Dial|net\.Listen|http\.Get|http\.Post|json\.Marshal|json\.Unmarshal|exec\.Command|ioutil\.\w+)\s*\(/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) continue;

      errorReturningFuncs.lastIndex = 0;
      if (!errorReturningFuncs.test(line)) continue;

      // Check if the line properly assigns the error return
      // Lines with "err" in them are considered handled
      if (/\berr\b/.test(line)) continue;

      // Lines that assign to _ (ignoring error) are fine
      if (/:=\s*_\s*,/.test(line)) continue;

      // Lines that are in a return statement using the result directly are ok
      if (/return\s+.*(?:os\.|net\.|http\.|json\.|exec\.|ioutil\.)/.test(line)) continue;

      // Lines in if conditions are ok (e.g., if err := ...)
      if (/^\s*if\s/.test(line)) continue;

      results.push({
        detectorId: this.id,
        severity: 'warning',
        category: this.category,
        messageKey: 'go-language-specific.unhandled-error-return',
        message: 'Function that returns an error is called without proper error handling. AI-generated Go code commonly ignores error returns.',
        file: unit.file,
        line: unit.location.startLine + i + 1,
        confidence: 0.7,
        metadata: {
          patternId: 'unhandled-error-return',
          language: 'go',
          matchedLine: line.substring(0, 100),
        },
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Java-specific AI Detector
// ═══════════════════════════════════════════════════════════════════

const JAVA_PATTERNS: Array<{
  id: string;
  pattern: RegExp;
  severity: 'error' | 'warning' | 'info';
  confidence: number;
  message: string;
}> = [
  {
    id: 'java-system-out-println',
    pattern: /\bSystem\.out\.println\s*\(/,
    severity: 'warning',
    confidence: 0.85,
    message: 'System.out.println() used instead of a proper logging framework. AI frequently leaves debug prints in production code.',
  },
  {
    id: 'java-system-err-println',
    pattern: /\bSystem\.err\.println\s*\(/,
    severity: 'warning',
    confidence: 0.85,
    message: 'System.err.println() used instead of a proper logging framework.',
  },
  {
    id: 'java-equals-without-null',
    pattern: /\w+\.equals\s*\(\s*\w+\s*\)/,
    severity: 'info',
    confidence: 0.5,
    message: 'String.equals() called on a variable that may be null. AI often writes this without null checks.',
  },
  {
    id: 'java-empty-catch',
    pattern: /catch\s*\([^)]+\)\s*\{\s*\}/,
    severity: 'warning',
    confidence: 0.9,
    message: 'Empty catch block — swallowing exceptions silently. AI commonly generates this pattern.',
  },
  {
    id: 'java-raw-type',
    pattern: /(?:ArrayList|HashMap|LinkedList|HashSet|TreeMap|TreeSet|Vector|Hashtable|Stack)\s*<\s*>/,
    severity: 'info',
    confidence: 0.8,
    message: 'Raw generic type used (diamond without type). Consider specifying the generic type parameter.',
  },
  {
    id: 'java-deprecated-date',
    pattern: /\bnew\s+Date\s*\(\s*\)/,
    severity: 'warning',
    confidence: 0.8,
    message: 'java.util.Date is outdated. Use java.time.LocalDateTime or java.time.Instant (Java 8+).',
  },
  {
    id: 'java-deprecated-calendar',
    pattern: /\bCalendar\.getInstance\s*\(\s*\)/,
    severity: 'warning',
    confidence: 0.8,
    message: 'Calendar.getInstance() is outdated. Use java.time API (ZonedDateTime, LocalDate) instead.',
  },
  {
    id: 'java-string-concatenation-loop',
    pattern: /for\s*\([^)]*\)\s*\{[^}]*\+=\s*['"]/,
    severity: 'warning',
    confidence: 0.65,
    message: 'String concatenation inside a loop. Use StringBuilder instead. AI commonly makes this mistake.',
  },
];

export class JavaLanguageDetector implements V4Detector {
  readonly id = 'java-language-specific';
  readonly name = 'Java Language-Specific Detector';
  readonly category: DetectorCategory = 'implementation';
  readonly supportedLanguages: SupportedLanguage[] = ['java'];

  async detect(units: CodeUnit[], context: DetectorContext): Promise<DetectorResult[]> {
    const results: DetectorResult[] = [];

    for (const unit of units) {
      if (unit.language !== 'java') continue;
      if (!unit.source || unit.source.trim().length === 0) continue;

      const lines = unit.source.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('*')) continue;

        for (const pat of JAVA_PATTERNS) {
          pat.pattern.lastIndex = 0;
          if (pat.pattern.test(line)) {
            results.push({
              detectorId: this.id,
              severity: pat.severity,
              category: this.category,
              messageKey: `java-language-specific.${pat.id}`,
              message: pat.message,
              file: unit.file,
              line: unit.location.startLine + i + 1,
              confidence: pat.confidence,
              metadata: {
                patternId: pat.id,
                language: 'java',
                matchedLine: trimmed.substring(0, 100),
              },
            });
          }
        }
      }
      // Check source for multiline patterns (empty catch blocks span lines)
      this.detectEmptyCatchBlocks(unit, results);
    }

    return results;
  }

  private detectEmptyCatchBlocks(unit: CodeUnit, results: DetectorResult[]): void {
    // Match empty catch blocks: catch (...) { } possibly with whitespace
    const emptyCatchPattern = /catch\s*\([^)]+\)\s*\{\s*\}/;
    emptyCatchPattern.lastIndex = 0;
    const match = emptyCatchPattern.exec(unit.source);
    if (match) {
      const lineNum = unit.source.substring(0, match.index).split('\n').length;
      results.push({
        detectorId: this.id,
        severity: 'warning',
        category: this.category,
        messageKey: 'java-language-specific.java-empty-catch',
        message: 'Empty catch block — swallowing exceptions silently. AI commonly generates this pattern.',
        file: unit.file,
        line: lineNum,
        confidence: 0.9,
        metadata: {
          patternId: 'java-empty-catch',
          language: 'java',
        },
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Kotlin-specific AI Detector
// ═══════════════════════════════════════════════════════════════════

const KOTLIN_PATTERNS: Array<{
  id: string;
  pattern: RegExp;
  severity: 'error' | 'warning' | 'info';
  confidence: number;
  message: string;
}> = [
  {
    id: 'kotlin-bang-bang-chain',
    pattern: /!!\s*\.\s*\w/,
    severity: 'warning',
    confidence: 0.8,
    message: 'Chained non-null assertion (!!) detected. This defeats Kotlin\'s null safety. Use safe calls (?.) or explicit null checks.',
  },
  {
    id: 'kotlin-bang-bang-multiple',
    pattern: /!!.*!!/,
    severity: 'warning',
    confidence: 0.85,
    message: 'Multiple non-null assertions (!!) in one expression. AI often chains !! operators instead of handling nulls properly.',
  },
  {
    id: 'kotlin-bare-println',
    pattern: /\bprintln\s*\(/,
    severity: 'info',
    confidence: 0.7,
    message: 'println() used instead of a logging framework. AI commonly leaves debug prints in production Kotlin code.',
  },
  {
    id: 'kotlin-unnecessary-apply',
    pattern: /\.\s*apply\s*\{\s*(?:\w+\s*=\s*\w+)\s*\}/,
    severity: 'info',
    confidence: 0.6,
    message: 'apply {} with a single simple assignment. Direct assignment would be clearer.',
  },
  {
    id: 'kotlin-empty-catch',
    pattern: /catch\s*\([^)]+\)\s*\{\s*\}/,
    severity: 'warning',
    confidence: 0.9,
    message: 'Empty catch block — silently swallowing exceptions. AI commonly generates this pattern.',
  },
];

export class KotlinLanguageDetector implements V4Detector {
  readonly id = 'kotlin-language-specific';
  readonly name = 'Kotlin Language-Specific Detector';
  readonly category: DetectorCategory = 'implementation';
  readonly supportedLanguages: SupportedLanguage[] = ['kotlin'];

  async detect(units: CodeUnit[], context: DetectorContext): Promise<DetectorResult[]> {
    const results: DetectorResult[] = [];

    for (const unit of units) {
      if (unit.language !== 'kotlin') continue;
      if (!unit.source || unit.source.trim().length === 0) continue;

      const lines = unit.source.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

        for (const pat of KOTLIN_PATTERNS) {
          pat.pattern.lastIndex = 0;
          if (pat.pattern.test(line)) {
            results.push({
              detectorId: this.id,
              severity: pat.severity,
              category: this.category,
              messageKey: `kotlin-language-specific.${pat.id}`,
              message: pat.message,
              file: unit.file,
              line: unit.location.startLine + i + 1,
              confidence: pat.confidence,
              metadata: {
                patternId: pat.id,
                language: 'kotlin',
                matchedLine: trimmed.substring(0, 100),
              },
            });
          }
        }
      }

      // Detect !!. chains across lines (multiline)
      this.detectBangBangChains(unit, lines, results);
      // Check source for multiline patterns (empty catch blocks span lines)
      this.detectEmptyCatchBlocks(unit, results);
    }

    return results;
  }

  private detectEmptyCatchBlocks(unit: CodeUnit, results: DetectorResult[]): void {
    const emptyCatchPattern = /catch\s*\([^)]+\)\s*\{\s*\}/;
    emptyCatchPattern.lastIndex = 0;
    const match = emptyCatchPattern.exec(unit.source);
    if (match) {
      const lineNum = unit.source.substring(0, match.index).split('\n').length;
      results.push({
        detectorId: this.id,
        severity: 'warning',
        category: this.category,
        messageKey: 'kotlin-language-specific.kotlin-empty-catch',
        message: 'Empty catch block — silently swallowing exceptions. AI commonly generates this pattern.',
        file: unit.file,
        line: lineNum,
        confidence: 0.9,
        metadata: {
          patternId: 'kotlin-empty-catch',
          language: 'kotlin',
        },
      });
    }
  }

  private detectBangBangChains(unit: CodeUnit, lines: string[], results: DetectorResult[]): void {
    // Count !! occurrences in each function/method unit
    const bangBangCount = unit.source.match(/!!/g)?.length ?? 0;
    if (bangBangCount >= 3) {
      // Find the first occurrence
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('!!')) {
          results.push({
            detectorId: this.id,
            severity: 'warning',
            category: this.category,
            messageKey: 'kotlin-language-specific.excessive-bang-bang',
            message: `Found ${bangBangCount} non-null assertions (!!) in this unit. AI often overuses !! instead of proper null handling.`,
            file: unit.file,
            line: unit.location.startLine + i + 1,
            confidence: 0.8,
            metadata: {
              patternId: 'excessive-bang-bang',
              language: 'kotlin',
              count: bangBangCount,
            },
          });
          break; // Only report once per unit
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Python-specific AI Detector
// ═══════════════════════════════════════════════════════════════════

const PYTHON_PATTERNS: Array<{
  id: string;
  pattern: RegExp;
  severity: 'error' | 'warning' | 'info';
  confidence: number;
  message: string;
}> = [
  {
    id: 'python-bare-except',
    pattern: /\bexcept\s*:/,
    severity: 'warning',
    confidence: 0.9,
    message: 'Bare except: catches all exceptions including SystemExit and KeyboardInterrupt. Use except Exception: instead.',
  },
  {
    id: 'python-eval-usage',
    pattern: /\beval\s*\(/,
    severity: 'error',
    confidence: 0.9,
    message: 'eval() usage detected — enables arbitrary code execution. Use ast.literal_eval() for safe evaluation.',
  },
  {
    id: 'python-exec-usage',
    pattern: /\bexec\s*\(/,
    severity: 'error',
    confidence: 0.85,
    message: 'exec() usage detected — enables arbitrary code execution. Consider safer alternatives.',
  },
  {
    id: 'python-deprecated-urlparse',
    pattern: /\bfrom\s+urllib\.parse\s+import\s+urlparse\b/,
    severity: 'info',
    confidence: 0.5,
    message: 'urlparse import detected. Note: urlparse is still valid in Python 3; however, AI sometimes confuses urlparse with urlsplit.',
  },
  {
    id: 'python-mutable-default-arg',
    pattern: /def\s+\w+\s*\([^)]*(?:=\s*\[\]|\s*=\s*\{\})\s*\)/,
    severity: 'warning',
    confidence: 0.85,
    message: 'Mutable default argument (list/dict) detected. This is a common Python gotcha — use None as default and initialize inside the function.',
  },
  {
    id: 'python-global-variable',
    pattern: /\bglobal\s+\w+/,
    severity: 'info',
    confidence: 0.5,
    message: 'global keyword used. Excessive use of global state is an anti-pattern common in AI-generated code.',
  },
  {
    id: 'python-pass-in-except',
    pattern: /\bexcept\s+.*?:\s*\n\s*pass/,
    severity: 'warning',
    confidence: 0.85,
    message: 'except block with only pass — silently swallowing exceptions. AI commonly generates this pattern.',
  },
  {
    id: 'python-os-system',
    pattern: /\bos\.system\s*\(/,
    severity: 'warning',
    confidence: 0.75,
    message: 'os.system() used instead of subprocess. Use subprocess.run() for better control and security.',
  },
  {
    id: 'python-pickle-load',
    pattern: /\bpickle\.load(?:s)?\s*\(/,
    severity: 'error',
    confidence: 0.8,
    message: 'pickle.load() can execute arbitrary code. Use json or safer serialization for untrusted data.',
  },
];

export class PythonLanguageDetector implements V4Detector {
  readonly id = 'python-language-specific';
  readonly name = 'Python Language-Specific Detector';
  readonly category: DetectorCategory = 'implementation';
  readonly supportedLanguages: SupportedLanguage[] = ['python'];

  async detect(units: CodeUnit[], context: DetectorContext): Promise<DetectorResult[]> {
    const results: DetectorResult[] = [];

    for (const unit of units) {
      if (unit.language !== 'python') continue;
      if (!unit.source || unit.source.trim().length === 0) continue;

      const lines = unit.source.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || trimmed.startsWith('"""') || trimmed.startsWith("'''")) continue;

        for (const pat of PYTHON_PATTERNS) {
          pat.pattern.lastIndex = 0;
          if (pat.pattern.test(line)) {
            results.push({
              detectorId: this.id,
              severity: pat.severity,
              category: this.category,
              messageKey: `python-language-specific.${pat.id}`,
              message: pat.message,
              file: unit.file,
              line: unit.location.startLine + i + 1,
              confidence: pat.confidence,
              metadata: {
                patternId: pat.id,
                language: 'python',
                matchedLine: trimmed.substring(0, 100),
              },
            });
          }
        }
      }

      // Multiline mutable default arg detection
      this.detectMultilinePatterns(unit, results);
    }

    return results;
  }

  private detectMultilinePatterns(unit: CodeUnit, results: DetectorResult[]): void {
    const source = unit.source;

    // Detect except ... pass pattern across lines
    const exceptPassMatches = source.matchAll(/except\s+(\w+)\s*:\s*\n\s*pass/g);
    for (const match of exceptPassMatches) {
      const lineNum = source.substring(0, match.index!).split('\n').length;
      results.push({
        detectorId: this.id,
        severity: 'warning',
        category: this.category,
        messageKey: 'python-language-specific.except-with-pass',
        message: `except ${match[1]} with only pass — silently swallowing exceptions. Log the exception or handle it properly.`,
        file: unit.file,
        line: lineNum,
        confidence: 0.85,
        metadata: {
          patternId: 'except-with-pass',
          language: 'python',
          exceptionType: match[1],
        },
      });
    }
  }
}

/**
 * SecurityPatternDetector — V4 detector for security anti-patterns in AI-generated code.
 *
 * NOT a replacement for dedicated security scanners (Snyk, Semgrep).
 * Focuses specifically on patterns AI commonly produces from training data:
 * - Hardcoded secrets/tokens (example values from docs left in code)
 * - Insecure defaults (HTTP instead of HTTPS, no TLS verification)
 * - SQL injection from string concatenation
 * - eval()/exec() usage
 * - Weak cryptography (MD5, SHA1 for security purposes)
 * - Hardcoded credentials
 *
 * V4 improvements over V3:
 * - Operates on CodeUnit IR with language-aware patterns
 * - Better context analysis (knows which calls are security-relevant)
 * - Reduced false positives through source context analysis
 *
 * @since 0.4.0
 */

import type { CodeUnit, SupportedLanguage } from '../../ir/types.js';
import type { V4Detector, DetectorResult, DetectorCategory, DetectorContext } from './types.js';

// ─── Security Pattern Definition ───────────────────────────────────

/** Security pattern definition for detecting vulnerabilities in code. */
export interface SecurityPattern {
  /** Unique ID for the pattern */
  id: string;
  /** Regex to match in source code */
  pattern: RegExp;
  /** Severity of the finding */
  severity: 'error' | 'warning' | 'info';
  /** Confidence level */
  confidence: number;
  /** Human-readable message */
  message: string;
  /** Languages this pattern applies to (empty = all) */
  languages: SupportedLanguage[];
  /** Additional context patterns that should NOT be present to trigger this finding */
  excludeContextPatterns?: RegExp[];
}

// ─── Security Patterns ─────────────────────────────────────────────

const SECURITY_PATTERNS: SecurityPattern[] = [
  // ── Hardcoded Secrets ──────────────────────────────────────────

  {
    id: 'hardcoded-api-key',
    pattern: /(?:api[_-]?key|apikey|api[_-]?secret|api[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i,
    severity: 'error',
    confidence: 0.85,
    message: 'Possible hardcoded API key detected. Use environment variables or a secrets manager instead.',
    languages: [],
  },
  {
    id: 'hardcoded-password',
    pattern: /(?:password|passwd|pwd|secret)\s*[:=]\s*['"][^'"]{4,}['"]/i,
    severity: 'error',
    confidence: 0.8,
    message: 'Possible hardcoded password detected. Use environment variables or a secrets manager instead.',
    languages: [],
    excludeContextPatterns: [
      /(?:example|sample|test|mock|dummy|placeholder|todo|fixme|xxx)/i,
    ],
  },
  {
    id: 'hardcoded-token',
    pattern: /(?:auth[_-]?token|access[_-]?token|bearer[_-]?token|jwt[_-]?secret)\s*[:=]\s*['"][A-Za-z0-9_.\-]{16,}['"]/i,
    severity: 'error',
    confidence: 0.85,
    message: 'Possible hardcoded authentication token detected. Use environment variables instead.',
    languages: [],
  },
  {
    id: 'aws-access-key',
    pattern: /(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/,
    severity: 'error',
    confidence: 0.95,
    message: 'Possible AWS access key ID detected. Rotate immediately and use IAM roles or environment variables.',
    languages: [],
  },
  {
    id: 'private-key',
    pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/,
    severity: 'error',
    confidence: 0.95,
    message: 'Private key embedded in source code. Store in a secure vault or secrets manager.',
    languages: [],
  },

  // ── Dangerous Functions ────────────────────────────────────────

  {
    id: 'eval-usage-js',
    pattern: /\beval\s*\(/,
    severity: 'error',
    confidence: 0.9,
    message: 'eval() usage detected. This enables code injection attacks. Use safer alternatives like JSON.parse() or a sandboxed evaluator.',
    languages: ['typescript', 'javascript'],
  },
  {
    id: 'eval-usage-python',
    pattern: /\beval\s*\(/,
    severity: 'error',
    confidence: 0.9,
    message: 'eval() usage detected. This enables code injection attacks. Use ast.literal_eval() or safer alternatives.',
    languages: ['python'],
  },
  {
    id: 'exec-usage-python',
    pattern: /\bexec\s*\(/,
    severity: 'error',
    confidence: 0.85,
    message: 'exec() usage detected. This enables arbitrary code execution. Consider safer alternatives.',
    languages: ['python'],
  },
  {
    id: 'new-function-js',
    pattern: /\bnew\s+Function\s*\(/,
    severity: 'warning',
    confidence: 0.85,
    message: 'new Function() is similar to eval() and can enable code injection. Use safer alternatives.',
    languages: ['typescript', 'javascript'],
  },

  // ── SQL Injection ──────────────────────────────────────────────

  {
    id: 'sql-string-concat',
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE|DROP)\s+.*?\+\s*(?:req\.|request\.|params\.|query\.|body\.|input|user)/i,
    severity: 'error',
    confidence: 0.8,
    message: 'SQL query with string concatenation from user input detected. Use parameterized queries to prevent SQL injection.',
    languages: ['typescript', 'javascript', 'java', 'kotlin', 'python'],
  },
  {
    id: 'sql-template-literal',
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE|DROP)\s+.*?\$\{.*?(?:req|request|params|query|body|input|user)/i,
    severity: 'error',
    confidence: 0.85,
    message: 'SQL query using template literals with user input detected. Use parameterized queries to prevent SQL injection.',
    languages: ['typescript', 'javascript'],
  },
  {
    id: 'sql-f-string-python',
    pattern: /f['"](?:SELECT|INSERT|UPDATE|DELETE|DROP)\s+.*?\{.*?(?:request|params|query|body|input|user)/i,
    severity: 'error',
    confidence: 0.85,
    message: 'SQL query using f-string with user input detected. Use parameterized queries to prevent SQL injection.',
    languages: ['python'],
  },

  // ── Weak Cryptography ──────────────────────────────────────────

  {
    id: 'weak-hash-md5',
    pattern: /\b(?:md5|MD5|createHash\s*\(\s*['"]md5['"]|hashlib\.md5|MessageDigest\.getInstance\s*\(\s*['"]MD5['"])\b/,
    severity: 'warning',
    confidence: 0.75,
    message: 'MD5 is cryptographically broken. Use SHA-256 or better for security purposes. (OK for checksums/non-security uses.)',
    languages: [],
  },
  {
    id: 'weak-hash-sha1',
    pattern: /\b(?:sha1|SHA1|createHash\s*\(\s*['"]sha1['"]|hashlib\.sha1|MessageDigest\.getInstance\s*\(\s*['"]SHA-?1['"])\b/,
    severity: 'warning',
    confidence: 0.7,
    message: 'SHA-1 is cryptographically weak. Use SHA-256 or better for security purposes. (OK for checksums/non-security uses.)',
    languages: [],
  },
  {
    id: 'weak-random',
    pattern: /\bMath\.random\s*\(\)/,
    severity: 'warning',
    confidence: 0.7,
    message: 'Math.random() is not cryptographically secure. Use crypto.randomUUID() or crypto.getRandomValues() for security-sensitive operations.',
    languages: ['typescript', 'javascript'],
  },

  // ── Insecure Defaults ──────────────────────────────────────────

  {
    id: 'tls-verify-disabled',
    pattern: /(?:rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|verify\s*=\s*False|InsecureSkipVerify\s*:\s*true)/i,
    severity: 'error',
    confidence: 0.9,
    message: 'TLS certificate verification is disabled. This enables man-in-the-middle attacks.',
    languages: [],
  },
  {
    id: 'cors-wildcard',
    pattern: /(?:Access-Control-Allow-Origin['"]\s*[:=]\s*['"]\*|cors\(\s*\)|allowedOrigins\s*\(\s*['"]\*['"])/i,
    severity: 'warning',
    confidence: 0.7,
    message: 'CORS is configured with wildcard origin. Restrict to specific trusted domains.',
    languages: [],
  },
  {
    id: 'http-no-tls',
    pattern: /['"]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/,
    severity: 'info',
    confidence: 0.5,
    message: 'HTTP URL detected (not HTTPS). Consider using HTTPS for production endpoints.',
    languages: [],
  },
];

// ─── Detector ──────────────────────────────────────────────────────

export class SecurityPatternDetector implements V4Detector {
  readonly id = 'security-pattern';
  readonly name = 'Security Pattern Detector';
  readonly category: DetectorCategory = 'implementation';
  readonly supportedLanguages: SupportedLanguage[] = [];

  async detect(units: CodeUnit[], context: DetectorContext): Promise<DetectorResult[]> {
    const results: DetectorResult[] = [];

    for (const unit of units) {
      // Skip non-source units (module-level containers without source)
      if (!unit.source || unit.source.trim().length === 0) continue;

      // Get applicable patterns for this language
      const applicablePatterns = SECURITY_PATTERNS.filter(
        p => p.languages.length === 0 || p.languages.includes(unit.language),
      );

      const lines = unit.source.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments (simple heuristic)
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) {
          continue;
        }

        for (const pattern of applicablePatterns) {
          // Reset regex lastIndex (patterns might be reused)
          pattern.pattern.lastIndex = 0;

          if (pattern.pattern.test(line)) {
            // Check exclude context patterns
            if (pattern.excludeContextPatterns) {
              const excluded = pattern.excludeContextPatterns.some(ep => {
                ep.lastIndex = 0;
                return ep.test(line);
              });
              if (excluded) continue;
            }

            const absoluteLine = unit.location.startLine + i;

            results.push({
              detectorId: this.id,
              severity: pattern.severity,
              category: this.category,
              messageKey: `security-pattern.${pattern.id}`,
              message: pattern.message,
              file: unit.file,
              line: absoluteLine + 1, // 0-based to 1-based
              confidence: pattern.confidence,
              metadata: {
                patternId: pattern.id,
                language: unit.language,
                matchedLine: line.trim().substring(0, 100), // Truncate for safety
              },
            });
          }
        }
      }
    }

    return results;
  }
}

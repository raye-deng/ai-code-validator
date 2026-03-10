/**
 * Security Pattern Detector (V3)
 *
 * Detects AI-generated security anti-patterns:
 * 1. Hardcoded secrets/credentials (CWE-798)
 * 2. eval/Function constructor usage (CWE-95)
 * 3. SQL injection via string concatenation/template literals (CWE-89)
 * 4. Insecure cryptography: Math.random(), MD5/SHA1 for passwords (CWE-328/338)
 * 5. Insecure defaults: cors origin '*', disabled security headers (CWE-942)
 *
 * AI models frequently generate code with these patterns from training data.
 *
 * Implements the unified Detector interface.
 *
 * @since 0.3.0
 */

import type { Detector, UnifiedIssue, FileAnalysis, Severity } from '../types.js';
import { AIDefectCategory } from '../types.js';

// ─── Pattern Definitions ───

/** Security pattern definition for detecting vulnerabilities in code. */
export interface SecurityPattern {
  type: string;
  regex: RegExp;
  severity: Severity;
  message: string;
  suggestion: string;
  cweId?: string;
  /** Skip in test files */
  skipTests?: boolean;
}

// ─── Hardcoded Secret Patterns ───

const SECRET_NAME_PATTERN = /(?:password|passwd|pwd|api_?key|apikey|secret|token|credential|private_?key|auth_?token|access_?key|client_?secret)\s*[:=]\s*['"`]([^'"`]{4,})['"`]/i;

const SECRET_ASSIGNMENT_PATTERN = /(?:const|let|var)\s+(?:password|passwd|pwd|apiKey|api_key|secret|token|credential|privateKey|private_key|authToken|auth_token|accessKey|access_key|clientSecret|client_secret)\s*=\s*['"`]([^'"`]{4,})['"`]/i;

// ─── SQL Patterns ───

const SQL_CONCAT_PATTERN = /['"`](?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\s.*?['"`]\s*\+\s*\w+/i;
const SQL_TEMPLATE_PATTERN = /(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\s.*?\$\{/i;

// ─── All Security Patterns ───

const SECURITY_PATTERNS: SecurityPattern[] = [
  // 1. Hardcoded secrets
  {
    type: 'hardcoded-secret',
    regex: SECRET_NAME_PATTERN,
    severity: 'critical',
    message: 'Hardcoded secret/credential detected',
    suggestion: 'Use environment variables (process.env.XXX) or a secrets manager instead of hardcoding credentials.',
    cweId: 'CWE-798',
    skipTests: true,
  },
  {
    type: 'hardcoded-secret',
    regex: SECRET_ASSIGNMENT_PATTERN,
    severity: 'critical',
    message: 'Hardcoded secret assigned to variable with sensitive name',
    suggestion: 'Use environment variables (process.env.XXX) or a secrets manager.',
    cweId: 'CWE-798',
    skipTests: true,
  },

  // 2. eval / Function constructor
  {
    type: 'unsafe-eval',
    regex: /\beval\s*\(/,
    severity: 'high',
    message: 'Use of eval() detected — allows arbitrary code execution',
    suggestion: 'Avoid eval(). Use JSON.parse() for data parsing, or safer alternatives like Function constructors with strict sandboxing.',
    cweId: 'CWE-95',
  },
  {
    type: 'unsafe-eval',
    regex: /new\s+Function\s*\(/,
    severity: 'high',
    message: 'Use of new Function() detected — allows dynamic code execution',
    suggestion: 'Avoid new Function(). Use structured approaches to achieve dynamic behavior.',
    cweId: 'CWE-95',
  },

  // 3. SQL injection
  {
    type: 'sql-injection',
    regex: SQL_CONCAT_PATTERN,
    severity: 'medium',
    message: 'Potential SQL injection: SQL query built with string concatenation',
    suggestion: 'Use parameterized queries or an ORM instead of string concatenation for SQL queries.',
    cweId: 'CWE-89',
  },
  {
    type: 'sql-injection',
    regex: SQL_TEMPLATE_PATTERN,
    severity: 'medium',
    message: 'Potential SQL injection: SQL query built with template literal interpolation',
    suggestion: 'Use parameterized queries (e.g., $1 placeholders) instead of template literal interpolation.',
    cweId: 'CWE-89',
  },

  // 4. Insecure crypto
  {
    type: 'insecure-random',
    regex: /Math\.random\s*\(\)/,
    severity: 'medium',
    message: 'Math.random() is not cryptographically secure',
    suggestion: 'Use crypto.randomBytes() or crypto.randomUUID() for security-sensitive random values.',
    cweId: 'CWE-338',
  },
  {
    type: 'insecure-hash',
    regex: /createHash\s*\(\s*['"]md5['"]\s*\)/,
    severity: 'medium',
    message: 'MD5 is cryptographically broken — should not be used for security purposes',
    suggestion: 'Use SHA-256 or SHA-3 for hashing. Use bcrypt/scrypt/argon2 for password hashing.',
    cweId: 'CWE-328',
  },
  {
    type: 'insecure-hash',
    regex: /createHash\s*\(\s*['"]sha1['"]\s*\)/,
    severity: 'medium',
    message: 'SHA-1 is deprecated for security use — vulnerable to collision attacks',
    suggestion: 'Use SHA-256 or SHA-3 for hashing. Use bcrypt/scrypt/argon2 for password hashing.',
    cweId: 'CWE-328',
  },

  // 5. Insecure defaults
  {
    type: 'insecure-cors',
    regex: /cors\s*\(\s*\{[^}]*origin\s*:\s*['"`]\*['"`]/,
    severity: 'medium',
    message: 'CORS configured with wildcard origin — allows any domain to make requests',
    suggestion: 'Restrict CORS origin to specific trusted domains instead of using wildcard \'*\'.',
    cweId: 'CWE-942',
  },
  {
    type: 'insecure-config',
    regex: /helmet\s*\(\s*\{[^}]*contentSecurityPolicy\s*:\s*false/,
    severity: 'medium',
    message: 'Content Security Policy is disabled in helmet configuration',
    suggestion: 'Enable Content Security Policy. Configure it for your specific needs rather than disabling it.',
    cweId: 'CWE-693',
  },
  {
    type: 'insecure-config',
    regex: /rejectUnauthorized\s*:\s*false/,
    severity: 'medium',
    message: 'TLS certificate verification is disabled (rejectUnauthorized: false)',
    suggestion: 'Do not disable TLS certificate verification in production. Fix the certificate chain instead.',
    cweId: 'CWE-295',
  },
];

// ─── Helpers ───

function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.[jt]sx?$/.test(filePath) ||
    filePath.includes('__tests__') ||
    filePath.includes('__mocks__') ||
    /\/tests?\//.test(filePath);
}

// ─── Main Detector ───

/**
 * SecurityPatternDetector — detects common security anti-patterns in AI-generated code.
 *
 * Scans source code with regex patterns for 5 categories:
 * hardcoded secrets, eval usage, SQL injection, insecure crypto, insecure defaults.
 */
export class SecurityPatternDetector implements Detector {
  readonly name = 'security-pattern';
  readonly version = '1.0.0';
  readonly tier = 1 as const;

  // ─── V3 Unified Interface ───

  async detect(files: FileAnalysis[]): Promise<UnifiedIssue[]> {
    const allIssues: UnifiedIssue[] = [];
    let globalIndex = 0;

    for (const file of files) {
      const issues = this.analyzeFile(file.path, file.content);
      for (const issue of issues) {
        issue.id = `security:${globalIndex++}`;
        allIssues.push(issue);
      }
    }

    return allIssues;
  }

  // ─── Internal Analysis ───

  private analyzeFile(filePath: string, source: string): UnifiedIssue[] {
    const issues: UnifiedIssue[] = [];
    const lines = source.split('\n');
    const isTest = isTestFile(filePath);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      // Skip suppressed lines
      const prevLine = i > 0 ? lines[i - 1] : '';
      if (prevLine.includes('// ai-validator-ignore') || prevLine.includes('// ai-validator-disable')) {
        continue;
      }

      for (const pattern of SECURITY_PATTERNS) {
        // Skip test-file-only patterns in test files
        if (pattern.skipTests && isTest) {
          continue;
        }

        // Reset regex state
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
        const match = regex.exec(line);

        if (match) {
          // Additional check: for hardcoded secrets, skip env variable references
          if (pattern.type === 'hardcoded-secret') {
            if (line.includes('process.env') || line.includes('env.') ||
                line.includes('config.') || line.includes('Config.')) {
              continue;
            }
            // Skip example/placeholder values
            const value = match[1] || '';
            if (value === 'xxx' || value === 'XXX' || value === '***' ||
                value === 'your-' || value.startsWith('your-') ||
                value === 'placeholder' || value === 'changeme') {
              continue;
            }
          }

          // For SQL injection, skip tagged template literals (sql``, Prisma.$queryRaw``)
          if (pattern.type === 'sql-injection') {
            if (/(?:sql|Prisma\.\$queryRaw)\s*`/.test(line)) {
              continue;
            }
          }

          issues.push({
            id: '', // set in detect()
            detector: this.name,
            type: pattern.type,
            category: AIDefectCategory.SECURITY_ANTIPATTERN,
            severity: pattern.severity,
            message: pattern.message,
            file: filePath,
            line: i + 1,
            column: match.index + 1,
            suggestion: pattern.suggestion,
            fix: {
              description: pattern.suggestion,
              autoFixable: false,
            },
            references: pattern.cweId
              ? { urls: [`https://cwe.mitre.org/data/definitions/${pattern.cweId.replace('CWE-', '')}.html`], cweId: pattern.cweId }
              : undefined,
            confidence: 0.85,
            detectionSource: 'static',
          });
        }
      }
    }

    return issues;
  }
}

export default SecurityPatternDetector;

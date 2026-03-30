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
  /** Whether this pattern should scan comment lines (default: false). Used for TODO/FIXME security bypass patterns. */
  scanComments?: boolean;
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

  // ── AI-Specific Security Anti-Patterns ────────────────────────
  // These patterns are commonly produced by AI from training data
  // and represent AI-specific security risks that traditional tools miss.

  {
    id: 'example-api-key',
    pattern: /sk-(?:proj-|svcacct-)[a-zA-Z0-9]+-[a-zA-Z0-9]*example[a-zA-Z0-9]*/i,
    severity: 'error',
    confidence: 0.95,
    message: 'Possible example OpenAI API key detected. AI often copies documentation examples with placeholder values. Use environment variables instead.',
    languages: [],
    excludeContextPatterns: [/process\.env/i, /import\.meta\.env/i, /\bgetenv\b/i],
  },
  {
    id: 'example-openai-key',
    pattern: /sk-(?:proj-|svcacct-)[a-zA-Z0-9]{4,24}(-[a-zA-Z0-9]{4,24}){1,3}/,
    severity: 'error',
    confidence: 0.8,
    message: 'Possible OpenAI API key from documentation/example code. Verify this is not a real key and use environment variables.',
    languages: [],
    excludeContextPatterns: [/process\.env/i, /import\.meta\.env/i, /\bgetenv\b/i],
  },
  {
    id: 'placeholder-secret-value',
    pattern: /(?:password|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"]*(?:example|sample|demo|placeholder|changeme|your[_-]?(?:api[_-]?)?(?:key[_-]?)?here|xxx+|FIXME|TODO)[^'"]*['"]/i,
    severity: 'warning',
    confidence: 0.7,
    message: 'Placeholder secret value detected. AI often copies example values from documentation. Replace with proper secret management.',
    languages: [],
  },
  {
    id: 'placeholder-secret-basic',
    pattern: /(?:password|secret)\s*[:=]\s*['"][^'"]*(?:example|test|demo|sample)[^'"]*['"]/i,
    severity: 'warning',
    confidence: 0.8,
    message: 'Placeholder secret detected. AI commonly uses obvious placeholder values like "example" or "test" for secrets. Use environment variables instead.',
    languages: [],
  },
  {
    id: 'dynamic-cors-origin-reflection',
    pattern: /Access-Control-Allow-Origin.*?(?:req|request|headers\.origin|\$\{.*?origin)/i,
    severity: 'error',
    confidence: 0.85,
    message: 'Dynamic CORS origin reflection detected. Echoing the request Origin header back in Access-Control-Allow-Origin enables cross-site attacks. Use an explicit allowlist instead.',
    languages: [],
  },
  {
    id: 'dynamic-cors-origin-variable',
    pattern: /(?:allowOrigin|cors\.origin|Access-Control-Allow-Origin).*?origin/i,
    severity: 'warning',
    confidence: 0.6,
    message: 'CORS configuration may dynamically reflect the request origin. This can enable cross-site attacks if not validated. Use an explicit allowlist.',
    languages: [],
    excludeContextPatterns: [/\[?['"][\w\-\.\/:*]+['"]\]?/, /allowedOrigins\s*[:=]\s*\[/],
  },
  {
    id: 'sensitive-data-logging',
    pattern: /console\.\w+\s*\(\s*(?:.*?(?:password|passwd|pwd|secret|token|api[_-]?key|authorization|cookie|session|credential))/i,
    severity: 'warning',
    confidence: 0.65,
    message: 'Possible sensitive data in console.log statement. AI commonly leaves debug logging that exposes secrets in production.',
    languages: ['typescript', 'javascript'],
  },
  {
    id: 'python-sensitive-logging',
    pattern: /(?:print|logging|logger)(?:\.\w+)?\s*\(\s*(?:.*?(?:password|secret|token|api[_-]?key|authorization|credential))/i,
    severity: 'warning',
    confidence: 0.6,
    message: 'Possible sensitive data in log output. AI commonly leaves debug logging that exposes secrets in production.',
    languages: ['python'],
  },
  {
    id: 'jwt-empty-secret',
    pattern: /jwt\.(?:verify|sign)\s*\([^,]+,\s*['"][^'"]{0,2}['"]/,
    severity: 'error',
    confidence: 0.85,
    message: 'JWT verification/signing with empty or near-empty secret. This provides no security. Use a strong, properly stored secret key.',
    languages: [],
  },
  {
    id: 'jwt-hardcoded-secret',
    pattern: /jwt\.(?:verify|sign)\s*\([^,]+,\s*['"][A-Za-z0-9]{8,}['"]/,
    severity: 'error',
    confidence: 0.8,
    message: 'JWT verification/signing with hardcoded secret. Use environment variables or a secrets manager for the signing key.',
    languages: [],
    excludeContextPatterns: [/process\.env/i, /import\.meta\.env/i, /\bgetenv\b/i, /\bos\.getenv\b/i],
  },
  {
    id: 'unsafe-json-parse-user-input',
    pattern: /JSON\.(?:parse|stringify)\s*\(\s*(?:req|request|body|params|query|input|user|event)\b/i,
    severity: 'warning',
    confidence: 0.5,
    message: 'JSON.parse() on user input without schema validation. AI often omits input validation. Consider using a schema validator (zod, joi, yup) to validate the parsed object.',
    languages: ['typescript', 'javascript'],
    excludeContextPatterns: [/zod|joi|yup|ajv|schema|validate|parseBody|safeParse/i],
  },

  // ── TODO/FIXME Security Bypass ──────────────────────────────────
  // AI commonly generates placeholder comments where security checks
  // should be, then never implements them. These are invisible to
  // traditional scanners because the code "works" — it just has no
  // security.

  {
    id: 'todo-auth-bypass',
    pattern: /\/\/\s*(?:TODO|FIXME|HACK|XXX)\s*:?\s*.*?(?:auth|authenti|authoriz|permission|access.?control|rbac|acl|login.?check)/i,
    severity: 'error',
    confidence: 0.85,
    message: 'TODO/FIXME comment indicates missing authentication or authorization check. AI generated a placeholder instead of implementing the security logic.',
    languages: [],
    scanComments: true,
  },
  {
    id: 'todo-validation-bypass',
    pattern: /\/\/\s*(?:TODO|FIXME|HACK|XXX)\s*:?\s*.*?(?:validat|sanitiz|escape|input.?check|verify.?input|check.?input)/i,
    severity: 'warning',
    confidence: 0.8,
    message: 'TODO/FIXME comment indicates missing input validation or sanitization. AI left a placeholder instead of implementing proper validation.',
    languages: [],
    scanComments: true,
  },
  {
    id: 'todo-encryption-bypass',
    pattern: /\/\/\s*(?:TODO|FIXME|HACK|XXX)\s*:?\s*.*?(?:encrypt|decrypt|hash|sign|verify.?signature|tls|ssl|cert)/i,
    severity: 'error',
    confidence: 0.8,
    message: 'TODO/FIXME comment indicates missing encryption or cryptographic operation. AI skipped implementing the security-critical logic.',
    languages: [],
    scanComments: true,
  },
  {
    id: 'todo-rate-limit-bypass',
    pattern: /\/\/\s*(?:TODO|FIXME|HACK|XXX)\s*:?\s*.*?(?:rate.?limit|throttl|brute.?force|dos|ddos)/i,
    severity: 'warning',
    confidence: 0.75,
    message: 'TODO/FIXME comment indicates missing rate limiting or abuse prevention. AI left a placeholder instead of implementing the protection.',
    languages: [],
    scanComments: true,
  },
  {
    id: 'todo-security-generic',
    pattern: /\/\/\s*(?:TODO|FIXME|HACK|XXX)\s*:?\s*.*?(?:security|secure|protect|csrf|xss|injection|vulnerab)/i,
    severity: 'warning',
    confidence: 0.75,
    message: 'TODO/FIXME comment references a security concern that was not implemented. AI acknowledged the risk but did not address it.',
    languages: [],
    scanComments: true,
  },
  {
    id: 'python-todo-security',
    pattern: /#\s*(?:TODO|FIXME|HACK|XXX)\s*:?\s*.*?(?:auth|validat|sanitiz|encrypt|security|permission|rate.?limit)/i,
    severity: 'warning',
    confidence: 0.75,
    message: 'TODO/FIXME comment references a security concern that was not implemented. AI acknowledged the risk but did not address it.',
    languages: ['python'],
    scanComments: true,
  },

  // ── Shell Template Literal Injection ────────────────────────────
  // AI commonly generates child_process calls with template strings
  // or string concatenation, creating command injection vectors that
  // bypass simple eval() detection.

  {
    id: 'shell-template-literal-injection',
    pattern: /\b(?:execSync|exec|spawnSync|spawn)\s*\(\s*`[^`]*\$\{/,
    severity: 'error',
    confidence: 0.85,
    message: 'Shell command with template literal interpolation detected. AI often generates child_process calls with unsanitized variables. Use spawn() with an argument array instead.',
    languages: ['typescript', 'javascript'],
  },
  {
    id: 'shell-string-concat-exec',
    pattern: /\b(?:execSync|exec)\s*\(\s*(?:['"][^'"]*['"]\s*\+|\w+\s*\+\s*['"])/,
    severity: 'error',
    confidence: 0.8,
    message: 'Shell command with string concatenation detected. This enables command injection. Use spawn() or execFile() with an explicit argument array.',
    languages: ['typescript', 'javascript'],
  },
  {
    id: 'python-shell-f-string',
    pattern: /\b(?:os\.system|subprocess\.(?:call|run|Popen|check_output|check_call))\s*\(\s*f['"]/,
    severity: 'error',
    confidence: 0.85,
    message: 'Shell command with f-string interpolation detected. AI often generates subprocess calls with unsanitized variables. Use subprocess.run() with a list of arguments instead.',
    languages: ['python'],
  },
  {
    id: 'python-shell-format-string',
    pattern: /\b(?:os\.system|subprocess\.(?:call|run|Popen|check_output|check_call))\s*\(\s*['"][^'"]*['"]\.format\s*\(/,
    severity: 'error',
    confidence: 0.85,
    message: 'Shell command with .format() string interpolation detected. Use subprocess.run() with a list of arguments to prevent command injection.',
    languages: ['python'],
  },

  // ── Sensitive Data in Error Responses ──────────────────────────
  // AI commonly generates error handlers that leak internal details
  // (stack traces, database errors, file paths) to API consumers.

  {
    id: 'error-stack-in-response',
    pattern: /\b(?:res\.(?:json|send|status\s*\([^)]*\)\.json|status\s*\([^)]*\)\.send))\s*\(\s*\{[^}]*(?:stack|stackTrace|trace)/i,
    severity: 'error',
    confidence: 0.85,
    message: 'Stack trace leaked in API error response. AI commonly exposes err.stack to API consumers, revealing internal paths and code structure. Return a generic error message instead.',
    languages: ['typescript', 'javascript'],
  },
  {
    id: 'error-details-in-response',
    pattern: /\bcatch\s*\([^)]*\)\s*\{[^}]*(?:res\.(?:json|send))\s*\(\s*(?:err|error|e)\b/,
    severity: 'warning',
    confidence: 0.65,
    message: 'Raw error object sent in API response. AI often passes entire error objects to response handlers, potentially leaking internal details. Return only safe, user-facing error messages.',
    languages: ['typescript', 'javascript'],
  },
  {
    id: 'python-traceback-in-response',
    pattern: /(?:(?:return|jsonify|Response).*?traceback\.(?:format_exc|print_exc)|traceback\.(?:format_exc|print_exc).*?(?:return|jsonify|Response))/i,
    severity: 'error',
    confidence: 0.8,
    message: 'Python traceback leaked in API response. AI commonly sends traceback.format_exc() output to clients, exposing internal paths and code. Return a generic error message instead.',
    languages: ['python'],
  },

  // ── Hardcoded Cloud/Service Keys ──────────────────────────────
  // AI copies these from documentation and training data examples.

  {
    id: 'example-stripe-key',
    pattern: /\b(?:pk|sk)_(?:test|live)_[a-zA-Z0-9]{20,}(?:example)?/i,
    severity: 'error',
    confidence: 0.9,
    message: 'Possible Stripe API key detected. AI often copies example keys from Stripe documentation. Use environment variables or a secrets manager.',
    languages: [],
  },
  {
    id: 'example-github-pat',
    pattern: /\bghp_[a-zA-Z0-9]{4,}example\b/i,
    severity: 'error',
    confidence: 0.95,
    message: 'Possible example GitHub Personal Access Token detected. AI often copies documentation examples with "example" suffix. Use environment variables instead.',
    languages: [],
  },
  {
    id: 'github-pat-general',
    pattern: /\bghp_[a-zA-Z0-9]{36}\b/,
    severity: 'error',
    confidence: 0.8,
    message: 'Possible GitHub Personal Access Token detected. Verify this is not a real token and use environment variables.',
    languages: [],
  },
  {
    id: 'example-slack-token',
    pattern: /\bxox[bpras]-[a-zA-Z0-9\-]{10,}/,
    severity: 'error',
    confidence: 0.85,
    message: 'Possible Slack API token detected. AI commonly copies example tokens from Slack documentation. Use environment variables.',
    languages: [],
  },

  // ── Environment Variable Fallback with Hardcoded Secrets ──────
  // AI models frequently generate code that loads secrets from env vars
  // but falls back to a hardcoded default. This "works" in development
  // but silently ships the default secret to production.

  {
    id: 'env-var-fallback-secret-js',
    pattern: /process\.env\.(?:\w*(?:SECRET|KEY|TOKEN|PASSWORD|PASSWD|PWD|CREDENTIALS?|AUTH)\w*)\s*\|\|\s*['"][^'"]{4,}['"]/i,
    severity: 'error',
    confidence: 0.85,
    message: 'Environment variable with hardcoded fallback secret detected. AI often generates `process.env.SECRET || "default"` which silently ships the default to production. Remove the fallback or throw an error when the env var is missing.',
    languages: ['typescript', 'javascript'],
    excludeContextPatterns: [/(?:test|spec|mock|fixture|example)/i],
  },
  {
    id: 'env-var-fallback-secret-nullish-js',
    pattern: /process\.env\.(?:\w*(?:SECRET|KEY|TOKEN|PASSWORD|PASSWD|PWD|CREDENTIALS?|AUTH)\w*)\s*\?\?\s*['"][^'"]{4,}['"]/i,
    severity: 'error',
    confidence: 0.85,
    message: 'Environment variable with hardcoded fallback secret detected (nullish coalescing). AI often generates `process.env.SECRET ?? "default"` which silently ships the default to production. Throw an error when the env var is missing instead.',
    languages: ['typescript', 'javascript'],
    excludeContextPatterns: [/(?:test|spec|mock|fixture|example)/i],
  },
  {
    id: 'python-env-var-fallback-secret',
    pattern: /os\.(?:getenv|environ\.get)\s*\(\s*['"](?:\w*(?:SECRET|KEY|TOKEN|PASSWORD|PASSWD|CREDENTIALS?|AUTH)\w*)['"](?:\s*,\s*['"][^'"]{4,}['"])/i,
    severity: 'error',
    confidence: 0.85,
    message: 'os.getenv() with hardcoded fallback secret detected. AI often generates `os.getenv("SECRET", "default")` which silently ships the default to production. Use os.environ["SECRET"] (which raises KeyError) or validate explicitly.',
    languages: ['python'],
    excludeContextPatterns: [/(?:test|spec|mock|fixture|example)/i],
  },

  // ── Insecure Cookie Configuration ──────────────────────────────
  // AI commonly generates cookie handling without security flags.
  // This is invisible to traditional linters because the code is
  // syntactically valid — it just has insecure defaults.

  {
    id: 'cookie-missing-secure-flag',
    pattern: /(?:res\.cookie|setCookie|set-cookie|cookie\s*[:=])\s*\([^)]*\)\s*(?!.*secure\s*:\s*true)/i,
    severity: 'warning',
    confidence: 0.5,
    message: 'Cookie set without explicit secure flag. AI often omits security attributes on cookies. Set secure: true, httpOnly: true, and sameSite: "strict" or "lax".',
    languages: ['typescript', 'javascript'],
    excludeContextPatterns: [/secure\s*:\s*true/i, /httpOnly\s*:\s*true/i],
  },
  {
    id: 'session-cookie-insecure',
    pattern: /(?:session|cookie)\s*(?::\s*\{|=\s*\{)[^}]*(?:secure\s*:\s*false|httpOnly\s*:\s*false)/i,
    severity: 'error',
    confidence: 0.85,
    message: 'Session/cookie configuration with security flags explicitly disabled. AI sometimes sets secure: false or httpOnly: false in session config. These must be true in production.',
    languages: ['typescript', 'javascript'],
  },

  // ── Insecure Server Binding ────────────────────────────────────
  // AI models default to binding on 0.0.0.0 or all interfaces,
  // exposing services to the network without considering firewall rules.

  {
    id: 'server-bind-all-interfaces',
    pattern: /\.listen\s*\(\s*\d+\s*,\s*['"]0\.0\.0\.0['"]/,
    severity: 'info',
    confidence: 0.5,
    message: 'Server explicitly bound to 0.0.0.0 (all interfaces). AI defaults to binding on all interfaces. Consider binding to 127.0.0.1 for local-only services, or document why public binding is needed.',
    languages: ['typescript', 'javascript'],
  },
  {
    id: 'python-server-bind-all',
    pattern: /\.(?:run|serve|listen)\s*\([^)]*host\s*=\s*['"]0\.0\.0\.0['"]/,
    severity: 'info',
    confidence: 0.5,
    message: 'Server bound to 0.0.0.0 (all interfaces). AI defaults to binding on all interfaces. Consider binding to 127.0.0.1 for local-only services.',
    languages: ['python'],
  },

  // ── Silent Error Swallowing ────────────────────────────────────
  // AI commonly generates empty catch blocks or catch blocks that
  // only log but don't handle or rethrow. This hides failures and
  // makes debugging production issues nearly impossible.

  {
    id: 'empty-catch-block',
    pattern: /\bcatch\s*\([^)]*\)\s*\{\s*\}/,
    severity: 'warning',
    confidence: 0.8,
    message: 'Empty catch block swallows errors silently. AI often generates empty catch blocks as placeholders. At minimum, log the error or rethrow it.',
    languages: ['typescript', 'javascript', 'java', 'kotlin'],
  },
  {
    id: 'python-bare-except',
    pattern: /\bexcept\s*:\s*$/m,
    severity: 'warning',
    confidence: 0.75,
    message: 'Bare except clause catches all exceptions including SystemExit and KeyboardInterrupt. AI often generates `except:` instead of `except Exception:`. Use a specific exception type.',
    languages: ['python'],
  },
  {
    id: 'python-except-pass',
    pattern: /\bexcept\b[^:]*:\s*pass\b/,
    severity: 'warning',
    confidence: 0.8,
    message: 'except/pass silently swallows errors. AI commonly generates `except: pass` as a placeholder. At minimum, log the exception.',
    languages: ['python'],
  },

  // ── AI-Overly Loose Input Validation Patterns ─────────────────────
  // AI commonly generates minimal validation that passes basic checks
  // but doesn't validate content quality, leading to security risks.

  {
    id: 'minimal-validation-length-only',
    pattern: /(?:\.min\(1\)|\.min\(2\)|length\s*>\s*0|length\s*>=\s*1)/i,
    severity: 'warning',
    confidence: 0.6,
    message: 'Minimal validation detected (checking only length > 0). AI often uses .min(1) for "required" fields but doesn\'t validate content quality, format, or business rules. Use meaningful validation instead.',
    languages: [],
    excludeContextPatterns: [
      /email|@.*\.|\.email\(\)|format|regex|pattern/i,
      /validate.*proper|properly.*validate|strict.*validate/i,
    ],
  },
  {
    id: 'z-minimal-validation',
    pattern: /z\.(?:string|number|object)\s*\(\s*\)\s*\.\s*(?:min\(|max\(\)|length\()/i,
    severity: 'warning',
    confidence: 0.7,
    message: 'Minimal validation with zod detected. AI often uses .min(1) for required validation but doesn\'t include format checks, business rules, or content validation. Use comprehensive validation schemas.',
    languages: ['typescript'],
    excludeContextPatterns: [/email|format|regex|@.*\.[a-z]+|[A-Z][a-z]+\.[a-z]+\.[a-z]+/i],
  },
  {
    id: 'python-minimal-validation',
    pattern: /(?:if\s+(?:len\(.*\)\s*>\s*0|.*\s*is\s*not\s*None)|assert\s+.*\s*>\s*0|if\s+.*\s*:\s*pass)/i,
    severity: 'warning',
    confidence: 0.6,
    message: 'Minimal validation in Python detected. AI often checks only "is not None" or length > 0 without validating content, format, or business rules. Use proper validation libraries like Pydantic.',
    languages: ['python'],
    excludeContextPatterns: [/validate|check|verify|pydantic|email|@.*\.[a-z]+/i],
  },

  // ─── Go-specific Security Patterns ──────────────────────────────

  {
    id: 'go-command-injection',
    pattern: /\bexec\.Command\s*\(\s*["']sh["'],\s*["']-c["']/,
    severity: 'error',
    confidence: 0.85,
    message: 'Shell command execution via exec.Command("sh", "-c") detected. This enables command injection. Use exec.Command directly with explicit arguments.',
    languages: ['go'],
  },
  {
    id: 'go-user-input-in-exec',
    pattern: /\bexec\.Command\s*\([^)]*\+[^)]*\)/,
    severity: 'error',
    confidence: 0.8,
    message: 'exec.Command with string concatenation detected. User input in command arguments can lead to command injection.',
    languages: ['go'],
  },
  {
    id: 'go-sql-injection',
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE)\s+.*?\+\s*(?:r\.|request\.|c\.|ctx\.|req\.)/i,
    severity: 'error',
    confidence: 0.8,
    message: 'SQL query with string concatenation from request/context detected. Use parameterized queries (db.QueryContext with ? placeholders).',
    languages: ['go'],
  },
  {
    id: 'go-hardcoded-secret',
    pattern: /(?:os\.Getenv|viper\.Get|config\.Get)\s*\(\s*["'][^"']*["']\s*\)\s*.*?(?:fallback|default|or)\s*["'][A-Za-z0-9_\-]{8,}["']/i,
    severity: 'warning',
    confidence: 0.6,
    message: 'Environment variable lookup with hardcoded fallback secret detected.',
    languages: ['go'],
  },

  // ── Java-specific Security Patterns ────────────────────────────

  {
    id: 'java-command-injection',
    pattern: /\bRuntime\.getRuntime\(\)\.exec\s*\([^)]*\+/,
    severity: 'error',
    confidence: 0.85,
    message: 'Runtime.exec() with string concatenation detected. Use ProcessBuilder with argument list to prevent command injection.',
    languages: ['java', 'kotlin'],
  },
  {
    id: 'java-unsafe-deserialization',
    pattern: /\bObjectInputStream\s*\(/,
    severity: 'error',
    confidence: 0.9,
    message: 'ObjectInputStream usage detected. Unsafe deserialization can lead to remote code execution. Use safe serialization alternatives.',
    languages: ['java', 'kotlin'],
  },
  {
    id: 'java-sql-string-concat',
    pattern: /(?:createStatement|Statement)\s*\(\s*\).*?(?:executeQuery|executeUpdate)\s*\(\s*["']/i,
    severity: 'warning',
    confidence: 0.7,
    message: 'Plain Statement with hardcoded query detected. Use PreparedStatement with parameterized queries to prevent SQL injection.',
    languages: ['java', 'kotlin'],
  },
  {
    id: 'java-reflective-access',
    pattern: /\bsetAccessible\s*\(\s*true\s*\)/,
    severity: 'warning',
    confidence: 0.7,
    message: 'setAccessible(true) bypasses Java access controls. Ensure this is necessary and the input is trusted.',
    languages: ['java', 'kotlin'],
  },
  {
    id: 'java-unsafe-file-path',
    pattern: /\bnew\s+File\s*\(\s*(?:request\.|req\.|getParameter|getHeader)/,
    severity: 'error',
    confidence: 0.8,
    message: 'File path constructed from user input detected. This may allow path traversal attacks. Validate and sanitize the path.',
    languages: ['java', 'kotlin'],
  },

  // ── Kotlin-specific Security Patterns ──────────────────────────

  {
    id: 'kotlin-process-builder-injection',
    pattern: /\bProcessBuilder\s*\([^)]*\+\s*\w/,
    severity: 'error',
    confidence: 0.8,
    message: 'ProcessBuilder with string concatenation detected. Use explicit argument list to prevent command injection.',
    languages: ['kotlin'],
  },
  {
    id: 'kotlin-trust-all-certs',
    pattern: /(?:TrustManager|X509TrustManager).*?checkClientTrusted\s*\(\s*[^,]*,\s*[^,]*\s*\)\s*\{\s*\}/,
    severity: 'error',
    confidence: 0.85,
    message: 'TrustManager with empty checkClientTrusted implementation detected. This accepts all certificates and enables man-in-the-middle attacks.',
    languages: ['kotlin', 'java'],
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

      // Separate patterns that scan comments from those that don't
      const codePatterns = applicablePatterns.filter(p => !p.scanComments);
      const commentPatterns = applicablePatterns.filter(p => p.scanComments);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        const isComment = trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*');

        // Pick which patterns to run based on whether this is a comment line
        const patternsToRun = isComment ? commentPatterns : [...codePatterns, ...commentPatterns];

        for (const pattern of patternsToRun) {
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

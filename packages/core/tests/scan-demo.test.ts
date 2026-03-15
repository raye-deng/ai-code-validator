/**
 * Open Code Review — Multi-Language Demo Scan
 *
 * Scans 5 real open-source repos across TypeScript, Python, Java, Go, Kotlin.
 * Generates reports in all formats (HTML, Markdown, JSON, SARIF, Terminal).
 *
 * Run: cd packages/core && pnpm test -- --testPathPattern scan-demo
 *   or: cd packages/core && npx vitest run tests/scan-demo.test.ts
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Import all detectors
import { HallucinationDetector } from '../src/detectors/hallucination.js';
import { LogicGapDetector } from '../src/detectors/logic-gap.js';
import { DuplicationDetector } from '../src/detectors/duplication.js';
import { ContextBreakDetector } from '../src/detectors/context-break.js';
import { StaleAPIDetector } from '../src/detectors/stale-api.js';
import { SecurityPatternDetector } from '../src/detectors/security-pattern.js';
import { OverEngineeringDetector } from '../src/detectors/over-engineering.js';
import { DeepHallucinationDetector } from '../src/detectors/deep-hallucination.js';
import { TypeSafetyDetector } from '../src/detectors/type-safety.js';

// Import scorer and reporter
import { ScoringEngine } from '../src/scorer/scoring-engine.js';
import { generateReport } from '../src/reporter/index.js';
import type { ReportData } from '../src/reporter/types.js';
import type { FileAnalysis, UnifiedIssue, Detector, SupportedLanguage } from '../src/types.js';

// ─── Config ───

const REPOS_BASE = '/tmp/ocr-demo';
const REPORTS_DIR = '/tmp/ocr-demo/reports';

interface RepoConfig {
  dir: string;
  language: SupportedLanguage;
  label: string;
}

const REPOS: RepoConfig[] = [
  { dir: path.join(REPOS_BASE, 'create-t3-app'), language: 'typescript', label: 'create-t3-app (TypeScript)' },
  { dir: path.join(REPOS_BASE, 'typer'), language: 'python', label: 'typer (Python)' },
  { dir: path.join(REPOS_BASE, 'java-design-patterns'), language: 'java', label: 'java-design-patterns (Java)' },
  { dir: path.join(REPOS_BASE, 'chi'), language: 'go', label: 'chi (Go)' },
  { dir: path.join(REPOS_BASE, 'moshi'), language: 'kotlin', label: 'moshi (Kotlin)' },
];

const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  typescript: ['.ts', '.tsx', '.js', '.jsx'],
  python: ['.py'],
  java: ['.java'],
  go: ['.go'],
  kotlin: ['.kt', '.kts'],
};

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'vendor', 'target', 'build', 'dist',
  '__pycache__', '.next', '.gradle', '.idea', '.vscode',
  'test', 'tests', '__tests__', 'testdata', 'test-data',
  'examples', 'docs', 'doc', '.github', 'gradle',
]);

const MAX_FILES = 100;
const MAX_FILE_SIZE = 50_000; // 50KB

// ─── Helpers ───

function findFiles(dir: string, extensions: string[]): string[] {
  const result: string[] = [];

  function walk(d: string, depth: number) {
    if (result.length >= MAX_FILES || depth > 12) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (result.length >= MAX_FILES) return;
      const full = path.join(d, entry.name);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          walk(full, depth + 1);
        }
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        try {
          const stat = fs.statSync(full);
          if (stat.size <= MAX_FILE_SIZE && stat.size > 0) {
            result.push(full);
          }
        } catch {
          // skip
        }
      }
    }
  }

  walk(dir, 0);
  return result;
}

function createDetectors(projectRoot: string): Detector[] {
  return [
    new HallucinationDetector({ projectRoot }),
    new LogicGapDetector(),
    new DuplicationDetector(),
    new ContextBreakDetector(),
    new StaleAPIDetector(),
    new SecurityPatternDetector(),
    new OverEngineeringDetector(),
    new DeepHallucinationDetector(),
    new TypeSafetyDetector(),
  ];
}

interface ScanResult {
  repoName: string;
  language: string;
  filesScanned: number;
  issues: UnifiedIssue[];
  durationMs: number;
  score: ReturnType<ScoringEngine['aggregateV3']>;
}

async function scanRepo(repo: RepoConfig): Promise<ScanResult> {
  const start = Date.now();
  const repoName = path.basename(repo.dir);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Scanning: ${repo.label}`);
  console.log(`${'='.repeat(60)}`);

  // Find source files
  const exts = LANGUAGE_EXTENSIONS[repo.language] || [];
  const filePaths = findFiles(repo.dir, exts);
  console.log(`  Found ${filePaths.length} files`);

  if (filePaths.length === 0) {
    console.log(`  ⚠ No files found — skipping`);
    const engine = new ScoringEngine(70);
    return {
      repoName,
      language: repo.language,
      filesScanned: 0,
      issues: [],
      durationMs: Date.now() - start,
      score: engine.aggregateV3([]),
    };
  }

  // Build FileAnalysis array
  const fileAnalyses: FileAnalysis[] = filePaths.map(f => ({
    path: path.relative(repo.dir, f),
    content: fs.readFileSync(f, 'utf-8'),
    language: repo.language,
  }));

  // Run all detectors
  const detectors = createDetectors(repo.dir);
  const allIssues: UnifiedIssue[] = [];

  for (const detector of detectors) {
    try {
      const detectorStart = Date.now();
      const issues = await detector.detect(fileAnalyses);
      const detectorTime = Date.now() - detectorStart;
      allIssues.push(...issues);
      console.log(`  ✓ ${detector.name} (tier ${detector.tier}): ${issues.length} issues [${detectorTime}ms]`);
    } catch (e: any) {
      console.log(`  ✗ ${detector.name}: FAILED — ${e.message?.slice(0, 100)}`);
    }
  }

  // Score
  const engine = new ScoringEngine(70);
  const score = engine.aggregateV3(allIssues);
  const durationMs = Date.now() - start;

  console.log(`\n  Total: ${allIssues.length} issues | Score: ${score.overallScore} | Grade: ${score.grade} | ${durationMs}ms`);

  return {
    repoName,
    language: repo.language,
    filesScanned: filePaths.length,
    issues: allIssues,
    durationMs,
    score,
  };
}

function writeReports(result: ScanResult): void {
  const reportData: ReportData = {
    projectName: result.repoName,
    scanDate: new Date().toISOString(),
    score: result.score,
    issues: result.issues,
    filesScanned: result.filesScanned,
    languages: [result.language],
    duration: result.durationMs,
  };

  const formats = ['html', 'markdown', 'json', 'sarif', 'terminal'] as const;
  const extensions: Record<string, string> = {
    html: '.html',
    markdown: '.md',
    json: '.json',
    sarif: '.sarif.json',
    terminal: '.terminal.txt',
  };

  for (const fmt of formats) {
    try {
      const report = generateReport(reportData, { format: fmt, theme: 'dark', includeSource: true });
      const outPath = path.join(REPORTS_DIR, `${result.repoName}${extensions[fmt]}`);
      fs.writeFileSync(outPath, report, 'utf-8');
      console.log(`  📄 ${path.basename(outPath)}`);
    } catch (e: any) {
      console.log(`  ⚠ ${fmt} report failed: ${e.message?.slice(0, 80)}`);
    }
  }
}

function generateSummary(results: ScanResult[]): string {
  const now = new Date().toISOString().split('T')[0];

  let md = `# Open Code Review — Demo Scan Results\n\n`;
  md += `> Generated: ${now}  \n`;
  md += `> Engine: Open Code Review v0.3.0  \n`;
  md += `> Mode: Static Analysis Only (Tier 1 + Tier 2)\n\n`;

  // Summary table
  md += `## Scanned Repositories\n\n`;
  md += `| Repository | Language | Files | Issues | Score | Grade |\n`;
  md += `|-----------|----------|------:|-------:|------:|:-----:|\n`;

  for (const r of results) {
    md += `| ${r.repoName} | ${r.language} | ${r.filesScanned} | ${r.issues.length} | ${r.score.overallScore} | ${r.score.grade} |\n`;
  }

  // Issue distribution by category
  md += `\n## Issue Distribution by Category\n\n`;
  md += `| Category | ${results.map(r => r.repoName).join(' | ')} | Total |\n`;
  md += `|----------|${results.map(() => '------:').join('|')}|------:|\n`;

  const allCategories = new Set<string>();
  for (const r of results) {
    for (const issue of r.issues) {
      allCategories.add(issue.category);
    }
  }

  for (const cat of [...allCategories].sort()) {
    const counts = results.map(r => r.issues.filter(i => i.category === cat).length);
    const total = counts.reduce((a, b) => a + b, 0);
    md += `| ${cat} | ${counts.join(' | ')} | ${total} |\n`;
  }

  // Issue distribution by severity
  md += `\n## Issue Distribution by Severity\n\n`;
  md += `| Severity | ${results.map(r => r.repoName).join(' | ')} | Total |\n`;
  md += `|----------|${results.map(() => '------:').join('|')}|------:|\n`;

  for (const sev of ['critical', 'high', 'medium', 'low', 'info']) {
    const counts = results.map(r => r.issues.filter(i => i.severity === sev).length);
    const total = counts.reduce((a, b) => a + b, 0);
    if (total > 0) {
      md += `| ${sev} | ${counts.join(' | ')} | ${total} |\n`;
    }
  }

  // Dimension scores
  md += `\n## Scoring Dimensions\n\n`;
  md += `| Dimension | ${results.map(r => r.repoName).join(' | ')} |\n`;
  md += `|-----------|${results.map(() => '------:').join('|')}|\n`;

  const dimIds = ['aiFaithfulness', 'codeFreshness', 'contextCoherence', 'implementationQuality'] as const;
  const dimNames: Record<string, string> = {
    aiFaithfulness: 'AI Faithfulness (35)',
    codeFreshness: 'Code Freshness (25)',
    contextCoherence: 'Context Coherence (20)',
    implementationQuality: 'Impl. Quality (20)',
  };

  for (const dimId of dimIds) {
    const scores = results.map(r => {
      const dim = r.score.dimensions[dimId];
      return dim ? `${dim.score}/${dim.maxScore}` : 'N/A';
    });
    md += `| ${dimNames[dimId]} | ${scores.join(' | ')} |\n`;
  }

  // Top issues per repo
  md += `\n## Top Issues per Repository\n\n`;
  for (const r of results) {
    md += `### ${r.repoName} (${r.language})\n\n`;
    if (r.issues.length === 0) {
      md += `_No issues detected._\n\n`;
      continue;
    }

    // Sort by severity
    const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    const sorted = [...r.issues].sort((a, b) => (sevOrder[a.severity] ?? 5) - (sevOrder[b.severity] ?? 5));
    const top = sorted.slice(0, 10);

    md += `| Severity | Category | File | Line | Message |\n`;
    md += `|----------|----------|------|-----:|--------|\n`;
    for (const issue of top) {
      const shortFile = issue.file.length > 40 ? '...' + issue.file.slice(-37) : issue.file;
      const shortMsg = issue.message.length > 80 ? issue.message.slice(0, 77) + '...' : issue.message;
      md += `| ${issue.severity} | ${issue.category} | ${shortFile} | ${issue.line} | ${shortMsg} |\n`;
    }
    if (r.issues.length > 10) {
      md += `\n_...and ${r.issues.length - 10} more issues._\n`;
    }
    md += `\n`;
  }

  // Key findings
  md += `## Key Findings\n\n`;

  const totalIssues = results.reduce((s, r) => s + r.issues.length, 0);
  const totalFiles = results.reduce((s, r) => s + r.filesScanned, 0);
  const avgScore = Math.round(results.reduce((s, r) => s + r.score.overallScore, 0) / results.length);
  const totalTime = results.reduce((s, r) => s + r.durationMs, 0);

  md += `- **Total files scanned**: ${totalFiles} across ${results.length} repositories\n`;
  md += `- **Total issues found**: ${totalIssues}\n`;
  md += `- **Average quality score**: ${avgScore}/100\n`;
  md += `- **Total scan time**: ${(totalTime / 1000).toFixed(1)}s\n`;
  md += `- **Scan mode**: Static analysis only (Tier 1 + Tier 2, no AI/LLM)\n\n`;

  // Per-language observations
  md += `### Per-Language Observations\n\n`;
  for (const r of results) {
    const issuesPerFile = r.filesScanned > 0 ? (r.issues.length / r.filesScanned).toFixed(1) : '0';
    md += `- **${r.repoName}** (${r.language}): ${r.issues.length} issues in ${r.filesScanned} files (${issuesPerFile}/file), Grade ${r.score.grade}\n`;
  }

  md += `\n---\n\n_Generated by Open Code Review v0.3.0 — [https://github.com/anthropics/open-code-review](https://github.com/anthropics/open-code-review)_\n`;

  return md;
}

// ─── Test Suite ───

describe('Multi-Language Demo Scan', () => {
  const results: ScanResult[] = [];

  it('should set up reports directory', () => {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    expect(fs.existsSync(REPORTS_DIR)).toBe(true);
  });

  for (const repo of REPOS) {
    const repoName = path.basename(repo.dir);

    it(`should scan ${repo.label}`, async () => {
      if (!fs.existsSync(repo.dir)) {
        console.log(`  ⚠ ${repo.dir} not found — skipping`);
        return;
      }

      const result = await scanRepo(repo);
      results.push(result);

      // Basic validations
      expect(result.filesScanned).toBeGreaterThan(0);
      expect(result.score.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.score.overallScore).toBeLessThanOrEqual(100);

      // Write reports
      console.log(`\n  Writing reports for ${repoName}:`);
      writeReports(result);
    }, 120_000); // 2 min timeout per repo
  }

  it('should generate summary report', () => {
    if (results.length === 0) {
      console.log('  ⚠ No results — skipping summary');
      return;
    }

    const summary = generateSummary(results);
    const summaryPath = path.join(REPORTS_DIR, 'SUMMARY.md');
    fs.writeFileSync(summaryPath, summary, 'utf-8');
    console.log(`\n📋 Summary written to ${summaryPath}`);

    // Also write a combined JSON with all results
    const combinedData = results.map(r => ({
      repoName: r.repoName,
      language: r.language,
      filesScanned: r.filesScanned,
      issueCount: r.issues.length,
      durationMs: r.durationMs,
      overallScore: r.score.overallScore,
      grade: r.score.grade,
      passed: r.score.passed,
      issueSummary: {
        byCategory: Object.fromEntries(
          [...new Set(r.issues.map(i => i.category))].map(cat => [
            cat, r.issues.filter(i => i.category === cat).length,
          ]),
        ),
        bySeverity: Object.fromEntries(
          ['critical', 'high', 'medium', 'low', 'info'].map(sev => [
            sev, r.issues.filter(i => i.severity === sev).length,
          ]).filter(([, count]) => (count as number) > 0),
        ),
      },
    }));

    fs.writeFileSync(
      path.join(REPORTS_DIR, 'combined-results.json'),
      JSON.stringify(combinedData, null, 2),
      'utf-8',
    );

    expect(results.length).toBeGreaterThan(0);
    console.log(`\n✅ All done! ${results.length} repos scanned.`);
  });
}, 600_000); // 10 min total timeout

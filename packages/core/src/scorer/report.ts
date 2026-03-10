/**
 * Report Generator V3
 *
 * Formats validation results into various output formats:
 * - Terminal (human-readable with colors and SLA metrics)
 * - JSON (machine-readable)
 * - Markdown (for PR comments)
 * - GitLab Code Quality (for CI integration)
 *
 * V3 additions:
 * - Support for new AggregateScoreV3 / FileScoreV3 types
 * - SLA metrics section in terminal and markdown output
 * - Dimension-based breakdown (AI Faithfulness, Code Freshness, etc.)
 * - Backward compatible with legacy AggregateScore
 */

import type {
  AggregateScore,
  FileScore,
  DimensionScore,
  AggregateScoreV3,
  FileScoreV3,
  DimensionScoreV3,
} from './scoring-engine.js';
import type { SLAMetrics } from '../sla/types.js';
import type { Grade } from '../types.js';

/** Output format type */
export type ReportFormat = 'terminal' | 'json' | 'markdown' | 'gitlab-report';

/** GitLab Code Quality issue format */
interface GitLabCodeQualityIssue {
  description: string;
  check_name: string;
  fingerprint: string;
  severity: 'info' | 'minor' | 'major' | 'critical' | 'blocker';
  location: {
    path: string;
    lines: { begin: number };
  };
}

// ─── Visual Helpers ────────────────────────────────────────────────

function dimensionBar(dim: DimensionScore | DimensionScoreV3): string {
  const pct = Math.round((dim.score / dim.maxScore) * 100);
  const filled = Math.round(pct / 5);
  const empty = 20 - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `  ${dim.name.padEnd(25)} ${bar} ${dim.score}/${dim.maxScore} (${pct}%)`;
}

function gradeEmoji(grade: string): string {
  switch (grade) {
    case 'A+': return '🏆';
    case 'A': return '🟢';
    case 'B': return '🔵';
    case 'C': return '🟡';
    case 'D': return '🟠';
    case 'F': return '🔴';
    default: return '⚪';
  }
}

function severityIcon(severity: string): string {
  switch (severity) {
    case 'critical': return '🔴';
    case 'high': return '🟠';
    case 'medium': return '🟡';
    case 'low': return '🔵';
    case 'info': return '⚪';
    default: return '⚪';
  }
}

// ─── Report Generator ──────────────────────────────────────────────

export class ReportGenerator {
  /**
   * Generate a V3 report with optional SLA metrics.
   */
  generateV3(
    result: AggregateScoreV3,
    format: ReportFormat,
    slaMetrics?: SLAMetrics,
  ): string {
    switch (format) {
      case 'terminal': return this.formatTerminalV3(result, slaMetrics);
      case 'json': return this.formatJSONV3(result, slaMetrics);
      case 'markdown': return this.formatMarkdownV3(result, slaMetrics);
      case 'gitlab-report': return this.formatGitLabReportV3(result);
      default: return this.formatJSONV3(result, slaMetrics);
    }
  }

  /**
   * Generate a legacy report (backward compatible).
   */
  generate(result: AggregateScore, format: ReportFormat): string {
    switch (format) {
      case 'terminal': return this.formatTerminal(result);
      case 'json': return this.formatJSON(result);
      case 'markdown': return this.formatMarkdown(result);
      case 'gitlab-report': return this.formatGitLabReport(result);
      default: return this.formatJSON(result);
    }
  }

  // ─── V3 Terminal Format ──────────────────────────────────────

  private formatTerminalV3(result: AggregateScoreV3, sla?: SLAMetrics): string {
    const lines: string[] = [];

    lines.push('');
    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push('║           AI Code Validator V3 — Quality Report              ║');
    lines.push('╚══════════════════════════════════════════════════════════════╝');
    lines.push('');

    // Overall summary
    lines.push(`  Overall Score: ${result.overallScore}/100  Grade: ${gradeEmoji(result.grade)} ${result.grade}`);
    lines.push(`  Files Scanned: ${result.totalFiles}  Passed: ${result.passedFiles}  Failed: ${result.failedFiles}`);
    lines.push(`  Issues Found: ${result.issueCount}  Threshold: ${result.threshold}`);
    lines.push(`  Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
    lines.push('');

    // Project-level dimension breakdown
    lines.push('  ── Scoring Dimensions ──');
    lines.push('');
    for (const dim of Object.values(result.dimensions)) {
      lines.push(dimensionBar(dim));
    }
    lines.push('');

    // SLA metrics
    if (sla) {
      lines.push('  ═══════════════════════════════════════════');
      lines.push('    AI Code Validator — SLA Metrics');
      lines.push('  ═══════════════════════════════════════════');
      lines.push(`    Scan Level:      ${sla.level} (${slaLevelName(sla.level)})`);
      lines.push(`    Files Scanned:   ${sla.filesScanned}`);
      lines.push(`    Scan Duration:   ${(sla.scanDurationMs / 1000).toFixed(1)}s (target: ≤${(sla.targetDurationMs / 1000).toFixed(0)}s ${sla.withinTarget ? '✅' : '⚠️'})`);
      lines.push(`    Detectors Used:  ${sla.detectorsUsed}/${sla.detectorsTotal}`);
      lines.push(`    AI Analysis:     ${sla.aiAnalysis === 'none' ? 'None' : sla.aiAnalysis}`);
      lines.push(`    Issues Found:    ${sla.issuesFound} (${sla.criticalCount} critical, ${sla.highCount} high, ${sla.mediumCount} medium)`);

      if (sla.degraded) {
        lines.push(`    ⚠️  DEGRADED:    ${sla.degradeReason}`);
      }

      lines.push('  ═══════════════════════════════════════════');
      lines.push('');
    }

    // Per-file details
    for (const file of result.files) {
      lines.push(`  ─── ${file.file} ─── Score: ${file.totalScore}/100 ${gradeEmoji(file.grade)}`);

      for (const dim of Object.values(file.dimensions)) {
        lines.push(dimensionBar(dim));
      }

      // Show top issues per file
      const allIssues = Object.values(file.dimensions)
        .flatMap(d => d.issues ?? [])
        .sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity));

      if (allIssues.length > 0) {
        lines.push('');
        lines.push('  Issues:');
        for (const issue of allIssues.slice(0, 8)) {
          lines.push(`    ${severityIcon(issue.severity)} [${issue.severity}] L${issue.line}: ${issue.message}`);
        }
        if (allIssues.length > 8) {
          lines.push(`    ... and ${allIssues.length - 8} more`);
        }
      }
      lines.push('');
    }

    lines.push('─'.repeat(62));
    lines.push(`  Generated at: ${result.timestamp}`);
    lines.push('');

    return lines.join('\n');
  }

  // ─── V3 JSON Format ─────────────────────────────────────────

  private formatJSONV3(result: AggregateScoreV3, sla?: SLAMetrics): string {
    const output: Record<string, unknown> = {
      version: '3.0',
      ...result,
    };

    // Strip full issue objects from dimension scores (they're in files already)
    // Keep dimensions lightweight in JSON
    if (sla) {
      output.sla = sla;
    }

    return JSON.stringify(output, null, 2);
  }

  // ─── V3 Markdown Format ──────────────────────────────────────

  private formatMarkdownV3(result: AggregateScoreV3, sla?: SLAMetrics): string {
    const lines: string[] = [];

    lines.push(`## ${gradeEmoji(result.grade)} AI Code Validator V3 Report`);
    lines.push('');
    lines.push(`**Overall Score:** ${result.overallScore}/100 (Grade: ${result.grade})`);
    lines.push(`**Status:** ${result.passed ? '✅ Passed' : '❌ Failed'} (threshold: ${result.threshold})`);
    lines.push(`**Files:** ${result.totalFiles} scanned, ${result.passedFiles} passed, ${result.failedFiles} failed`);
    lines.push(`**Issues:** ${result.issueCount} total`);
    lines.push('');

    // Dimension breakdown
    lines.push('### Scoring Dimensions');
    lines.push('');
    lines.push('| Dimension | Score | Issues |');
    lines.push('|-----------|-------|--------|');
    for (const dim of Object.values(result.dimensions)) {
      const pct = Math.round((dim.score / dim.maxScore) * 100);
      lines.push(`| ${dim.name} | ${dim.score}/${dim.maxScore} (${pct}%) | ${dim.issueCount} |`);
    }
    lines.push('');

    // SLA metrics
    if (sla) {
      lines.push('<details>');
      lines.push('<summary>📊 SLA Metrics</summary>');
      lines.push('');
      lines.push(`| Metric | Value |`);
      lines.push(`|--------|-------|`);
      lines.push(`| Scan Level | ${sla.level} (${slaLevelName(sla.level)}) |`);
      lines.push(`| Duration | ${(sla.scanDurationMs / 1000).toFixed(1)}s (target: ≤${(sla.targetDurationMs / 1000).toFixed(0)}s) ${sla.withinTarget ? '✅' : '⚠️'} |`);
      lines.push(`| Detectors | ${sla.detectorsUsed}/${sla.detectorsTotal} |`);
      lines.push(`| AI Analysis | ${sla.aiAnalysis} |`);
      if (sla.degraded) {
        lines.push(`| ⚠️ Degraded | ${sla.degradeReason} |`);
      }
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }

    // File details
    if (result.files.length > 0) {
      lines.push('### File Details');
      lines.push('');
      lines.push('| File | Score | AI Faith. | Freshness | Coherence | Quality |');
      lines.push('|------|-------|-----------|-----------|-----------|---------|');

      for (const file of result.files) {
        const d = file.dimensions;
        lines.push(
          `| \`${file.file}\` | ${file.totalScore}/100 ${gradeEmoji(file.grade)} | ${d.aiFaithfulness.score}/${d.aiFaithfulness.maxScore} | ${d.codeFreshness.score}/${d.codeFreshness.maxScore} | ${d.contextCoherence.score}/${d.contextCoherence.maxScore} | ${d.implementationQuality.score}/${d.implementationQuality.maxScore} |`,
        );
      }
    }

    lines.push('');
    lines.push('---');
    lines.push('*Powered by [AI Code Validator](https://github.com/raye-deng/ai-code-validator) v3*');

    return lines.join('\n');
  }

  // ─── V3 GitLab Report ────────────────────────────────────────

  private formatGitLabReportV3(result: AggregateScoreV3): string {
    const issues: GitLabCodeQualityIssue[] = [];

    for (const file of result.files) {
      const allIssues = Object.values(file.dimensions).flatMap(d => d.issues ?? []);

      for (const issue of allIssues) {
        const hash = Buffer.from(`${issue.file}:${issue.line}:${issue.message}`).toString('base64').slice(0, 32);
        issues.push({
          description: `[${issue.severity}] ${issue.message}`,
          check_name: `ai-validator/${issue.category}`,
          fingerprint: hash,
          severity: mapToGitLabSeverity(issue.severity),
          location: {
            path: issue.file,
            lines: { begin: issue.line },
          },
        });
      }
    }

    return JSON.stringify(issues, null, 2);
  }

  // ─── Legacy Format Methods (backward compatible) ─────────────

  private formatTerminal(result: AggregateScore): string {
    const lines: string[] = [];

    lines.push('');
    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push('║              AI Code Validator — Quality Report              ║');
    lines.push('╚══════════════════════════════════════════════════════════════╝');
    lines.push('');
    lines.push(`  Overall Score: ${result.overallScore}/100  Grade: ${gradeEmoji(result.grade)} ${result.grade}`);
    lines.push(`  Files Scanned: ${result.totalFiles}  Passed: ${result.passedFiles}  Failed: ${result.failedFiles}`);
    lines.push(`  Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
    lines.push('');

    for (const file of result.files) {
      lines.push(`  ─── ${file.file} ─── Score: ${file.totalScore}/100 ${gradeEmoji(file.grade)}`);
      lines.push(dimensionBar(file.dimensions.completeness));
      lines.push(dimensionBar(file.dimensions.coherence));
      lines.push(dimensionBar(file.dimensions.consistency));
      lines.push(dimensionBar(file.dimensions.conciseness));

      const allDetails = [
        ...file.dimensions.completeness.details,
        ...file.dimensions.coherence.details,
        ...file.dimensions.consistency.details,
        ...file.dimensions.conciseness.details,
      ];
      if (allDetails.length > 0) {
        lines.push('');
        lines.push('  Issues:');
        for (const detail of allDetails.slice(0, 5)) {
          lines.push(`    ⚠ ${detail}`);
        }
        if (allDetails.length > 5) {
          lines.push(`    ... and ${allDetails.length - 5} more`);
        }
      }
      lines.push('');
    }

    lines.push('─'.repeat(62));
    lines.push(`  Generated at: ${result.timestamp}`);
    lines.push('');

    return lines.join('\n');
  }

  private formatJSON(result: AggregateScore): string {
    return JSON.stringify(result, null, 2);
  }

  private formatMarkdown(result: AggregateScore): string {
    const lines: string[] = [];

    lines.push(`## ${gradeEmoji(result.grade)} AI Code Validator Report`);
    lines.push('');
    lines.push(`**Overall Score:** ${result.overallScore}/100 (Grade: ${result.grade})`);
    lines.push(`**Status:** ${result.passed ? '✅ Passed' : '❌ Failed'}`);
    lines.push(`**Files:** ${result.totalFiles} scanned, ${result.passedFiles} passed, ${result.failedFiles} failed`);
    lines.push('');

    if (result.files.length > 0) {
      lines.push('### File Details');
      lines.push('');
      lines.push('| File | Score | Completeness | Coherence | Consistency | Conciseness |');
      lines.push('|------|-------|-------------|-----------|-------------|-------------|');

      for (const file of result.files) {
        const d = file.dimensions;
        lines.push(
          `| \`${file.file}\` | ${file.totalScore}/100 ${gradeEmoji(file.grade)} | ${d.completeness.score}/${d.completeness.maxScore} | ${d.coherence.score}/${d.coherence.maxScore} | ${d.consistency.score}/${d.consistency.maxScore} | ${d.conciseness.score}/${d.conciseness.maxScore} |`,
        );
      }
    }

    lines.push('');
    lines.push('---');
    lines.push('*Powered by [AI Code Validator](https://github.com/raye-deng/ai-code-validator)*');

    return lines.join('\n');
  }

  private formatGitLabReport(result: AggregateScore): string {
    const issues: GitLabCodeQualityIssue[] = [];

    for (const file of result.files) {
      const allIssues = [
        ...file.dimensions.completeness.details.map(d => ({ d, check: 'completeness' })),
        ...file.dimensions.coherence.details.map(d => ({ d, check: 'coherence' })),
        ...file.dimensions.consistency.details.map(d => ({ d, check: 'consistency' })),
        ...file.dimensions.conciseness.details.map(d => ({ d, check: 'conciseness' })),
      ];

      for (const { d, check } of allIssues) {
        const hash = Buffer.from(`${file.file}:${d}`).toString('base64').slice(0, 32);
        issues.push({
          description: d,
          check_name: `ai-validator/${check}`,
          fingerprint: hash,
          severity: file.totalScore < 50 ? 'major' : 'minor',
          location: {
            path: file.file,
            lines: { begin: 1 },
          },
        });
      }
    }

    return JSON.stringify(issues, null, 2);
  }
}

// ─── Helpers ───────────────────────────────────────────────────────

function slaLevelName(level: string): string {
  switch (level) {
    case 'L1': return 'Fast Scan';
    case 'L2': return 'Standard';
    case 'L3': return 'Deep Scan';
    default: return level;
  }
}

function severityOrder(severity: string): number {
  switch (severity) {
    case 'critical': return 0;
    case 'high': return 1;
    case 'medium': return 2;
    case 'low': return 3;
    case 'info': return 4;
    default: return 5;
  }
}

function mapToGitLabSeverity(severity: string): 'info' | 'minor' | 'major' | 'critical' | 'blocker' {
  switch (severity) {
    case 'critical': return 'blocker';
    case 'high': return 'critical';
    case 'medium': return 'major';
    case 'low': return 'minor';
    case 'info': return 'info';
    default: return 'minor';
  }
}

export default ReportGenerator;

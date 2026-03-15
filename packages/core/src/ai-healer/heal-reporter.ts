/**
 * Heal Report Generator
 *
 * Generates markdown reports for the AI auto-fix process.
 */

import type { HealReport, AutoFixResult } from './auto-fix-engine.js';
import type { AggregateScore } from '../scorer/scoring-engine.js';

// ─── Types ─────────────────────────────────────────────────────────

export interface ReportOptions {
  includeDiff?: boolean;
}

// ─── Reporter ──────────────────────────────────────────────────────

export class HealReporter {
  /**
   * Generate a markdown report for the heal operation.
   */
  generateReport(healReport: HealReport, options?: ReportOptions): string {
    const lines: string[] = [];
    lines.push('# AI Auto-Fix Report');
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(`- Files scanned: ${healReport.filesScanned}`);
    lines.push(`- Files healed: ${healReport.filesHealed}`);
    lines.push(`- Issues fixed: ${healReport.issuesFixed}`);
    lines.push(`- Average score improvement: +${healReport.avgScoreImprovement}`);
    lines.push(`- AI provider: ${healReport.providerName}/${healReport.modelName}`);
    lines.push('');

    // Fixed files
    const fixedFiles = healReport.results.filter(r => r.patches.length > 0);
    if (fixedFiles.length > 0) {
      lines.push('## Fixed Files');
      lines.push('');
      for (const result of fixedFiles) {
        lines.push(`### ${result.file}`);
        lines.push(`- Score: ${result.originalScore} → ${result.fixedScore} (+${result.fixedScore - result.originalScore})`);
        lines.push(`- Changes: ${result.changes} line(s)`);
        if (result.errors.length > 0) {
          for (const err of result.errors) {
            lines.push(`- ⚠ ${err}`);
          }
        }
        lines.push('');
      }
    }

    // Remaining issues
    const failedFiles = healReport.results.filter(r => r.patches.length === 0);
    if (failedFiles.length > 0) {
      lines.push('## Remaining Issues');
      lines.push('');
      for (const result of failedFiles) {
        lines.push(`### ${result.file}`);
        lines.push(`- Score: ${result.originalScore} (not healed)`);
        if (result.errors.length > 0) {
          for (const err of result.errors) {
            lines.push(`- Error: ${err}`);
          }
        }
        lines.push('');
      }
    }

    // Errors
    if (healReport.errors.length > 0) {
      lines.push('## Errors');
      lines.push('');
      for (const err of healReport.errors) {
        lines.push(`- ${err}`);
      }
      lines.push('');
    }

    // Diff appendix
    if (options?.includeDiff) {
      lines.push('## Diffs');
      lines.push('');
      for (const result of fixedFiles) {
        lines.push(`### ${result.file}`);
        lines.push('```diff');
        lines.push(result.patches[0].diff);
        lines.push('```');
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate a SARIF report for the heal operation.
   */
  generateSARIF(healReport: HealReport, aggregateBefore?: AggregateScore): string {
    const results: object[] = [];

    for (const result of healReport.results) {
      if (result.patches.length > 0) {
        results.push({
          ruleId: 'ocr-auto-fixed',
          level: 'note',
          message: {
            text: `Auto-fixed by AI. Score: ${result.originalScore} → ${result.fixedScore} (+${result.fixedScore - result.originalScore}). Changes: ${result.changes} line(s).`,
          },
          locations: [{
            physicalLocation: {
              artifactLocation: { uri: result.file },
            },
          }],
          fixNotifications: result.patches.map(patch => ({
            description: {
              text: `Applied fix to ${patch.file}`,
            },
          })),
        });
      }
    }

    const sarif = {
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
      version: '2.1.0',
      runs: [{
        tool: {
          driver: {
            name: 'Open Code Review — AI Auto-Fix',
            version: '2.0.0',
            informationUri: 'https://github.com/raye-deng/open-code-review',
            rules: [
              {
                id: 'ocr-auto-fixed',
                shortDescription: { text: 'File auto-fixed by AI' },
              },
            ],
          },
        },
        results,
        invocation: {
          executionSuccessful: healReport.errors.length === 0,
          endTimeUtc: healReport.timestamp,
          toolConfigurationNotifications: healReport.errors.map(err => ({
            level: 'error',
            message: { text: err },
          })),
        },
      }],
    };

    return JSON.stringify(sarif, null, 2);
  }
}

export default HealReporter;

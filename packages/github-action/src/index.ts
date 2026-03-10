/**
 * Open Code Review — GitHub Action (V4)
 *
 * Runs V4 AI code validation pipeline in GitHub Actions CI/CD.
 * Supports diff-only scanning, L1/L2 SLA levels, and PR comments.
 *
 * @since 0.4.0
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { execSync } from 'node:child_process';
import { glob } from 'glob';
import {
  V4Scanner,
  loadV4Config,
  scoreV4Results,
  parseDiff,
  filterByDiff,
  getScannableFiles,
} from '@open-code-review/core';
import type {
  V4ScanResult,
  V4ScoreResult,
  SLALevel,
  V4DetectorResult,
  DiffResult,
} from '@open-code-review/core';

// ─── Constants ─────────────────────────────────────────────────────

const VERSION = '0.4.0';
const COMMENT_MARKER = '<!-- ocr-report -->';
const SUPPORTED_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|py|java|go|kt|kts)$/;

// ─── Main ──────────────────────────────────────────────────────────

async function run(): Promise<void> {
  try {
    const startTime = Date.now();

    // ─── Read inputs ─────────────────────────────────────────────
    const sla = (core.getInput('sla') || 'L1').toUpperCase() as SLALevel;
    const threshold = parseInt(core.getInput('threshold') || '70', 10);
    const scanMode = core.getInput('scan-mode') || 'diff'; // diff | full
    const ollamaUrl = core.getInput('ollama-url') || '';
    const failOnLow = core.getInput('fail-on-low-score') !== 'false';
    const token = core.getInput('github-token');

    core.info(`Open Code Review V4 — SLA: ${sla} | Mode: ${scanMode} | Threshold: ${threshold}`);

    const projectRoot = resolve('.');

    // ─── Determine files to scan ─────────────────────────────────
    let diffResult: DiffResult | undefined;
    let filesToScan: string[] | undefined;

    if (scanMode === 'diff' && github.context.payload.pull_request && token) {
      core.info('Diff mode: fetching PR changed files...');

      try {
        const octokit = github.getOctokit(token);
        const prNumber = github.context.payload.pull_request.number;

        // Get PR files via GitHub API
        const { data: prFiles } = await octokit.rest.pulls.listFiles({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          pull_number: prNumber,
          per_page: 300,
        });

        // Also get the unified diff for line-level filtering
        try {
          const baseSha = github.context.payload.pull_request.base.sha;
          const headSha = github.context.payload.pull_request.head.sha;
          const diffText = execSync(`git diff ${baseSha}...${headSha}`, {
            cwd: projectRoot,
            encoding: 'utf-8',
            maxBuffer: 50 * 1024 * 1024,
          });
          diffResult = parseDiff(diffText);
        } catch {
          core.warning('Could not get unified diff for line-level filtering, using file-level filtering only');
        }

        // Filter to scannable files
        filesToScan = prFiles
          .filter(f => f.status !== 'removed')
          .filter(f => SUPPORTED_EXTENSIONS.test(f.filename))
          .map(f => f.filename);

        core.info(`Diff mode: ${filesToScan.length} scannable file(s) from ${prFiles.length} changed file(s)`);

        if (filesToScan.length === 0) {
          core.info('No scannable files in PR diff. Reporting perfect score.');
          setOutputs(100, 'A', 0);
          if (token && github.context.payload.pull_request) {
            await postOrUpdateComment(
              github.getOctokit(token),
              generateNoFilesComment(sla),
            );
          }
          return;
        }
      } catch (err) {
        core.warning(`Failed to get PR diff: ${err instanceof Error ? err.message : 'unknown'}. Falling back to full scan.`);
        filesToScan = undefined;
      }
    }

    // ─── Configure V4 Scanner ────────────────────────────────────
    const v4Config = loadV4Config({
      projectRoot,
      overrides: {
        projectRoot,
        sla,
        threshold,
        include: filesToScan ? filesToScan.map(f => `**/${f.split('/').pop()}`) : undefined,
      },
    });

    // L2 with Ollama: only if URL provided (CI usually doesn't have Ollama)
    if (sla !== 'L1' && ollamaUrl) {
      v4Config.ai = {
        ...v4Config.ai,
        embedding: { provider: 'local' }, // TF-IDF fallback
        llm: {
          provider: 'ollama',
          model: 'codellama',
          endpoint: ollamaUrl,
        },
      };
    } else if (sla !== 'L1') {
      // L2 without Ollama: use local TF-IDF embedding only
      v4Config.ai = {
        ...v4Config.ai,
        embedding: { provider: 'local' },
      };
    }

    // ─── Run scan ────────────────────────────────────────────────
    core.info('Scanning...');
    const scanner = new V4Scanner(v4Config);
    const result = await scanner.scan();

    // Apply diff filter if we have line-level diff data
    if (diffResult && result.issues.length > 0) {
      const originalCount = result.issues.length;
      result.issues = filterByDiff(result.issues, diffResult);
      core.info(`Diff filter: ${originalCount} → ${result.issues.length} issue(s) on changed lines`);
    }

    // ─── Score ───────────────────────────────────────────────────
    const score = scoreV4Results(result.issues, result.files.length, threshold);
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

    core.info(`Score: ${score.totalScore}/100 (${score.grade}) — ${result.issues.length} issue(s) in ${durationSec}s`);

    // ─── Generate PR comment ─────────────────────────────────────
    const report = generatePRComment(result, score, sla, scanMode, durationSec);

    // ─── Post/update PR comment ──────────────────────────────────
    if (token && github.context.payload.pull_request) {
      try {
        const octokit = github.getOctokit(token);
        await postOrUpdateComment(octokit, report);
        core.info('Posted/updated PR comment.');
      } catch (err) {
        core.warning(`Failed to post PR comment: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    // ─── Write JSON report ───────────────────────────────────────
    const jsonReport = {
      version: VERSION,
      sla,
      scanMode,
      score: score.totalScore,
      grade: score.grade,
      passed: score.passed,
      threshold,
      issues: result.issues,
      files: result.files,
      duration: durationSec,
      timestamp: new Date().toISOString(),
    };
    writeFileSync('ocr-report.json', JSON.stringify(jsonReport, null, 2));

    // ─── Set outputs ─────────────────────────────────────────────
    setOutputs(score.totalScore, score.grade, result.issues.length);

    // ─── Quality gate ────────────────────────────────────────────
    if (!score.passed && failOnLow) {
      core.setFailed(
        `Open Code Review: Score ${score.totalScore}/100 (${score.grade}) is below threshold ${threshold}`,
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Open Code Review failed: ${error.message}`);
    } else {
      core.setFailed('Open Code Review failed with an unknown error');
    }
  }
}

// ─── Output Helpers ────────────────────────────────────────────────

function setOutputs(score: number, grade: string, issuesCount: number): void {
  core.setOutput('score', score.toString());
  core.setOutput('grade', grade);
  core.setOutput('issues-count', issuesCount.toString());
}

// ─── PR Comment Generator ──────────────────────────────────────────

function generatePRComment(
  result: V4ScanResult,
  score: V4ScoreResult,
  sla: SLALevel,
  scanMode: string,
  durationSec: string,
): string {
  const statusEmoji = score.passed ? '✅' : '❌';
  const statusText = score.passed ? 'Passed' : 'Failed';

  const bySeverity = countBySeverity(result.issues);

  const lines: string[] = [
    COMMENT_MARKER,
    `## 🛡️ Open Code Review — ${sla} Report`,
    '',
    `**Score: ${score.totalScore}/100 (${score.grade})** ${statusEmoji} ${statusText} (threshold: ${score.threshold})`,
    '',
    '### Summary',
    '| Metric | Value |',
    '|--------|-------|',
    `| Files scanned | ${result.files.length}${scanMode === 'diff' ? ' (diff mode)' : ''} |`,
    `| Issues found | ${result.issues.length} |`,
    `| Critical | ${bySeverity.error} |`,
    `| Warnings | ${bySeverity.warning} |`,
    `| Info | ${bySeverity.info} |`,
    `| Duration | ${durationSec}s |`,
    '',
  ];

  // Dimension scores
  lines.push('### Dimensions');
  lines.push('| Dimension | Score | Issues |');
  lines.push('|-----------|-------|--------|');
  const dims = score.dimensions;
  lines.push(`| 🎯 AI Faithfulness | ${dims.faithfulness.score}/${dims.faithfulness.maxScore} (${dims.faithfulness.percentage}%) | ${dims.faithfulness.issueCount} |`);
  lines.push(`| 🔄 Code Freshness | ${dims.freshness.score}/${dims.freshness.maxScore} (${dims.freshness.percentage}%) | ${dims.freshness.issueCount} |`);
  lines.push(`| 🧠 Context Coherence | ${dims.coherence.score}/${dims.coherence.maxScore} (${dims.coherence.percentage}%) | ${dims.coherence.issueCount} |`);
  lines.push(`| ⚙️ Implementation Quality | ${dims.quality.score}/${dims.quality.maxScore} (${dims.quality.percentage}%) | ${dims.quality.issueCount} |`);
  lines.push('');

  // Issues (top 20)
  if (result.issues.length > 0) {
    lines.push('### Issues');
    lines.push('');

    const displayIssues = result.issues.slice(0, 20);
    for (const issue of displayIssues) {
      const severityIcon = issue.severity === 'error' ? '🔴' :
        issue.severity === 'warning' ? '⚠️' : 'ℹ️';
      const severityLabel = issue.severity === 'error' ? 'Critical' :
        issue.severity === 'warning' ? 'Warning' : 'Info';
      lines.push(`#### ${severityIcon} ${severityLabel}: ${issue.message}`);
      lines.push(`\`${issue.file}:${issue.line}\` — \`${issue.detectorId}\` (confidence: ${Math.round(issue.confidence * 100)}%)`);
      lines.push('');
    }

    if (result.issues.length > 20) {
      lines.push(`<details><summary>... and ${result.issues.length - 20} more issue(s)</summary>`);
      lines.push('');
      lines.push('See the full JSON report artifact for all issues.');
      lines.push('</details>');
      lines.push('');
    }
  } else {
    lines.push('### Issues');
    lines.push('');
    lines.push('✅ No issues found! Great job!');
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push(`<sub>🛡️ Open Code Review v${VERSION} | SLA: ${sla} | <a href="https://codes.evallab.ai">codes.evallab.ai</a></sub>`);

  return lines.join('\n');
}

function generateNoFilesComment(sla: SLALevel): string {
  return [
    COMMENT_MARKER,
    `## 🛡️ Open Code Review — ${sla} Report`,
    '',
    '**Score: 100/100 (A)** ✅ Passed',
    '',
    'No scannable code files were changed in this PR.',
    '',
    '---',
    `<sub>🛡️ Open Code Review v${VERSION} | SLA: ${sla} | <a href="https://codes.evallab.ai">codes.evallab.ai</a></sub>`,
  ].join('\n');
}

function countBySeverity(issues: V4DetectorResult[]): Record<string, number> {
  const counts: Record<string, number> = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) {
    counts[issue.severity] = (counts[issue.severity] || 0) + 1;
  }
  return counts;
}

// ─── PR Comment CRUD ───────────────────────────────────────────────

type Octokit = ReturnType<typeof github.getOctokit>;

async function postOrUpdateComment(octokit: Octokit, body: string): Promise<void> {
  const context = github.context;
  const prNumber = context.payload.pull_request?.number;
  if (!prNumber) return;

  const { owner, repo } = context.repo;

  // Search for existing OCR comment
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const existingComment = comments.find(c =>
    c.body?.includes(COMMENT_MARKER)
  );

  if (existingComment) {
    // Update existing comment
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existingComment.id,
      body,
    });
  } else {
    // Create new comment
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
  }
}

// ─── Run ───────────────────────────────────────────────────────────

run();

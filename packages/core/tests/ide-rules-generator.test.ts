/**
 * IDE Rules Generator Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IDERulesGenerator } from '../src/ai-healer/ide-rules-generator.js';
import type { AggregateScore } from '../src/scorer/scoring-engine.js';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Test Data ─────────────────────────────────────────────────────

function makeAggregateWithIssues(): AggregateScore {
  return {
    overallScore: 68,
    grade: 'D',
    totalFiles: 2,
    passedFiles: 0,
    failedFiles: 2,
    files: [
      {
        file: 'src/auth/login.ts',
        totalScore: 60,
        grade: 'D',
        passed: false,
        dimensions: {
          completeness: { name: 'Completeness', maxScore: 35, score: 15, issueCount: 2, details: ['hallucinated import: crypto-utils', 'unknown API: validateUserToken'] },
          coherence: { name: 'Coherence', maxScore: 25, score: 20, issueCount: 0, details: [] },
          consistency: { name: 'Consistency', maxScore: 20, score: 15, issueCount: 1, details: ['mixed async patterns'] },
          conciseness: { name: 'Conciseness', maxScore: 20, score: 10, issueCount: 1, details: ['duplicated auth checks'] },
        },
      },
      {
        file: 'src/api/users.ts',
        totalScore: 76,
        grade: 'C',
        passed: false,
        dimensions: {
          completeness: { name: 'Completeness', maxScore: 35, score: 30, issueCount: 0, details: [] },
          coherence: { name: 'Coherence', maxScore: 25, score: 20, issueCount: 0, details: [] },
          consistency: { name: 'Consistency', maxScore: 20, score: 16, issueCount: 0, details: [] },
          conciseness: { name: 'Conciseness', maxScore: 20, score: 10, issueCount: 1, details: ['over-engineering pattern detected'] },
        },
      },
    ],
    passed: false,
    timestamp: new Date().toISOString(),
  };
}

function makeCleanAggregate(): AggregateScore {
  return {
    overallScore: 95,
    grade: 'A',
    totalFiles: 1,
    passedFiles: 1,
    failedFiles: 0,
    files: [
      {
        file: 'src/index.ts',
        totalScore: 95,
        grade: 'A',
        passed: true,
        dimensions: {
          completeness: { name: 'Completeness', maxScore: 35, score: 35, issueCount: 0, details: [] },
          coherence: { name: 'Coherence', maxScore: 25, score: 25, issueCount: 0, details: [] },
          consistency: { name: 'Consistency', maxScore: 20, score: 20, issueCount: 0, details: [] },
          conciseness: { name: 'Conciseness', maxScore: 20, score: 15, issueCount: 0, details: [] },
        },
      },
    ],
    passed: true,
    timestamp: new Date().toISOString(),
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('IDERulesGenerator', () => {
  const tmpDir = `/tmp/ocr-ide-test-${Date.now()}`;
  let generator: IDERulesGenerator;

  beforeEach(() => {
    generator = new IDERulesGenerator();
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('should generate Cursor rules', () => {
    const report = makeAggregateWithIssues();
    const cursorRules = generator.generateCursorRules({ projectRoot: tmpDir, report });

    expect(cursorRules).toContain('---');
    expect(cursorRules).toContain('# AI Code Quality Rules');
    expect(cursorRules).toContain('Hallucinated imports');
    expect(cursorRules).toContain('src/auth/login.ts');
    expect(cursorRules).toContain('crypto-utils');
    expect(cursorRules).toContain('## General Guidelines');
  });

  it('should generate Copilot instructions', () => {
    const report = makeAggregateWithIssues();
    const copilot = generator.generateCopilotInstructions({ projectRoot: tmpDir, report });

    expect(copilot).toContain('# GitHub Copilot Instructions');
    expect(copilot).toContain('Known Issue Patterns');
    expect(copilot).toContain('Coding Rules for This Project');
  });

  it('should generate Augment instructions', () => {
    const report = makeAggregateWithIssues();
    const augment = generator.generateAugmentInstructions({ projectRoot: tmpDir, report });

    expect(augment).toContain('# Augment Coding Assistant Instructions');
    expect(augment).toContain('Frequently Detected Issues');
    expect(augment).toContain('No hallucinated imports');
  });

  it('should generate all files', () => {
    const report = makeAggregateWithIssues();
    const files = generator.generateAll({ projectRoot: tmpDir, report });

    expect(files).toHaveLength(3);
    expect(files[0].path).toBe('.cursor/rules/ocr-fixes.md');
    expect(files[1].path).toBe('.github/copilot-instructions.md');
    expect(files[2].path).toBe('.augment/instructions.md');
  });

  it('should write files to disk', () => {
    const report = makeAggregateWithIssues();
    const written = generator.writeAll({ projectRoot: tmpDir, report });

    expect(written).toHaveLength(3);
    for (const path of written) {
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, 'utf-8');
      expect(content.length).toBeGreaterThan(0);
    }
  });

  it('should include heal report in Cursor rules when provided', () => {
    const report = makeAggregateWithIssues();
    const healReport = {
      filesScanned: 2,
      filesToHeal: 2,
      filesHealed: 1,
      issuesFixed: 5,
      avgScoreImprovement: 12.4,
      results: [
        {
          file: 'src/auth/login.ts',
          originalScore: 60,
          fixedScore: 82,
          changes: 8,
          patches: [{ file: 'src/auth/login.ts', original: '', fixed: '', diff: '' }],
          errors: [],
        },
      ],
      providerName: 'ollama',
      modelName: 'qwen2.5-coder',
      timestamp: new Date().toISOString(),
      errors: [],
    };

    const cursorRules = generator.generateCursorRules({ projectRoot: tmpDir, report, healReport });
    expect(cursorRules).toContain('## Recently Fixed Issues');
    expect(cursorRules).toContain('src/auth/login.ts');
    expect(cursorRules).toContain('60 → 82');
  });

  it('should handle clean reports gracefully', () => {
    const report = makeCleanAggregate();
    const cursorRules = generator.generateCursorRules({ projectRoot: tmpDir, report });

    expect(cursorRules).toContain('No issues detected');
  });
});

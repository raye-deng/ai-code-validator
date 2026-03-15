/**
 * AutoFixEngine Unit Tests
 *
 * Tests the auto-fix engine with mocked AI responses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoFixEngine, simpleDiff } from '../src/ai-healer/auto-fix-engine.js';
import type { AggregateScore, FileScore } from '../src/scorer/scoring-engine.js';

// ─── Test Data ─────────────────────────────────────────────────────

function makeFileScore(overrides: Partial<FileScore> & { file: string }): FileScore {
  return {
    totalScore: 72,
    grade: 'C',
    passed: false,
    dimensions: {
      completeness: { name: 'Completeness', maxScore: 35, score: 25, issueCount: 1, details: ['hallucinated import: crypto-utils'] },
      coherence: { name: 'Coherence', maxScore: 25, score: 20, issueCount: 0, details: [] },
      consistency: { name: 'Consistency', maxScore: 20, score: 17, issueCount: 1, details: ['mixed callback and promise patterns'] },
      conciseness: { name: 'Conciseness', maxScore: 20, score: 10, issueCount: 1, details: ['duplicated error handler code'] },
    },
    ...overrides,
  };
}

function makeAggregateScore(files: FileScore[]): AggregateScore {
  const passedFiles = files.filter(f => f.passed).length;
  const overallScore = files.length > 0
    ? Math.round(files.reduce((s, f) => s + f.totalScore, 0) / files.length)
    : 100;

  return {
    overallScore,
    grade: overallScore >= 90 ? 'A' : overallScore >= 80 ? 'B' : overallScore >= 70 ? 'C' : 'D',
    totalFiles: files.length,
    passedFiles,
    failedFiles: files.length - passedFiles,
    files,
    passed: passedFiles === files.length,
    timestamp: new Date().toISOString(),
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('simpleDiff', () => {
  it('should return empty diff for identical strings', () => {
    const original = 'line1\nline2\nline3';
    const diff = simpleDiff(original, original, 'test.ts');
    expect(diff).toContain('--- test.ts (original)');
    expect(diff).toContain('+++ test.ts (fixed)');
  });

  it('should show changed lines', () => {
    const original = 'const a = 1;\nconst b = 2;\nconst c = 3;';
    const fixed = 'const a = 1;\nconst b = 99;\nconst c = 3;';
    const diff = simpleDiff(original, fixed, 'test.ts');
    expect(diff).toContain('-const b = 2;');
    expect(diff).toContain('+const b = 99;');
  });

  it('should show added lines', () => {
    const original = 'line1\nline3';
    const fixed = 'line1\nline2\nline3';
    const diff = simpleDiff(original, fixed, 'test.ts');
    expect(diff).toContain('+line2');
  });

  it('should show removed lines', () => {
    const original = 'line1\nline2\nline3';
    const fixed = 'line1\nline3';
    const diff = simpleDiff(original, fixed, 'test.ts');
    expect(diff).toContain('-line2');
  });
});

describe('AutoFixEngine', () => {
  let engine: AutoFixEngine;

  beforeEach(() => {
    engine = new AutoFixEngine();
  });

  describe('heal', () => {
    it('should return empty report when all files pass', async () => {
      const passingFile = makeFileScore({
        file: 'good.ts',
        totalScore: 98,
        grade: 'A',
        passed: true,
      });

      const report = makeAggregateScore([passingFile]);
      const result = await engine.heal(report, {
        projectRoot: '/tmp/test',
        threshold: 95,
      });

      expect(result.filesScanned).toBe(1);
      expect(result.filesToHeal).toBe(0);
      expect(result.filesHealed).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('should report files to heal when below threshold', async () => {
      const badFile = makeFileScore({ file: 'bad.ts', totalScore: 50 });

      const report = makeAggregateScore([badFile]);
      const result = await engine.heal(report, {
        projectRoot: '/tmp/test',
        threshold: 95,
        dryRun: true,
        outputPrompts: '/tmp/test/prompts',
      });

      expect(result.filesScanned).toBe(1);
      expect(result.filesToHeal).toBe(1);
      // In prompts mode, no actual healing happens
    });
  });

  describe('healFile', () => {
    it('should throw when file does not exist', async () => {
      const file = makeFileScore({ file: 'nonexistent.ts', totalScore: 50 });

      await expect(
        engine.healFile(file, { projectRoot: '/tmp/nonexistent' }),
      ).rejects.toThrow('File not found');
    });

    it('should generate output in prompts mode', async () => {
      const file = makeFileScore({ file: 'test.ts', totalScore: 50 });

      // Create a temp file
      const tmpDir = `/tmp/ocr-test-${Date.now()}`;
      const { mkdirSync: realMkdir, writeFileSync: realWrite } = await import('node:fs');
      realMkdir(tmpDir, { recursive: true });
      realWrite(`${tmpDir}/test.ts`, 'const a = 1;');

      const result = await engine.healFile(file, {
        projectRoot: tmpDir,
        outputPrompts: `${tmpDir}/prompts`,
      });

      expect(result.file).toBe('test.ts');
      expect(result.changes).toBe(0);
      expect(result.patches).toHaveLength(0);

      // Verify prompt file was written
      const { existsSync: realExists, readFileSync: realRead } = await import('node:fs');
      const promptFiles = realRead(`${tmpDir}/prompts/test.ts.prompt.md`, 'utf-8');
      expect(promptFiles.length).toBeGreaterThan(0);
    });
  });
});

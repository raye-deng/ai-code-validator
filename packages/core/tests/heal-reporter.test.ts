/**
 * Heal Reporter Tests
 */

import { describe, it, expect } from 'vitest';
import { HealReporter } from '../src/ai-healer/heal-reporter.js';
import type { HealReport } from '../src/ai-healer/auto-fix-engine.js';

// ─── Test Data ─────────────────────────────────────────────────────

function makeHealReport(overrides: Partial<HealReport> = {}): HealReport {
  return {
    filesScanned: 5,
    filesToHeal: 3,
    filesHealed: 2,
    issuesFixed: 7,
    avgScoreImprovement: 12.4,
    results: [
      {
        file: 'src/auth/login.ts',
        originalScore: 60,
        fixedScore: 82,
        changes: 8,
        patches: [{
          file: 'src/auth/login.ts',
          original: 'const x = Math.random();',
          fixed: 'const x = crypto.randomInt(100);',
          diff: '-const x = Math.random();\n+const x = crypto.randomInt(100);',
        }],
        errors: [],
      },
      {
        file: 'src/api/users.ts',
        originalScore: 68,
        fixedScore: 68,
        changes: 0,
        patches: [],
        errors: ['AI call failed: timeout'],
      },
    ],
    providerName: 'ollama',
    modelName: 'qwen2.5-coder',
    timestamp: '2026-03-15T08:00:00.000Z',
    errors: ['src/api/users.ts: timeout'],
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('HealReporter', () => {
  let reporter: HealReporter;

  it('should create reporter', () => {
    reporter = new HealReporter();
    expect(reporter).toBeDefined();
  });

  describe('generateReport', () => {
    it('should generate markdown report with summary', () => {
      reporter = new HealReporter();
      const report = makeHealReport();
      const markdown = reporter.generateReport(report);

      expect(markdown).toContain('# AI Auto-Fix Report');
      expect(markdown).toContain('## Summary');
      expect(markdown).toContain('Files scanned: 5');
      expect(markdown).toContain('Files healed: 2');
      expect(markdown).toContain('Issues fixed: 7');
      expect(markdown).toContain('+12.4');
      expect(markdown).toContain('ollama/qwen2.5-coder');
    });

    it('should list fixed files with score improvements', () => {
      reporter = new HealReporter();
      const report = makeHealReport();
      const markdown = reporter.generateReport(report);

      expect(markdown).toContain('## Fixed Files');
      expect(markdown).toContain('### src/auth/login.ts');
      expect(markdown).toContain('60 → 82');
      expect(markdown).toContain('+22');
      expect(markdown).toContain('Changes: 8 line(s)');
    });

    it('should list remaining issues', () => {
      reporter = new HealReporter();
      const report = makeHealReport();
      const markdown = reporter.generateReport(report);

      expect(markdown).toContain('## Remaining Issues');
      expect(markdown).toContain('### src/api/users.ts');
      expect(markdown).toContain('not healed');
    });

    it('should include errors section', () => {
      reporter = new HealReporter();
      const report = makeHealReport();
      const markdown = reporter.generateReport(report);

      expect(markdown).toContain('## Errors');
      expect(markdown).toContain('timeout');
    });

    it('should include diffs when requested', () => {
      reporter = new HealReporter();
      const report = makeHealReport();
      const markdown = reporter.generateReport(report, { includeDiff: true });

      expect(markdown).toContain('## Diffs');
      expect(markdown).toContain('```diff');
      expect(markdown).toContain('Math.random');
      expect(markdown).toContain('crypto.randomInt');
    });

    it('should handle empty results', () => {
      reporter = new HealReporter();
      const report = makeHealReport({
        filesHealed: 0,
        results: [],
      });
      const markdown = reporter.generateReport(report);

      expect(markdown).toContain('Files healed: 0');
    });

    it('should handle no errors', () => {
      reporter = new HealReporter();
      const report = makeHealReport({ errors: [] });
      const markdown = reporter.generateReport(report);

      expect(markdown).not.toContain('## Errors');
    });
  });

  describe('generateSARIF', () => {
    it('should generate valid SARIF JSON', () => {
      reporter = new HealReporter();
      const report = makeHealReport();
      const sarif = reporter.generateSARIF(report);

      const parsed = JSON.parse(sarif);
      expect(parsed.$schema).toContain('sarif-2.1');
      expect(parsed.version).toBe('2.1.0');
      expect(parsed.runs).toHaveLength(1);
      expect(parsed.runs[0].tool.driver.name).toContain('AI Auto-Fix');
    });

    it('should include fixed files in SARIF results', () => {
      reporter = new HealReporter();
      const report = makeHealReport();
      const sarif = reporter.generateSARIF(report);
      const parsed = JSON.parse(sarif);

      expect(parsed.runs[0].results).toHaveLength(1);
      expect(parsed.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri)
        .toBe('src/auth/login.ts');
    });

    it('should include errors in invocation', () => {
      reporter = new HealReporter();
      const report = makeHealReport();
      const sarif = reporter.generateSARIF(report);
      const parsed = JSON.parse(sarif);

      expect(parsed.runs[0].invocation.executionSuccessful).toBe(false);
      expect(parsed.runs[0].invocation.toolConfigurationNotifications).toHaveLength(1);
    });

    it('should set executionSuccessful when no errors', () => {
      reporter = new HealReporter();
      const report = makeHealReport({ errors: [] });
      const sarif = reporter.generateSARIF(report);
      const parsed = JSON.parse(sarif);

      expect(parsed.runs[0].invocation.executionSuccessful).toBe(true);
    });
  });
});

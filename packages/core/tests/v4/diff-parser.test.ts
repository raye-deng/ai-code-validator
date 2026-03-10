/**
 * Tests for diff parser and filter.
 */

import { describe, it, expect } from 'vitest';
import { parseDiff, parseNameStatus, filterByDiff, getScannableFiles } from '../../src/diff/index.js';
import type { DetectorResult } from '../../src/detectors/v4/types.js';
import type { DiffResult } from '../../src/diff/index.js';

// ─── parseDiff ─────────────────────────────────────────────────────

describe('parseDiff', () => {
  it('should return empty result for empty input', () => {
    const result = parseDiff('');
    expect(result.files).toHaveLength(0);
    expect(result.totalAdditions).toBe(0);
    expect(result.totalDeletions).toBe(0);
  });

  it('should parse a simple added file', () => {
    const diff = `diff --git a/src/utils.ts b/src/utils.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/utils.ts
@@ -0,0 +1,5 @@
+export function add(a: number, b: number): number {
+  return a + b;
+}
+
+export const PI = 3.14;
`;
    const result = parseDiff(diff);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('src/utils.ts');
    expect(result.files[0].status).toBe('added');
    expect(result.files[0].additions).toBe(5);
    expect(result.totalAdditions).toBe(5);
  });

  it('should parse a modified file with additions and deletions', () => {
    const diff = `diff --git a/src/app.ts b/src/app.ts
index abc1234..def5678 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -10,7 +10,8 @@ import { logger } from './logger';
 
 export function main() {
-  const old = true;
+  const updated = true;
+  const extra = false;
   console.log('hello');
 }
`;
    const result = parseDiff(diff);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('src/app.ts');
    expect(result.files[0].status).toBe('modified');
    expect(result.files[0].additions).toBe(2);
    expect(result.files[0].deletions).toBe(1);
    expect(result.files[0].changedLines).toContain(12);
    expect(result.files[0].changedLines).toContain(13);
  });

  it('should parse deleted file', () => {
    const diff = `diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index abc1234..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export function old() {
-  return true;
-}
`;
    const result = parseDiff(diff);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].status).toBe('deleted');
    expect(result.files[0].deletions).toBe(3);
  });

  it('should parse multiple files', () => {
    const diff = `diff --git a/src/a.ts b/src/a.ts
new file mode 100644
--- /dev/null
+++ b/src/a.ts
@@ -0,0 +1,2 @@
+export const A = 1;
+export const B = 2;
diff --git a/src/b.ts b/src/b.ts
index abc..def 100644
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,3 +1,4 @@
 import { A } from './a';
+import { B } from './a';
 
 console.log(A);
`;
    const result = parseDiff(diff);
    expect(result.files).toHaveLength(2);
    expect(result.files[0].path).toBe('src/a.ts');
    expect(result.files[0].status).toBe('added');
    expect(result.files[1].path).toBe('src/b.ts');
    expect(result.files[1].status).toBe('modified');
  });

  it('should handle renamed files', () => {
    const diff = `diff --git a/src/old-name.ts b/src/new-name.ts
similarity index 90%
rename from src/old-name.ts
rename to src/new-name.ts
index abc..def 100644
--- a/src/old-name.ts
+++ b/src/new-name.ts
@@ -1,3 +1,3 @@
-export const NAME = 'old';
+export const NAME = 'new';
 export const VALUE = 42;
`;
    const result = parseDiff(diff);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].status).toBe('renamed');
    expect(result.files[0].path).toBe('src/new-name.ts');
  });
});

// ─── parseNameStatus ───────────────────────────────────────────────

describe('parseNameStatus', () => {
  it('should return empty for empty input', () => {
    expect(parseNameStatus('')).toHaveLength(0);
  });

  it('should parse added files', () => {
    const output = 'A\tsrc/new-file.ts\n';
    const files = parseNameStatus(output);
    expect(files).toHaveLength(1);
    expect(files[0].status).toBe('added');
    expect(files[0].path).toBe('src/new-file.ts');
  });

  it('should parse modified files', () => {
    const output = 'M\tsrc/app.ts\n';
    const files = parseNameStatus(output);
    expect(files).toHaveLength(1);
    expect(files[0].status).toBe('modified');
    expect(files[0].path).toBe('src/app.ts');
  });

  it('should parse deleted files', () => {
    const output = 'D\tsrc/old.ts\n';
    const files = parseNameStatus(output);
    expect(files).toHaveLength(1);
    expect(files[0].status).toBe('deleted');
    expect(files[0].path).toBe('src/old.ts');
  });

  it('should parse renamed files', () => {
    const output = 'R100\tsrc/old.ts\tsrc/new.ts\n';
    const files = parseNameStatus(output);
    expect(files).toHaveLength(1);
    expect(files[0].status).toBe('renamed');
    expect(files[0].path).toBe('src/new.ts');
  });

  it('should parse multiple entries', () => {
    const output = `A\tsrc/new.ts
M\tsrc/app.ts
D\tsrc/old.ts
R100\tsrc/utils.ts\tsrc/helpers.ts`;
    const files = parseNameStatus(output);
    expect(files).toHaveLength(4);
    expect(files[0].status).toBe('added');
    expect(files[1].status).toBe('modified');
    expect(files[2].status).toBe('deleted');
    expect(files[3].status).toBe('renamed');
    expect(files[3].path).toBe('src/helpers.ts');
  });
});

// ─── filterByDiff ──────────────────────────────────────────────────

describe('filterByDiff', () => {
  const makeIssue = (file: string, line: number, endLine?: number): DetectorResult => ({
    detectorId: 'test-detector',
    severity: 'warning',
    category: 'ai-faithfulness',
    messageKey: 'test.issue',
    message: 'Test issue',
    file,
    line,
    endLine,
    confidence: 0.9,
  });

  it('should exclude issues not in diff', () => {
    const issues = [makeIssue('src/other.ts', 10)];
    const diff: DiffResult = {
      files: [{ path: 'src/app.ts', status: 'modified', additions: 1, deletions: 0, changedLines: [5] }],
      totalAdditions: 1,
      totalDeletions: 0,
    };
    expect(filterByDiff(issues, diff)).toHaveLength(0);
  });

  it('should include all issues for added files', () => {
    const issues = [
      makeIssue('src/new.ts', 1),
      makeIssue('src/new.ts', 50),
      makeIssue('src/new.ts', 100),
    ];
    const diff: DiffResult = {
      files: [{ path: 'src/new.ts', status: 'added', additions: 100, deletions: 0, changedLines: [] }],
      totalAdditions: 100,
      totalDeletions: 0,
    };
    expect(filterByDiff(issues, diff)).toHaveLength(3);
  });

  it('should only include issues on changed lines for modified files', () => {
    const issues = [
      makeIssue('src/app.ts', 5),   // on changed line
      makeIssue('src/app.ts', 10),  // NOT on changed line
      makeIssue('src/app.ts', 15),  // on changed line
    ];
    const diff: DiffResult = {
      files: [{ path: 'src/app.ts', status: 'modified', additions: 2, deletions: 1, changedLines: [5, 15, 20] }],
      totalAdditions: 2,
      totalDeletions: 1,
    };
    const filtered = filterByDiff(issues, diff);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].line).toBe(5);
    expect(filtered[1].line).toBe(15);
  });

  it('should exclude issues on deleted files', () => {
    const issues = [makeIssue('src/old.ts', 1)];
    const diff: DiffResult = {
      files: [{ path: 'src/old.ts', status: 'deleted', additions: 0, deletions: 10, changedLines: [] }],
      totalAdditions: 0,
      totalDeletions: 10,
    };
    expect(filterByDiff(issues, diff)).toHaveLength(0);
  });

  it('should match files by suffix', () => {
    const issues = [makeIssue('packages/core/src/app.ts', 5)];
    const diff: DiffResult = {
      files: [{ path: 'src/app.ts', status: 'modified', additions: 1, deletions: 0, changedLines: [5] }],
      totalAdditions: 1,
      totalDeletions: 0,
    };
    expect(filterByDiff(issues, diff)).toHaveLength(1);
  });

  it('should handle issues with endLine spanning changed lines', () => {
    const issues = [makeIssue('src/app.ts', 8, 12)]; // spans lines 8-12
    const diff: DiffResult = {
      files: [{ path: 'src/app.ts', status: 'modified', additions: 1, deletions: 0, changedLines: [10] }],
      totalAdditions: 1,
      totalDeletions: 0,
    };
    expect(filterByDiff(issues, diff)).toHaveLength(1);
  });
});

// ─── getScannableFiles ─────────────────────────────────────────────

describe('getScannableFiles', () => {
  it('should exclude deleted files', () => {
    const diff: DiffResult = {
      files: [
        { path: 'src/app.ts', status: 'modified', additions: 1, deletions: 0, changedLines: [] },
        { path: 'src/old.ts', status: 'deleted', additions: 0, deletions: 5, changedLines: [] },
      ],
      totalAdditions: 1,
      totalDeletions: 5,
    };
    const files = getScannableFiles(diff);
    expect(files).toEqual(['src/app.ts']);
  });

  it('should filter by supported extensions', () => {
    const diff: DiffResult = {
      files: [
        { path: 'src/app.ts', status: 'modified', additions: 1, deletions: 0, changedLines: [] },
        { path: 'README.md', status: 'modified', additions: 1, deletions: 0, changedLines: [] },
        { path: 'src/main.py', status: 'added', additions: 5, deletions: 0, changedLines: [] },
        { path: 'config.yml', status: 'modified', additions: 1, deletions: 0, changedLines: [] },
      ],
      totalAdditions: 8,
      totalDeletions: 0,
    };
    const files = getScannableFiles(diff);
    expect(files).toEqual(['src/app.ts', 'src/main.py']);
  });

  it('should support custom extensions', () => {
    const diff: DiffResult = {
      files: [
        { path: 'src/app.ts', status: 'modified', additions: 1, deletions: 0, changedLines: [] },
        { path: 'src/main.rs', status: 'added', additions: 5, deletions: 0, changedLines: [] },
      ],
      totalAdditions: 6,
      totalDeletions: 0,
    };
    const files = getScannableFiles(diff, ['.rs']);
    expect(files).toEqual(['src/main.rs']);
  });
});

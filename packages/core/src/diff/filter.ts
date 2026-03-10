/**
 * Diff Filter — Filter scan results to only include issues in changed lines.
 *
 * Used in diff-only scanning mode to restrict reported issues to the
 * lines actually modified in a PR/MR.
 *
 * @since 0.4.0
 */

import type { DetectorResult } from '../detectors/v4/types.js';
import type { DiffResult } from './parser.js';

/**
 * Filter V4 DetectorResults to only include issues in changed lines.
 *
 * Logic:
 * - If the issue's file is not in the diff, exclude it
 * - If the file was newly added, include all issues (all lines are new)
 * - If the file was modified/renamed, only include issues on changed lines
 * - Deleted files are excluded (nothing to scan)
 *
 * @param issues - All detected issues
 * @param diff - Parsed diff result
 * @returns Filtered issues that are on changed lines
 */
export function filterByDiff(issues: DetectorResult[], diff: DiffResult): DetectorResult[] {
  return issues.filter(issue => {
    // Find matching diff file — match by exact path or suffix
    const diffFile = diff.files.find(f =>
      f.path === issue.file ||
      issue.file.endsWith(f.path) ||
      f.path.endsWith(issue.file)
    );

    // If the file is not in the diff, exclude the issue
    if (!diffFile) return false;

    // Deleted files have no issues to report
    if (diffFile.status === 'deleted') return false;

    // New files: all lines are considered changed
    if (diffFile.status === 'added') return true;

    // Modified/renamed files: check if the issue line is in changed lines
    // If changedLines is empty (e.g. from name-status parse), include all issues
    if (diffFile.changedLines.length === 0) return true;

    // Check if the issue line falls within changed lines
    // Also consider a small window around changed lines for context
    return diffFile.changedLines.includes(issue.line) ||
      (issue.endLine !== undefined && diffFile.changedLines.some(
        cl => cl >= issue.line && cl <= issue.endLine!
      ));
  });
}

/**
 * Get the list of scannable file paths from a diff result.
 *
 * Filters out deleted files and files with unsupported extensions.
 *
 * @param diff - Parsed diff result
 * @param supportedExtensions - Extensions to include (e.g. ['.ts', '.js', '.py'])
 * @returns Array of file paths to scan
 */
export function getScannableFiles(
  diff: DiffResult,
  supportedExtensions: string[] = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.kt', '.kts'],
): string[] {
  return diff.files
    .filter(f => f.status !== 'deleted')
    .filter(f => {
      const ext = '.' + f.path.split('.').pop()?.toLowerCase();
      return supportedExtensions.includes(ext);
    })
    .map(f => f.path);
}

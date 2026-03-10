/**
 * Diff Parser — Parse unified diff format and git name-status output.
 *
 * Extracts changed files and line ranges from unified diffs,
 * used for diff-only scanning in PR/MR workflows.
 *
 * @since 0.4.0
 */

// ─── Types ────────────────────────────────────────────────────────

/**
 * Represents a single file in a diff.
 */
export interface DiffFile {
  /** File path (relative to project root) */
  path: string;
  /** Change status */
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  /** Number of added lines */
  additions: number;
  /** Number of deleted lines */
  deletions: number;
  /** Changed line numbers (in the new version of the file) */
  changedLines: number[];
}

/**
 * Parsed diff result containing all changed files.
 */
export interface DiffResult {
  /** All changed files */
  files: DiffFile[];
  /** Total additions across all files */
  totalAdditions: number;
  /** Total deletions across all files */
  totalDeletions: number;
}

// ─── Unified Diff Parser ──────────────────────────────────────────

/**
 * Parse unified diff text (output of `git diff`) into structured DiffResult.
 *
 * Handles standard unified diff format with `---`, `+++`, `@@` hunk headers,
 * and `+`/`-` line markers.
 *
 * @param diffText - Raw unified diff text
 * @returns Parsed DiffResult
 */
export function parseDiff(diffText: string): DiffResult {
  const files: DiffFile[] = [];
  let totalAdditions = 0;
  let totalDeletions = 0;

  if (!diffText || !diffText.trim()) {
    return { files, totalAdditions, totalDeletions };
  }

  const lines = diffText.split('\n');
  let currentFile: DiffFile | null = null;
  let newLineNum = 0;
  let oldLineNum = 0;
  let inHunk = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // New file diff header: diff --git a/path b/path
    if (line.startsWith('diff --git ')) {
      // Save previous file
      if (currentFile) {
        files.push(currentFile);
      }

      // Reset hunk tracking
      inHunk = false;
      newLineNum = 0;
      oldLineNum = 0;

      // Extract file path from "diff --git a/path b/path"
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (match) {
        const oldPath = match[1];
        const newPath = match[2];
        currentFile = {
          path: newPath,
          status: oldPath !== newPath ? 'renamed' : 'modified',
          additions: 0,
          deletions: 0,
          changedLines: [],
        };
      }
      continue;
    }

    // Detect new file: "new file mode"
    if (line.startsWith('new file mode') && currentFile) {
      currentFile.status = 'added';
      continue;
    }

    // Detect deleted file: "deleted file mode"
    if (line.startsWith('deleted file mode') && currentFile) {
      currentFile.status = 'deleted';
      continue;
    }

    // Detect rename: "rename from" / "rename to"
    if (line.startsWith('rename from') && currentFile) {
      currentFile.status = 'renamed';
      continue;
    }
    if (line.startsWith('rename to') && currentFile) {
      const match = line.match(/^rename to (.+)$/);
      if (match) {
        currentFile.path = match[1];
      }
      continue;
    }

    // Hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    if (line.startsWith('@@') && currentFile) {
      const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunkMatch) {
        oldLineNum = parseInt(hunkMatch[1], 10);
        newLineNum = parseInt(hunkMatch[2], 10);
        inHunk = true;
      }
      continue;
    }

    // Skip --- and +++ header lines
    if (line.startsWith('---') || line.startsWith('+++')) {
      continue;
    }

    if (!inHunk || !currentFile) continue;

    // Added line
    if (line.startsWith('+')) {
      currentFile.additions++;
      if (newLineNum > 0) {
        currentFile.changedLines.push(newLineNum);
      }
      totalAdditions++;
      newLineNum++;
      continue;
    }

    // Deleted line
    if (line.startsWith('-')) {
      currentFile.deletions++;
      totalDeletions++;
      // Track the position in the new file for filtering context
      if (newLineNum > 0) {
        currentFile.changedLines.push(newLineNum);
      }
      oldLineNum++;
      continue;
    }

    // Context line (space prefix)
    if (line.startsWith(' ') || line === '') {
      newLineNum++;
      oldLineNum++;
      continue;
    }
  }

  // Save last file
  if (currentFile) {
    files.push(currentFile);
  }

  // Deduplicate changedLines for each file
  for (const file of files) {
    file.changedLines = [...new Set(file.changedLines)].sort((a, b) => a - b);
  }

  return { files, totalAdditions, totalDeletions };
}

// ─── Name-Status Parser ────────────────────────────────────────────

/**
 * Parse `git diff --name-status` output into DiffFile array.
 *
 * Each line is in format: `STATUS\tFILENAME` or `STATUS\tOLD\tNEW` (for renames).
 *
 * Status codes:
 * - A: Added
 * - M: Modified
 * - D: Deleted
 * - R: Renamed (with similarity percentage, e.g. R100)
 * - C: Copied
 *
 * @param output - Raw `git diff --name-status` output
 * @returns Array of DiffFile (without line-level info)
 */
export function parseNameStatus(output: string): DiffFile[] {
  const files: DiffFile[] = [];

  if (!output || !output.trim()) {
    return files;
  }

  const lines = output.trim().split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Split by tab
    const parts = trimmed.split('\t');
    if (parts.length < 2) continue;

    const statusCode = parts[0].charAt(0).toUpperCase();
    let path: string;
    let status: DiffFile['status'];

    switch (statusCode) {
      case 'A':
        status = 'added';
        path = parts[1];
        break;
      case 'M':
        status = 'modified';
        path = parts[1];
        break;
      case 'D':
        status = 'deleted';
        path = parts[1];
        break;
      case 'R':
        status = 'renamed';
        path = parts.length >= 3 ? parts[2] : parts[1]; // new path
        break;
      case 'C':
        status = 'added'; // Treat copies as additions
        path = parts.length >= 3 ? parts[2] : parts[1];
        break;
      default:
        // Unknown status, treat as modified
        status = 'modified';
        path = parts[1];
    }

    files.push({
      path,
      status,
      additions: 0,
      deletions: 0,
      changedLines: [], // Not available from name-status
    });
  }

  return files;
}

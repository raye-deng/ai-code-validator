/**
 * Diff Module — Parse and filter diffs for PR/MR scanning.
 *
 * @since 0.4.0
 */

export { parseDiff, parseNameStatus } from './parser.js';
export type { DiffFile, DiffResult } from './parser.js';

export { filterByDiff, getScannableFiles } from './filter.js';

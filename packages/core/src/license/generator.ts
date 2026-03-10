/**
 * License Key Generator
 *
 * Generates and validates AICV license keys in the format:
 * AICV-XXXX-XXXX-XXXX-XXXX
 *
 * Each group contains 4 characters from a set that excludes
 * easily confused characters (I/O/0/1/L).
 *
 * @since 0.3.0
 */

import { randomInt } from 'node:crypto';

/**
 * Character set for license key generation.
 * Excludes I, O, 0, 1, L to avoid confusion in manual entry.
 */
const LICENSE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** License key prefix */
const LICENSE_PREFIX = 'AICV';

/** Number of character groups after the prefix */
const GROUP_COUNT = 4;

/** Characters per group */
const GROUP_SIZE = 4;

/**
 * Regular expression pattern for valid license keys.
 * Format: AICV-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}
 */
const LICENSE_FORMAT_REGEX =
  /^AICV-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

/**
 * Generate a new License Key.
 *
 * Format: AICV-XXXX-XXXX-XXXX-XXXX
 * Each X is a character from: ABCDEFGHJKLMNPQRSTUVWXYZ23456789
 *
 * @returns A new license key string
 *
 * @example
 * ```ts
 * const key = generateLicenseKey();
 * // => "AICV-8F3A-K9D2-P7X1-Q4M6"
 * ```
 */
export function generateLicenseKey(): string {
  const parts: string[] = [];

  for (let g = 0; g < GROUP_COUNT; g++) {
    let part = '';
    for (let i = 0; i < GROUP_SIZE; i++) {
      part += LICENSE_CHARS[randomInt(LICENSE_CHARS.length)];
    }
    parts.push(part);
  }

  return `${LICENSE_PREFIX}-${parts.join('-')}`;
}

/**
 * Validate whether a string matches the license key format.
 *
 * Does NOT verify the key against the API — only checks format.
 *
 * @param key - String to validate
 * @returns true if the key matches AICV-XXXX-XXXX-XXXX-XXXX format
 *
 * @example
 * ```ts
 * isValidLicenseFormat('AICV-8F3A-K9D2-P7X1-Q4M6'); // true
 * isValidLicenseFormat('AICV-0000-1111-OOOO-LLLL'); // false (contains 0, 1, O, L)
 * isValidLicenseFormat('invalid'); // false
 * ```
 */
export function isValidLicenseFormat(key: string): boolean {
  return LICENSE_FORMAT_REGEX.test(key);
}

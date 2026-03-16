import type { CodeUnit } from '../../ir/types.js';
import type { V4Detector, DetectorResult, DetectorContext } from './types.js';

interface UnicodeRange {
  start: number;
  end: number;
  label: string;
}

const INVISIBLE_RANGES: UnicodeRange[] = [
  { start: 0xFE00, end: 0xFE0F, label: 'Variation Selector' },
  { start: 0xFE20, end: 0xFE2F, label: 'Variation Selector' },
  { start: 0xE0100, end: 0xE01EF, label: 'Variation Selector Supplement' },
  { start: 0xE0001, end: 0xE007F, label: 'Language Tag' },
  { start: 0xE000, end: 0xF8FF, label: 'Private Use Area (PUA)' },
  { start: 0xFDD0, end: 0xFDEF, label: 'Noncharacter' },
  { start: 0x2060, end: 0x2064, label: 'Invisible Format Character' },
  { start: 0x202A, end: 0x202E, label: 'Bidi Control' },
  { start: 0x2066, end: 0x2069, label: 'Bidi Control' },
];

const INVISIBLE_CODEPOINTS = new Set<number>([
  0x200B, // ZWSP
  0x200C, // ZWNJ
  0x200D, // ZWJ
  0xFEFF, // BOM/ZWNBSP
]);

interface NoncharacterPlane {
  plane: number;
  offset: number;
}

const NONCHARACTER_LAST_TWO: NoncharacterPlane[] = [];
for (let plane = 0; plane <= 16; plane++) {
  NONCHARACTER_LAST_TWO.push({ plane, offset: 0xFFFE });
  NONCHARACTER_LAST_TWO.push({ plane, offset: 0xFFFF });
}

const SUPPLEMENTARY_PUA_RANGES: UnicodeRange[] = [
  { start: 0xF0000, end: 0xFFFFD, label: 'Supplementary PUA-A' },
  { start: 0x100000, end: 0x10FFFD, label: 'Supplementary PUA-B' },
];

function categorizeCodePoint(cp: number): string | null {
  for (const range of INVISIBLE_RANGES) {
    if (cp >= range.start && cp <= range.end) return range.label;
  }
  if (INVISIBLE_CODEPOINTS.has(cp)) {
    const names: Record<number, string> = {
      0x200B: 'Zero Width Space',
      0x200C: 'Zero Width Non-Joiner',
      0x200D: 'Zero Width Joiner',
      0xFEFF: 'BOM/Zero Width No-Break Space',
    };
    return names[cp] ?? 'Zero Width Character';
  }
  for (const nc of NONCHARACTER_LAST_TWO) {
    if (cp === nc.plane * 0x10000 + nc.offset) return 'Noncharacter';
  }
  for (const range of SUPPLEMENTARY_PUA_RANGES) {
    if (cp >= range.start && cp <= range.end) return range.label;
  }
  return null;
}

function escapeChar(cp: number): string {
  if (cp <= 0xFFFF) return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
  return `U+${cp.toString(16).toUpperCase().padStart(6, '0')}`;
}

export class UnicodeInvisibleDetector implements V4Detector {
  readonly id = 'unicode-invisible';
  readonly name = 'Unicode Invisible Character Detector';
  readonly category = 'ai-faithfulness' as const;
  readonly supportedLanguages: string[] = [];

  async detect(units: CodeUnit[], _context: DetectorContext): Promise<DetectorResult[]> {
    const results: DetectorResult[] = [];

    for (const unit of units) {
      if (unit.kind !== 'file') continue;

      const lines = unit.source.split('\n');
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        for (let col = 0; col < line.length; col++) {
          const cp = line.codePointAt(col);
          if (cp === undefined) continue;

          const category = categorizeCodePoint(cp);
          if (!category) continue;

          results.push({
            detectorId: this.id,
            severity: 'error',
            category: 'ai-faithfulness',
            messageKey: 'unicode-invisible.found',
            message: `Invisible Unicode character (${category}) detected: ${escapeChar(cp)}. This can be used to hide malicious code or confuse code reviewers.`,
            file: unit.file,
            line: lineIdx + 1,
            confidence: 0.95,
            metadata: {
              codePoint: cp,
              hex: escapeChar(cp),
              category,
              column: col + 1,
            },
          });
        }
      }
    }

    return results;
  }
}

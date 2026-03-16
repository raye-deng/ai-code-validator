import { describe, it, expect } from 'vitest';
import { UnicodeInvisibleDetector } from '../../src/detectors/v4/unicode-invisible.js';
import type { CodeUnit, DetectorContext } from '../../src/ir/types.js';
import { createCodeUnit } from '../../src/ir/types.js';

function makeFileUnit(source: string, file = 'test.ts'): CodeUnit {
  return createCodeUnit({
    id: `file:${file}`,
    file,
    language: 'typescript',
    kind: 'file',
    location: { startLine: 0, startColumn: 0, endLine: source.split('\n').length, endColumn: 0 },
    source,
  });
}

const emptyContext: DetectorContext = { projectRoot: '/tmp', allFiles: [] };

describe('UnicodeInvisibleDetector', () => {
  const detector = new UnicodeInvisibleDetector();

  it('should not flag clean source code', async () => {
    const unit = makeFileUnit('const x = 1;\nconsole.log(x);');
    const results = await detector.detect([unit], emptyContext);
    expect(results).toHaveLength(0);
  });

  it('should detect zero-width space (U+200B)', async () => {
    const unit = makeFileUnit('const x\u200B= 1;');
    const results = await detector.detect([unit], emptyContext);
    expect(results).toHaveLength(1);
    expect(results[0].message).toContain('Zero Width Space');
    expect(results[0].metadata.hex).toBe('U+200B');
    expect(results[0].line).toBe(1);
  });

  it('should detect zero-width non-joiner (U+200C)', async () => {
    const unit = makeFileUnit('hello\u200Cworld');
    const results = await detector.detect([unit], emptyContext);
    expect(results).toHaveLength(1);
    expect(results[0].metadata.hex).toBe('U+200C');
  });

  it('should detect zero-width joiner (U+200D)', async () => {
    const unit = makeFileUnit('hello\u200Dworld');
    const results = await detector.detect([unit], emptyContext);
    expect(results).toHaveLength(1);
    expect(results[0].metadata.hex).toBe('U+200D');
  });

  it('should detect BOM/ZWNBSP (U+FEFF)', async () => {
    const unit = makeFileUnit('\uFEFFconst x = 1;');
    const results = await detector.detect([unit], emptyContext);
    expect(results).toHaveLength(1);
    expect(results[0].metadata.hex).toBe('U+FEFF');
  });

  it('should detect variation selectors (U+FE00-FE0F)', async () => {
    const unit = makeFileUnit('a\uFE0F');
    const results = await detector.detect([unit], emptyContext);
    expect(results).toHaveLength(1);
    expect(results[0].message).toContain('Variation Selector');
    expect(results[0].metadata.hex).toBe('U+FE0F');
  });

  it('should detect PUA characters (U+E000-U+F8FF)', async () => {
    const unit = makeFileUnit('test\uE000data');
    const results = await detector.detect([unit], emptyContext);
    expect(results).toHaveLength(1);
    expect(results[0].message).toContain('Private Use Area');
  });

  it('should detect noncharacters (U+FDD0-U+FDEF)', async () => {
    const unit = makeFileUnit('x\uFDD0y');
    const results = await detector.detect([unit], emptyContext);
    expect(results).toHaveLength(1);
    expect(results[0].message).toContain('Noncharacter');
  });

  it('should detect bidi control characters (U+202A-U+202E)', async () => {
    const unit = makeFileUnit('text\u202Ereversed');
    const results = await detector.detect([unit], emptyContext);
    expect(results).toHaveLength(1);
    expect(results[0].message).toContain('Bidi Control');
    expect(results[0].metadata.hex).toBe('U+202E');
  });

  it('should detect invisible format characters (U+2060-U+2064)', async () => {
    const unit = makeFileUnit('a\u2061b');
    const results = await detector.detect([unit], emptyContext);
    expect(results).toHaveLength(1);
    expect(results[0].message).toContain('Invisible Format Character');
  });

  it('should detect language tags (U+E0001-U+E007F)', async () => {
    const unit = makeFileUnit('a\u{E0001}b');
    const results = await detector.detect([unit], emptyContext);
    expect(results).toHaveLength(1);
    expect(results[0].message).toContain('Language Tag');
  });

  it('should report correct line numbers for multi-line files', async () => {
    const unit = makeFileUnit('line1\nline2\u200B\nline3');
    const results = await detector.detect([unit], emptyContext);
    expect(results).toHaveLength(1);
    expect(results[0].line).toBe(2);
  });

  it('should report correct column positions', async () => {
    const unit = makeFileUnit('ab\u200Bcd');
    const results = await detector.detect([unit], emptyContext);
    expect(results).toHaveLength(1);
    expect(results[0].metadata.column).toBe(3);
  });

  it('should detect multiple invisible characters on the same line', async () => {
    const unit = makeFileUnit('a\u200Bb\u200Cc');
    const results = await detector.detect([unit], emptyContext);
    expect(results).toHaveLength(2);
  });

  it('should detect characters across multiple files', async () => {
    const unit1 = makeFileUnit('clean file', 'clean.ts');
    const unit2 = makeFileUnit('dirty\u200Bfile', 'dirty.ts');
    const results = await detector.detect([unit1, unit2], emptyContext);
    expect(results).toHaveLength(1);
    expect(results[0].file).toBe('dirty.ts');
  });

  it('should have high confidence and error severity', async () => {
    const unit = makeFileUnit('x\u200By');
    const results = await detector.detect([unit], emptyContext);
    expect(results[0].severity).toBe('error');
    expect(results[0].confidence).toBe(0.95);
  });
});

/**
 * ContextCoherenceDetector Tests
 *
 * Tests detection of AI context window inconsistencies:
 * unused definitions, inconsistent imports, duplicate functions,
 * and undefined references.
 *
 * @since 0.4.0 (V4)
 */

import { describe, it, expect } from 'vitest';
import { ContextCoherenceDetector } from '../../src/detectors/v4/context-coherence.js';
import type { DetectorContext } from '../../src/detectors/v4/types.js';
import type { CodeUnit } from '../../src/ir/types.js';
import { createCodeUnit } from '../../src/ir/types.js';

// ─── Helpers ───────────────────────────────────────────────────────

function makeFileUnit(overrides: Partial<CodeUnit>): CodeUnit {
  return createCodeUnit({
    id: `file:${overrides.file || 'test.ts'}`,
    file: overrides.file || 'test.ts',
    language: overrides.language || 'typescript',
    kind: 'file',
    location: { startLine: 0, startColumn: 0, endLine: 100, endColumn: 0 },
    source: '',
    ...overrides,
  });
}

function makeFuncUnit(overrides: Partial<CodeUnit> & { name?: string }): CodeUnit {
  const name = overrides.name || 'testFunc';
  return createCodeUnit({
    id: `func:${overrides.file || 'test.ts'}:${name}`,
    file: overrides.file || 'test.ts',
    language: overrides.language || 'typescript',
    kind: 'function',
    location: { startLine: overrides.location?.startLine ?? 10, startColumn: 0, endLine: overrides.location?.endLine ?? 20, endColumn: 0 },
    source: '',
    parentId: overrides.parentId || `file:${overrides.file || 'test.ts'}`,
    definitions: overrides.definitions || [
      { name, kind: 'function', line: overrides.location?.startLine ?? 10, exported: false },
    ],
    ...overrides,
  });
}

function createContext(): DetectorContext {
  return {
    projectRoot: '/project',
    allFiles: ['test.ts'],
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('ContextCoherenceDetector', () => {
  const detector = new ContextCoherenceDetector();

  it('should have correct metadata', () => {
    expect(detector.id).toBe('context-coherence');
    expect(detector.name).toBe('Context Coherence Detector');
    expect(detector.category).toBe('context-coherence');
    expect(detector.supportedLanguages).toEqual([]);
  });

  // ── Analysis 1: Unused non-exported definitions ────────────────

  it('should detect unused non-exported function', async () => {
    const fileUnit = makeFileUnit({
      definitions: [
        { name: 'helperFunc', kind: 'function', line: 5, exported: false },
      ],
    });

    // No references to helperFunc anywhere
    const results = await detector.detect([fileUnit], createContext());
    const unused = results.find(
      r => r.metadata?.analysisType === 'unused-definition' && r.metadata?.symbolName === 'helperFunc',
    );
    expect(unused).toBeDefined();
    expect(unused!.severity).toBe('info');
    expect(unused!.message).toContain('helperFunc');
    expect(unused!.message).toContain('never used');
  });

  it('should not flag exported definitions as unused', async () => {
    const fileUnit = makeFileUnit({
      definitions: [
        { name: 'publicFunc', kind: 'function', line: 5, exported: true },
      ],
    });

    const results = await detector.detect([fileUnit], createContext());
    const unused = results.filter(r => r.metadata?.symbolName === 'publicFunc');
    expect(unused).toHaveLength(0);
  });

  it('should not flag definitions that are referenced', async () => {
    const fileUnit = makeFileUnit({
      definitions: [
        { name: 'usedHelper', kind: 'function', line: 5, exported: false },
      ],
      references: [
        { name: 'usedHelper', line: 20, resolved: false },
      ],
    });

    const results = await detector.detect([fileUnit], createContext());
    const unused = results.filter(
      r => r.metadata?.analysisType === 'unused-definition' && r.metadata?.symbolName === 'usedHelper',
    );
    expect(unused).toHaveLength(0);
  });

  it('should not flag definitions that are called', async () => {
    const fileUnit = makeFileUnit({
      definitions: [
        { name: 'calledFunc', kind: 'function', line: 5, exported: false },
      ],
      calls: [
        { callee: 'calledFunc', method: 'calledFunc', line: 20, argCount: 0 },
      ],
    });

    const results = await detector.detect([fileUnit], createContext());
    const unused = results.filter(
      r => r.metadata?.analysisType === 'unused-definition' && r.metadata?.symbolName === 'calledFunc',
    );
    expect(unused).toHaveLength(0);
  });

  // ── Analysis 2: Inconsistent imports ───────────────────────────

  it('should detect inconsistent imports (same symbol from different modules)', async () => {
    const fileUnit = makeFileUnit({
      imports: [
        { module: 'fs', symbols: ['readFile'], line: 0, isRelative: false, raw: "import { readFile } from 'fs'" },
        { module: 'fs/promises', symbols: ['readFile'], line: 1, isRelative: false, raw: "import { readFile } from 'fs/promises'" },
      ],
    });

    const results = await detector.detect([fileUnit], createContext());
    const inconsistent = results.find(r => r.metadata?.analysisType === 'inconsistent-import');
    expect(inconsistent).toBeDefined();
    expect(inconsistent!.severity).toBe('warning');
    expect(inconsistent!.message).toContain('readFile');
    expect(inconsistent!.message).toContain('multiple modules');
  });

  it('should not flag different symbols from different modules', async () => {
    const fileUnit = makeFileUnit({
      imports: [
        { module: 'fs', symbols: ['readFile'], line: 0, isRelative: false, raw: "import { readFile } from 'fs'" },
        { module: 'path', symbols: ['join'], line: 1, isRelative: false, raw: "import { join } from 'path'" },
      ],
    });

    const results = await detector.detect([fileUnit], createContext());
    const inconsistent = results.filter(r => r.metadata?.analysisType === 'inconsistent-import');
    expect(inconsistent).toHaveLength(0);
  });

  // ── Analysis 3: Duplicate function names ───────────────────────

  it('should detect duplicate function names in same scope', async () => {
    const func1 = makeFuncUnit({
      name: 'processData',
      file: 'test.ts',
      parentId: 'file:test.ts',
      location: { startLine: 5, startColumn: 0, endLine: 15, endColumn: 0 },
      definitions: [
        { name: 'processData', kind: 'function', line: 5, exported: false },
      ],
    });

    const func2 = makeFuncUnit({
      name: 'processData',
      file: 'test.ts',
      parentId: 'file:test.ts',
      location: { startLine: 20, startColumn: 0, endLine: 30, endColumn: 0 },
      definitions: [
        { name: 'processData', kind: 'function', line: 20, exported: false },
      ],
    });

    // Override IDs to be unique
    (func2 as any).id = 'func:test.ts:processData2';

    const results = await detector.detect([func1, func2], createContext());
    const duplicate = results.find(r => r.metadata?.analysisType === 'duplicate-function');
    expect(duplicate).toBeDefined();
    expect(duplicate!.severity).toBe('warning');
    expect(duplicate!.message).toContain('processData');
    expect(duplicate!.message).toContain('2 times');
  });

  // ── Analysis 4: Referenced but undefined symbols ───────────────

  it('should detect referenced but undefined symbols', async () => {
    const fileUnit = makeFileUnit({
      references: [
        { name: 'undefinedHelper', line: 15, resolved: false },
      ],
      definitions: [],
      imports: [],
    });

    const results = await detector.detect([fileUnit], createContext());
    const undefined_ = results.find(
      r => r.metadata?.analysisType === 'undefined-reference' && r.metadata?.symbolName === 'undefinedHelper',
    );
    expect(undefined_).toBeDefined();
    expect(undefined_!.severity).toBe('warning');
    expect(undefined_!.message).toContain('undefinedHelper');
    expect(undefined_!.message).toContain('never defined');
  });

  it('should not flag well-known globals as undefined', async () => {
    const fileUnit = makeFileUnit({
      references: [
        { name: 'console', line: 5, resolved: false },
        { name: 'process', line: 6, resolved: false },
        { name: 'JSON', line: 7, resolved: false },
      ],
      definitions: [],
      imports: [],
    });

    const results = await detector.detect([fileUnit], createContext());
    const falsePositives = results.filter(
      r => r.metadata?.analysisType === 'undefined-reference' &&
        ['console', 'process', 'JSON'].includes(r.metadata?.symbolName as string),
    );
    expect(falsePositives).toHaveLength(0);
  });

  it('should not flag already-resolved references', async () => {
    const fileUnit = makeFileUnit({
      references: [
        { name: 'someSymbol', line: 10, resolved: true },
      ],
    });

    const results = await detector.detect([fileUnit], createContext());
    const undefined_ = results.filter(
      r => r.metadata?.analysisType === 'undefined-reference' && r.metadata?.symbolName === 'someSymbol',
    );
    expect(undefined_).toHaveLength(0);
  });

  it('should not flag references that are imported', async () => {
    const fileUnit = makeFileUnit({
      references: [
        { name: 'importedFunc', line: 10, resolved: false },
      ],
      imports: [
        { module: 'some-lib', symbols: ['importedFunc'], line: 0, isRelative: false, raw: "import { importedFunc } from 'some-lib'" },
      ],
    });

    const results = await detector.detect([fileUnit], createContext());
    const undefined_ = results.filter(
      r => r.metadata?.analysisType === 'undefined-reference' && r.metadata?.symbolName === 'importedFunc',
    );
    expect(undefined_).toHaveLength(0);
  });

  it('should handle Python well-known globals', async () => {
    const fileUnit = makeFileUnit({
      language: 'python',
      file: 'test.py',
      references: [
        { name: 'print', line: 5, resolved: false },
        { name: 'len', line: 6, resolved: false },
        { name: 'None', line: 7, resolved: false },
      ],
    });

    const results = await detector.detect([fileUnit], createContext());
    const falsePositives = results.filter(
      r => r.metadata?.analysisType === 'undefined-reference' &&
        ['print', 'len', 'None'].includes(r.metadata?.symbolName as string),
    );
    expect(falsePositives).toHaveLength(0);
  });
});

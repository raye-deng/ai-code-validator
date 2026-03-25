/**
 * IncompleteImplementationDetector Tests
 *
 * Tests detection of AI-generated skeleton/placeholder code:
 * - throw "not implemented" patterns
 * - Empty function bodies
 * - Debug-only stubs (console.log only)
 * - Placeholder return values with TODO
 * - Python pass/ellipsis stubs
 */

import { describe, it, expect } from 'vitest';
import { IncompleteImplementationDetector } from '../../src/detectors/v4/incomplete-implementation.js';
import type { CodeUnit, SupportedLanguage } from '../../src/ir/types.js';
import type { DetectorContext } from '../../src/detectors/v4/types.js';

// ─── Test Helpers ──────────────────────────────────────────────────

function makeUnit(
  source: string,
  overrides: Partial<CodeUnit> = {},
): CodeUnit {
  const lines = source.split('\n');
  return {
    id: overrides.id ?? 'test-unit',
    file: overrides.file ?? 'test.ts',
    kind: overrides.kind ?? 'function',
    language: (overrides.language ?? 'typescript') as SupportedLanguage,
    source,
    location: overrides.location ?? { startLine: 0, endLine: lines.length - 1 },
    imports: overrides.imports ?? [],
    definitions: overrides.definitions ?? [
      { name: 'testFunc', kind: 'function', line: 0, exported: false },
    ],
    references: overrides.references ?? [],
    calls: overrides.calls ?? [],
    complexity: overrides.complexity ?? {
      linesOfCode: lines.length,
      cyclomaticComplexity: 1,
      maxNestingDepth: 0,
      parameterCount: 0,
    },
  };
}

function makeFileUnit(
  source: string,
  language: SupportedLanguage = 'typescript',
  file: string = 'test.ts',
): CodeUnit {
  const lines = source.split('\n');
  return {
    id: `file-${file}`,
    file,
    kind: 'file',
    language,
    source,
    location: { startLine: 0, endLine: lines.length - 1 },
    imports: [],
    definitions: [],
    references: [],
    calls: [],
    complexity: {
      linesOfCode: lines.length,
      cyclomaticComplexity: 1,
      maxNestingDepth: 0,
    },
  };
}

const context: DetectorContext = {
  projectRoot: '/test',
  allFiles: ['test.ts'],
};

// ─── Tests ─────────────────────────────────────────────────────────

describe('IncompleteImplementationDetector', () => {
  const detector = new IncompleteImplementationDetector();

  describe('metadata', () => {
    it('should have correct id and category', () => {
      expect(detector.id).toBe('incomplete-implementation');
      expect(detector.category).toBe('context-coherence');
    });
  });

  // ── throw "not implemented" patterns ─────────────────────────

  describe('throw "not implemented" patterns', () => {
    it('should detect throw new Error("not implemented")', async () => {
      const unit = makeUnit(
        `function processPayment(amount: number) {\n  throw new Error("not implemented");\n}`,
      );
      const results = await detector.detect([unit], context);
      expect(results.length).toBeGreaterThan(0);
      const found = results.find(r => r.metadata?.patternId === 'throw-not-implemented');
      expect(found).toBeDefined();
      expect(found!.severity).toBe('error');
    });

    it('should detect throw new Error("TODO")', async () => {
      const unit = makeUnit(
        `function validate(input: string) {\n  throw new Error("TODO");\n}`,
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata?.patternId === 'throw-not-implemented')).toBe(true);
    });

    it('should detect throw new Error("implement this")', async () => {
      const unit = makeUnit(
        `function sendEmail(to: string) {\n  throw new Error("implement this");\n}`,
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata?.patternId === 'throw-not-implemented')).toBe(true);
    });

    it('should detect throw new Error("stub")', async () => {
      const unit = makeUnit(
        `function getUser(id: string) {\n  throw new Error("stub");\n}`,
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata?.patternId === 'throw-not-implemented')).toBe(true);
    });

    it('should detect bare throw "not implemented"', async () => {
      const unit = makeUnit(
        `function doSomething() {\n  throw "not implemented";\n}`,
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata?.patternId === 'throw-not-implemented-bare')).toBe(true);
    });

    it('should NOT detect throw with real error messages', async () => {
      const unit = makeUnit(
        `function validate(input: string) {\n  throw new Error("Invalid input: " + input);\n}`,
      );
      const results = await detector.detect([unit], context);
      const throwResults = results.filter(r =>
        r.metadata?.patternId === 'throw-not-implemented' ||
        r.metadata?.patternId === 'throw-not-implemented-bare'
      );
      expect(throwResults.length).toBe(0);
    });
  });

  // ── Python raise NotImplementedError ─────────────────────────

  describe('Python raise patterns', () => {
    it('should detect raise NotImplementedError', async () => {
      const unit = makeUnit(
        `def process_data(data):\n    raise NotImplementedError("TODO")`,
        { language: 'python', file: 'test.py' },
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata?.patternId === 'python-raise-not-implemented')).toBe(true);
    });
  });

  // ── Java/Kotlin throw patterns ───────────────────────────────

  describe('Java/Kotlin throw patterns', () => {
    it('should detect throw UnsupportedOperationException("not implemented")', async () => {
      const unit = makeUnit(
        `public void process() {\n  throw new UnsupportedOperationException("not implemented");\n}`,
        { language: 'java', file: 'Test.java' },
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata?.patternId === 'java-throw-unsupported')).toBe(true);
    });
  });

  // ── Go panic patterns ───────────────────────────────────────

  describe('Go panic patterns', () => {
    it('should detect panic("not implemented")', async () => {
      const unit = makeUnit(
        `func ProcessData(data []byte) error {\n  panic("not implemented")\n}`,
        { language: 'go', file: 'test.go' },
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata?.patternId === 'go-panic-not-implemented')).toBe(true);
    });
  });

  // ── Empty function bodies ────────────────────────────────────

  describe('empty function bodies', () => {
    it('should detect empty function body', async () => {
      const unit = makeUnit(
        `function processOrder(order: Order) {\n}`,
        {
          definitions: [{ name: 'processOrder', kind: 'function', line: 0, exported: false }],
        },
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata?.analysisType === 'empty-function-body')).toBe(true);
    });

    it('should detect function with only whitespace body', async () => {
      const unit = makeUnit(
        `function processOrder(order: Order) {\n  \n  \n}`,
        {
          definitions: [{ name: 'processOrder', kind: 'function', line: 0, exported: false }],
        },
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata?.analysisType === 'empty-function-body')).toBe(true);
    });

    it('should NOT detect constructor empty bodies', async () => {
      const unit = makeUnit(
        `constructor() {\n}`,
        {
          kind: 'method',
          definitions: [{ name: 'constructor', kind: 'method', line: 0, exported: false }],
        },
      );
      const results = await detector.detect([unit], context);
      expect(results.filter(r => r.metadata?.analysisType === 'empty-function-body').length).toBe(0);
    });

    it('should NOT detect functions with real implementations', async () => {
      const unit = makeUnit(
        `function add(a: number, b: number) {\n  return a + b;\n}`,
        {
          definitions: [{ name: 'add', kind: 'function', line: 0, exported: false }],
        },
      );
      const results = await detector.detect([unit], context);
      expect(results.filter(r => r.metadata?.analysisType === 'empty-function-body').length).toBe(0);
    });
  });

  // ── Throw-only functions ─────────────────────────────────────

  describe('throw-only functions', () => {
    it('should detect function that only throws "not implemented"', async () => {
      const unit = makeUnit(
        `function sendNotification(user: User) {\n  throw new Error("not implemented");\n}`,
        {
          definitions: [{ name: 'sendNotification', kind: 'function', line: 0, exported: false }],
        },
      );
      const results = await detector.detect([unit], context);
      const throwOnly = results.filter(r => r.metadata?.analysisType === 'throw-only-function');
      expect(throwOnly.length).toBeGreaterThan(0);
      expect(throwOnly[0].severity).toBe('error');
      expect(throwOnly[0].metadata?.isNotImplemented).toBe(true);
    });

    it('should detect function that only throws a generic error at warning level', async () => {
      const unit = makeUnit(
        `function validateConfig(config: Config) {\n  throw new Error("Invalid configuration");\n}`,
        {
          definitions: [{ name: 'validateConfig', kind: 'function', line: 0, exported: false }],
        },
      );
      const results = await detector.detect([unit], context);
      const throwOnly = results.filter(r => r.metadata?.analysisType === 'throw-only-function');
      expect(throwOnly.length).toBeGreaterThan(0);
      expect(throwOnly[0].severity).toBe('warning');
      expect(throwOnly[0].metadata?.isNotImplemented).toBe(false);
    });

    it('should NOT flag functions with more than just a throw', async () => {
      const unit = makeUnit(
        `function validate(input: string) {\n  if (!input) throw new Error("Required");\n  return input.trim();\n}`,
        {
          definitions: [{ name: 'validate', kind: 'function', line: 0, exported: false }],
        },
      );
      const results = await detector.detect([unit], context);
      expect(results.filter(r => r.metadata?.analysisType === 'throw-only-function').length).toBe(0);
    });
  });

  // ── Console/debug-only stubs ─────────────────────────────────

  describe('console-only stubs', () => {
    it('should detect function with only console.log', async () => {
      const unit = makeUnit(
        `function handleError(err: Error) {\n  console.log(err);\n}`,
        {
          definitions: [{ name: 'handleError', kind: 'function', line: 0, exported: false }],
        },
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata?.patternId === 'console-only-function')).toBe(true);
    });
  });

  // ── Placeholder return with TODO ─────────────────────────────

  describe('placeholder return with TODO', () => {
    it('should detect return null with TODO comment', async () => {
      const unit = makeUnit(
        `function getUserProfile(id: string) {\n  // TODO: implement user lookup\n  return null;\n}`,
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata?.patternId === 'return-null-with-todo')).toBe(true);
    });

    it('should detect return {} with FIXME comment', async () => {
      const unit = makeUnit(
        `function getConfig() {\n  // FIXME: load from file\n  return {};\n}`,
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata?.patternId === 'return-empty-object-with-todo')).toBe(true);
    });

    it('should detect return [] with TODO comment', async () => {
      const unit = makeUnit(
        `function getUsers() {\n  // TODO: fetch from database\n  return [];\n}`,
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata?.patternId === 'return-empty-array-with-todo')).toBe(true);
    });
  });

  // ── Multi-language support ───────────────────────────────────

  describe('multi-language support', () => {
    it('should detect Go panic("not implemented") via throw-only analysis', async () => {
      const unit = makeUnit(
        `func ProcessData(data []byte) error {\n  panic("not implemented")\n}`,
        {
          language: 'go',
          file: 'handler.go',
          definitions: [{ name: 'ProcessData', kind: 'function', line: 0, exported: true }],
        },
      );
      const results = await detector.detect([unit], context);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should detect Kotlin throw NotImplementedException', async () => {
      const unit = makeUnit(
        `fun processData(data: ByteArray) {\n  throw RuntimeException("not implemented yet")\n}`,
        {
          language: 'kotlin',
          file: 'Handler.kt',
          definitions: [{ name: 'processData', kind: 'function', line: 0, exported: false }],
        },
      );
      const results = await detector.detect([unit], context);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ── Edge cases ───────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle units without source gracefully', async () => {
      const unit = makeUnit('', { kind: 'file' });
      const results = await detector.detect([unit], context);
      expect(results.length).toBe(0);
    });

    it('should not flag abstract methods', async () => {
      const unit = makeUnit(
        `abstract processData(data: Buffer): Promise<void> {\n}`,
        {
          definitions: [{ name: 'processData', kind: 'method', line: 0, exported: false }],
        },
      );
      const results = await detector.detect([unit], context);
      expect(results.filter(r => r.metadata?.analysisType === 'empty-function-body').length).toBe(0);
    });

    it('should handle multiple patterns in same file', async () => {
      const fileUnit = makeFileUnit(`
function a() {
  throw new Error("not implemented");
}
function b() {
  // TODO: implement
  return null;
}
function c() {
  console.log("stub");
}
      `.trim());
      const results = await detector.detect([fileUnit], context);
      expect(results.length).toBeGreaterThanOrEqual(2);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { TestAntiPatternDetector } from '../../src/detectors/v4/test-antipattern.js';
import type { CodeUnit, SupportedLanguage } from '../../src/ir/types.js';
import type { DetectorContext } from '../../src/detectors/v4/types.js';

function makeFuncUnit(
  source: string,
  language: SupportedLanguage = 'typescript',
  name: string = 'testFunc',
  kind: CodeUnit['kind'] = 'function',
): CodeUnit {
  const lines = source.split('\n');
  return {
    id: 'test-unit',
    file: 'test.ts',
    kind,
    language,
    source,
    location: { startLine: 0, endLine: lines.length - 1 },
    imports: [],
    definitions: [{ name, kind: 'function', line: 0, exported: false }],
    references: [],
    calls: [],
    complexity: { linesOfCode: lines.length, cyclomaticComplexity: 1, maxNestingDepth: 0, parameterCount: 0 },
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
    complexity: { linesOfCode: lines.length, cyclomaticComplexity: 1, maxNestingDepth: 0 },
  };
}

const context: DetectorContext = { projectRoot: '/test', allFiles: ['test.ts'] };

describe('TestAntiPatternDetector', () => {
  const detector = new TestAntiPatternDetector();

  describe('empty-test-body', () => {
    it('detects JS test with no assertions', async () => {
      const unit = makeFuncUnit(
        `it('adds numbers', () => {\n  const result = add(1, 2);\n});`,
        'typescript',
        'adds numbers',
      );
      const results = await detector.detect([unit], context);
      expect(results).toHaveLength(1);
      expect(results[0].metadata.patternId).toBe('empty-test-body');
      expect(results[0].severity).toBe('error');
      expect(results[0].confidence).toBe(0.9);
    });

    it('detects Python test with no assertions', async () => {
      const unit = makeFuncUnit(
        `def test_addition():\n    result = add(1, 2)\n    print(result)`,
        'python',
        'test_addition',
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata.patternId === 'empty-test-body')).toBe(true);
    });

    it('passes when test has expect assertion', async () => {
      const unit = makeFuncUnit(
        `it('adds numbers', () => {\n  expect(add(1, 2)).toBe(3);\n});`,
        'typescript',
        'adds numbers',
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata.patternId === 'empty-test-body')).toBe(false);
    });

    it('passes when Python test has self.assert', async () => {
      const unit = makeFuncUnit(
        `def test_addition():\n    self.assertEqual(add(1, 2), 3)`,
        'python',
        'test_addition',
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata.patternId === 'empty-test-body')).toBe(false);
    });

    it('passes when Java test has assertEquals', async () => {
      const unit = makeFuncUnit(
        `@Test\nvoid testAddition() {\n  assertEquals(3, add(1, 2));\n}`,
        'java',
        'testAddition',
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata.patternId === 'empty-test-body')).toBe(false);
    });

    it('skips non-test functions', async () => {
      const unit = makeFuncUnit(
        `function calculate() {\n  return 1 + 2;\n}`,
        'typescript',
        'calculate',
      );
      const results = await detector.detect([unit], context);
      expect(results).toHaveLength(0);
    });
  });

  describe('trivially-true', () => {
    it('detects expect(true).toBe(true)', async () => {
      const unit = makeFuncUnit(
        `it('is true', () => {\n  expect(true).toBe(true);\n});`,
        'typescript',
        'is true',
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata.patternId === 'trivially-true')).toBe(true);
      expect(results[0].severity).toBe('warning');
    });

    it('detects assertEquals(true, true)', async () => {
      const unit = makeFuncUnit(
        `it('checks true', () => {\n  assertEquals(true, true);\n});`,
        'typescript',
        'checks true',
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata.patternId === 'trivially-true')).toBe(true);
    });

    it('detects expect("string").toBeTruthy()', async () => {
      const unit = makeFuncUnit(
        `it('truthy string', () => {\n  expect("hello").toBeTruthy();\n});`,
        'typescript',
        'truthy string',
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata.patternId === 'trivially-true')).toBe(true);
    });

    it('passes when assertion has real expected value', async () => {
      const unit = makeFuncUnit(
        `it('adds numbers', () => {\n  expect(add(1, 2)).toBe(3);\n});`,
        'typescript',
        'adds numbers',
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata.patternId === 'trivially-true')).toBe(false);
    });
  });

  describe('description-body-mismatch', () => {
    it('detects "should throw" without error assertions', async () => {
      const source = `import { add } from './math';
it('should throw error when dividing by zero', () => {
  const result = divide(1, 0);
  console.log(result);
});`;
      const unit = makeFileUnit(source, 'typescript', 'math.test.ts');
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata.patternId === 'description-body-mismatch')).toBe(true);
      expect(results.find(r => r.metadata.patternId === 'description-body-mismatch')!.severity).toBe('info');
    });

    it('detects "should return empty array" without length/empty check', async () => {
      const source = `import { filter } from './utils';
it('should return empty array', () => {
  const result = filter([], x => x > 0);
  console.log(result);
});`;
      const unit = makeFileUnit(source, 'typescript', 'utils.test.ts');
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata.patternId === 'description-body-mismatch')).toBe(true);
    });

    it('passes when description matches body assertions', async () => {
      const source = `import { divide } from './math';
it('should throw error when dividing by zero', () => {
  expect(() => divide(1, 0)).toThrow();
});`;
      const unit = makeFileUnit(source, 'typescript', 'math.test.ts');
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata.patternId === 'description-body-mismatch')).toBe(false);
    });
  });

  describe('swallowing-try-catch', () => {
    it('detects try/catch with no assertion on error', async () => {
      const unit = makeFuncUnit(
        `it('handles error', () => {\n  try {\n    riskyOperation();\n  } catch (e) {\n    console.log(e);\n  }\n});`,
        'typescript',
        'handles error',
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata.patternId === 'swallowing-try-catch')).toBe(true);
    });

    it('passes when catch block asserts on error', async () => {
      const unit = makeFuncUnit(
        `it('handles error', () => {\n  try {\n    riskyOperation();\n  } catch (e) {\n    expect(e).toBeInstanceOf(Error);\n  }\n});`,
        'typescript',
        'handles error',
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata.patternId === 'swallowing-try-catch')).toBe(false);
    });

    it('detects empty catch block', async () => {
      const unit = makeFuncUnit(
        `it('handles error', () => {\n  try {\n    riskyOperation();\n  } catch (e) {\n  }\n});`,
        'typescript',
        'handles error',
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata.patternId === 'swallowing-try-catch')).toBe(true);
    });
  });

  describe('no-throw-only', () => {
    it('detects expect().not.toThrow() as sole assertion', async () => {
      const unit = makeFuncUnit(
        `it('does not crash', () => {\n  expect(() => process()).not.toThrow();\n});`,
        'typescript',
        'does not crash',
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata.patternId === 'no-throw-only')).toBe(true);
      expect(results.find(r => r.metadata.patternId === 'no-throw-only')!.severity).toBe('info');
    });

    it('detects Python with assertRaises(Exception) as sole assertion', async () => {
      const unit = makeFuncUnit(
        `def test_no_error():\n    with self.assertRaises(Exception):\n        risky()`,
        'python',
        'test_no_error',
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata.patternId === 'no-throw-only')).toBe(true);
    });

    it('passes when test has additional assertions beyond not.toThrow', async () => {
      const unit = makeFuncUnit(
        `it('works correctly', () => {\n  const result = process();\n  expect(result).toBe(42);\n  expect(() => process()).not.toThrow();\n});`,
        'typescript',
        'works correctly',
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata.patternId === 'no-throw-only')).toBe(false);
    });
  });

  describe('duplicate-description', () => {
    it('detects duplicate test descriptions', async () => {
      const source = `import { add } from './math';
describe('Math', () => {
  it('adds two numbers', () => {
    expect(add(1, 2)).toBe(3);
  });
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
});`;
      const unit = makeFileUnit(source, 'typescript', 'math.test.ts');
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata.patternId === 'duplicate-description')).toBe(true);
      expect(results.find(r => r.metadata.patternId === 'duplicate-description')!.severity).toBe('warning');
    });

    it('passes when all descriptions are unique', async () => {
      const source = `import { add, subtract } from './math';
describe('Math', () => {
  it('adds two numbers', () => {
    expect(add(1, 2)).toBe(3);
  });
  it('subtracts two numbers', () => {
    expect(subtract(5, 3)).toBe(2);
  });
});`;
      const unit = makeFileUnit(source, 'typescript', 'math.test.ts');
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata.patternId === 'duplicate-description')).toBe(false);
    });
  });

  describe('multi-language support', () => {
    it('detects empty test body in Go', async () => {
      const unit = makeFuncUnit(
        `func TestAddition(t *testing.T) {\n  result := Add(1, 2)\n  fmt.Println(result)\n}`,
        'go',
        'TestAddition',
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata.patternId === 'empty-test-body')).toBe(true);
    });

    it('detects empty test body in Kotlin', async () => {
      const unit = makeFuncUnit(
        `@Test\nfun addition works correctly() {\n  val result = add(1, 2)\n  println(result)\n}`,
        'kotlin',
        'addition works correctly',
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata.patternId === 'empty-test-body')).toBe(true);
    });

    it('detects swallowing try/catch in Java', async () => {
      const unit = makeFuncUnit(
        `@Test\nvoid testError() {\n  try {\n    risky();\n  } catch (Exception e) {\n    System.out.println(e);\n  }\n}`,
        'java',
        'testError',
      );
      const results = await detector.detect([unit], context);
      expect(results.some(r => r.metadata.patternId === 'swallowing-try-catch')).toBe(true);
    });
  });
});

import type { CodeUnit, SupportedLanguage } from '../../ir/types.js';
import type { V4Detector, DetectorResult, DetectorCategory, DetectorContext } from './types.js';

const ASSERTION_CALLS = /\b(?:expect|assert|assertEquals|assertEqual|assertTrue|assertFalse|assertThat|assertStrictEqual|assertNotEqual|assertNotStrictEqual|assertDeepEqual|assertDeepStrictEqual|assertRejects|assertThrows|ok|notOk|equal|strictEqual|deepEqual|throws|rejects)\b/;
const ASSERTION_CALLS_PY = /\b(?:self\.assert|assertEqual|assertEquals|assertTrue|assertFalse|assertRaises|assertThat|assert)\b/;
const ASSERTION_CALLS_JAVA = /\b(?:assertEquals|assertNotEquals|assertTrue|assertFalse|assertNull|assertNotNull|assertThat|assertThrows|verify|when)\b/;
const ASSERTION_CALLS_GO = /\b(?:assert|require|assertEquals|assertEqual|assertTrue|False|Nil|NotNil|Error)\b/;

const TRIVIALLY_TRUE = /(?:expect\(\s*(?:true|1|""|'')\s*\)\.\w+\(\s*(?:true|1|""|'')\s*\)|assert(?:Strict)?Equals?\(\s*(?:true|1)\s*,\s*(?:true|1)\s*\)|assertTrue\(\s*(?:true|1)\s*\)|assertFalse\(\s*(?:false|0)\s*\)|assert\w+\(\s*(?:true|1|""|'')\s*\)|expect\(\s*(?:\w+|'[^']*'|"[^"]*")\s*\)\.(?:toBeTruthy|toBeFalsy|toBeDefined|toBeUndefined)\(\s*\)|assertThat\(\s*(?:true|1|""|'')\s*,\s*(?:is|equalTo|notNullValue)\s*\()/;

const TEST_NAME_KEYWORDS: Record<string, RegExp[]> = {
  throw: [/\b(?:toThrow|throws?|throwError|assertThrows|rejects|assertRejects|should\s+throw)\b/i],
  reject: [/\b(?:rejects|reject|rejectsWith|should\s+reject|toReject)\b/i],
  error: [/\b(?:toThrow|throws?|rejects|error|assertThrows|toThrowError|should\s+error)\b/i],
  empty: [/\b(?:toHaveLength\(0\)|\.length\s*===?\s*0|toEqual\(\s*\[\s*\]\)|toStrictEqual\(\s*\[\s*\]\)|\.toBeEmpty|assertEmpty|assertArrayEquals\(\s*\[\s*\]\))/i],
  null: [/\b(?:toBeNull|toBe\(null\)|toEqual\(null\)|assertNull|toStrictEqual\(null\))/i],
  undefined: [/\b(?:toBeUndefined|toBe\(undefined\)|toEqual\(undefined\))/i],
};

const SWALLOWING_TRY_CATCH = /try\s*\{[^}]*\}\s*catch\s*\([^)]*\)\s*\{(?:(?!expect|assert|fail|throw|assertEquals|assertTrue|assertFalse|assertThat|rejects|toThrow).)*\}/s;

const NO_THROW_ONLY = /^\s*(?:expect\(\s*(?:\(\)\s*=>\s*\w[\w.]*\(\)|async\s*\(\)\s*=>\s*(?:await\s+)?\w[\w.]*\(\))\s*\)\.not\.toThrow\(\s*\)\s*;?\s*$|await\s+expect\(\s*(?:\(\)\s*=>\s*\w[\w.]*\(\)|async\s*\(\)\s*=>\s*(?:await\s+)?\w[\w.]*\(\))\s*\)\.not\.toThrow\(\s*\)\s*;?\s*$)/m;

const NO_THROW_ONLY_PY = /^\s*(?:with\s+self\.assert(?:Not)?Raises?\(\s*(?:Exception|Error)\s*\)|self\.assert(?:Not)?Raises?\s*\(\s*(?:Exception|Error)\s*,?\s*\w[\w.]*\s*\))\s*:?\s*$/m;

const NO_THROW_ONLY_JAVA = /^\s*assert(?:DoesNotThrow|NotThrows)?\s*\(.*\)\s*;?\s*$/m;

const TEST_DESCRIPTION_RE = /(?:\b(?:it|test|describe)\s*\(\s*['"`]([^'"`]+)['"`]|@Test\s*\n\s*void\s+(\w+)|@Test\s+(?:fun|def)\s+(\w+)|it\s*\(\s*['"`]([^'"`]+)['"`]|test\s*\(\s*['"`]([^'"`]+)['"`])/gm;

interface TestDescriptionMatch {
  description: string;
  bodyStart: number;
  bodyEnd: number;
}

export class TestAntiPatternDetector implements V4Detector {
  readonly id = 'test-antipattern';
  readonly name = 'Test Anti-Pattern Detector';
  readonly category: DetectorCategory = 'context-coherence';
  readonly supportedLanguages: SupportedLanguage[] = [];

  async detect(units: CodeUnit[], context: DetectorContext): Promise<DetectorResult[]> {
    const results: DetectorResult[] = [];

    for (const unit of units) {
      if (!unit.source || unit.source.trim().length === 0) continue;

      if (unit.kind === 'file') {
        this.detectDescriptionBodyMismatch(unit, results);
        this.detectDuplicateDescriptions(unit, results);
      }

      if (unit.kind === 'function' || unit.kind === 'method') {
        this.detectEmptyTestBody(unit, results);
        this.detectTriviallyTrue(unit, results);
        this.detectSwallowingTryCatch(unit, results);
        this.detectNoThrowOnly(unit, results);
      }
    }

    return results;
  }

  private hasAssertion(source: string, language: SupportedLanguage): boolean {
    const isPython = language === 'python';
    const isJava = language === 'java' || language === 'kotlin';
    const isGo = language === 'go';

    if (isPython) return ASSERTION_CALLS_PY.test(source);
    if (isJava) return ASSERTION_CALLS_JAVA.test(source);
    if (isGo) return ASSERTION_CALLS_GO.test(source);
    return ASSERTION_CALLS.test(source);
  }

  private isTestFunction(unit: CodeUnit): boolean {
    const name = unit.definitions[0]?.name ?? '';
    const testNameRe = /^(?:test_|test$|it\(|it$|should_|should$|when_|when$|describe\(|describe$)/i;
    if (testNameRe.test(name)) return true;

    const source = unit.source ?? '';
    const testPrefixRe = /^\s*(?:it|test|describe)\s*[\(\.]/m;
    const pytestRe = /^\s*def\s+test_/m;
    const junitRe = /@Test\b/;
    const goTestRe = /func\s+Test\w/;
    const kotlinTestRe = /@Test\s+(?:fun\s+)/;

    return testPrefixRe.test(source) || pytestRe.test(source) || junitRe.test(source) || goTestRe.test(source) || kotlinTestRe.test(source);
  }

  private detectEmptyTestBody(unit: CodeUnit, results: DetectorResult[]): void {
    if (!this.isTestFunction(unit)) return;
    if (this.hasAssertion(unit.source, unit.language)) return;

    const funcName = unit.definitions[0]?.name ?? 'anonymous';

    results.push({
      detectorId: this.id,
      severity: 'error',
      category: this.category,
      messageKey: 'test-antipattern.empty-test-body',
      message: `Test "${funcName}" has no assertions. AI-generated tests often look correct but verify nothing.`,
      file: unit.file,
      line: unit.location.startLine + 1,
      endLine: unit.location.endLine + 1,
      confidence: 0.9,
      metadata: { patternId: 'empty-test-body', functionName: funcName, analysisType: 'pattern' },
    });
  }

  private detectTriviallyTrue(unit: CodeUnit, results: DetectorResult[]): void {
    if (!this.isTestFunction(unit)) return;

    TRIVIALLY_TRUE.lastIndex = 0;
    const match = TRIVIALLY_TRUE.exec(unit.source);
    if (!match) return;

    const line = unit.source.substring(0, match.index).split('\n').length;
    const funcName = unit.definitions[0]?.name ?? 'anonymous';

    results.push({
      detectorId: this.id,
      severity: 'warning',
      category: this.category,
      messageKey: 'test-antipattern.trivially-true',
      message: `Test "${funcName}" contains a trivially true assertion that always passes. This verifies nothing.`,
      file: unit.file,
      line: unit.location.startLine + line + 1,
      confidence: 0.85,
      metadata: { patternId: 'trivially-true', functionName: funcName, matchedText: match[0].trim().substring(0, 100), analysisType: 'pattern' },
    });
  }

  private detectDescriptionBodyMismatch(unit: CodeUnit, results: DetectorResult[]): void {
    const language = unit.language;
    if (language !== 'typescript' && language !== 'javascript') return;

    const matches = this.extractTestDescriptions(unit.source);
    for (const m of matches) {
      const body = unit.source.substring(m.bodyStart, m.bodyEnd);
      const descLower = m.description.toLowerCase();

      for (const [keyword, assertionPatterns] of Object.entries(TEST_NAME_KEYWORDS)) {
        if (!descLower.includes(keyword)) continue;

        const hasRelevantAssertion = assertionPatterns.some(re => {
          re.lastIndex = 0;
          return re.test(body);
        });

        if (!hasRelevantAssertion) {
          const line = unit.source.substring(0, m.bodyStart).split('\n').length;

          results.push({
            detectorId: this.id,
            severity: 'info',
            category: this.category,
            messageKey: 'test-antipattern.description-body-mismatch',
            message: `Test "${m.description}" mentions "${keyword}" but the body lacks corresponding assertions. AI may have mismatched the description and implementation.`,
            file: unit.file,
            line: unit.location.startLine + line + 1,
            confidence: 0.6,
            metadata: { patternId: 'description-body-mismatch', keyword, description: m.description, analysisType: 'pattern' },
          });
          break;
        }
      }
    }
  }

  private extractTestDescriptions(source: string): TestDescriptionMatch[] {
    const results: TestDescriptionMatch[] = [];

    const itTestRe = /\b(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(?:async\s+)?(?:\([^)]*\)\s*=>\s*)?{/g;
    let match;
    while ((match = itTestRe.exec(source)) !== null) {
      const desc = match[1];
      const bodyStart = match.index + match[0].length;
      const bodyEnd = this.findMatchingBrace(source, bodyStart - 1);
      if (bodyEnd !== -1) {
        results.push({ description: desc, bodyStart, bodyEnd });
      }
    }

    return results;
  }

  private findMatchingBrace(source: string, openBraceIndex: number): number {
    let depth = 0;
    for (let i = openBraceIndex; i < source.length; i++) {
      if (source[i] === '{') depth++;
      if (source[i] === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  private detectSwallowingTryCatch(unit: CodeUnit, results: DetectorResult[]): void {
    if (!this.isTestFunction(unit)) return;

    SWALLOWING_TRY_CATCH.lastIndex = 0;
    const match = SWALLOWING_TRY_CATCH.exec(unit.source);
    if (!match) return;

    const line = unit.source.substring(0, match.index).split('\n').length;
    const funcName = unit.definitions[0]?.name ?? 'anonymous';

    results.push({
      detectorId: this.id,
      severity: 'warning',
      category: this.category,
      messageKey: 'test-antipattern.swallowing-try-catch',
      message: `Test "${funcName}" has a try/catch block that silently swallows errors without asserting on them. This makes the test always pass.`,
      file: unit.file,
      line: unit.location.startLine + line + 1,
      confidence: 0.75,
      metadata: { patternId: 'swallowing-try-catch', functionName: funcName, analysisType: 'pattern' },
    });
  }

  private detectNoThrowOnly(unit: CodeUnit, results: DetectorResult[]): void {
    if (!this.isTestFunction(unit)) return;

    const lang = unit.language;

    const hasNoThrowOnly = lang === 'python'
      ? NO_THROW_ONLY_PY.test(unit.source)
      : lang === 'java' || lang === 'kotlin'
        ? NO_THROW_ONLY_JAVA.test(unit.source)
        : NO_THROW_ONLY.test(unit.source);

    if (!hasNoThrowOnly) return;

    const lines = unit.source.split('\n');
    const effectiveLines = lines.filter(l => {
      const trimmed = l.trim();
      return trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('#') && !trimmed.startsWith('*') && !trimmed.match(/^(?:it|test|describe|}\);?|def\s|@Test|func\s+Test|with\s)/);
    });

    if (effectiveLines.length > 1) return;

    if (!hasNoThrowOnly) return;

    const funcName = unit.definitions[0]?.name ?? 'anonymous';

    results.push({
      detectorId: this.id,
      severity: 'info',
      category: this.category,
      messageKey: 'test-antipattern.no-throw-only',
      message: `Test "${funcName}" only verifies the function doesn't throw. It doesn't check return values or side effects. AI often generates superficial "no crash" tests.`,
      file: unit.file,
      line: unit.location.startLine + 1,
      endLine: unit.location.endLine + 1,
      confidence: 0.6,
      metadata: { patternId: 'no-throw-only', functionName: funcName, analysisType: 'pattern' },
    });
  }

  private detectDuplicateDescriptions(unit: CodeUnit, results: DetectorResult[]): void {
    const descriptions: Map<string, { line: number; description: string }[]> = new Map();

    TEST_DESCRIPTION_RE.lastIndex = 0;
    let match;
    while ((match = TEST_DESCRIPTION_RE.exec(unit.source)) !== null) {
      const desc = match[1] || match[2] || match[3] || match[4] || match[5];
      if (!desc) continue;
      const line = unit.source.substring(0, match.index).split('\n').length;
      const existing = descriptions.get(desc) ?? [];
      existing.push({ line, description: desc });
      descriptions.set(desc, existing);
    }

    for (const [, entries] of descriptions) {
      if (entries.length < 2) continue;

      for (let i = 1; i < entries.length; i++) {
        results.push({
          detectorId: this.id,
          severity: 'warning',
          category: this.category,
          messageKey: 'test-antipattern.duplicate-description',
          message: `Duplicate test description "${entries[0].description}" found ${entries.length} times. AI often generates copy-pasted tests with identical names but different implementations.`,
          file: unit.file,
          line: unit.location.startLine + entries[i].line + 1,
          confidence: 0.8,
          metadata: { patternId: 'duplicate-description', description: entries[0].description, occurrence: i + 1, total: entries.length, analysisType: 'pattern' },
        });
      }
    }
  }
}

/**
 * OverEngineeringDetector — V4 detector for over-engineered AI-generated code.
 *
 * AI models love generating unnecessarily complex code: excessive abstraction,
 * design pattern abuse, deep nesting, and bloated function signatures.
 * This detector catches these patterns using CodeUnit complexity metrics.
 *
 * V4 improvements over V3:
 * - Uses pre-computed ComplexityMetrics from CodeUnit IR
 * - Configurable thresholds via DetectorContext
 * - Structural analysis using definitions instead of regex
 *
 * @since 0.4.0
 */

import type { CodeUnit, SupportedLanguage } from '../../ir/types.js';
import type { V4Detector, DetectorResult, DetectorCategory, DetectorContext } from './types.js';

// ─── Default thresholds ────────────────────────────────────────────

/** Configurable thresholds for over-engineering detection. */
export interface OverEngineeringThresholds {
  maxParams: number;
  maxNesting: number;
  maxFunctionLOC: number;
  maxCyclomaticComplexity: number;
}

const DEFAULT_THRESHOLDS: OverEngineeringThresholds = {
  maxParams: 5,
  maxNesting: 4,
  maxFunctionLOC: 100,
  maxCyclomaticComplexity: 15,
};

// ─── Detector ──────────────────────────────────────────────────────

export class OverEngineeringDetector implements V4Detector {
  readonly id = 'over-engineering';
  readonly name = 'Over-engineering Detector';
  readonly category: DetectorCategory = 'implementation';
  readonly supportedLanguages: SupportedLanguage[] = [];

  private readonly thresholds: OverEngineeringThresholds;

  constructor(thresholds?: Partial<OverEngineeringThresholds>) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  async detect(units: CodeUnit[], context: DetectorContext): Promise<DetectorResult[]> {
    const results: DetectorResult[] = [];

    // Apply config overrides if present
    const thresholds = this.getEffectiveThresholds(context);

    // Analysis 1: Excessive function parameters
    this.detectExcessiveParams(units, thresholds, results);

    // Analysis 2: Deep nesting
    this.detectDeepNesting(units, thresholds, results);

    // Analysis 3: Long functions
    this.detectLongFunctions(units, thresholds, results);

    // Analysis 4: High cyclomatic complexity
    this.detectHighComplexity(units, thresholds, results);

    // Analysis 5: Excessive abstraction (many single-method interfaces/classes)
    this.detectExcessiveAbstraction(units, results);

    // Analysis 6: Single-implementation abstractions
    this.detectSingleImplAbstractions(units, results);

    return results;
  }

  /**
   * Detect functions with too many parameters.
   * AI models often generate functions with excessive parameters
   * instead of using option objects or builders.
   */
  private detectExcessiveParams(
    units: CodeUnit[],
    thresholds: OverEngineeringThresholds,
    results: DetectorResult[],
  ): void {
    for (const unit of units) {
      if (unit.kind !== 'function' && unit.kind !== 'method') continue;

      const paramCount = unit.complexity.parameterCount;
      if (paramCount !== undefined && paramCount > thresholds.maxParams) {
        results.push({
          detectorId: this.id,
          severity: 'warning',
          category: this.category,
          messageKey: 'over-engineering.excessive-params',
          message: `Function has ${paramCount} parameters (max: ${thresholds.maxParams}). Consider using an options object or builder pattern.`,
          file: unit.file,
          line: unit.location.startLine + 1,
          endLine: unit.location.endLine + 1,
          confidence: 0.8,
          metadata: {
            paramCount,
            threshold: thresholds.maxParams,
            functionId: unit.id,
            analysisType: 'excessive-params',
          },
        });
      }
    }
  }

  /**
   * Detect deeply nested code structures.
   * AI-generated code often has excessive nesting from
   * nested conditionals and callbacks.
   */
  private detectDeepNesting(
    units: CodeUnit[],
    thresholds: OverEngineeringThresholds,
    results: DetectorResult[],
  ): void {
    for (const unit of units) {
      if (unit.kind !== 'function' && unit.kind !== 'method') continue;

      if (unit.complexity.maxNestingDepth > thresholds.maxNesting) {
        results.push({
          detectorId: this.id,
          severity: 'warning',
          category: this.category,
          messageKey: 'over-engineering.deep-nesting',
          message: `Function has nesting depth of ${unit.complexity.maxNestingDepth} (max: ${thresholds.maxNesting}). Consider early returns or extracting helper functions.`,
          file: unit.file,
          line: unit.location.startLine + 1,
          endLine: unit.location.endLine + 1,
          confidence: 0.75,
          metadata: {
            nestingDepth: unit.complexity.maxNestingDepth,
            threshold: thresholds.maxNesting,
            functionId: unit.id,
            analysisType: 'deep-nesting',
          },
        });
      }
    }
  }

  /**
   * Detect functions that are excessively long.
   * AI models often generate monolithic functions instead of
   * properly decomposed code.
   */
  private detectLongFunctions(
    units: CodeUnit[],
    thresholds: OverEngineeringThresholds,
    results: DetectorResult[],
  ): void {
    for (const unit of units) {
      if (unit.kind !== 'function' && unit.kind !== 'method') continue;

      if (unit.complexity.linesOfCode > thresholds.maxFunctionLOC) {
        results.push({
          detectorId: this.id,
          severity: 'warning',
          category: this.category,
          messageKey: 'over-engineering.long-function',
          message: `Function has ${unit.complexity.linesOfCode} lines of code (max: ${thresholds.maxFunctionLOC}). Consider breaking it into smaller functions.`,
          file: unit.file,
          line: unit.location.startLine + 1,
          endLine: unit.location.endLine + 1,
          confidence: 0.7,
          metadata: {
            linesOfCode: unit.complexity.linesOfCode,
            threshold: thresholds.maxFunctionLOC,
            functionId: unit.id,
            analysisType: 'long-function',
          },
        });
      }
    }
  }

  /**
   * Detect high cyclomatic complexity.
   * AI models produce code with many branching paths that
   * is difficult to understand and test.
   */
  private detectHighComplexity(
    units: CodeUnit[],
    thresholds: OverEngineeringThresholds,
    results: DetectorResult[],
  ): void {
    for (const unit of units) {
      if (unit.kind !== 'function' && unit.kind !== 'method') continue;

      if (unit.complexity.cyclomaticComplexity > thresholds.maxCyclomaticComplexity) {
        results.push({
          detectorId: this.id,
          severity: 'warning',
          category: this.category,
          messageKey: 'over-engineering.high-complexity',
          message: `Function has cyclomatic complexity of ${unit.complexity.cyclomaticComplexity} (max: ${thresholds.maxCyclomaticComplexity}). Consider simplifying the logic.`,
          file: unit.file,
          line: unit.location.startLine + 1,
          endLine: unit.location.endLine + 1,
          confidence: 0.85,
          metadata: {
            cyclomaticComplexity: unit.complexity.cyclomaticComplexity,
            threshold: thresholds.maxCyclomaticComplexity,
            functionId: unit.id,
            analysisType: 'high-complexity',
          },
        });
      }
    }
  }

  /**
   * Detect excessive abstraction patterns.
   *
   * AI models tend to over-architect solutions by creating:
   * - Multiple single-method interfaces (unnecessary abstraction)
   * - Abstract classes with single concrete implementations
   */
  private detectExcessiveAbstraction(
    units: CodeUnit[],
    results: DetectorResult[],
  ): void {
    // Group by file to detect per-file patterns
    const fileUnits = new Map<string, CodeUnit[]>();
    for (const unit of units) {
      if (!fileUnits.has(unit.file)) {
        fileUnits.set(unit.file, []);
      }
      fileUnits.get(unit.file)!.push(unit);
    }

    for (const [file, fileUnitList] of fileUnits) {
      // Count interfaces with single method definitions
      let singleMethodInterfaces = 0;
      const interfaceUnits: CodeUnit[] = [];

      for (const unit of fileUnitList) {
        if (unit.kind !== 'class') continue;

        // Detect interfaces/types with only a single method
        const methodDefs = unit.definitions.filter(d => d.kind === 'method');
        const interfaceDefs = unit.definitions.filter(d => d.kind === 'interface');

        // If this is an interface-like unit (has interface definitions) with very few methods
        if (interfaceDefs.length > 0 && methodDefs.length === 1) {
          singleMethodInterfaces++;
          interfaceUnits.push(unit);
        }
      }

      // Flag if there are many single-method interfaces in one file
      if (singleMethodInterfaces >= 3) {
        results.push({
          detectorId: this.id,
          severity: 'info',
          category: this.category,
          messageKey: 'over-engineering.excessive-abstraction',
          message: `File contains ${singleMethodInterfaces} single-method interfaces. This may be over-engineered — consider consolidating or using function types.`,
          file,
          line: interfaceUnits[0]?.location.startLine + 1 || 1,
          confidence: 0.6,
          metadata: {
            singleMethodInterfaces,
            analysisType: 'excessive-abstraction',
          },
        });
      }
    }
  }

  /**
   * Detect abstract classes and interfaces with only one implementation.
   * This is a common AI over-engineering pattern: creating unnecessary abstractions.
   */
  private detectSingleImplAbstractions(
    units: CodeUnit[],
    results: DetectorResult[],
  ): void {
    const LANGUAGES_WITH_CLASSES = new Set(['typescript', 'javascript', 'java', 'kotlin']);

    // Collect all units per file, filter by supported languages
    const fileUnits = units.filter(u =>
      u.kind === 'file' && LANGUAGES_WITH_CLASSES.has(u.language),
    );

    if (fileUnits.length === 0) return;

    // Collect abstract classes and interfaces
    const abstractNames = new Set<string>();
    // Map: abstract name → [{implName, file, line}]
    const implementations = new Map<string, Array<{ implName: string; file: string; line: number }>>();
    // Map: abstract name → {file, line}
    const definitions = new Map<string, { file: string; line: number }>();

    for (const unit of fileUnits) {
      const source = unit.source;
      if (!source) continue;

      // Find abstract class definitions
      const abstractClassRegex = /abstract\s+class\s+(\w+)/g;
      let match: RegExpExecArray | null;
      while ((match = abstractClassRegex.exec(source)) !== null) {
        const name = match[1];
        abstractNames.add(name);
        const line = source.substring(0, match.index).split('\n').length - 1;
        definitions.set(name, { file: unit.file, line });
      }

      // Find interface definitions
      const interfaceRegex = /interface\s+(\w+)/g;
      while ((match = interfaceRegex.exec(source)) !== null) {
        const name = match[1];
        abstractNames.add(name);
        const line = source.substring(0, match.index).split('\n').length - 1;
        definitions.set(name, { file: unit.file, line });
      }

      // Find extends relationships
      const extendsRegex = /class\s+(\w+)\s+extends\s+(\w+)/g;
      while ((match = extendsRegex.exec(source)) !== null) {
        const implName = match[1];
        const parentName = match[2];
        if (!implementations.has(parentName)) {
          implementations.set(parentName, []);
        }
        const line = source.substring(0, match.index).split('\n').length - 1;
        implementations.get(parentName)!.push({ implName, file: unit.file, line });
      }

      // Find implements relationships
      const implementsRegex = /class\s+(\w+)\s+implements\s+(\w+)/g;
      while ((match = implementsRegex.exec(source)) !== null) {
        const implName = match[1];
        const ifaceName = match[2];
        if (!implementations.has(ifaceName)) {
          implementations.set(ifaceName, []);
        }
        const line = source.substring(0, match.index).split('\n').length - 1;
        implementations.get(ifaceName)!.push({ implName, file: unit.file, line });
      }
    }

    // Flag abstractions with exactly one implementation
    for (const name of abstractNames) {
      const impls = implementations.get(name);
      if (!impls || impls.length !== 1) continue;

      const def = definitions.get(name);
      const impl = impls[0];

      results.push({
        detectorId: this.id,
        severity: 'warning',
        category: this.category,
        messageKey: 'over-engineering.single-impl-abstraction',
        message: `Abstract class/interface '${name}' has only one implementation '${impl.implName}'. Consider simplifying by inlining the implementation.`,
        file: def?.file || impl.file,
        line: (def?.line ?? impl.line) + 1,
        confidence: 0.7,
        metadata: {
          abstractName: name,
          implementationName: impl.implName,
          implementationFile: impl.file,
          analysisType: 'single-impl-abstraction',
        },
      });
    }
  }

  /**
   * Get effective thresholds, considering config overrides.
   */
  private getEffectiveThresholds(context: DetectorContext): OverEngineeringThresholds {
    const config = context.config?.['over-engineering'] as Partial<OverEngineeringThresholds> | undefined;
    if (!config) return this.thresholds;

    return {
      maxParams: config.maxParams ?? this.thresholds.maxParams,
      maxNesting: config.maxNesting ?? this.thresholds.maxNesting,
      maxFunctionLOC: config.maxFunctionLOC ?? this.thresholds.maxFunctionLOC,
      maxCyclomaticComplexity: config.maxCyclomaticComplexity ?? this.thresholds.maxCyclomaticComplexity,
    };
  }
}

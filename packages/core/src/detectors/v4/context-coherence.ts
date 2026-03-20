/**
 * ContextCoherenceDetector — V4 detector for AI context window issues.
 *
 * Detects logic inconsistencies that arise from AI context window limitations.
 * When AI models generate long code, they lose track of what they've already
 * defined, used, or imported — leading to coherence issues.
 *
 * V4 improvements over V3:
 * - Operates on CodeUnit IR (definitions, references, imports) instead of regex
 * - Cross-unit analysis for referenced-but-undefined symbols
 * - Structural analysis using definitions/references instead of source text
 * - Dramatically reduced false positives
 *
 * @since 0.4.0
 */

import type { CodeUnit, SupportedLanguage } from '../../ir/types.js';
import type { V4Detector, DetectorResult, DetectorCategory, DetectorContext } from './types.js';

// ─── Detector ──────────────────────────────────────────────────────

export class ContextCoherenceDetector implements V4Detector {
  readonly id = 'context-coherence';
  readonly name = 'Context Coherence Detector';
  readonly category: DetectorCategory = 'context-coherence';
  readonly supportedLanguages: SupportedLanguage[] = [];

  async detect(units: CodeUnit[], context: DetectorContext): Promise<DetectorResult[]> {
    const results: DetectorResult[] = [];

    // Analysis 1: Unused non-exported definitions
    this.detectUnusedDefinitions(units, results);

    // Analysis 2: Inconsistent import patterns within same file
    this.detectInconsistentImports(units, results);

    // Analysis 3: Duplicate function names in same scope
    this.detectDuplicateFunctionNames(units, results);

    // Analysis 4: Referenced but undefined symbols (cross-unit)
    this.detectUndefinedReferences(units, results);

    // Analysis 5: Cross-file type/enum inconsistencies
    this.detectCrossFileTypeInconsistencies(units, results);

    // Analysis 6: Cross-file function call signature mismatches
    this.detectCallSignatureMismatches(units, results);

    return results;
  }

  /**
   * Analysis 1: Detect functions/classes/types defined but never used and not exported.
   *
   * AI models sometimes define helper functions that are never called,
   * or define types/interfaces that are never used — a sign of context loss.
   */
  private detectUnusedDefinitions(units: CodeUnit[], results: DetectorResult[]): void {
    // Build a set of all referenced symbol names across all units
    const allReferencedNames = new Set<string>();
    const allCalledNames = new Set<string>();

    for (const unit of units) {
      for (const ref of unit.references) {
        allReferencedNames.add(ref.name);
      }
      for (const call of unit.calls) {
        allCalledNames.add(call.method);
        if (call.callee) {
          allCalledNames.add(call.callee);
        }
      }
      // Also count imports as usage context
      for (const imp of unit.imports) {
        for (const sym of imp.symbols) {
          allReferencedNames.add(sym);
        }
      }
    }

    // Check each definition
    for (const unit of units) {
      for (const def of unit.definitions) {
        // Skip exported definitions — they're intended for external use
        if (def.exported) continue;

        // Only flag functions, classes, types, interfaces
        if (!['function', 'class', 'type', 'interface'].includes(def.kind)) continue;

        // Check if the symbol is referenced anywhere
        const isReferenced = allReferencedNames.has(def.name) || allCalledNames.has(def.name);

        if (!isReferenced) {
          results.push({
            detectorId: this.id,
            severity: 'info',
            category: this.category,
            messageKey: 'context-coherence.unused-definition',
            message: `${this.capitalizeKind(def.kind)} "${def.name}" is defined but never used and not exported. This may indicate a context window issue.`,
            file: unit.file,
            line: def.line + 1, // 0-based to 1-based
            confidence: 0.6,
            metadata: {
              symbolName: def.name,
              symbolKind: def.kind,
              analysisType: 'unused-definition',
            },
          });
        }
      }
    }
  }

  /**
   * Analysis 2: Detect inconsistent import patterns within the same file.
   *
   * When AI loses context mid-generation, it may import the same functionality
   * from different modules in different parts of the file. For example:
   * - import { readFile } from 'fs' AND import { readFile } from 'fs/promises'
   * - import lodash AND import underscore (same purpose)
   */
  private detectInconsistentImports(units: CodeUnit[], results: DetectorResult[]): void {
    for (const unit of units) {
      if (unit.kind !== 'file') continue;
      if (unit.imports.length < 2) continue;

      // Check for duplicate symbol imports from different modules
      const symbolToModules = new Map<string, { module: string; line: number }[]>();

      for (const imp of unit.imports) {
        for (const sym of imp.symbols) {
          if (!symbolToModules.has(sym)) {
            symbolToModules.set(sym, []);
          }
          symbolToModules.get(sym)!.push({ module: imp.module, line: imp.line });
        }
      }

      for (const [symbol, sources] of symbolToModules.entries()) {
        // Get unique modules importing the same symbol
        const uniqueModules = [...new Set(sources.map(s => s.module))];
        if (uniqueModules.length > 1) {
          results.push({
            detectorId: this.id,
            severity: 'warning',
            category: this.category,
            messageKey: 'context-coherence.inconsistent-import',
            message: `Symbol "${symbol}" is imported from multiple modules: ${uniqueModules.map(m => `"${m}"`).join(', ')}. This may indicate a context window inconsistency.`,
            file: unit.file,
            line: sources[1].line + 1, // Report on the second occurrence
            confidence: 0.75,
            metadata: {
              symbol,
              modules: uniqueModules,
              analysisType: 'inconsistent-import',
            },
          });
        }
      }
    }
  }

  /**
   * Analysis 3: Detect duplicate function names in the same scope.
   *
   * AI may re-define the same function name multiple times in a file
   * when it loses track of what it has already generated.
   */
  private detectDuplicateFunctionNames(units: CodeUnit[], results: DetectorResult[]): void {
    // Group units by parent (same scope) and file
    const scopeMap = new Map<string, CodeUnit[]>();

    for (const unit of units) {
      // Group functions/methods by their parent scope
      if (unit.kind === 'function' || unit.kind === 'method') {
        const scopeKey = `${unit.file}:${unit.parentId || 'file'}`;
        if (!scopeMap.has(scopeKey)) {
          scopeMap.set(scopeKey, []);
        }
        scopeMap.get(scopeKey)!.push(unit);
      }
    }

    for (const [, scopeUnits] of scopeMap) {
      const nameToUnits = this.groupByFunctionName(scopeUnits);
      this.reportDuplicates(nameToUnits, results);
    }
  }

  /** Group code units by their function/method definition names. */
  private groupByFunctionName(scopeUnits: CodeUnit[]): Map<string, CodeUnit[]> {
    const nameToUnits = new Map<string, CodeUnit[]>();
    for (const unit of scopeUnits) {
      for (const def of unit.definitions) {
        if (def.kind !== 'function' && def.kind !== 'method') continue;
        if (!nameToUnits.has(def.name)) nameToUnits.set(def.name, []);
        nameToUnits.get(def.name)!.push(unit);
      }
    }
    return nameToUnits;
  }

  /** Report duplicate function definitions within the same scope. */
  private reportDuplicates(
    nameToUnits: Map<string, CodeUnit[]>,
    results: DetectorResult[],
  ): void {
    for (const [name, duplicateUnits] of nameToUnits) {
      if (duplicateUnits.length <= 1) continue;
      for (let i = 1; i < duplicateUnits.length; i++) {
        const unit = duplicateUnits[i];
        results.push({
          detectorId: this.id,
          severity: 'warning',
          category: this.category,
          messageKey: 'context-coherence.duplicate-function',
          message: `Function "${name}" is defined ${duplicateUnits.length} times in the same scope. This likely indicates an AI context window issue.`,
          file: unit.file,
          line: unit.location.startLine + 1,
          confidence: 0.85,
          metadata: {
            functionName: name,
            occurrences: duplicateUnits.length,
            analysisType: 'duplicate-function',
          },
        });
      }
    }
  }

  /**
   * Analysis 4: Detect referenced but undefined symbols across units within a file.
   *
   * If a symbol is referenced but never defined (and not imported),
   * the AI may have "forgotten" to include the definition.
   */
  private detectUndefinedReferences(units: CodeUnit[], results: DetectorResult[]): void {
    // Group units by file
    const fileUnits = new Map<string, CodeUnit[]>();
    for (const unit of units) {
      if (!fileUnits.has(unit.file)) {
        fileUnits.set(unit.file, []);
      }
      fileUnits.get(unit.file)!.push(unit);
    }

    for (const [file, fileUnitList] of fileUnits) {
      // Collect all definitions and imports in this file
      const definedNames = new Set<string>();
      const importedNames = new Set<string>();

      for (const unit of fileUnitList) {
        for (const def of unit.definitions) {
          definedNames.add(def.name);
        }
        for (const imp of unit.imports) {
          for (const sym of imp.symbols) {
            importedNames.add(sym);
          }
          // Whole module imports
          if (imp.symbols.length === 0) {
            // The module name itself is available
            const parts = imp.module.split(/[./]/);
            importedNames.add(parts[parts.length - 1]);
          }
        }
      }

      // Check for unresolved references
      for (const unit of fileUnitList) {
        for (const ref of unit.references) {
          if (ref.resolved) continue; // Already resolved by the parser
          if (definedNames.has(ref.name)) continue;
          if (importedNames.has(ref.name)) continue;

          // Common globals that should not be flagged
          if (this.isWellKnownGlobal(ref.name, unit.language)) continue;

          results.push({
            detectorId: this.id,
            severity: 'warning',
            category: this.category,
            messageKey: 'context-coherence.undefined-reference',
            message: `Symbol "${ref.name}" is referenced but never defined or imported in file "${file}". The AI may have lost context.`,
            file,
            line: ref.line + 1, // 0-based to 1-based
            confidence: 0.7,
            metadata: {
              symbolName: ref.name,
              analysisType: 'undefined-reference',
            },
          });
        }
      }
    }
  }

  /**
   * Check if a name is a well-known global (e.g., console, window, process).
   */
  private isWellKnownGlobal(name: string, language: SupportedLanguage): boolean {
    const globals: Record<string, Set<string>> = {
      typescript: new Set([
        'console', 'window', 'document', 'process', 'global', 'globalThis',
        'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
        'Promise', 'Map', 'Set', 'Array', 'Object', 'String', 'Number',
        'Boolean', 'Error', 'JSON', 'Math', 'Date', 'RegExp', 'Symbol',
        'undefined', 'null', 'NaN', 'Infinity', 'Buffer', 'require',
        'module', 'exports', '__dirname', '__filename',
      ]),
      javascript: new Set([
        'console', 'window', 'document', 'process', 'global', 'globalThis',
        'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
        'Promise', 'Map', 'Set', 'Array', 'Object', 'String', 'Number',
        'Boolean', 'Error', 'JSON', 'Math', 'Date', 'RegExp', 'Symbol',
        'undefined', 'null', 'NaN', 'Infinity', 'Buffer', 'require',
        'module', 'exports', '__dirname', '__filename',
      ]),
      python: new Set([
        'print', 'len', 'range', 'type', 'str', 'int', 'float', 'list',
        'dict', 'set', 'tuple', 'bool', 'None', 'True', 'False',
        'isinstance', 'issubclass', 'super', 'self', 'cls',
        'Exception', 'ValueError', 'TypeError', 'KeyError',
      ]),
      java: new Set([
        'System', 'String', 'Integer', 'Long', 'Double', 'Float',
        'Object', 'Class', 'Exception', 'RuntimeException',
        'this', 'super', 'null', 'true', 'false',
      ]),
      go: new Set([
        'fmt', 'error', 'nil', 'true', 'false', 'make', 'len', 'cap',
        'append', 'copy', 'delete', 'new', 'panic', 'recover', 'close',
        'string', 'int', 'int64', 'float64', 'bool', 'byte', 'rune',
      ]),
      kotlin: new Set([
        'println', 'print', 'this', 'super', 'null', 'true', 'false',
        'String', 'Int', 'Long', 'Double', 'Float', 'Boolean',
        'Any', 'Unit', 'Nothing', 'it', 'listOf', 'mapOf', 'setOf',
      ]),
    };

    return globals[language]?.has(name) ?? false;
  }

  /**
   * Analysis 5: Detect cross-file type and enum inconsistencies.
   *
   * AI models generating multi-file projects often produce inconsistent
   * type definitions: enum members with wrong casing, interface properties
   * that mismatch between definition and usage, or conflicting type names.
   *
   * Detections:
   * - Same type/interface/enum name defined differently in multiple files
   * - Enum member access that doesn't match the defined enum values
   * - Interface/type with same name but different property sets
   */
  private detectCrossFileTypeInconsistencies(
    units: CodeUnit[],
    results: DetectorResult[],
  ): void {
    // Collect type/interface/enum definitions across all files
    const typeDefsByName = new Map<string, Array<{
      file: string;
      line: number;
      kind: string;
      source: string;
      properties: string[];
    }>>();

    for (const unit of units) {
      if (unit.kind !== 'file') continue;
      if (!unit.source) continue;

      // Extract enum definitions with their members
      const enumRegex = /enum\s+(\w+)\s*\{([^}]*)\}/g;
      let match: RegExpExecArray | null;
      while ((match = enumRegex.exec(unit.source)) !== null) {
        const name = match[1];
        const body = match[2];
        const members = body.split(',')
          .map(m => m.trim().split(/[=\s]/)[0])
          .filter(m => m.length > 0);

        if (!typeDefsByName.has(name)) typeDefsByName.set(name, []);
        const line = unit.source.substring(0, match.index).split('\n').length - 1;
        typeDefsByName.get(name)!.push({
          file: unit.file,
          line,
          kind: 'enum',
          source: match[0],
          properties: members,
        });
      }

      // Extract interface definitions with their property names
      const interfaceRegex = /interface\s+(\w+)\s*(?:extends\s+\w+\s*)?\{([^}]*)\}/g;
      while ((match = interfaceRegex.exec(unit.source)) !== null) {
        const name = match[1];
        const body = match[2];
        const props = body.split(/[;\n]/)
          .map(line => {
            const propMatch = line.trim().match(/^(\w+)\s*[?:]/)
            return propMatch ? propMatch[1] : null;
          })
          .filter((p): p is string => p !== null);

        if (!typeDefsByName.has(name)) typeDefsByName.set(name, []);
        const line = unit.source.substring(0, match.index).split('\n').length - 1;
        typeDefsByName.get(name)!.push({
          file: unit.file,
          line,
          kind: 'interface',
          source: match[0],
          properties: props,
        });
      }

      // Extract type alias definitions
      const typeRegex = /type\s+(\w+)\s*=\s*\{([^}]*)\}/g;
      while ((match = typeRegex.exec(unit.source)) !== null) {
        const name = match[1];
        const body = match[2];
        const props = body.split(/[;\n]/)
          .map(line => {
            const propMatch = line.trim().match(/^(\w+)\s*[?:]/);
            return propMatch ? propMatch[1] : null;
          })
          .filter((p): p is string => p !== null);

        if (!typeDefsByName.has(name)) typeDefsByName.set(name, []);
        const line = unit.source.substring(0, match.index).split('\n').length - 1;
        typeDefsByName.get(name)!.push({
          file: unit.file,
          line,
          kind: 'type',
          source: match[0],
          properties: props,
        });
      }
    }

    // Detect conflicts: same name defined in multiple files with different properties
    for (const [name, defs] of typeDefsByName) {
      if (defs.length < 2) continue;

      // Group by file to only compare cross-file
      const byFile = new Map<string, typeof defs[0]>();
      for (const def of defs) {
        if (!byFile.has(def.file)) {
          byFile.set(def.file, def);
        }
      }
      if (byFile.size < 2) continue;

      const defList = [...byFile.values()];
      const baseline = defList[0];

      for (let i = 1; i < defList.length; i++) {
        const other = defList[i];

        // Compare properties
        const baselineProps = new Set(baseline.properties);
        const otherProps = new Set(other.properties);

        const missingInOther = baseline.properties.filter(p => !otherProps.has(p));
        const extraInOther = other.properties.filter(p => !baselineProps.has(p));

        if (missingInOther.length > 0 || extraInOther.length > 0) {
          const details: string[] = [];
          if (missingInOther.length > 0) {
            details.push(`missing: ${missingInOther.join(', ')}`);
          }
          if (extraInOther.length > 0) {
            details.push(`extra: ${extraInOther.join(', ')}`);
          }

          results.push({
            detectorId: this.id,
            severity: 'warning',
            category: this.category,
            messageKey: 'context-coherence.cross-file-type-mismatch',
            message: `${this.capitalizeKind(other.kind)} "${name}" is defined in both "${baseline.file}" and "${other.file}" with different members (${details.join('; ')}). AI may have generated inconsistent definitions across files.`,
            file: other.file,
            line: other.line + 1,
            confidence: 0.8,
            metadata: {
              typeName: name,
              typeKind: other.kind,
              baselineFile: baseline.file,
              conflictFile: other.file,
              missingMembers: missingInOther,
              extraMembers: extraInOther,
              analysisType: 'cross-file-type-mismatch',
            },
          });
        }
      }
    }

    // Detect enum member access that doesn't match defined values
    for (const unit of units) {
      if (!unit.source) continue;

      for (const [enumName, defs] of typeDefsByName) {
        const enumDefs = defs.filter(d => d.kind === 'enum');
        if (enumDefs.length === 0) continue;

        // Collect all known enum members across all definitions
        const allMembers = new Set<string>();
        for (const def of enumDefs) {
          for (const m of def.properties) allMembers.add(m);
        }

        // Find enum member accesses: EnumName.MemberName
        const accessRegex = new RegExp(`\\b${enumName}\\.(\\w+)\\b`, 'g');
        let accessMatch: RegExpExecArray | null;
        while ((accessMatch = accessRegex.exec(unit.source)) !== null) {
          const memberName = accessMatch[1];
          if (!allMembers.has(memberName)) {
            const line = unit.source.substring(0, accessMatch.index).split('\n').length - 1;
            const absoluteLine = unit.kind === 'file' ? line : unit.location.startLine + line;

            results.push({
              detectorId: this.id,
              severity: 'error',
              category: this.category,
              messageKey: 'context-coherence.invalid-enum-member',
              message: `"${enumName}.${memberName}" references a non-existent enum member. Known members: ${[...allMembers].join(', ')}. AI may have used incorrect casing or a fabricated value.`,
              file: unit.file,
              line: absoluteLine + 1,
              confidence: 0.85,
              metadata: {
                enumName,
                invalidMember: memberName,
                validMembers: [...allMembers],
                analysisType: 'invalid-enum-member',
              },
            });
          }
        }
      }
    }
  }

  /**
   * Analysis 6: Detect cross-file function call signature mismatches.
   *
   * When AI generates multi-file code, it sometimes defines a function
   * with N parameters but calls it with a different number elsewhere.
   * This detects argument count mismatches across file boundaries.
   */
  private detectCallSignatureMismatches(
    units: CodeUnit[],
    results: DetectorResult[],
  ): void {
    // Collect function definitions with their parameter counts
    const funcDefs = new Map<string, Array<{
      file: string;
      line: number;
      paramCount: number;
      exported: boolean;
    }>>();

    for (const unit of units) {
      for (const def of unit.definitions) {
        if (def.kind !== 'function' && def.kind !== 'method') continue;
        if (!def.exported) continue; // Only check exported functions (cross-file relevant)

        if (!funcDefs.has(def.name)) funcDefs.set(def.name, []);

        // Get parameter count from the unit's complexity metrics
        const paramCount = unit.kind === 'function' || unit.kind === 'method'
          ? (unit.complexity.parameterCount ?? -1)
          : -1;

        if (paramCount >= 0) {
          funcDefs.get(def.name)!.push({
            file: unit.file,
            line: def.line,
            paramCount,
            exported: def.exported,
          });
        }
      }
    }

    // Check all call sites against known definitions
    for (const unit of units) {
      for (const call of unit.calls) {
        const defs = funcDefs.get(call.method);
        if (!defs || defs.length === 0) continue;

        // Only flag cross-file calls
        const crossFileDefs = defs.filter(d => d.file !== unit.file);
        if (crossFileDefs.length === 0) continue;

        for (const def of crossFileDefs) {
          // Allow some flexibility: flag if arg count differs by more than reasonable defaults
          // (Functions may have optional params, so only flag clearly wrong cases)
          if (call.argCount > def.paramCount + 1 || call.argCount < def.paramCount - 2) {
            results.push({
              detectorId: this.id,
              severity: 'warning',
              category: this.category,
              messageKey: 'context-coherence.call-signature-mismatch',
              message: `Function "${call.method}" is defined with ${def.paramCount} parameter(s) in "${def.file}" but called with ${call.argCount} argument(s) here. AI may have lost track of the function signature across files.`,
              file: unit.file,
              line: call.line + 1,
              confidence: 0.75,
              metadata: {
                functionName: call.method,
                definedParams: def.paramCount,
                calledArgs: call.argCount,
                definitionFile: def.file,
                analysisType: 'call-signature-mismatch',
              },
            });
          }
        }
      }
    }
  }

  /**
   * Capitalize a symbol kind for display.
   */
  private capitalizeKind(kind: string): string {
    return kind.charAt(0).toUpperCase() + kind.slice(1);
  }
}

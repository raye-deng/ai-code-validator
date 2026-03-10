/**
 * Open Code Review V4 — Kotlin Extractor
 *
 * Extracts CodeUnits from Kotlin tree-sitter CSTs.
 * Handles: imports (basic, aliased), classes (regular, data, sealed),
 * object declarations (singletons), functions (regular, extension),
 * companion objects, properties, calls, complexity, symbols.
 *
 * @since 0.4.0
 */

import type Parser from 'web-tree-sitter';
import type { LanguageExtractor } from '../extractor.js';
import type {
  CodeUnit,
  SupportedLanguage,
  ImportInfo,
  CallInfo,
  ComplexityMetrics,
  SymbolDef,
  SourceLocation,
} from '../../ir/types.js';
import { createCodeUnit, emptyComplexity } from '../../ir/types.js';

// ─── Tree-sitter node type constants ───────────────────────────────

/** Node types that represent branching (for cyclomatic complexity) */
const BRANCHING_NODES = new Set([
  'if_expression',
  'for_statement',
  'while_statement',
  'do_while_statement',
  'when_expression',
  'when_entry',
  'catch_block',
  'conjunction_expression',  // &&
  'disjunction_expression',  // ||
  'elvis_expression',        // ?:
]);

/** Node types that increase nesting depth */
const NESTING_NODES = new Set([
  'if_expression',
  'for_statement',
  'while_statement',
  'do_while_statement',
  'when_expression',
  'try_expression',
  'catch_block',
]);

/** Node types for cognitive complexity */
const COGNITIVE_NODES = new Set([
  'if_expression',
  'for_statement',
  'while_statement',
  'do_while_statement',
  'when_expression',
  'catch_block',
]);

// ─── Helper: Get node location ─────────────────────────────────────

function getLocation(node: Parser.SyntaxNode): SourceLocation {
  return {
    startLine: node.startPosition.row,
    startColumn: node.startPosition.column,
    endLine: node.endPosition.row,
    endColumn: node.endPosition.column,
  };
}

// ─── Helper: Count lines of code ───────────────────────────────────

function countLinesOfCode(source: string): number {
  const lines = source.split('\n');
  let count = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*')) {
      count++;
    }
  }
  return count;
}

// ─── Helper: Check if Kotlin declaration is exported (public) ──────

/**
 * In Kotlin, default visibility is public. So exported = NOT private/protected/internal.
 */
function isExported(node: Parser.SyntaxNode): boolean {
  const modifiers = node.children.find(c => c.type === 'modifiers');
  if (!modifiers) return true; // default = public = exported

  for (const mod of modifiers.children) {
    if (mod.type === 'visibility_modifier') {
      const text = mod.text;
      if (text === 'private' || text === 'protected' || text === 'internal') {
        return false;
      }
    }
  }
  return true;
}

// ─── Helper: Extract import from import_header ─────────────────────

function extractImport(node: Parser.SyntaxNode): ImportInfo | null {
  if (node.type !== 'import_header') return null;

  // import_header children: import, identifier, ['.', wildcard_import], [import_alias]
  const identNode = node.children.find(c => c.type === 'identifier');
  if (!identNode) return null;

  const fullPath = identNode.text;
  const aliasNode = node.children.find(c => c.type === 'import_alias');
  const hasWildcard = node.children.some(c => c.type === 'wildcard_import');
  const symbols: string[] = [];

  let moduleName: string;

  if (hasWildcard) {
    // import kotlin.collections.* → identifier = "kotlin.collections", wildcard_import = "*"
    // The identifier already contains the full module path
    moduleName = fullPath;
    symbols.push('*');
  } else {
    // Split into module and symbol
    const lastDot = fullPath.lastIndexOf('.');
    if (lastDot >= 0) {
      moduleName = fullPath.substring(0, lastDot);
      symbols.push(fullPath.substring(lastDot + 1));
    } else {
      moduleName = fullPath;
    }
  }

  return {
    module: moduleName,
    symbols,
    line: node.startPosition.row,
    isRelative: false,
    raw: node.text,
  };
}

// ─── Helper: Extract calls from a subtree ──────────────────────────

function extractCalls(node: Parser.SyntaxNode): CallInfo[] {
  const calls: CallInfo[] = [];

  function walk(n: Parser.SyntaxNode): void {
    if (n.type === 'call_expression') {
      // call_expression children: [callee_expr, call_suffix]
      // callee_expr can be: simple_identifier, navigation_expression, etc.
      const calleeNode = n.children[0];
      const callSuffix = n.children.find(c => c.type === 'call_suffix');

      if (calleeNode) {
        const callee = calleeNode.text;
        let object: string | undefined;
        let method: string;

        if (calleeNode.type === 'navigation_expression') {
          // navigation_expression children: [object_expr, navigation_suffix]
          // navigation_suffix children: ["." or "?.", simple_identifier]
          const objectExpr = calleeNode.children[0];
          const navSuffix = calleeNode.children.find(
            c => c.type === 'navigation_suffix',
          );
          if (navSuffix) {
            const nameInSuffix = navSuffix.children.find(
              c => c.type === 'simple_identifier',
            );
            object = objectExpr?.text;
            method = nameInSuffix?.text ?? callee;
          } else {
            // Fallback: parse as flat children
            const parts = calleeNode.children.filter(
              c => c.type !== '.' && c.type !== '?.',
            );
            if (parts.length >= 2) {
              object = parts.slice(0, -1).map(p => p.text).join('.');
              method = parts[parts.length - 1].text;
            } else {
              method = callee;
            }
          }
        } else if (calleeNode.type === 'simple_identifier') {
          method = calleeNode.text;
        } else {
          method = callee;
        }

        // Count arguments from call_suffix
        let argCount = 0;
        if (callSuffix) {
          const valueArgs = callSuffix.children.find(
            c => c.type === 'value_arguments',
          );
          if (valueArgs) {
            for (const arg of valueArgs.children) {
              if (arg.type === 'value_argument') {
                argCount++;
              }
            }
          }
          // Check for trailing lambda
          const annotatedLambda = callSuffix.children.find(
            c => c.type === 'annotated_lambda',
          );
          const lambdaLiteral = callSuffix.children.find(
            c => c.type === 'lambda_literal',
          );
          if (annotatedLambda || lambdaLiteral) {
            argCount++;
          }
        }

        calls.push({
          callee,
          object,
          method,
          line: n.startPosition.row,
          argCount,
        });
      }
    }

    for (let i = 0; i < n.childCount; i++) {
      walk(n.child(i)!);
    }
  }

  walk(node);
  return calls;
}

// ─── Helper: Compute complexity ────────────────────────────────────

function computeComplexity(
  node: Parser.SyntaxNode,
  source: string,
): ComplexityMetrics {
  let cyclomatic = 1; // base complexity
  let cognitive = 0;
  let maxDepth = 0;

  function walk(n: Parser.SyntaxNode, nestingDepth: number): void {
    // Cyclomatic complexity
    if (BRANCHING_NODES.has(n.type)) {
      if (
        n.type === 'conjunction_expression' ||
        n.type === 'disjunction_expression'
      ) {
        cyclomatic++;
      } else if (n.type === 'elvis_expression') {
        cyclomatic++;
      } else if (n.type === 'when_entry') {
        // Each when entry adds a branch
        cyclomatic++;
      } else {
        cyclomatic++;
      }
    }

    // Cognitive complexity
    if (COGNITIVE_NODES.has(n.type)) {
      cognitive += 1 + nestingDepth;
    }

    // && / || / ?: add cognitive complexity
    if (
      n.type === 'conjunction_expression' ||
      n.type === 'disjunction_expression' ||
      n.type === 'elvis_expression'
    ) {
      cognitive += 1;
    }

    // Nesting
    let newDepth = nestingDepth;
    if (NESTING_NODES.has(n.type)) {
      newDepth = nestingDepth + 1;
      if (newDepth > maxDepth) maxDepth = newDepth;
    }

    for (let i = 0; i < n.childCount; i++) {
      walk(n.child(i)!, newDepth);
    }
  }

  walk(node, 0);

  return {
    cyclomaticComplexity: cyclomatic,
    cognitiveComplexity: cognitive,
    maxNestingDepth: maxDepth,
    linesOfCode: countLinesOfCode(source),
  };
}

// ─── Helper: Count parameters (Kotlin) ─────────────────────────────

function countParameters(paramsNode: Parser.SyntaxNode): number {
  let count = 0;
  for (const child of paramsNode.children) {
    if (child.type === 'parameter') {
      count++;
    }
  }
  return count;
}

// ─── KotlinExtractor ───────────────────────────────────────────────

export class KotlinExtractor implements LanguageExtractor {
  readonly language: SupportedLanguage = 'kotlin';

  extract(
    tree: Parser.Tree,
    filePath: string,
    source: string,
  ): CodeUnit[] {
    const units: CodeUnit[] = [];
    const root = tree.rootNode;

    // 1. File-level CodeUnit
    const fileImports = this.extractFileImports(root);
    const fileCalls = extractCalls(root);
    const fileDefs = this.extractFileDefinitions(root);
    const fileComplexity = computeComplexity(root, source);

    const fileUnit = createCodeUnit({
      id: `file:${filePath}`,
      file: filePath,
      language: 'kotlin',
      kind: 'file',
      location: getLocation(root),
      source,
      imports: fileImports,
      calls: fileCalls,
      complexity: fileComplexity,
      definitions: fileDefs,
      references: [],
      childIds: [],
    });
    units.push(fileUnit);

    // 2. Extract top-level declarations
    this.extractTopLevelDeclarations(root, filePath, fileUnit, units);

    return units;
  }

  // ─── File-level imports ──────────────────────────────────────────

  private extractFileImports(root: Parser.SyntaxNode): ImportInfo[] {
    const imports: ImportInfo[] = [];

    // In Kotlin, imports are under import_list
    for (let i = 0; i < root.childCount; i++) {
      const child = root.child(i)!;
      if (child.type === 'import_list') {
        for (const importHeader of child.children) {
          if (importHeader.type === 'import_header') {
            const info = extractImport(importHeader);
            if (info) imports.push(info);
          }
        }
      } else if (child.type === 'import_header') {
        const info = extractImport(child);
        if (info) imports.push(info);
      }
    }

    return imports;
  }

  // ─── File-level definitions ──────────────────────────────────────

  private extractFileDefinitions(root: Parser.SyntaxNode): SymbolDef[] {
    const defs: SymbolDef[] = [];

    for (let i = 0; i < root.childCount; i++) {
      const child = root.child(i)!;

      if (child.type === 'class_declaration') {
        const nameNode = child.children.find(c => c.type === 'type_identifier');
        if (nameNode) {
          defs.push({
            name: nameNode.text,
            kind: 'class',
            line: child.startPosition.row,
            exported: isExported(child),
          });
        }
      } else if (child.type === 'object_declaration') {
        const nameNode = child.children.find(c => c.type === 'type_identifier');
        if (nameNode) {
          defs.push({
            name: nameNode.text,
            kind: 'class',
            line: child.startPosition.row,
            exported: isExported(child),
          });
        }
      } else if (child.type === 'function_declaration') {
        const nameNode = child.children.find(c => c.type === 'simple_identifier');
        if (nameNode) {
          defs.push({
            name: nameNode.text,
            kind: 'function',
            line: child.startPosition.row,
            exported: isExported(child),
          });
        }
      } else if (child.type === 'property_declaration') {
        const varDecl = child.children.find(c => c.type === 'variable_declaration');
        if (varDecl) {
          const nameNode = varDecl.children.find(c => c.type === 'simple_identifier');
          if (nameNode) {
            defs.push({
              name: nameNode.text,
              kind: 'variable',
              line: child.startPosition.row,
              exported: isExported(child),
            });
          }
        }
      }
    }

    return defs;
  }

  // ─── Extract top-level declarations ──────────────────────────────

  private extractTopLevelDeclarations(
    root: Parser.SyntaxNode,
    filePath: string,
    fileUnit: CodeUnit,
    units: CodeUnit[],
  ): void {
    for (let i = 0; i < root.childCount; i++) {
      const child = root.child(i)!;

      if (child.type === 'class_declaration') {
        this.extractClass(child, filePath, fileUnit, units);
      } else if (child.type === 'object_declaration') {
        this.extractObjectDeclaration(child, filePath, fileUnit, units);
      } else if (child.type === 'function_declaration') {
        this.extractFunction(child, filePath, fileUnit, units);
      }
    }
  }

  // ─── Extract a class declaration ─────────────────────────────────

  private extractClass(
    classNode: Parser.SyntaxNode,
    filePath: string,
    parentUnit: CodeUnit,
    units: CodeUnit[],
  ): void {
    const nameNode = classNode.children.find(c => c.type === 'type_identifier');
    if (!nameNode) return;

    const className = nameNode.text;
    const classId = `class:${filePath}:${className}`;
    const classSource = classNode.text;
    const classCalls = extractCalls(classNode);
    const classComplexity = computeComplexity(classNode, classSource);
    const exported = isExported(classNode);

    // Determine class kind (data, sealed, enum, interface, regular)
    const modifiers = classNode.children.find(c => c.type === 'modifiers');
    let symbolKind: 'class' | 'interface' | 'enum' = 'class';

    // Check if it's an interface
    if (classNode.children.some(c => c.type === 'interface')) {
      symbolKind = 'interface';
    }

    // Check for enum_class_body
    const classBody = classNode.children.find(c => c.type === 'class_body');
    const enumBody = classNode.children.find(c => c.type === 'enum_class_body');
    if (enumBody) {
      symbolKind = 'enum';
    }

    const classDefs: SymbolDef[] = [
      {
        name: className,
        kind: symbolKind,
        line: classNode.startPosition.row,
        exported,
      },
    ];

    // Extract primary constructor parameters as definitions
    const primaryCtor = classNode.children.find(c => c.type === 'primary_constructor');
    if (primaryCtor) {
      for (const param of primaryCtor.children) {
        if (param.type === 'class_parameter') {
          const paramName = param.children.find(c => c.type === 'simple_identifier');
          if (paramName) {
            const hasValOrVar = param.children.some(
              c => c.type === 'binding_pattern_kind',
            );
            classDefs.push({
              name: paramName.text,
              kind: hasValOrVar ? 'variable' : 'parameter',
              line: param.startPosition.row,
              exported: hasValOrVar, // val/var params are effectively public properties
            });
          }
        }
      }
    }

    const classUnit = createCodeUnit({
      id: classId,
      file: filePath,
      language: 'kotlin',
      kind: 'class',
      location: getLocation(classNode),
      source: classSource,
      calls: classCalls,
      complexity: classComplexity,
      definitions: classDefs,
      parentId: parentUnit.id,
    });

    units.push(classUnit);
    parentUnit.childIds.push(classId);

    // Extract members from class body
    const body = classBody ?? enumBody;
    if (body) {
      this.extractClassMembers(body, className, filePath, classUnit, units);
    }
  }

  // ─── Extract an object declaration (singleton) ───────────────────

  private extractObjectDeclaration(
    objNode: Parser.SyntaxNode,
    filePath: string,
    parentUnit: CodeUnit,
    units: CodeUnit[],
  ): void {
    const nameNode = objNode.children.find(c => c.type === 'type_identifier');
    if (!nameNode) return;

    const objName = nameNode.text;
    const objId = `class:${filePath}:${objName}`;
    const objSource = objNode.text;
    const objCalls = extractCalls(objNode);
    const objComplexity = computeComplexity(objNode, objSource);
    const exported = isExported(objNode);

    const objDefs: SymbolDef[] = [
      {
        name: objName,
        kind: 'class',
        line: objNode.startPosition.row,
        exported,
      },
    ];

    const objUnit = createCodeUnit({
      id: objId,
      file: filePath,
      language: 'kotlin',
      kind: 'class',
      location: getLocation(objNode),
      source: objSource,
      calls: objCalls,
      complexity: objComplexity,
      definitions: objDefs,
      parentId: parentUnit.id,
    });

    units.push(objUnit);
    parentUnit.childIds.push(objId);

    // Extract members from object body
    const body = objNode.children.find(c => c.type === 'class_body');
    if (body) {
      this.extractClassMembers(body, objName, filePath, objUnit, units);
    }
  }

  // ─── Extract members from a class/object body ───────────────────

  private extractClassMembers(
    body: Parser.SyntaxNode,
    className: string,
    filePath: string,
    classUnit: CodeUnit,
    units: CodeUnit[],
  ): void {
    for (let i = 0; i < body.childCount; i++) {
      const member = body.child(i)!;

      if (member.type === 'function_declaration') {
        const nameNode = member.children.find(c => c.type === 'simple_identifier');
        if (!nameNode) continue;

        const methodName = nameNode.text;
        const methodId = `method:${filePath}:${className}.${methodName}`;
        const methodSource = member.text;

        const paramsNode = member.children.find(
          c => c.type === 'function_value_parameters',
        );
        const paramCount = paramsNode ? countParameters(paramsNode) : 0;

        const complexity = computeComplexity(member, methodSource);
        complexity.parameterCount = paramCount;

        const calls = extractCalls(member);
        const exported = isExported(member);

        const methodDefs: SymbolDef[] = [
          {
            name: methodName,
            kind: 'method',
            line: member.startPosition.row,
            exported,
          },
        ];

        // Extract parameter definitions
        if (paramsNode) {
          for (const param of paramsNode.children) {
            if (param.type === 'parameter') {
              const paramName = param.children.find(
                c => c.type === 'simple_identifier',
              );
              if (paramName) {
                methodDefs.push({
                  name: paramName.text,
                  kind: 'parameter',
                  line: param.startPosition.row,
                  exported: false,
                });
              }
            }
          }
        }

        const methodUnit = createCodeUnit({
          id: methodId,
          file: filePath,
          language: 'kotlin',
          kind: 'method',
          location: getLocation(member),
          source: methodSource,
          calls,
          complexity,
          definitions: methodDefs,
          parentId: classUnit.id,
        });

        units.push(methodUnit);
        classUnit.childIds.push(methodId);
      } else if (member.type === 'companion_object') {
        // Extract companion object as a nested class-like unit
        const companionName = `${className}.Companion`;
        const companionId = `class:${filePath}:${companionName}`;
        const companionSource = member.text;
        const companionCalls = extractCalls(member);
        const companionComplexity = computeComplexity(member, companionSource);

        const companionDefs: SymbolDef[] = [
          {
            name: 'Companion',
            kind: 'class',
            line: member.startPosition.row,
            exported: true,
          },
        ];

        const companionUnit = createCodeUnit({
          id: companionId,
          file: filePath,
          language: 'kotlin',
          kind: 'class',
          location: getLocation(member),
          source: companionSource,
          calls: companionCalls,
          complexity: companionComplexity,
          definitions: companionDefs,
          parentId: classUnit.id,
        });

        units.push(companionUnit);
        classUnit.childIds.push(companionId);

        // Extract functions inside companion object body
        const companionBody = member.children.find(
          c => c.type === 'class_body',
        );
        if (companionBody) {
          this.extractClassMembers(
            companionBody,
            companionName,
            filePath,
            companionUnit,
            units,
          );
        }
      } else if (member.type === 'property_declaration') {
        // Properties add to the parent class definitions
        const varDecl = member.children.find(
          c => c.type === 'variable_declaration',
        );
        if (varDecl) {
          const nameNode = varDecl.children.find(
            c => c.type === 'simple_identifier',
          );
          if (nameNode) {
            classUnit.definitions.push({
              name: nameNode.text,
              kind: 'variable',
              line: member.startPosition.row,
              exported: isExported(member),
            });
          }
        }
      }
    }
  }

  // ─── Extract top-level functions ─────────────────────────────────

  private extractFunction(
    funcNode: Parser.SyntaxNode,
    filePath: string,
    parentUnit: CodeUnit,
    units: CodeUnit[],
  ): void {
    const nameNode = funcNode.children.find(c => c.type === 'simple_identifier');
    if (!nameNode) return;

    const funcName = nameNode.text;

    // Check if it's an extension function
    // Extension functions have a user_type (receiver) before the dot before the name
    const dotIndex = funcNode.children.findIndex(c => c.text === '.');
    let receiverType: string | undefined;
    if (dotIndex > 0) {
      const possibleReceiver = funcNode.children[dotIndex - 1];
      if (possibleReceiver && possibleReceiver.type === 'user_type') {
        receiverType = possibleReceiver.text;
      }
    }

    const funcId = receiverType
      ? `func:${filePath}:${receiverType}.${funcName}`
      : `func:${filePath}:${funcName}`;
    const funcSource = funcNode.text;

    const paramsNode = funcNode.children.find(
      c => c.type === 'function_value_parameters',
    );
    const paramCount = paramsNode ? countParameters(paramsNode) : 0;

    const complexity = computeComplexity(funcNode, funcSource);
    complexity.parameterCount = paramCount;

    const calls = extractCalls(funcNode);
    const exported = isExported(funcNode);

    const funcDefs: SymbolDef[] = [
      {
        name: funcName,
        kind: 'function',
        line: funcNode.startPosition.row,
        exported,
      },
    ];

    // Extract parameter definitions
    if (paramsNode) {
      for (const param of paramsNode.children) {
        if (param.type === 'parameter') {
          const paramName = param.children.find(
            c => c.type === 'simple_identifier',
          );
          if (paramName) {
            funcDefs.push({
              name: paramName.text,
              kind: 'parameter',
              line: param.startPosition.row,
              exported: false,
            });
          }
        }
      }
    }

    const funcUnit = createCodeUnit({
      id: funcId,
      file: filePath,
      language: 'kotlin',
      kind: 'function',
      location: getLocation(funcNode),
      source: funcSource,
      calls,
      complexity,
      definitions: funcDefs,
      parentId: parentUnit.id,
    });

    units.push(funcUnit);
    parentUnit.childIds.push(funcId);
  }
}

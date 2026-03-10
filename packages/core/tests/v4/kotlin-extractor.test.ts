/**
 * V4 Kotlin Extractor Tests
 *
 * Tests for extracting CodeUnits from Kotlin tree-sitter CSTs.
 * Covers: imports (basic, aliased), classes (regular, data, sealed),
 * object declarations, functions (regular, extension), calls,
 * complexity (if/for/while/when/catch/elvis), properties, companion objects,
 * default visibility, lambda expressions.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ParserManager } from '../../src/parser/manager.js';
import { KotlinExtractor } from '../../src/parser/extractors/kotlin.js';
import type { CodeUnit } from '../../src/ir/types.js';

describe('V4 KotlinExtractor', () => {
  let manager: ParserManager;
  let extractor: KotlinExtractor;

  beforeAll(async () => {
    manager = new ParserManager();
    await manager.init();
    extractor = new KotlinExtractor();
  });

  function parse(source: string): CodeUnit[] {
    const tree = manager.parse(source, 'kotlin');
    return extractor.extract(tree, 'Test.kt', source);
  }

  // ─── Imports ─────────────────────────────────────────────────────

  describe('import extraction', () => {
    it('should extract a basic import', () => {
      const units = parse('import kotlin.collections.List');
      const fileUnit = units.find(u => u.kind === 'file')!;
      expect(fileUnit.imports).toHaveLength(1);
      expect(fileUnit.imports[0].module).toBe('kotlin.collections');
      expect(fileUnit.imports[0].symbols).toEqual(['List']);
      expect(fileUnit.imports[0].isRelative).toBe(false);
    });

    it('should extract an aliased import', () => {
      const units = parse('import org.junit.Test as JTest');
      const fileUnit = units.find(u => u.kind === 'file')!;
      expect(fileUnit.imports).toHaveLength(1);
      expect(fileUnit.imports[0].module).toBe('org.junit');
      expect(fileUnit.imports[0].symbols).toEqual(['Test']);
    });

    it('should extract multiple imports', () => {
      const source = `
import kotlin.collections.List
import kotlin.collections.Map
import java.io.File
`;
      const units = parse(source);
      const fileUnit = units.find(u => u.kind === 'file')!;
      expect(fileUnit.imports).toHaveLength(3);
      expect(fileUnit.imports[0].module).toBe('kotlin.collections');
      expect(fileUnit.imports[1].module).toBe('kotlin.collections');
      expect(fileUnit.imports[2].module).toBe('java.io');
    });

    it('should extract wildcard imports', () => {
      const units = parse('import kotlin.collections.*');
      const fileUnit = units.find(u => u.kind === 'file')!;
      expect(fileUnit.imports).toHaveLength(1);
      expect(fileUnit.imports[0].module).toBe('kotlin.collections');
      expect(fileUnit.imports[0].symbols).toEqual(['*']);
    });
  });

  // ─── Classes ─────────────────────────────────────────────────────

  describe('class extraction', () => {
    it('should extract a regular class', () => {
      const units = parse(`
class Foo {
  fun greet(): String { return "hello" }
}
`);
      const classUnit = units.find(u => u.kind === 'class' && u.id.includes('Foo'))!;
      expect(classUnit).toBeDefined();
      expect(classUnit.definitions[0].name).toBe('Foo');
      expect(classUnit.definitions[0].kind).toBe('class');
      expect(classUnit.definitions[0].exported).toBe(true); // default visibility is public
    });

    it('should extract a data class', () => {
      const units = parse('data class Point(val x: Int, val y: Int)');
      const classUnit = units.find(u => u.kind === 'class' && u.id.includes('Point'))!;
      expect(classUnit).toBeDefined();
      expect(classUnit.definitions[0].name).toBe('Point');
      expect(classUnit.definitions[0].kind).toBe('class');

      // Check primary constructor parameters (val = property)
      const properties = classUnit.definitions.filter(d => d.kind === 'variable');
      expect(properties).toHaveLength(2);
      expect(properties.map(p => p.name)).toContain('x');
      expect(properties.map(p => p.name)).toContain('y');
    });

    it('should extract a sealed class', () => {
      const units = parse('sealed class Result');
      const classUnit = units.find(u => u.kind === 'class' && u.id.includes('Result'))!;
      expect(classUnit).toBeDefined();
      expect(classUnit.definitions[0].name).toBe('Result');
    });

    it('should extract a private class as not exported', () => {
      const units = parse('private class InternalHelper');
      const classUnit = units.find(u => u.kind === 'class' && u.id.includes('InternalHelper'))!;
      expect(classUnit).toBeDefined();
      expect(classUnit.definitions[0].exported).toBe(false);
    });
  });

  // ─── Object Declarations ─────────────────────────────────────────

  describe('object declarations', () => {
    it('should extract an object declaration (singleton)', () => {
      const units = parse(`
object Singleton {
  fun doSomething() { }
}
`);
      const objUnit = units.find(u => u.kind === 'class' && u.id.includes('Singleton'))!;
      expect(objUnit).toBeDefined();
      expect(objUnit.definitions[0].name).toBe('Singleton');
      expect(objUnit.definitions[0].kind).toBe('class');
      expect(objUnit.definitions[0].exported).toBe(true);

      // Should have the method as a child
      const methodUnit = units.find(u => u.kind === 'method' && u.id.includes('doSomething'))!;
      expect(methodUnit).toBeDefined();
      expect(methodUnit.parentId).toBe(objUnit.id);
    });
  });

  // ─── Functions ───────────────────────────────────────────────────

  describe('function extraction', () => {
    it('should extract a top-level function', () => {
      const units = parse(`
fun topLevel(a: Int, b: Int): Int { return a + b }
`);
      const funcUnit = units.find(u => u.kind === 'function')!;
      expect(funcUnit).toBeDefined();
      expect(funcUnit.definitions[0].name).toBe('topLevel');
      expect(funcUnit.definitions[0].kind).toBe('function');
      expect(funcUnit.complexity.parameterCount).toBe(2);
    });

    it('should extract an extension function', () => {
      const units = parse(`
fun String.toSnakeCase(): String { return this.lowercase() }
`);
      const funcUnit = units.find(u => u.kind === 'function')!;
      expect(funcUnit).toBeDefined();
      expect(funcUnit.definitions[0].name).toBe('toSnakeCase');
      expect(funcUnit.id).toContain('String.toSnakeCase');
    });

    it('should extract function parameters as definitions', () => {
      const units = parse(`
fun process(name: String, count: Int): String { return name }
`);
      const funcUnit = units.find(u => u.kind === 'function')!;
      const params = funcUnit.definitions.filter(d => d.kind === 'parameter');
      expect(params).toHaveLength(2);
      expect(params.map(p => p.name)).toContain('name');
      expect(params.map(p => p.name)).toContain('count');
    });
  });

  // ─── Calls ───────────────────────────────────────────────────────

  describe('call extraction', () => {
    it('should extract regular function calls', () => {
      const units = parse(`
fun main() {
  println("hello")
  listOf(1, 2, 3)
}
`);
      const funcUnit = units.find(u => u.kind === 'function')!;
      expect(funcUnit.calls.length).toBeGreaterThanOrEqual(2);
      const printlnCall = funcUnit.calls.find(c => c.method === 'println');
      expect(printlnCall).toBeDefined();
      expect(printlnCall!.argCount).toBe(1);
    });

    it('should extract method calls on objects', () => {
      const units = parse(`
fun main() {
  val list = listOf(1, 2, 3)
  list.filter { it > 1 }
  list.map { it * 2 }
}
`);
      const funcUnit = units.find(u => u.kind === 'function')!;
      const filterCall = funcUnit.calls.find(c => c.method === 'filter');
      expect(filterCall).toBeDefined();
      expect(filterCall!.object).toBe('list');
    });

    it('should extract constructor calls', () => {
      const units = parse(`
fun main() {
  val foo = Foo()
  val bar = Bar(1, "hello")
}
`);
      const funcUnit = units.find(u => u.kind === 'function')!;
      const fooCalls = funcUnit.calls.filter(c => c.method === 'Foo');
      expect(fooCalls).toHaveLength(1);
      const barCalls = funcUnit.calls.filter(c => c.method === 'Bar');
      expect(barCalls).toHaveLength(1);
    });
  });

  // ─── Complexity ──────────────────────────────────────────────────

  describe('complexity calculation', () => {
    it('should calculate complexity for if/for/while', () => {
      const units = parse(`
fun process(x: Int): Int {
  if (x > 0) {
    for (i in 1..10) {
      while (true) { break }
    }
  }
  return x
}
`);
      const funcUnit = units.find(u => u.kind === 'function')!;
      // base 1 + if + for + while = 4
      expect(funcUnit.complexity.cyclomaticComplexity).toBeGreaterThanOrEqual(4);
    });

    it('should count when expression branches', () => {
      const units = parse(`
fun describe(x: Int): String {
  return when(x) {
    1 -> "one"
    2 -> "two"
    else -> "other"
  }
}
`);
      const funcUnit = units.find(u => u.kind === 'function')!;
      // base 1 + when + 3 entries = 5
      expect(funcUnit.complexity.cyclomaticComplexity).toBeGreaterThanOrEqual(4);
    });

    it('should count catch blocks in complexity', () => {
      const units = parse(`
fun safe() {
  try {
    riskyOperation()
  } catch (e: Exception) {
    handleError(e)
  }
}
`);
      const funcUnit = units.find(u => u.kind === 'function')!;
      // base 1 + catch = 2
      expect(funcUnit.complexity.cyclomaticComplexity).toBeGreaterThanOrEqual(2);
    });

    it('should count elvis operator in complexity', () => {
      const units = parse(`
fun getValue(x: Int?): Int {
  return x ?: 0
}
`);
      const funcUnit = units.find(u => u.kind === 'function')!;
      // base 1 + elvis = 2
      expect(funcUnit.complexity.cyclomaticComplexity).toBeGreaterThanOrEqual(2);
    });

    it('should count && and || in complexity', () => {
      const units = parse(`
fun check(x: Int, y: Int): Boolean {
  return x > 0 && y < 10
}
`);
      const funcUnit = units.find(u => u.kind === 'function')!;
      // base 1 + && = 2
      expect(funcUnit.complexity.cyclomaticComplexity).toBeGreaterThanOrEqual(2);
    });

    it('should calculate nesting depth', () => {
      const units = parse(`
fun deep() {
  if (true) {
    for (i in 1..10) {
      while (true) { break }
    }
  }
}
`);
      const funcUnit = units.find(u => u.kind === 'function')!;
      expect(funcUnit.complexity.maxNestingDepth).toBeGreaterThanOrEqual(3);
    });
  });

  // ─── Properties ──────────────────────────────────────────────────

  describe('property extraction', () => {
    it('should extract top-level val/var properties', () => {
      const units = parse(`
val PI = 3.14
var counter = 0
`);
      const fileUnit = units.find(u => u.kind === 'file')!;
      const props = fileUnit.definitions.filter(d => d.kind === 'variable');
      expect(props).toHaveLength(2);
      expect(props.map(p => p.name)).toContain('PI');
      expect(props.map(p => p.name)).toContain('counter');
    });

    it('should extract class properties', () => {
      const units = parse(`
class Config {
  val name: String = "default"
  var count: Int = 0
}
`);
      const classUnit = units.find(u => u.kind === 'class')!;
      const props = classUnit.definitions.filter(d => d.kind === 'variable');
      expect(props).toHaveLength(2);
      expect(props.map(p => p.name)).toContain('name');
      expect(props.map(p => p.name)).toContain('count');
    });
  });

  // ─── Companion Objects ───────────────────────────────────────────

  describe('companion objects', () => {
    it('should extract companion object and its members', () => {
      const units = parse(`
class Foo {
  companion object {
    fun create(): String { return "foo" }
  }
}
`);
      const fooUnit = units.find(u => u.kind === 'class' && u.id.includes(':Foo'))!;
      expect(fooUnit).toBeDefined();

      const companionUnit = units.find(u => u.kind === 'class' && u.id.includes('Foo.Companion'))!;
      expect(companionUnit).toBeDefined();
      expect(companionUnit.parentId).toBe(fooUnit.id);
      expect(fooUnit.childIds).toContain(companionUnit.id);

      // Companion object should have the create method
      const createMethod = units.find(u => u.kind === 'method' && u.id.includes('create'))!;
      expect(createMethod).toBeDefined();
      expect(createMethod.parentId).toBe(companionUnit.id);
    });
  });

  // ─── Default Visibility ──────────────────────────────────────────

  describe('default visibility (public)', () => {
    it('should treat default visibility as exported (public)', () => {
      const units = parse(`
class PublicClass
fun publicFunction() {}
val publicProp = 1
`);
      const fileUnit = units.find(u => u.kind === 'file')!;
      for (const def of fileUnit.definitions) {
        expect(def.exported).toBe(true);
      }
    });

    it('should treat private as not exported', () => {
      const units = parse(`
private class PrivateClass
private fun privateFunction() {}
`);
      const fileUnit = units.find(u => u.kind === 'file')!;
      const classDef = fileUnit.definitions.find(d => d.name === 'PrivateClass')!;
      const funcDef = fileUnit.definitions.find(d => d.name === 'privateFunction')!;
      expect(classDef.exported).toBe(false);
      expect(funcDef.exported).toBe(false);
    });

    it('should treat internal as not exported', () => {
      const units = parse('internal class InternalClass');
      const classUnit = units.find(u => u.kind === 'class')!;
      expect(classUnit.definitions[0].exported).toBe(false);
    });
  });

  // ─── Lambda Expressions ──────────────────────────────────────────

  describe('lambda expressions', () => {
    it('should extract calls with trailing lambdas', () => {
      const units = parse(`
fun main() {
  val items = listOf(1, 2, 3)
  items.map { it * 2 }
  items.filter { it > 1 }
}
`);
      const funcUnit = units.find(u => u.kind === 'function')!;
      const mapCall = funcUnit.calls.find(c => c.method === 'map');
      expect(mapCall).toBeDefined();
      expect(mapCall!.argCount).toBeGreaterThanOrEqual(1);

      const filterCall = funcUnit.calls.find(c => c.method === 'filter');
      expect(filterCall).toBeDefined();
    });
  });

  // ─── Unit Structure ──────────────────────────────────────────────

  describe('unit structure', () => {
    it('should always include a file-level unit', () => {
      const units = parse('val x = 1');
      const fileUnit = units.find(u => u.kind === 'file')!;
      expect(fileUnit).toBeDefined();
      expect(fileUnit.language).toBe('kotlin');
      expect(fileUnit.file).toBe('Test.kt');
    });

    it('should set correct parent-child relationships', () => {
      const units = parse(`
class Foo {
  fun bar() {}
  fun baz() {}
}
`);
      const fileUnit = units.find(u => u.kind === 'file')!;
      const classUnit = units.find(u => u.kind === 'class')!;
      const methodUnits = units.filter(u => u.kind === 'method');

      expect(fileUnit.childIds).toContain(classUnit.id);
      expect(classUnit.parentId).toBe(fileUnit.id);

      for (const method of methodUnits) {
        expect(classUnit.childIds).toContain(method.id);
        expect(method.parentId).toBe(classUnit.id);
      }
    });

    it('should count lines of code', () => {
      const source = `
class Foo {
  // This is a comment
  /* Multi-line
   * comment
   */
  fun bar() {
    println("hello")
  }
}
`;
      const units = parse(source);
      const fileUnit = units.find(u => u.kind === 'file')!;
      expect(fileUnit.complexity.linesOfCode).toBeGreaterThan(0);
    });
  });
});

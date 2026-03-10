/**
 * Java LanguageAdapter Tests
 *
 * Tests for the JavaAdapter: parsing, import extraction, call extraction,
 * complexity metrics, deprecated API detection, package verification,
 * and integration with the LanguageRegistry.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { JavaAdapter, JAVA_STDLIB_PACKAGES, JAVA_COMMON_PACKAGES } from '../src/languages/java/index.js';
import { LanguageRegistry } from '../src/languages/registry.js';

describe('JavaAdapter', () => {
  const adapter = new JavaAdapter();

  // ─── Properties ───

  describe('properties', () => {
    it('should have correct id', () => {
      expect(adapter.id).toBe('java');
    });

    it('should support .java extension', () => {
      expect(adapter.extensions).toContain('.java');
    });
  });

  // ─── Parse ───

  describe('parse', () => {
    it('should parse Java source code into a JavaCompilationUnit node', async () => {
      const source = `
package com.example;

import java.util.List;

public class Main {
    public static void main(String[] args) {
        System.out.println("Hello");
    }
}
`;
      const ast = await adapter.parse(source, 'Main.java');
      expect(ast).toBeDefined();
      expect(ast.type).toBe('JavaCompilationUnit');
      expect((ast as any).lines).toBeInstanceOf(Array);
      expect((ast as any).source).toBe(source);
    });

    it('should parse empty source', async () => {
      const ast = await adapter.parse('', 'Empty.java');
      expect(ast.type).toBe('JavaCompilationUnit');
      expect((ast as any).lines).toEqual(['']);
    });
  });

  // ─── Import Extraction ───

  describe('extractImports', () => {
    it('should extract simple import statements', () => {
      const source = `import java.util.List;
import java.io.File;
import java.net.URL;`;
      const imports = adapter.extractImports(source);
      expect(imports.length).toBe(3);
      expect(imports[0].module).toBe('java.util');
      expect(imports[0].bindings).toContain('List');
      expect(imports[0].isBuiltin).toBe(true);
      expect(imports[1].module).toBe('java.io');
      expect(imports[1].bindings).toContain('File');
      expect(imports[2].module).toBe('java.net');
      expect(imports[2].bindings).toContain('URL');
    });

    it('should extract wildcard imports', () => {
      const source = `import java.util.*;
import javax.swing.*;`;
      const imports = adapter.extractImports(source);
      expect(imports.length).toBe(2);
      expect(imports[0].module).toBe('java.util');
      expect(imports[0].bindings).toContain('*');
      expect(imports[0].isBuiltin).toBe(true);
      expect(imports[1].module).toBe('javax.swing');
      expect(imports[1].bindings).toContain('*');
    });

    it('should extract static imports', () => {
      const source = `import static org.junit.Assert.assertEquals;
import static java.lang.Math.PI;
import static org.junit.Assert.*;`;
      const imports = adapter.extractImports(source);
      expect(imports.length).toBe(3);
      expect(imports[0].module).toBe('org.junit.Assert');
      expect(imports[0].bindings).toContain('assertEquals');
      expect(imports[1].module).toBe('java.lang.Math');
      expect(imports[1].bindings).toContain('PI');
      expect(imports[2].module).toBe('org.junit.Assert');
      expect(imports[2].bindings).toContain('*');
    });

    it('should correctly identify stdlib vs third-party imports', () => {
      const source = `import java.util.List;
import java.io.File;
import org.springframework.boot.SpringApplication;
import com.fasterxml.jackson.databind.ObjectMapper;`;
      const imports = adapter.extractImports(source);
      expect(imports[0].isBuiltin).toBe(true);  // java.util
      expect(imports[1].isBuiltin).toBe(true);  // java.io
      expect(imports[2].isBuiltin).toBe(false);  // org.springframework
      expect(imports[3].isBuiltin).toBe(false);  // com.fasterxml
    });

    it('should skip comments', () => {
      const source = `// import java.util.List;
import java.io.File;
/* import java.net.URL; */`;
      const imports = adapter.extractImports(source);
      expect(imports.length).toBe(1);
      expect(imports[0].module).toBe('java.io');
    });

    it('should extract javax imports', () => {
      const source = `import javax.servlet.http.HttpServletRequest;
import javax.persistence.Entity;`;
      const imports = adapter.extractImports(source);
      expect(imports.length).toBe(2);
      expect(imports[0].isBuiltin).toBe(true);  // javax.servlet
      expect(imports[1].isBuiltin).toBe(true);  // javax.persistence
    });

    it('should extract org.w3c and org.xml imports as builtin', () => {
      const source = `import org.w3c.dom.Document;
import org.xml.sax.SAXException;`;
      const imports = adapter.extractImports(source);
      expect(imports.length).toBe(2);
      expect(imports[0].isBuiltin).toBe(true);  // org.w3c.dom
      expect(imports[1].isBuiltin).toBe(true);  // org.xml.sax
    });
  });

  // ─── Call Extraction ───

  describe('extractCalls', () => {
    it('should extract method calls', () => {
      const source = `System.out.println("hello");
list.add(item);
String.valueOf(42);`;
      const calls = adapter.extractCalls(source);
      const names = calls.map(c => c.name);
      expect(names).toContain('System.out.println');
      expect(names).toContain('list.add');
      expect(names).toContain('String.valueOf');
    });

    it('should extract standalone function calls', () => {
      const source = `assertEquals(expected, actual);
assertTrue(result);`;
      const calls = adapter.extractCalls(source);
      const names = calls.map(c => c.name);
      expect(names).toContain('assertEquals');
      expect(names).toContain('assertTrue');
    });

    it('should not extract Java keywords as calls', () => {
      const source = `if (x > 0) {
    for (int i = 0; i < 10; i++) {
        while (running) {
            switch (state) {
                case 1: break;
            }
        }
    }
}`;
      const calls = adapter.extractCalls(source);
      const names = calls.map(c => c.name);
      expect(names).not.toContain('if');
      expect(names).not.toContain('for');
      expect(names).not.toContain('while');
      expect(names).not.toContain('switch');
    });

    it('should skip import declarations', () => {
      const source = `import java.util.List;
import java.io.File;
System.out.println("test");`;
      const calls = adapter.extractCalls(source);
      // Should not have any calls from import lines
      const names = calls.map(c => c.name);
      expect(names).toContain('System.out.println');
      expect(calls.length).toBe(1);
    });
  });

  // ─── Complexity ───

  describe('computeComplexity', () => {
    it('should compute base complexity for simple code', () => {
      const source = `public class Simple {
    public int add(int a, int b) {
        return a + b;
    }
}`;
      const metrics = adapter.computeComplexity(source);
      expect(metrics.cyclomatic).toBe(1);
      expect(metrics.loc).toBeGreaterThan(0);
      expect(metrics.functionCount).toBe(1);
    });

    it('should increase complexity for if/else branches', () => {
      const source = `public class Branching {
    public String classify(int x) {
        if (x > 0) {
            if (x > 100) {
                return "big";
            } else {
                return "small";
            }
        } else if (x < 0) {
            return "negative";
        } else {
            return "zero";
        }
    }
}`;
      const metrics = adapter.computeComplexity(source);
      // 1 (base) + 3 (if, if, else if) = 4
      expect(metrics.cyclomatic).toBeGreaterThanOrEqual(4);
    });

    it('should count logical operators', () => {
      const source = `public class Logic {
    public boolean check(int x, int y) {
        if (x > 0 && y > 0 || x < -10) {
            return true;
        }
        return false;
    }
}`;
      const metrics = adapter.computeComplexity(source);
      // 1 (base) + 1 (if) + 2 (&&, ||) = 4
      expect(metrics.cyclomatic).toBeGreaterThanOrEqual(4);
    });

    it('should count switch/case statements', () => {
      const source = `public class SwitchCase {
    public String dayType(int day) {
        switch (day) {
            case 1: return "Monday";
            case 2: return "Tuesday";
            case 3: return "Wednesday";
            default: return "Other";
        }
    }
}`;
      const metrics = adapter.computeComplexity(source);
      // 1 (base) + 3 (cases) = 4
      expect(metrics.cyclomatic).toBeGreaterThanOrEqual(4);
    });

    it('should track nesting depth', () => {
      const source = `public class Deep {
    public void deep() {
        if (true) {
            for (int i = 0; i < 10; i++) {
                while (true) {
                    if (false) {
                        break;
                    }
                }
            }
        }
    }
}`;
      const metrics = adapter.computeComplexity(source);
      expect(metrics.maxNestingDepth).toBeGreaterThanOrEqual(4);
    });

    it('should have higher complexity for complex code vs simple code', () => {
      const simple = `public class Simple {
    public int add(int a, int b) {
        return a + b;
    }
}`;
      const complex = `public class Complex {
    public void process(List<String> data) {
        if (data == null) {
            return;
        }
        for (String item : data) {
            if (item != null && item.length() > 0) {
                try {
                    transform(item);
                } catch (Exception e) {
                    continue;
                }
            } else if (item == null) {
                handleNull();
            }
        }
    }
}`;
      const simpleMetrics = adapter.computeComplexity(simple);
      const complexMetrics = adapter.computeComplexity(complex);
      expect(complexMetrics.cyclomatic).toBeGreaterThan(simpleMetrics.cyclomatic);
      expect(complexMetrics.cognitive).toBeGreaterThan(simpleMetrics.cognitive);
    });
  });

  // ─── Deprecated API Detection ───

  describe('checkDeprecated', () => {
    it('should detect new Date() as deprecated', () => {
      const result = adapter.checkDeprecated('new Date()');
      expect(result).not.toBeNull();
      expect(result!.api).toContain('Date');
    });

    it('should detect Vector usage as deprecated', () => {
      const result = adapter.checkDeprecated('Vector<String> list = new Vector<>();');
      expect(result).not.toBeNull();
      expect(result!.api).toContain('Vector');
    });

    it('should detect Hashtable usage as deprecated', () => {
      const result = adapter.checkDeprecated('Hashtable<String, Object> map = new Hashtable<>();');
      expect(result).not.toBeNull();
      expect(result!.api).toContain('Hashtable');
    });

    it('should detect Thread.stop() as deprecated', () => {
      const result = adapter.checkDeprecated('thread.stop()');
      expect(result).not.toBeNull();
      expect(result!.api).toContain('Thread.stop');
    });

    it('should detect System.gc() as deprecated', () => {
      const result = adapter.checkDeprecated('System.gc()');
      expect(result).not.toBeNull();
    });

    it('should detect finalize() as deprecated', () => {
      const result = adapter.checkDeprecated('protected void finalize()');
      expect(result).not.toBeNull();
      expect(result!.api).toContain('finalize');
    });

    it('should detect StringBuffer as deprecated', () => {
      const result = adapter.checkDeprecated('StringBuffer sb = new StringBuffer();');
      expect(result).not.toBeNull();
      expect(result!.replacement).toContain('StringBuilder');
    });

    it('should detect javax.servlet as deprecated namespace', () => {
      const result = adapter.checkDeprecated('import javax.servlet.http.HttpServletRequest;');
      expect(result).not.toBeNull();
      expect(result!.replacement).toContain('jakarta.servlet');
    });

    it('should return null for non-deprecated APIs', () => {
      const result = adapter.checkDeprecated('ArrayList<String> list = new ArrayList<>();');
      expect(result).toBeNull();
    });
  });

  // ─── Package Verification ───

  describe('verifyPackage', () => {
    it('should recognize Java stdlib packages', async () => {
      const result = await adapter.verifyPackage('java.util');
      expect(result.exists).toBe(true);
    });

    it('should recognize javax packages', async () => {
      const result = await adapter.verifyPackage('javax.servlet');
      expect(result.exists).toBe(true);
    });

    it('should recognize common third-party packages', async () => {
      const result = await adapter.verifyPackage('org.springframework');
      expect(result.exists).toBe(true);
    });

    it('should recognize sub-packages of known packages', async () => {
      const result = await adapter.verifyPackage('org.springframework.boot.autoconfigure');
      expect(result.exists).toBe(true);
    });

    it('should report unknown packages as not existing', async () => {
      const result = await adapter.verifyPackage('com.nonexistent.fake.package');
      expect(result.exists).toBe(false);
    });

    it('should recognize org.w3c.dom as stdlib', async () => {
      const result = await adapter.verifyPackage('org.w3c.dom');
      expect(result.exists).toBe(true);
    });
  });

  // ─── Whitelists ───

  describe('whitelists', () => {
    it('should have at least 30 stdlib packages', () => {
      expect(JAVA_STDLIB_PACKAGES.size).toBeGreaterThanOrEqual(30);
    });

    it('should have at least 40 common third-party packages', () => {
      expect(JAVA_COMMON_PACKAGES.size).toBeGreaterThanOrEqual(40);
    });

    it('should include key stdlib packages', () => {
      const expected = ['java.lang', 'java.util', 'java.io', 'java.net', 'java.time'];
      for (const pkg of expected) {
        expect(JAVA_STDLIB_PACKAGES.has(pkg)).toBe(true);
      }
    });

    it('should include key third-party packages', () => {
      const expected = ['org.springframework', 'com.google.gson', 'org.junit', 'com.fasterxml.jackson'];
      for (const pkg of expected) {
        expect(JAVA_COMMON_PACKAGES.has(pkg)).toBe(true);
      }
    });
  });
});

// ─── LanguageRegistry Integration ───

describe('LanguageRegistry + JavaAdapter', () => {
  beforeEach(() => {
    LanguageRegistry.resetInstance();
  });

  it('should register JavaAdapter and find it by .java extension', () => {
    const registry = LanguageRegistry.getInstance();
    registry.register(new JavaAdapter());

    const adapter = registry.getByExtension('.java');
    expect(adapter).toBeDefined();
    expect(adapter!.id).toBe('java');
  });

  it('should find JavaAdapter by file path', () => {
    const registry = LanguageRegistry.getInstance();
    registry.register(new JavaAdapter());

    expect(registry.getByFilePath('src/main/java/com/example/Main.java')).toBeDefined();
    expect(registry.getByFilePath('/home/user/project/Service.java')).toBeDefined();
  });

  it('should detect java language from file path', () => {
    const registry = LanguageRegistry.getInstance();
    registry.register(new JavaAdapter());

    expect(registry.detectLanguage('App.java')).toBe('java');
  });

  it('should mark .java as supported', () => {
    const registry = LanguageRegistry.getInstance();
    registry.register(new JavaAdapter());

    expect(registry.isSupported('.java')).toBe(true);
    expect(registry.isSupported('Main.java')).toBe(true);
  });

  it('should coexist with TypeScriptAdapter and PythonAdapter', async () => {
    const registry = LanguageRegistry.getInstance();
    const { TypeScriptAdapter } = await import('../src/languages/typescript/index.js');
    const { PythonAdapter } = await import('../src/languages/python/index.js');
    registry.register(new TypeScriptAdapter());
    registry.register(new PythonAdapter());
    registry.register(new JavaAdapter());

    expect(registry.getByExtension('.ts')!.id).toBe('typescript');
    expect(registry.getByExtension('.py')!.id).toBe('python');
    expect(registry.getByExtension('.java')!.id).toBe('java');
    expect(registry.getRegisteredLanguages()).toContain('java');
  });
});

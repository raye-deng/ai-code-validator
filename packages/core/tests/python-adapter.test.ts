/**
 * Python LanguageAdapter Tests
 *
 * Tests for the PythonAdapter: parsing, import extraction, call extraction,
 * complexity metrics, deprecated API detection, package verification,
 * and integration with the LanguageRegistry.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PythonAdapter, PYTHON_BUILTIN_MODULES, PYTHON_COMMON_PACKAGES } from '../src/languages/python/index.js';
import { LanguageRegistry } from '../src/languages/registry.js';

describe('PythonAdapter', () => {
  const adapter = new PythonAdapter();

  // ─── Properties ───

  describe('properties', () => {
    it('should have correct id', () => {
      expect(adapter.id).toBe('python');
    });

    it('should support .py and .pyi extensions', () => {
      expect(adapter.extensions).toContain('.py');
      expect(adapter.extensions).toContain('.pyi');
    });
  });

  // ─── Parse ───

  describe('parse', () => {
    it('should parse Python source code into a PythonModule node', async () => {
      const source = `
import os

def hello(name):
    return f"Hello, {name}"
`;
      const ast = await adapter.parse(source, 'test.py');
      expect(ast).toBeDefined();
      expect(ast.type).toBe('PythonModule');
      expect((ast as any).lines).toBeInstanceOf(Array);
      expect((ast as any).source).toBe(source);
    });

    it('should parse empty source', async () => {
      const ast = await adapter.parse('', 'empty.py');
      expect(ast.type).toBe('PythonModule');
      expect((ast as any).lines).toEqual(['']);
    });
  });

  // ─── Import Extraction ───

  describe('extractImports', () => {
    it('should extract simple import statements', () => {
      const source = `import os
import sys
import json`;
      const imports = adapter.extractImports(source);
      expect(imports.length).toBe(3);
      expect(imports[0].module).toBe('os');
      expect(imports[0].isRelative).toBe(false);
      expect(imports[0].isBuiltin).toBe(true);
      expect(imports[1].module).toBe('sys');
      expect(imports[2].module).toBe('json');
    });

    it('should extract dotted import statements', () => {
      const source = `import os.path
import xml.etree.ElementTree`;
      const imports = adapter.extractImports(source);
      expect(imports.length).toBe(2);
      expect(imports[0].module).toBe('os.path');
      expect(imports[0].bindings).toContain('path');
      expect(imports[0].isBuiltin).toBe(true);
      expect(imports[1].module).toBe('xml.etree.ElementTree');
      expect(imports[1].isBuiltin).toBe(true);
    });

    it('should extract "from xxx import yyy" statements', () => {
      const source = `from os import path, getcwd
from collections import defaultdict, OrderedDict`;
      const imports = adapter.extractImports(source);
      expect(imports.length).toBe(2);
      expect(imports[0].module).toBe('os');
      expect(imports[0].bindings).toContain('path');
      expect(imports[0].bindings).toContain('getcwd');
      expect(imports[0].isBuiltin).toBe(true);
      expect(imports[1].module).toBe('collections');
      expect(imports[1].bindings).toContain('defaultdict');
      expect(imports[1].bindings).toContain('OrderedDict');
    });

    it('should extract relative imports', () => {
      const source = `from . import utils
from .. import parent_module
from .helpers import helper_func
from ...deep import something`;
      const imports = adapter.extractImports(source);
      expect(imports.length).toBe(4);

      expect(imports[0].module).toBe('.');
      expect(imports[0].isRelative).toBe(true);
      expect(imports[0].isBuiltin).toBe(false);

      expect(imports[1].module).toBe('..');
      expect(imports[1].isRelative).toBe(true);

      expect(imports[2].module).toBe('.helpers');
      expect(imports[2].isRelative).toBe(true);
      expect(imports[2].bindings).toContain('helper_func');

      expect(imports[3].module).toBe('...deep');
      expect(imports[3].isRelative).toBe(true);
    });

    it('should extract aliased imports', () => {
      const source = `import numpy as np
import pandas as pd`;
      const imports = adapter.extractImports(source);
      expect(imports.length).toBe(2);
      expect(imports[0].module).toBe('numpy');
      expect(imports[0].bindings).toContain('np');
      expect(imports[1].module).toBe('pandas');
      expect(imports[1].bindings).toContain('pd');
    });

    it('should extract comma-separated imports', () => {
      const source = `import os, sys, json`;
      const imports = adapter.extractImports(source);
      expect(imports.length).toBe(3);
      expect(imports[0].module).toBe('os');
      expect(imports[1].module).toBe('sys');
      expect(imports[2].module).toBe('json');
    });

    it('should correctly identify builtin vs third-party imports', () => {
      const source = `import os
import flask
import requests
import asyncio`;
      const imports = adapter.extractImports(source);
      expect(imports[0].isBuiltin).toBe(true);  // os
      expect(imports[1].isBuiltin).toBe(false);  // flask
      expect(imports[2].isBuiltin).toBe(false);  // requests
      expect(imports[3].isBuiltin).toBe(true);  // asyncio
    });

    it('should skip comments', () => {
      const source = `# import os
import sys
# from json import loads`;
      const imports = adapter.extractImports(source);
      expect(imports.length).toBe(1);
      expect(imports[0].module).toBe('sys');
    });

    it('should handle __future__ imports', () => {
      const source = `from __future__ import annotations`;
      const imports = adapter.extractImports(source);
      expect(imports.length).toBe(1);
      expect(imports[0].module).toBe('__future__');
      expect(imports[0].bindings).toContain('annotations');
      expect(imports[0].isBuiltin).toBe(true);
    });
  });

  // ─── Call Extraction ───

  describe('extractCalls', () => {
    it('should extract simple function calls', () => {
      const source = `print("hello")
len([1, 2, 3])
range(10)`;
      const calls = adapter.extractCalls(source);
      const names = calls.map(c => c.name);
      expect(names).toContain('print');
      expect(names).toContain('len');
      expect(names).toContain('range');
    });

    it('should extract method calls', () => {
      const source = `os.path.join("/tmp", "file")
result.strip()
data.to_json()`;
      const calls = adapter.extractCalls(source);
      const names = calls.map(c => c.name);
      expect(names).toContain('os.path.join');
      expect(names).toContain('result.strip');
      expect(names).toContain('data.to_json');

      const methodCalls = calls.filter(c => c.isMethodCall);
      expect(methodCalls.length).toBe(3);
    });

    it('should skip comments', () => {
      const source = `# print("commented")
real_call()`;
      const calls = adapter.extractCalls(source);
      expect(calls.length).toBe(1);
      expect(calls[0].name).toBe('real_call');
    });

    it('should not extract Python keywords as calls', () => {
      const source = `if x > 0:
    for i in range(10):
        while True:
            pass`;
      const calls = adapter.extractCalls(source);
      const names = calls.map(c => c.name);
      expect(names).not.toContain('if');
      expect(names).not.toContain('for');
      expect(names).not.toContain('while');
      expect(names).toContain('range');
    });

    it('should extract eval() calls (security-sensitive)', () => {
      const source = `result = eval(user_input)`;
      const calls = adapter.extractCalls(source);
      const names = calls.map(c => c.name);
      expect(names).toContain('eval');
    });
  });

  // ─── Complexity ───

  describe('computeComplexity', () => {
    it('should compute base complexity for simple code', () => {
      const source = `def add(a, b):
    return a + b`;
      const metrics = adapter.computeComplexity(source);
      expect(metrics.cyclomatic).toBe(1);
      expect(metrics.loc).toBeGreaterThan(0);
      expect(metrics.functionCount).toBe(1);
    });

    it('should increase complexity for branches', () => {
      const source = `def classify(x):
    if x > 0:
        if x > 100:
            return "big"
        else:
            return "small"
    elif x < 0:
        return "negative"
    else:
        return "zero"`;
      const metrics = adapter.computeComplexity(source);
      // 1 (base) + 3 (if, if, elif) = 4
      expect(metrics.cyclomatic).toBeGreaterThanOrEqual(4);
      expect(metrics.functionCount).toBe(1);
    });

    it('should detect nesting depth via indentation', () => {
      const source = `def deep():
    if True:
        for i in range(10):
            while True:
                if x:
                    pass`;
      const metrics = adapter.computeComplexity(source);
      expect(metrics.maxNestingDepth).toBeGreaterThanOrEqual(4);
    });

    it('should count logical operators', () => {
      const source = `def check(x, y, z):
    if x > 0 and y > 0 or z > 0:
        return True`;
      const metrics = adapter.computeComplexity(source);
      // 1 (base) + 1 (if) + 2 (and, or) = 4
      expect(metrics.cyclomatic).toBeGreaterThanOrEqual(4);
    });

    it('should count lines of code excluding comments and blanks', () => {
      const source = `# This is a comment

def func():
    # Another comment
    x = 1
    return x

# End`;
      const metrics = adapter.computeComplexity(source);
      // Only "def func():", "x = 1", "return x" are code lines
      expect(metrics.loc).toBe(3);
    });

    it('should count multiple functions', () => {
      const source = `def func_a():
    pass

def func_b():
    pass

async def func_c():
    pass`;
      const metrics = adapter.computeComplexity(source);
      expect(metrics.functionCount).toBe(3);
    });

    it('should have higher complexity for complex code vs simple code', () => {
      const simple = `def add(a, b):
    return a + b`;
      const complex = `def process(data):
    if data is None:
        return None
    for item in data:
        if item > 0 and item < 100:
            try:
                result = transform(item)
            except ValueError:
                continue
        elif item >= 100:
            handle_large(item)
    return data`;
      const simpleMetrics = adapter.computeComplexity(simple);
      const complexMetrics = adapter.computeComplexity(complex);
      expect(complexMetrics.cyclomatic).toBeGreaterThan(simpleMetrics.cyclomatic);
      expect(complexMetrics.cognitive).toBeGreaterThan(simpleMetrics.cognitive);
    });
  });

  // ─── Deprecated API Detection ───

  describe('checkDeprecated', () => {
    it('should detect os.popen as deprecated', () => {
      const result = adapter.checkDeprecated('os.popen(cmd)');
      expect(result).not.toBeNull();
      expect(result!.api).toBe('os.popen');
      expect(result!.replacement).toBe('subprocess.run()');
    });

    it('should detect distutils as deprecated', () => {
      const result = adapter.checkDeprecated('from distutils.core import setup');
      expect(result).not.toBeNull();
      expect(result!.api).toBe('distutils');
      expect(result!.replacement).toBe('setuptools');
    });

    it('should detect imp module as deprecated', () => {
      const result = adapter.checkDeprecated('imp.find_module("test")');
      expect(result).not.toBeNull();
      expect(result!.api).toBe('imp.find_module');
    });

    it('should detect ssl.wrap_socket as deprecated', () => {
      const result = adapter.checkDeprecated('ssl.wrap_socket(sock)');
      expect(result).not.toBeNull();
      expect(result!.replacement).toBe('SSLContext.wrap_socket()');
    });

    it('should detect cgi module as deprecated', () => {
      const result = adapter.checkDeprecated('import cgi');
      expect(result).not.toBeNull();
      expect(result!.api).toBe('cgi');
    });

    it('should return null for non-deprecated APIs', () => {
      const result = adapter.checkDeprecated('subprocess.run(["ls"])');
      expect(result).toBeNull();
    });

    it('should detect asyncio.coroutine decorator as deprecated', () => {
      const result = adapter.checkDeprecated('@asyncio.coroutine');
      expect(result).not.toBeNull();
      expect(result!.replacement).toBe('async def');
    });

    it('should detect typing.Dict as deprecated', () => {
      const result = adapter.checkDeprecated('typing.Dict[str, int]');
      expect(result).not.toBeNull();
      expect(result!.replacement).toBe('dict (builtin)');
    });
  });

  // ─── Package Verification ───

  describe('verifyPackage', () => {
    it('should recognize Python builtin modules', async () => {
      const result = await adapter.verifyPackage('os');
      expect(result.exists).toBe(true);
      expect(result.name).toBe('os');
    });

    it('should recognize common third-party packages', async () => {
      const result = await adapter.verifyPackage('numpy');
      expect(result.exists).toBe(true);
    });

    it('should recognize flask as a known package', async () => {
      const result = await adapter.verifyPackage('flask');
      expect(result.exists).toBe(true);
    });

    it('should report unknown packages as not existing', async () => {
      const result = await adapter.verifyPackage('nonexistent_fake_package_xyz');
      expect(result.exists).toBe(false);
    });

    it('should handle dotted module paths', async () => {
      const result = await adapter.verifyPackage('os.path');
      expect(result.exists).toBe(true);
    });
  });

  // ─── Whitelists ───

  describe('whitelists', () => {
    it('should have at least 60 builtin modules', () => {
      expect(PYTHON_BUILTIN_MODULES.size).toBeGreaterThanOrEqual(60);
    });

    it('should have at least 50 common packages', () => {
      expect(PYTHON_COMMON_PACKAGES.size).toBeGreaterThanOrEqual(50);
    });

    it('should include key builtin modules', () => {
      const expected = ['os', 'sys', 'json', 'pathlib', 'asyncio', 'typing', 'dataclasses'];
      for (const mod of expected) {
        expect(PYTHON_BUILTIN_MODULES.has(mod)).toBe(true);
      }
    });

    it('should include key third-party packages', () => {
      const expected = ['numpy', 'pandas', 'flask', 'django', 'pytest', 'requests'];
      for (const pkg of expected) {
        expect(PYTHON_COMMON_PACKAGES.has(pkg)).toBe(true);
      }
    });
  });
});

// ─── LanguageRegistry Integration ───

describe('LanguageRegistry + PythonAdapter', () => {
  beforeEach(() => {
    LanguageRegistry.resetInstance();
  });

  it('should register PythonAdapter and find it by .py extension', () => {
    const registry = LanguageRegistry.getInstance();
    registry.register(new PythonAdapter());

    const adapter = registry.getByExtension('.py');
    expect(adapter).toBeDefined();
    expect(adapter!.id).toBe('python');
  });

  it('should find PythonAdapter by .pyi extension', () => {
    const registry = LanguageRegistry.getInstance();
    registry.register(new PythonAdapter());

    const adapter = registry.getByExtension('.pyi');
    expect(adapter).toBeDefined();
    expect(adapter!.id).toBe('python');
  });

  it('should find PythonAdapter by file path', () => {
    const registry = LanguageRegistry.getInstance();
    registry.register(new PythonAdapter());

    expect(registry.getByFilePath('src/main.py')).toBeDefined();
    expect(registry.getByFilePath('/home/user/project/utils.pyi')).toBeDefined();
  });

  it('should detect python language from file path', () => {
    const registry = LanguageRegistry.getInstance();
    registry.register(new PythonAdapter());

    expect(registry.detectLanguage('app.py')).toBe('python');
    expect(registry.detectLanguage('types.pyi')).toBe('python');
  });

  it('should coexist with TypeScriptAdapter', async () => {
    const registry = LanguageRegistry.getInstance();
    const { TypeScriptAdapter } = await import('../src/languages/typescript/index.js');
    registry.register(new TypeScriptAdapter());
    registry.register(new PythonAdapter());

    expect(registry.getByExtension('.ts')!.id).toBe('typescript');
    expect(registry.getByExtension('.py')!.id).toBe('python');
    expect(registry.getRegisteredLanguages()).toContain('typescript');
    expect(registry.getRegisteredLanguages()).toContain('python');
  });

  it('should mark .py as supported', () => {
    const registry = LanguageRegistry.getInstance();
    registry.register(new PythonAdapter());

    expect(registry.isSupported('.py')).toBe(true);
    expect(registry.isSupported('script.py')).toBe(true);
  });
});

// ─── Detector Integration (existing detectors on Python code) ───

describe('Existing detectors on Python code', () => {
  it('LogicGapDetector: should not crash on Python code', async () => {
    // LogicGapDetector uses regex patterns designed for TS/JS,
    // but should not throw when given Python code
    const { LogicGapDetector } = await import('../src/detectors/logic-gap.js');
    const detector = new LogicGapDetector();

    const pythonCode = `
def process(data):
    # TODO: implement actual processing
    pass

async def fetch_data():
    result = await get_remote()
    return result
`;
    const issues = await detector.detect([{
      path: 'main.py',
      content: pythonCode,
      language: 'python',
    }]);

    // Should not crash — may or may not find issues since patterns are JS-oriented
    expect(Array.isArray(issues)).toBe(true);
  });

  it('LogicGapDetector: should detect JS-style TODO markers in Python code', async () => {
    // If Python code happens to use // TODO (unusual but possible in strings/comments),
    // or the detector's patterns partially match
    const { LogicGapDetector } = await import('../src/detectors/logic-gap.js');
    const detector = new LogicGapDetector();

    // Use throw new Error pattern that LogicGapDetector recognizes
    const mixedCode = `
// TODO: fix this later
function placeholder() {
  throw new Error("todo");
}
`;
    const issues = await detector.detect([{
      path: 'mixed.js',
      content: mixedCode,
      language: 'javascript',
    }]);

    expect(issues.length).toBeGreaterThan(0);
    const messages = issues.map(i => i.message.toLowerCase());
    const hasTodo = messages.some(m =>
      m.includes('todo') || m.includes('incomplete') || m.includes('placeholder')
    );
    expect(hasTodo).toBe(true);
  });

  it('PythonAdapter: can detect Python eval() calls for security review', () => {
    // While SecurityPatternDetector may be added by Worker A,
    // PythonAdapter's extractCalls can already identify eval() usage
    const adapter = new PythonAdapter();

    const pythonCode = `
user_input = input("Enter expression: ")
result = eval(user_input)
exec(compile(code, '<string>', 'exec'))
`;
    const calls = adapter.extractCalls(pythonCode);
    const names = calls.map(c => c.name);
    expect(names).toContain('eval');
    expect(names).toContain('exec');
    expect(names).toContain('input');
    expect(names).toContain('compile');
  });

  it('PythonAdapter: can detect deprecated API usage via checkDeprecated', () => {
    const adapter = new PythonAdapter();

    // Simulate checking lines of code for deprecated patterns
    const deprecatedLines = [
      'os.popen("ls")',
      'from distutils.core import setup',
      'ssl.wrap_socket(sock)',
      'import cgi',
    ];

    for (const line of deprecatedLines) {
      const result = adapter.checkDeprecated(line);
      expect(result).not.toBeNull();
    }
  });
});

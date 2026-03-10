/**
 * Python Language Adapter
 *
 * Regex-based parser for Python source code. No native AST dependencies needed —
 * Python's indentation-based syntax is straightforward enough for regex extraction.
 *
 * Supports:
 * - Import extraction (import, from...import, relative imports)
 * - Function/method call extraction
 * - Complexity metrics (cyclomatic, cognitive, nesting via indentation)
 * - Deprecated API detection (via deprecated-apis-python.json)
 * - Package verification (builtin + common third-party whitelists)
 *
 * @since 0.3.0
 */

import { createRequire } from 'node:module';
import type { SupportedLanguage } from '../../types.js';
import type {
  LanguageAdapter,
  ASTNode,
  ImportInfo,
  CallInfo,
  PackageVerifyResult,
  DeprecatedInfo,
  ComplexityMetrics,
} from '../types.js';

// ─── Python Built-in Modules ───

/**
 * Python standard library modules (3.10+).
 * At least 65 modules covering the most commonly used parts of stdlib.
 */
export const PYTHON_BUILTIN_MODULES = new Set([
  // Core
  'os', 'sys', 're', 'json', 'math', 'random', 'datetime', 'time',
  'pathlib', 'typing', 'collections', 'functools', 'itertools', 'io',
  // System & subprocess
  'subprocess', 'shutil', 'tempfile', 'logging', 'unittest', 'argparse',
  // Crypto & encoding
  'hashlib', 'hmac', 'secrets', 'base64',
  // Network & web
  'urllib', 'http', 'socket', 'ssl', 'email', 'smtplib',
  // Data formats
  'csv', 'sqlite3', 'xml', 'html', 'configparser',
  // OOP & patterns
  'abc', 'asyncio', 'concurrent', 'multiprocessing', 'threading', 'queue',
  // Binary & serialization
  'struct', 'pickle', 'copy', 'pprint', 'textwrap',
  // Enums & data
  'enum', 'dataclasses', 'contextlib', 'warnings', 'traceback',
  // Introspection
  'inspect', 'dis', 'ast', 'token', 'tokenize', 'importlib', 'pkgutil',
  // Archive & compression
  'zipfile', 'tarfile', 'gzip', 'bz2', 'lzma', 'zipimport',
  // OS-level
  'signal', 'ctypes', 'platform',
  // Additional stdlib
  'string', 'decimal', 'fractions', 'statistics', 'operator',
  'array', 'bisect', 'heapq', 'weakref', 'types',
  'glob', 'fnmatch', 'linecache', 'shelve', 'dbm',
  'binascii', 'codecs', 'unicodedata',
  'mmap', 'select', 'selectors',
  'atexit', 'sched', 'gettext', 'locale',
  'os.path', 'posixpath', 'ntpath',
  'pdb', 'profile', 'cProfile', 'timeit',
  'doctest', 'builtins', '__future__',
]);

// ─── Common Third-Party Packages ───

/**
 * Well-known Python third-party packages from PyPI.
 * At least 55 packages covering data science, web, testing, tooling, etc.
 */
export const PYTHON_COMMON_PACKAGES = new Set([
  // Data science & ML
  'numpy', 'pandas', 'scipy', 'matplotlib', 'seaborn',
  'sklearn', 'scikit-learn', 'tensorflow', 'torch', 'keras',
  'xgboost', 'lightgbm', 'transformers',
  // Web frameworks
  'flask', 'django', 'fastapi', 'uvicorn', 'gunicorn',
  'starlette', 'sanic',
  // Task queues & caching
  'celery', 'redis', 'kombu',
  // Database
  'sqlalchemy', 'alembic', 'pydantic', 'psycopg2', 'pymongo',
  // HTTP clients
  'requests', 'httpx', 'aiohttp', 'urllib3',
  // Scraping & automation
  'beautifulsoup4', 'bs4', 'scrapy', 'selenium', 'playwright',
  // Image processing
  'pillow', 'PIL', 'opencv-python', 'cv2',
  // Cloud
  'boto3', 'botocore', 'google-cloud-storage',
  // Testing
  'pytest', 'tox', 'coverage', 'mock', 'hypothesis',
  // Code quality
  'black', 'isort', 'flake8', 'pylint', 'mypy', 'ruff', 'pre-commit',
  // Packaging
  'poetry', 'pipenv', 'setuptools', 'wheel', 'twine', 'pip',
  // CLI
  'click', 'typer', 'rich', 'tqdm',
  // Config & serialization
  'pyyaml', 'yaml', 'toml', 'tomli', 'python-dotenv', 'dotenv',
  // Security
  'cryptography', 'paramiko', 'jwt', 'pyjwt',
]);

// ─── Deprecated API Database ───

interface DeprecatedAPIEntry {
  api: string;
  pattern: string;
  replacement: string;
  deprecated_since: string;
  severity: string;
  reason: string;
}

/** Load deprecated APIs from JSON data file */
function loadDeprecatedAPIs(): DeprecatedAPIEntry[] {
  try {
    const require = createRequire(import.meta.url);
    return require('../../data/deprecated-apis-python.json') as DeprecatedAPIEntry[];
  } catch {
    return [];
  }
}

const PYTHON_DEPRECATED_DB = loadDeprecatedAPIs();

// ─── Python Adapter ───

/**
 * PythonAdapter — LanguageAdapter implementation for Python.
 *
 * Covers: .py, .pyi
 *
 * Uses regex-based parsing instead of a native AST parser.
 * Python's syntax (indentation-based nesting, simple import syntax)
 * is well-suited for regex-based extraction.
 */
export class PythonAdapter implements LanguageAdapter {
  readonly id: SupportedLanguage = 'python';
  readonly extensions = ['.py', '.pyi'];

  /**
   * Parse Python source code.
   * Returns a lightweight AST-like structure with lines and source,
   * sufficient for regex-based detection.
   */
  async parse(source: string, _filePath: string): Promise<ASTNode> {
    return {
      type: 'PythonModule',
      lines: source.split('\n'),
      source,
    };
  }

  /**
   * Extract import statements from Python source.
   *
   * Matches:
   * - import os
   * - import os.path
   * - import os, sys
   * - from os import path
   * - from os.path import exists, join
   * - from . import relative
   * - from ..parent import something
   * - from __future__ import annotations
   */
  extractImports(source: string, _ast?: ASTNode): ImportInfo[] {
    const lines = source.split('\n');
    const imports: ImportInfo[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const lineNum = i + 1;

      // Skip comments and strings
      if (trimmed.startsWith('#')) continue;

      // from xxx import yyy, zzz
      const fromMatch = trimmed.match(
        /^from\s+(\.{0,3}[\w.]*)\s+import\s+(.+?)(?:\s*#.*)?$/
      );
      if (fromMatch) {
        const modulePath = fromMatch[1];
        const importedNames = fromMatch[2];
        const isRelative = modulePath.startsWith('.');

        // Parse imported bindings: "a, b as c, d"
        const bindings: string[] = [];
        // Handle star import
        if (importedNames.trim() === '*') {
          bindings.push('*');
        } else {
          // Handle parenthesized imports (single-line): from x import (a, b, c)
          const cleaned = importedNames.replace(/[()]/g, '');
          for (const part of cleaned.split(',')) {
            const name = part.trim().split(/\s+as\s+/).pop()?.trim();
            if (name && name !== '\\') bindings.push(name);
          }
        }

        // Determine base module name
        const baseModule = isRelative
          ? modulePath
          : modulePath.split('.')[0];

        imports.push({
          module: modulePath,
          bindings,
          line: lineNum,
          isRelative,
          isBuiltin: !isRelative && PYTHON_BUILTIN_MODULES.has(baseModule),
        });
        continue;
      }

      // import xxx, yyy.zzz
      const importMatch = trimmed.match(
        /^import\s+(.+?)(?:\s*#.*)?$/
      );
      if (importMatch) {
        const moduleList = importMatch[1];
        // Split comma-separated imports: import os, sys, json
        for (const part of moduleList.split(',')) {
          const asMatch = part.trim().match(/^([\w.]+)(?:\s+as\s+(\w+))?$/);
          if (asMatch) {
            const fullPath = asMatch[1];
            const alias = asMatch[2] || fullPath.split('.').pop()!;
            const baseModule = fullPath.split('.')[0];

            imports.push({
              module: fullPath,
              bindings: [alias],
              line: lineNum,
              isRelative: false,
              isBuiltin: PYTHON_BUILTIN_MODULES.has(baseModule),
            });
          }
        }
      }
    }

    return imports;
  }

  /**
   * Extract function/method calls from Python source.
   *
   * Matches patterns like:
   * - func()
   * - obj.method()
   * - module.submodule.func()
   * - Class()
   */
  extractCalls(source: string, _ast?: ASTNode): CallInfo[] {
    const lines = source.split('\n');
    const calls: CallInfo[] = [];

    // Python keywords that look like function calls but aren't
    const pythonKeywords = new Set([
      'if', 'elif', 'else', 'for', 'while', 'with', 'try', 'except',
      'finally', 'def', 'class', 'return', 'yield', 'raise', 'import',
      'from', 'as', 'pass', 'break', 'continue', 'del', 'assert',
      'lambda', 'global', 'nonlocal', 'async', 'await', 'and', 'or',
      'not', 'in', 'is', 'True', 'False', 'None',
    ]);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trimStart();
      const lineNum = i + 1;

      // Skip comments
      if (trimmed.startsWith('#')) continue;
      // Skip string-only lines (rough heuristic)
      if (/^(['"]){3}/.test(trimmed) || /^(['"])/.test(trimmed)) continue;

      // Match calls: word.word.word(  or  word(
      const callPattern = /(\w+(?:\.\w+)*)\s*\(/g;
      let match: RegExpExecArray | null;
      while ((match = callPattern.exec(line)) !== null) {
        const callee = match[1];
        const firstName = callee.split('.')[0];

        // Skip keywords
        if (pythonKeywords.has(firstName)) continue;
        // Skip decorators (they're on lines starting with @)
        if (trimmed.startsWith('@') && match.index <= line.indexOf(callee)) continue;

        const isMethodCall = callee.includes('.');

        calls.push({
          name: callee,
          line: lineNum,
          column: match.index + 1,
          isMethodCall,
        });
      }
    }

    return calls;
  }

  /**
   * Verify if a Python package exists.
   *
   * Phase 2 implementation: checks against builtin modules and
   * common third-party package whitelists.
   * Full PyPI verification will be added in a later phase.
   */
  async verifyPackage(name: string): Promise<PackageVerifyResult> {
    const baseModule = name.split('.')[0];

    if (PYTHON_BUILTIN_MODULES.has(baseModule) || PYTHON_BUILTIN_MODULES.has(name)) {
      return {
        name,
        exists: true,
        checkedAt: Date.now(),
      };
    }

    if (PYTHON_COMMON_PACKAGES.has(baseModule) || PYTHON_COMMON_PACKAGES.has(name)) {
      return {
        name,
        exists: true,
        checkedAt: Date.now(),
      };
    }

    return {
      name,
      exists: false,
      checkedAt: Date.now(),
    };
  }

  /**
   * Check if an API is deprecated.
   * Searches the deprecated-apis-python.json database.
   */
  checkDeprecated(api: string): DeprecatedInfo | null {
    for (const entry of PYTHON_DEPRECATED_DB) {
      const regex = new RegExp(entry.pattern);
      if (regex.test(api)) {
        return {
          api: entry.api,
          reason: entry.reason,
          replacement: entry.replacement,
          since: entry.deprecated_since,
        };
      }
    }
    return null;
  }

  /**
   * Compute complexity metrics for Python source code.
   *
   * Uses indentation-based nesting detection (Python's natural structure)
   * and regex matching for decision points.
   */
  computeComplexity(source: string, _ast?: ASTNode): ComplexityMetrics {
    const lines = source.split('\n');

    let cyclomatic = 1; // base complexity
    let cognitive = 0;
    let maxNestingDepth = 0;
    let currentDepth = 0;
    let functionCount = 0;

    // Track non-empty, non-comment lines
    const codeLines = lines.filter(l => {
      const t = l.trim();
      return t.length > 0 && !t.startsWith('#');
    });

    for (const line of lines) {
      const trimmed = line.trimStart();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Python uses indentation for nesting
      const indent = line.length - trimmed.length;
      // Use 4-space standard, but handle 2-space too
      currentDepth = indent > 0 ? Math.floor(indent / 4) || Math.floor(indent / 2) : 0;
      maxNestingDepth = Math.max(maxNestingDepth, currentDepth);

      // Decision points → cyclomatic complexity
      if (/^(if|elif)\s+/.test(trimmed)) {
        cyclomatic++;
        cognitive += 1 + currentDepth; // nesting adds cognitive load
      } else if (/^(for|while)\s+/.test(trimmed)) {
        cyclomatic++;
        cognitive += 1 + currentDepth;
      } else if (/^except(\s+|\s*:)/.test(trimmed)) {
        cyclomatic++;
        cognitive += 1 + currentDepth;
      } else if (/^else\s*:/.test(trimmed)) {
        cognitive += 1; // else doesn't add cyclomatic but adds cognitive
      }

      // Logical operators within expressions
      const logicalOps = (trimmed.match(/\band\b|\bor\b/g) || []).length;
      cyclomatic += logicalOps;
      cognitive += logicalOps;

      // Count function/method definitions
      if (/^(async\s+)?def\s+\w+/.test(trimmed)) {
        functionCount++;
      }

      // Count class definitions (rough proxy for structure)
      // Not counted as functions, but noted
    }

    return {
      cyclomatic,
      cognitive,
      loc: codeLines.length,
      functionCount,
      maxNestingDepth,
    };
  }
}

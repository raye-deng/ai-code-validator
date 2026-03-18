/**
 * HallucinatedImportDetector Tests
 *
 * Tests dynamic registry-based detection of hallucinated package imports.
 * All registry calls are mocked — no real HTTP.
 *
 * @since 0.4.0 (V4)
 */

import { describe, it, expect, vi } from 'vitest';
import { HallucinatedImportDetector } from '../../src/detectors/v4/hallucinated-import.js';
import type { DetectorContext } from '../../src/detectors/v4/types.js';
import type { CodeUnit } from '../../src/ir/types.js';
import { createCodeUnit } from '../../src/ir/types.js';
import type { RegistryManager } from '../../src/registry/registry-manager.js';
import type { PackageVerifyResult, PackageRegistry, DeprecationInfo } from '../../src/registry/types.js';

// ─── Helper: create a file-level CodeUnit with imports ─────────────

function makeFileUnit(overrides: Partial<CodeUnit> & { file?: string; language?: CodeUnit['language'] }): CodeUnit {
  return createCodeUnit({
    id: `file:${overrides.file || 'test.ts'}`,
    file: overrides.file || 'test.ts',
    language: overrides.language || 'typescript',
    kind: 'file',
    location: { startLine: 0, startColumn: 0, endLine: 100, endColumn: 0 },
    source: '',
    ...overrides,
  });
}

// ─── Helper: create a mock RegistryManager ─────────────────────────

function createMockRegistryManager(
  verifyBatchResult: Map<string, PackageVerifyResult>,
): RegistryManager {
  return {
    verifyBatch: vi.fn().mockResolvedValue(verifyBatchResult),
    verifyPackage: vi.fn(),
    getRegistry: vi.fn(),
    cacheStats: vi.fn(),
    persistCache: vi.fn(),
  } as unknown as RegistryManager;
}

function createContext(registryManager?: RegistryManager): DetectorContext {
  return {
    projectRoot: '/project',
    allFiles: ['test.ts'],
    registryManager,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('HallucinatedImportDetector', () => {
  const detector = new HallucinatedImportDetector();

  it('should have correct metadata', () => {
    expect(detector.id).toBe('hallucinated-import');
    expect(detector.name).toBe('Hallucinated Import Detector');
    expect(detector.category).toBe('ai-faithfulness');
    expect(detector.supportedLanguages).toEqual([]);
  });

  it('should detect non-existent npm package', async () => {
    const unit = makeFileUnit({
      imports: [
        { module: 'nonexistent-pkg', symbols: ['foo'], line: 2, isRelative: false, raw: "import { foo } from 'nonexistent-pkg'" },
      ],
    });

    const verifyResults = new Map<string, PackageVerifyResult>([
      ['nonexistent-pkg', { exists: false, name: 'nonexistent-pkg', source: 'registry', latencyMs: 50 }],
    ]);

    const results = await detector.detect([unit], createContext(createMockRegistryManager(verifyResults)));
    expect(results).toHaveLength(1);
    expect(results[0].detectorId).toBe('hallucinated-import');
    expect(results[0].severity).toBe('error');
    expect(results[0].category).toBe('ai-faithfulness');
    expect(results[0].message).toContain('nonexistent-pkg');
    expect(results[0].message).toContain('npm');
    expect(results[0].file).toBe('test.ts');
    expect(results[0].line).toBe(3); // 0-based line 2 → 1-based line 3
  });

  it('should skip relative imports', async () => {
    const unit = makeFileUnit({
      imports: [
        { module: './utils', symbols: ['helper'], line: 0, isRelative: true, raw: "import { helper } from './utils'" },
        { module: '../config', symbols: ['config'], line: 1, isRelative: true, raw: "import { config } from '../config'" },
      ],
    });

    const verifyResults = new Map<string, PackageVerifyResult>();
    const mockManager = createMockRegistryManager(verifyResults);
    const results = await detector.detect([unit], createContext(mockManager));
    expect(results).toHaveLength(0);
    // verifyBatch should not have been called for relative imports
    expect(mockManager.verifyBatch).not.toHaveBeenCalled();
  });

  it('should skip Node.js builtin modules', async () => {
    const unit = makeFileUnit({
      imports: [
        { module: 'fs', symbols: ['readFile'], line: 0, isRelative: false, raw: "import { readFile } from 'fs'" },
        { module: 'path', symbols: ['join'], line: 1, isRelative: false, raw: "import { join } from 'path'" },
        { module: 'node:crypto', symbols: ['randomBytes'], line: 2, isRelative: false, raw: "import { randomBytes } from 'node:crypto'" },
      ],
    });

    const verifyResults = new Map<string, PackageVerifyResult>();
    const mockManager = createMockRegistryManager(verifyResults);
    const results = await detector.detect([unit], createContext(mockManager));
    expect(results).toHaveLength(0);
  });

  it('should skip Python builtin modules', async () => {
    const unit = makeFileUnit({
      language: 'python',
      file: 'test.py',
      imports: [
        { module: 'os', symbols: ['path'], line: 0, isRelative: false, raw: 'import os' },
        { module: 'json', symbols: ['dumps'], line: 1, isRelative: false, raw: 'import json' },
        { module: 'asyncio', symbols: [], line: 2, isRelative: false, raw: 'import asyncio' },
      ],
    });

    const verifyResults = new Map<string, PackageVerifyResult>();
    const mockManager = createMockRegistryManager(verifyResults);
    const results = await detector.detect([unit], createContext(mockManager));
    expect(results).toHaveLength(0);
  });

  it('should handle multiple languages in same scan', async () => {
    const tsUnit = makeFileUnit({
      file: 'app.ts',
      language: 'typescript',
      imports: [
        { module: 'fake-ts-pkg', symbols: ['x'], line: 0, isRelative: false, raw: "import { x } from 'fake-ts-pkg'" },
      ],
    });

    const pyUnit = makeFileUnit({
      file: 'app.py',
      language: 'python',
      imports: [
        { module: 'fake_py_pkg', symbols: ['y'], line: 0, isRelative: false, raw: 'from fake_py_pkg import y' },
      ],
    });

    const verifyResults = new Map<string, PackageVerifyResult>([
      ['fake-ts-pkg', { exists: false, name: 'fake-ts-pkg', source: 'registry', latencyMs: 50 }],
      ['fake_py_pkg', { exists: false, name: 'fake_py_pkg', source: 'registry', latencyMs: 50 }],
    ]);

    const mockManager = createMockRegistryManager(verifyResults);
    const results = await detector.detect([tsUnit, pyUnit], createContext(mockManager));
    expect(results).toHaveLength(2);
    expect(results.some(r => r.message.includes('fake-ts-pkg'))).toBe(true);
    expect(results.some(r => r.message.includes('fake_py_pkg'))).toBe(true);
  });

  it('should flag imports in offline mode (no registry manager)', async () => {
    const unit = makeFileUnit({
      imports: [
        { module: 'some-pkg', symbols: ['fn'], line: 0, isRelative: false, raw: "import { fn } from 'some-pkg'" },
      ],
    });

    const results = await detector.detect([unit], createContext()); // No registryManager
    // Fallback detection should flag non-builtin, non-relative imports
    expect(results).toHaveLength(1);
    expect(results[0].confidence).toBe(0.6);
  });

  it('should have correct severity and category in results', async () => {
    const unit = makeFileUnit({
      imports: [
        { module: 'ghost-pkg', symbols: ['abc'], line: 5, isRelative: false, raw: "import { abc } from 'ghost-pkg'" },
      ],
    });

    const verifyResults = new Map<string, PackageVerifyResult>([
      ['ghost-pkg', { exists: false, name: 'ghost-pkg', source: 'registry', latencyMs: 50 }],
    ]);

    const results = await detector.detect([unit], createContext(createMockRegistryManager(verifyResults)));
    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe('error');
    expect(results[0].category).toBe('ai-faithfulness');
    expect(results[0].messageKey).toBe('hallucinated-import.package-not-found');
  });

  it('should have confidence score of 0.9', async () => {
    const unit = makeFileUnit({
      imports: [
        { module: 'phantom-lib', symbols: ['x'], line: 0, isRelative: false, raw: "import { x } from 'phantom-lib'" },
      ],
    });

    const verifyResults = new Map<string, PackageVerifyResult>([
      ['phantom-lib', { exists: false, name: 'phantom-lib', source: 'registry', latencyMs: 50 }],
    ]);

    const results = await detector.detect([unit], createContext(createMockRegistryManager(verifyResults)));
    expect(results).toHaveLength(1);
    expect(results[0].confidence).toBe(0.9);
  });

  it('should handle scoped npm packages (@scope/name)', async () => {
    const unit = makeFileUnit({
      imports: [
        { module: '@fake-scope/fake-pkg', symbols: ['A'], line: 0, isRelative: false, raw: "import { A } from '@fake-scope/fake-pkg'" },
        { module: '@fake-scope/fake-pkg/sub', symbols: ['B'], line: 1, isRelative: false, raw: "import { B } from '@fake-scope/fake-pkg/sub'" },
      ],
    });

    const verifyResults = new Map<string, PackageVerifyResult>([
      ['@fake-scope/fake-pkg', { exists: false, name: '@fake-scope/fake-pkg', source: 'registry', latencyMs: 50 }],
    ]);

    const results = await detector.detect([unit], createContext(createMockRegistryManager(verifyResults)));
    // Both imports should be grouped under @fake-scope/fake-pkg
    expect(results).toHaveLength(2);
    expect(results[0].metadata?.packageName).toBe('@fake-scope/fake-pkg');
    expect(results[1].metadata?.packageName).toBe('@fake-scope/fake-pkg');
  });

  it('should not flag real packages (registry returns exists:true)', async () => {
    const unit = makeFileUnit({
      imports: [
        { module: 'lodash', symbols: ['map'], line: 0, isRelative: false, raw: "import { map } from 'lodash'" },
        { module: 'express', symbols: [], line: 1, isRelative: false, raw: "import express from 'express'" },
      ],
    });

    const verifyResults = new Map<string, PackageVerifyResult>([
      ['lodash', { exists: true, name: 'lodash', version: '4.17.21', source: 'registry', latencyMs: 50 }],
      ['express', { exists: true, name: 'express', version: '4.18.2', source: 'registry', latencyMs: 50 }],
    ]);

    const results = await detector.detect([unit], createContext(createMockRegistryManager(verifyResults)));
    expect(results).toHaveLength(0);
  });

  it('should only process file-level units (skip function/class units)', async () => {
    const funcUnit = createCodeUnit({
      id: 'func:test.ts:main',
      file: 'test.ts',
      language: 'typescript',
      kind: 'function',
      location: { startLine: 5, startColumn: 0, endLine: 20, endColumn: 1 },
      source: 'function main() {}',
      imports: [
        { module: 'ghost-in-func', symbols: ['x'], line: 0, isRelative: false, raw: "import { x } from 'ghost-in-func'" },
      ],
    });

    const verifyResults = new Map<string, PackageVerifyResult>();
    const mockManager = createMockRegistryManager(verifyResults);
    const results = await detector.detect([funcUnit], createContext(mockManager));
    expect(results).toHaveLength(0);
  });

  it('should deduplicate package lookups across multiple files', async () => {
    const unit1 = makeFileUnit({
      file: 'a.ts',
      imports: [
        { module: 'shared-ghost', symbols: ['x'], line: 0, isRelative: false, raw: "import { x } from 'shared-ghost'" },
      ],
    });

    const unit2 = makeFileUnit({
      file: 'b.ts',
      imports: [
        { module: 'shared-ghost', symbols: ['y'], line: 0, isRelative: false, raw: "import { y } from 'shared-ghost'" },
      ],
    });

    const verifyResults = new Map<string, PackageVerifyResult>([
      ['shared-ghost', { exists: false, name: 'shared-ghost', source: 'registry', latencyMs: 50 }],
    ]);

    const mockManager = createMockRegistryManager(verifyResults);
    const results = await detector.detect([unit1, unit2], createContext(mockManager));

    // Should have 2 results (one per file) but only 1 registry call (deduplicated)
    expect(results).toHaveLength(2);
    expect(mockManager.verifyBatch).toHaveBeenCalledTimes(1);
  });

  it('should include metadata in results', async () => {
    const unit = makeFileUnit({
      imports: [
        { module: 'ai-hallucinated-lib', symbols: ['fn'], line: 3, isRelative: false, raw: "import { fn } from 'ai-hallucinated-lib'" },
      ],
    });

    const verifyResults = new Map<string, PackageVerifyResult>([
      ['ai-hallucinated-lib', { exists: false, name: 'ai-hallucinated-lib', source: 'registry', latencyMs: 50 }],
    ]);

    const results = await detector.detect([unit], createContext(createMockRegistryManager(verifyResults)));
    expect(results).toHaveLength(1);
    expect(results[0].metadata).toBeDefined();
    expect(results[0].metadata?.packageName).toBe('ai-hallucinated-lib');
    expect(results[0].metadata?.language).toBe('typescript');
    expect(results[0].metadata?.registry).toBe('npm');
  });

  it('should handle Go imports with URL-based module paths', async () => {
    const unit = makeFileUnit({
      file: 'main.go',
      language: 'go',
      imports: [
        { module: 'github.com/fake-org/fake-repo', symbols: [], line: 0, isRelative: false, raw: '"github.com/fake-org/fake-repo"' },
      ],
    });

    const verifyResults = new Map<string, PackageVerifyResult>([
      ['github.com/fake-org/fake-repo', { exists: false, name: 'github.com/fake-org/fake-repo', source: 'registry', latencyMs: 50 }],
    ]);

    const results = await detector.detect([unit], createContext(createMockRegistryManager(verifyResults)));
    expect(results).toHaveLength(1);
    expect(results[0].metadata?.registry).toBe('Go module proxy');
  });

  it('should skip Java builtin packages', async () => {
    const unit = makeFileUnit({
      file: 'App.java',
      language: 'java',
      imports: [
        { module: 'java.util.List', symbols: ['List'], line: 0, isRelative: false, raw: 'import java.util.List;' },
        { module: 'java.io.File', symbols: ['File'], line: 1, isRelative: false, raw: 'import java.io.File;' },
      ],
    });

    const verifyResults = new Map<string, PackageVerifyResult>();
    const mockManager = createMockRegistryManager(verifyResults);
    const results = await detector.detect([unit], createContext(mockManager));
    expect(results).toHaveLength(0);
  });

  it('should detect hallucinated Kotlin package', async () => {
    const unit = makeFileUnit({
      file: 'App.kt',
      language: 'kotlin',
      imports: [
        { module: 'com.fake.kotlin.library', symbols: ['FakeClient'], line: 0, isRelative: false, raw: 'import com.fake.kotlin.library.FakeClient' },
      ],
    });

    const verifyResults = new Map<string, PackageVerifyResult>([
      ['com.fake.kotlin.library', { exists: false, name: 'com.fake.kotlin.library', source: 'registry', latencyMs: 50 }],
    ]);

    const results = await detector.detect([unit], createContext(createMockRegistryManager(verifyResults)));
    expect(results).toHaveLength(1);
    expect(results[0].metadata?.registry).toBe('Maven Central');
    expect(results[0].metadata?.language).toBe('kotlin');
    expect(results[0].metadata?.packageName).toBe('com.fake.kotlin.library');
  });

  it('should skip Kotlin stdlib packages', async () => {
    const unit = makeFileUnit({
      file: 'App.kt',
      language: 'kotlin',
      imports: [
        { module: 'kotlin.collections.List', symbols: ['List'], line: 0, isRelative: false, raw: 'import kotlin.collections.List' },
        { module: 'kotlin.coroutines', symbols: [], line: 1, isRelative: false, raw: 'import kotlin.coroutines' },
      ],
    });

    const verifyResults = new Map<string, PackageVerifyResult>();
    const mockManager = createMockRegistryManager(verifyResults);
    const results = await detector.detect([unit], createContext(mockManager));
    expect(results).toHaveLength(0);
  });

  it('should detect hallucinated Python package', async () => {
    const unit = makeFileUnit({
      file: 'app.py',
      language: 'python',
      imports: [
        { module: 'nonexistent_ai_library', symbols: ['MagicModel'], line: 0, isRelative: false, raw: 'from nonexistent_ai_library import MagicModel' },
      ],
    });

    const verifyResults = new Map<string, PackageVerifyResult>([
      ['nonexistent_ai_library', { exists: false, name: 'nonexistent_ai_library', source: 'registry', latencyMs: 50 }],
    ]);

    const results = await detector.detect([unit], createContext(createMockRegistryManager(verifyResults)));
    expect(results).toHaveLength(1);
    expect(results[0].metadata?.registry).toBe('PyPI');
    expect(results[0].metadata?.language).toBe('python');
  });
});

// ─── Fallback detection (no registry) ─────────────────────────────

describe('HallucinatedImportDetector - fallback detection (no registry)', () => {
  const detector = new HallucinatedImportDetector();

  it('should detect non-relative, non-builtin imports as potentially hallucinated when no registry', async () => {
    const unit = makeFileUnit({
      imports: [
        { module: 'some-unknown-pkg', symbols: ['fn'], line: 0, isRelative: false, raw: "import { fn } from 'some-unknown-pkg'" },
      ],
    });

    const results = await detector.detect([unit], createContext()); // No registryManager
    expect(results).toHaveLength(1);
    expect(results[0].detectorId).toBe('hallucinated-import');
    expect(results[0].severity).toBe('warning');
    expect(results[0].confidence).toBe(0.6);
    expect(results[0].message).toContain('some-unknown-pkg');
    expect(results[0].metadata?.offline).toBe(true);
  });

  it('should not flag relative imports', async () => {
    const unit = makeFileUnit({
      imports: [
        { module: './utils', symbols: ['helper'], line: 0, isRelative: true, raw: "import { helper } from './utils'" },
        { module: '../config', symbols: ['cfg'], line: 1, isRelative: true, raw: "import { cfg } from '../config'" },
      ],
    });

    const results = await detector.detect([unit], createContext());
    expect(results).toHaveLength(0);
  });

  it('should not flag builtin modules', async () => {
    const unit = makeFileUnit({
      imports: [
        { module: 'fs', symbols: ['readFile'], line: 0, isRelative: false, raw: "import { readFile } from 'fs'" },
        { module: 'path', symbols: ['join'], line: 1, isRelative: false, raw: "import { join } from 'path'" },
      ],
    });

    const results = await detector.detect([unit], createContext());
    expect(results).toHaveLength(0);
  });

  it('should not flag imports present in projectDependencies', async () => {
    const unit = makeFileUnit({
      imports: [
        { module: 'lodash', symbols: ['map'], line: 0, isRelative: false, raw: "import { map } from 'lodash'" },
        { module: 'express', symbols: [], line: 1, isRelative: false, raw: "import express from 'express'" },
        { module: 'unknown-pkg', symbols: ['fn'], line: 2, isRelative: false, raw: "import { fn } from 'unknown-pkg'" },
      ],
    });

    const context: DetectorContext = {
      projectRoot: '/project',
      allFiles: ['test.ts'],
      projectDependencies: ['lodash', 'express'],
    };

    const results = await detector.detect([unit], context);
    expect(results).toHaveLength(1);
    expect(results[0].metadata?.packageName).toBe('unknown-pkg');
  });

  it('should use lower confidence (0.6) for fallback results', async () => {
    const unit = makeFileUnit({
      imports: [
        { module: 'some-pkg', symbols: ['fn'], line: 0, isRelative: false, raw: "import { fn } from 'some-pkg'" },
      ],
    });

    const results = await detector.detect([unit], createContext());
    expect(results).toHaveLength(1);
    expect(results[0].confidence).toBe(0.6);
  });

  it('should match subpath imports against projectDependencies', async () => {
    const unit = makeFileUnit({
      imports: [
        { module: 'lodash/fp', symbols: ['flow'], line: 0, isRelative: false, raw: "import { flow } from 'lodash/fp'" },
      ],
    });

    const context: DetectorContext = {
      projectRoot: '/project',
      allFiles: ['test.ts'],
      projectDependencies: ['lodash'],
    };

    const results = await detector.detect([unit], context);
    expect(results).toHaveLength(0);
  });
});

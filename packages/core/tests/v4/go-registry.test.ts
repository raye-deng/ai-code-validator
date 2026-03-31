/**
 * Go Proxy Registry Tests
 *
 * Tests Go module proxy verification using mocked fetch.
 * No real HTTP calls are made.
 *
 * @since 0.4.0 (V4)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { GoProxyRegistry } from '../../src/registry/go-registry.js';
import { RegistryCache } from '../../src/registry/cache.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('GoProxyRegistry', () => {
  let tmpDir: string;
  let cache: RegistryCache;
  let registry: GoProxyRegistry;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-go-test-'));
    cache = new RegistryCache(tmpDir);
    registry = new GoProxyRegistry(undefined, cache);
    mockFetch.mockReset();
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // cleanup
    }
  });

  // 1. Verify existing module
  it('should verify existing Go module returns exists=true', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => 'v1.7.4\nv1.8.0\nv1.9.1\n',
    });

    const result = await registry.verify('github.com/gin-gonic/gin');
    expect(result.exists).toBe(true);
    expect(result.name).toBe('github.com/gin-gonic/gin');
    expect(result.version).toBe('v1.9.1');
    expect(result.source).toBe('registry');
  });

  // 2. Verify non-existent module
  it('should verify non-existent module returns exists=false', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 404,
      ok: false,
    });

    const result = await registry.verify('github.com/fake/nonexistent');
    expect(result.exists).toBe(false);
    expect(result.source).toBe('registry');
  });

  // 3. Standard library bypass (fmt)
  it('should return builtin source for Go stdlib packages', async () => {
    const result = await registry.verify('fmt');
    expect(result.exists).toBe(true);
    expect(result.source).toBe('builtin');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // 4. Standard library bypass (net/http sub-package)
  it('should detect stdlib sub-packages (e.g., net)', async () => {
    const result = await registry.verify('net');
    expect(result.exists).toBe(true);
    expect(result.source).toBe('builtin');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // 5. Module path with upper case (case encoding)
  it('should encode upper case letters in module paths', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => 'v1.0.0\n',
    });

    await registry.verify('github.com/Azure/azure-sdk-for-go');
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    // Upper case 'A' should be encoded as '!a'
    expect(calledUrl).toContain('!azure');
  });

  // 6. 410 Gone status (removed module)
  it('should treat 410 Gone as non-existent', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 410,
      ok: false,
    });

    const result = await registry.verify('github.com/removed/module');
    expect(result.exists).toBe(false);
    expect(result.source).toBe('registry');
  });

  // 7. Cache integration
  it('should use cache on second call', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => 'v1.0.0\n',
    });

    await registry.verify('github.com/gin-gonic/gin');
    const result2 = await registry.verify('github.com/gin-gonic/gin');
    expect(result2.source).toBe('cache');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // 8. Network error returns conservative result
  it('should return exists=true on network error (conservative)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    const result = await registry.verify('github.com/some/module');
    expect(result.exists).toBe(true);
  });

  // 9. Custom proxy URL
  it('should use custom proxy URL', async () => {
    const customRegistry = new GoProxyRegistry(
      { url: 'https://goproxy.company.com' },
      cache,
    );

    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => 'v1.0.0\n',
    });

    await customRegistry.verify('github.com/internal/module');
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('goproxy.company.com');
  });

  // 10. Multiple stdlib packages
  it('should recognize multiple stdlib packages', async () => {
    const stdlibPkgs = ['fmt', 'os', 'io', 'sync', 'context', 'testing', 'crypto', 'encoding'];
    for (const pkg of stdlibPkgs) {
      const result = await registry.verify(pkg);
      expect(result.exists).toBe(true);
      expect(result.source).toBe('builtin');
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // 11. checkDeprecated detects deprecated Go module via go.mod comment
  it('should detect deprecated module from go.mod comment', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () =>
        'module github.com/example/old-pkg\n\n' +
        '// Deprecated: Use github.com/example/old-pkg/v2 instead.\n\n' +
        'go 1.21\n',
    });

    const result = await registry.checkDeprecated('github.com/example/old-pkg');
    expect(result).not.toBeNull();
    expect(result!.deprecated).toBe(true);
    expect(result!.message).toContain('Use github.com/example/old-pkg/v2 instead');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/@v/go.mod');
  });

  // 12. checkDeprecated with specific version
  it('should fetch go.mod for specific version', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () =>
        'module github.com/example/pkg\n\n' +
        '// Deprecated: This module is archived.\n\n' +
        'go 1.20\n',
    });

    const result = await registry.checkDeprecated('github.com/example/pkg', 'v1.2.3');
    expect(result).not.toBeNull();
    expect(result!.deprecated).toBe(true);
    expect(result!.message).toContain('archived');
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/@v/v1.2.3.mod');
  });

  // 13. checkDeprecated returns null for non-deprecated module
  it('should return null for non-deprecated module', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () =>
        'module github.com/example/active-pkg\n\n' +
        'go 1.22\n',
    });

    const result = await registry.checkDeprecated('github.com/example/active-pkg');
    expect(result).toBeNull();
  });

  // 14. checkDeprecated returns null for stdlib
  it('should return null for stdlib packages', async () => {
    const result = await registry.checkDeprecated('fmt');
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // 15. checkDeprecated handles network error gracefully
  it('should return null on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    const result = await registry.checkDeprecated('github.com/example/pkg');
    expect(result).toBeNull();
  });

  // 16. checkDeprecated handles 404 gracefully
  it('should return null for 404 response', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 404,
      ok: false,
    });

    const result = await registry.checkDeprecated('github.com/nonexistent/pkg');
    expect(result).toBeNull();
  });

  // 17. checkDeprecated detects inline deprecated comment
  it('should detect deprecated comment on module line', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () =>
        'module github.com/example/inline-dep // Deprecated: Use other-pkg\n\n' +
        'go 1.21\n',
    });

    const result = await registry.checkDeprecated('github.com/example/inline-dep');
    expect(result).not.toBeNull();
    expect(result!.deprecated).toBe(true);
    expect(result!.message).toContain('Use other-pkg');
  });

  // 18. checkDeprecated uses cache
  it('should cache deprecation results', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () =>
        'module github.com/example/cached-dep\n\n' +
        '// Deprecated: Use v2.\n\n' +
        'go 1.21\n',
    });

    await registry.checkDeprecated('github.com/example/cached-dep');
    const result2 = await registry.checkDeprecated('github.com/example/cached-dep');
    expect(result2).not.toBeNull();
    expect(result2!.deprecated).toBe(true);
    // Second call should hit cache
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

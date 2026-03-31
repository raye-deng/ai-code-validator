/**
 * Go Proxy Registry — module verification against the Go module proxy.
 *
 * Supports:
 * - Standard Go modules (e.g. 'github.com/gin-gonic/gin')
 * - Go standard library detection (no proxy needed)
 * - Custom proxy URLs (e.g. GOPROXY)
 *
 * @since 0.4.0 (V4)
 */

import type { PackageRegistry, PackageVerifyResult, DeprecationInfo, RegistryConfig } from './types.js';
import { RegistryCache } from './cache.js';
import { GO_BUILTINS } from './builtins/go-builtins.js';

export class GoProxyRegistry implements PackageRegistry {
  readonly name = 'go';
  readonly language = 'go';

  private baseUrl: string;
  private token?: string;
  private timeout: number;
  private cacheTtl: number;
  private cache: RegistryCache;

  constructor(config?: RegistryConfig, cache?: RegistryCache) {
    this.baseUrl = config?.url || 'https://proxy.golang.org';
    this.token = config?.token;
    this.timeout = config?.timeoutMs || 5000;
    this.cacheTtl = config?.cacheTtlSeconds || 86400;
    this.cache = cache || new RegistryCache();
  }

  /**
   * Check if an import path is a Go standard library package.
   * Go stdlib packages don't have dots in the first path segment.
   * Additionally, check against the known stdlib set for top-level packages.
   */
  private isStdlib(modulePath: string): boolean {
    const topLevel = modulePath.split('/')[0];

    // Go stdlib packages don't contain dots in the first path segment
    // e.g., "fmt", "net/http", "crypto/tls" are stdlib
    // e.g., "github.com/foo/bar" is not stdlib
    if (!topLevel.includes('.')) {
      // Additionally verify against our known stdlib set
      return GO_BUILTINS.has(topLevel);
    }

    return false;
  }

  /**
   * Verify if a Go module exists.
   *
   * 1. Check if it's a Go standard library package
   * 2. Check cache
   * 3. Query Go module proxy: GET {proxy}/{module}/@v/list
   *    - 200 with version list → exists
   *    - 404 or 410 → does not exist
   *    - error → assume exists (conservative)
   */
  async verify(packageName: string): Promise<PackageVerifyResult> {
    const start = Date.now();

    // Check standard library first
    if (this.isStdlib(packageName)) {
      return {
        exists: true,
        name: packageName,
        source: 'builtin',
        latencyMs: Date.now() - start,
      };
    }

    // Check cache
    const cacheKey = `go:${packageName}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, name: packageName, latencyMs: Date.now() - start };
    }

    // Query Go module proxy
    try {
      // Module paths are case-sensitive in Go, but proxied with case-encoding
      // Upper case letters are encoded as !{lowercase}
      const encodedModule = this.encodeModulePath(packageName);
      const url = `${this.baseUrl}/${encodedModule}/@v/list`;
      const headers: Record<string, string> = {};
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(this.timeout),
      });

      const latencyMs = Date.now() - start;

      if (response.status === 404 || response.status === 410) {
        const result: PackageVerifyResult = {
          exists: false,
          name: packageName,
          source: 'registry',
          latencyMs,
        };
        await this.cache.set(cacheKey, result, this.cacheTtl);
        return result;
      }

      // Parse version list — last line is latest
      let version: string | undefined;
      try {
        const text = await response.text();
        const versions = text.trim().split('\n').filter(Boolean);
        if (versions.length > 0) {
          version = versions[versions.length - 1];
        }
      } catch {
        // Could not parse versions
      }

      const result: PackageVerifyResult = {
        exists: true,
        name: packageName,
        version,
        source: 'registry',
        latencyMs,
      };
      await this.cache.set(cacheKey, result, this.cacheTtl);
      return result;

    } catch {
      // Network error → assume exists (conservative)
      return {
        exists: true,
        name: packageName,
        source: 'registry',
        latencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Encode a module path for the Go proxy.
   * Upper case letters are encoded as !{lowercase}.
   * e.g., "github.com/Azure/azure-sdk" → "github.com/!azure/azure-sdk"
   */
  private encodeModulePath(modulePath: string): string {
    return modulePath.replace(/[A-Z]/g, (c) => `!${c.toLowerCase()}`);
  }

  /**
   * Check if a Go module is deprecated.
   *
   * Go modules indicate deprecation via a "// Deprecated:" comment in go.mod:
   * ```
   * module github.com/example/pkg
   *
   * // Deprecated: Use github.com/example/pkg/v2 instead.
   * ```
   *
   * Fetches the go.mod file from the Go module proxy and parses it.
   * GET {proxy}/{module}/@v/go.mod
   */
  async checkDeprecated(packageName: string, version?: string): Promise<DeprecationInfo | null> {
    if (this.isStdlib(packageName)) return null;

    try {
      const cacheKey = `go:deprecation:${packageName}`;
      const cached = await this.cache.get(cacheKey) as DeprecationInfo | null;
      if (cached) return cached;

      const encodedModule = this.encodeModulePath(packageName);
      let url: string;

      if (version) {
        url = `${this.baseUrl}/${encodedModule}/@v/${version}.mod`;
      } else {
        url = `${this.baseUrl}/${encodedModule}/@v/go.mod`;
      }

      const headers: Record<string, string> = {};
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) return null;

      const goModContent = await response.text();

      // Parse go.mod for "// Deprecated:" comments (Go toolchain convention)
      const deprecationMatch = goModContent.match(/^\/\/\s*Deprecated:\s*(.+)$/m);
      if (deprecationMatch) {
        const message = deprecationMatch[1].trim();
        const result: DeprecationInfo = {
          deprecated: true,
          message,
        };
        await this.cache.set(cacheKey, result, this.cacheTtl);
        return result;
      }

      // Also check for "module ... // Deprecated:" format (single-line)
      const inlineMatch = goModContent.match(/^module\s+\S+.*?\/\/\s*Deprecated:\s*(.+)$/m);
      if (inlineMatch) {
        const message = inlineMatch[1].trim();
        const result: DeprecationInfo = {
          deprecated: true,
          message,
        };
        await this.cache.set(cacheKey, result, this.cacheTtl);
        return result;
      }

      return null;
    } catch {
      return null;
    }
  }
}

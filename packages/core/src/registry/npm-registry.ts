/**
 * npm Registry — package verification against the npm registry.
 *
 * Supports:
 * - Regular packages (e.g. 'lodash')
 * - Scoped packages (e.g. '@scope/name')
 * - Custom registry URLs (enterprise Nexus/Artifactory)
 * - Auth token headers
 *
 * @since 0.4.0 (V4)
 */

import type { PackageRegistry, PackageVerifyResult, DeprecationInfo, RegistryConfig } from './types.js';
import { RegistryCache } from './cache.js';
import { NODE_BUILTINS } from './builtins/node-builtins.js';

export class NpmRegistry implements PackageRegistry {
  readonly name = 'npm';
  readonly language = 'typescript';

  private baseUrl: string;
  private token?: string;
  private timeout: number;
  private cacheTtl: number;
  private cache: RegistryCache;

  constructor(config?: RegistryConfig, cache?: RegistryCache) {
    this.baseUrl = config?.url || 'https://registry.npmjs.org';
    this.token = config?.token;
    this.timeout = config?.timeoutMs || 5000;
    this.cacheTtl = config?.cacheTtlSeconds || 86400;
    this.cache = cache || new RegistryCache();
  }

  /**
   * Verify if an npm package exists.
   *
   * 1. Check if it's a Node.js built-in module
   * 2. Check cache
   * 3. Query registry: GET {baseUrl}/{packageName}
   *    - 200 → exists, extract version from dist-tags.latest
   *    - 404 → does not exist
   *    - timeout/error → assume exists (conservative)
   */
  async verify(packageName: string): Promise<PackageVerifyResult> {
    const start = Date.now();

    // Check built-in modules first
    const normalizedName = packageName.startsWith('node:')
      ? packageName
      : packageName;

    if (NODE_BUILTINS.has(normalizedName) || NODE_BUILTINS.has(`node:${normalizedName}`)) {
      return {
        exists: true,
        name: packageName,
        source: 'builtin',
        latencyMs: Date.now() - start,
      };
    }

    // Check cache
    const cacheKey = `npm:${packageName}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, latencyMs: Date.now() - start };
    }

    // Query registry
    try {
      // Scoped packages: @scope/name → @scope%2Fname
      const encodedName = packageName.startsWith('@')
        ? `@${encodeURIComponent(packageName.slice(1))}`
        : encodeURIComponent(packageName);

      const url = `${this.baseUrl}/${encodedName}`;
      const headers: Record<string, string> = {
        Accept: 'application/vnd.npm.install-v1+json',
      };
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(this.timeout),
      });

      const latencyMs = Date.now() - start;

      if (response.status === 404) {
        const result: PackageVerifyResult = {
          exists: false,
          name: packageName,
          source: 'registry',
          latencyMs,
          error: 'not-found',
        };
        await this.cache.set(cacheKey, result, this.cacheTtl);
        return result;
      }

      // Parse response to get version info
      let version: string | undefined;
      try {
        const data = await response.json() as Record<string, unknown>;
        const distTags = data['dist-tags'] as Record<string, string> | undefined;
        version = distTags?.latest;
      } catch {
        // Could not parse response body, but status was OK
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

    } catch (err) {
      // Network error or timeout → assume exists (conservative, avoid false positives)
      const errorDetail = err instanceof Error ? err.message : String(err);
      return {
        exists: true,
        name: packageName,
        source: 'registry',
        latencyMs: Date.now() - start,
        error: 'unreachable',
        errorDetail,
      };
    }
  }

  /**
   * Check if an npm package is deprecated.
   * GET {baseUrl}/{packageName}/latest and check the deprecated field.
   */
  async checkDeprecated(packageName: string): Promise<DeprecationInfo | null> {
    try {
      const encodedName = packageName.startsWith('@')
        ? `@${encodeURIComponent(packageName.slice(1))}`
        : encodeURIComponent(packageName);

      const url = `${this.baseUrl}/${encodedName}/latest`;
      const headers: Record<string, string> = {};
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as Record<string, unknown>;
      const deprecated = data['deprecated'] as string | undefined;

      if (deprecated) {
        return {
          deprecated: true,
          message: deprecated,
        };
      }

      return null;
    } catch {
      return null;
    }
  }
}

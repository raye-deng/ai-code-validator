/**
 * Registry Abstraction Types
 *
 * Defines the PackageRegistry interface and related types for
 * dynamic package verification against real registries (npm, PyPI, Maven, Go proxy).
 *
 * Replaces V3's hardcoded whitelist approach with live registry lookups.
 *
 * @since 0.4.0 (V4)
 */

/**
 * PackageRegistry — interface for verifying package existence against
 * a language-specific package registry.
 */
export interface PackageRegistry {
  /** Registry name (e.g. 'npm', 'pypi', 'maven', 'go') */
  readonly name: string;
  /** Primary language this registry serves */
  readonly language: string;

  /** Check if a package/module exists in the registry */
  verify(packageName: string): Promise<PackageVerifyResult>;

  /** Check if a package is deprecated */
  checkDeprecated(packageName: string, version?: string): Promise<DeprecationInfo | null>;
}

/**
 * Result of verifying a package against a registry.
 */
export interface PackageVerifyResult {
  /** Whether the package exists */
  exists: boolean;
  /** Package name that was looked up */
  name: string;
  /** Latest version if the package exists */
  version?: string;
  /** Where the result came from */
  source: 'registry' | 'cache' | 'builtin';
  /** Time taken for the lookup in milliseconds */
  latencyMs: number;
  /**
   * If the lookup failed, indicates why.
   * - 'not-found': package confirmed not to exist (404 from registry)
   * - 'unreachable': registry was unreachable (network error, timeout, DNS failure)
   * - undefined: no error (package exists, or result from cache/builtin)
   */
  error?: 'not-found' | 'unreachable';
  /** Human-readable error detail (e.g., "ETIMEDOUT after 5000ms", "ENOTFOUND registry.npmjs.org") */
  errorDetail?: string;
}

/**
 * Deprecation information for a package.
 */
export interface DeprecationInfo {
  /** Whether the package is deprecated */
  deprecated: boolean;
  /** Deprecation message from the registry */
  message?: string;
  /** Suggested replacement package */
  replacement?: string;
  /** Version or date since deprecation */
  since?: string;
}

/**
 * Configuration for a single registry endpoint.
 */
export interface RegistryConfig {
  /** Custom registry URL (for enterprise Nexus/Artifactory) */
  url: string;
  /** Auth token if needed */
  token?: string;
  /** Cache TTL in seconds (default: 86400 = 24h) */
  cacheTtlSeconds?: number;
  /** Timeout for HTTP requests in ms (default: 5000) */
  timeoutMs?: number;
}

/**
 * Configuration for all supported registries.
 */
export interface RegistryOptions {
  npm?: RegistryConfig;
  pypi?: RegistryConfig;
  maven?: RegistryConfig;
  go?: RegistryConfig;
}

/**
 * Internal cache entry structure.
 */
export interface CacheEntry {
  result: PackageVerifyResult;
  timestamp: number;
  ttl: number;
}

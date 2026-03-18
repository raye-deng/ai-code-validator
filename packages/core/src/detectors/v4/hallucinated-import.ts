/**
 * HallucinatedImportDetector — V4 detector for hallucinated imports.
 *
 * Detects imports of packages/modules that don't exist in the package registry.
 * This is THE core differentiator of Open Code Review: AI code generators
 * frequently hallucinate package names that look plausible but don't exist.
 *
 * V4 improvements over V3:
 * - Uses dynamic registry verification (npm, PyPI, Maven, Go proxy) instead of hardcoded whitelists
 * - Operates on CodeUnit IR instead of raw source
 * - Language-aware built-in module filtering
 * - Batch verification to minimize HTTP calls
 *
 * @since 0.4.0
 */

import type { CodeUnit, SupportedLanguage, ImportInfo } from '../../ir/types.js';
import type { V4Detector, DetectorResult, DetectorCategory, DetectorContext } from './types.js';
import { NODE_BUILTINS } from '../../registry/builtins/node-builtins.js';
import { PYTHON_BUILTINS } from '../../registry/builtins/python-builtins.js';
import { JAVA_BUILTINS } from '../../registry/builtins/java-builtins.js';
import { GO_BUILTINS } from '../../registry/builtins/go-builtins.js';
import { KOTLIN_BUILTINS } from '../../registry/builtins/kotlin-builtins.js';

// ─── Built-in module sets by language ──────────────────────────────

const BUILTIN_SETS: Record<string, Set<string>> = {
  typescript: NODE_BUILTINS,
  javascript: NODE_BUILTINS,
  python: PYTHON_BUILTINS,
  java: JAVA_BUILTINS,
  go: GO_BUILTINS,
  kotlin: KOTLIN_BUILTINS,
};

// ─── Import occurrence tracking ────────────────────────────────────

/** Tracks an import occurrence for hallucination detection. */
export interface ImportOccurrence {
  file: string;
  line: number;
  raw: string;
}

// ─── Detector ──────────────────────────────────────────────────────

export class HallucinatedImportDetector implements V4Detector {
  readonly id = 'hallucinated-import';
  readonly name = 'Hallucinated Import Detector';
  readonly category: DetectorCategory = 'ai-faithfulness';
  readonly supportedLanguages: SupportedLanguage[] = []; // All languages

  async detect(units: CodeUnit[], context: DetectorContext): Promise<DetectorResult[]> {
    const results: DetectorResult[] = [];

    // If no registry manager is provided (offline mode), fall back to whitelist-based detection
    if (!context.registryManager) {
      return this.detectWithoutRegistry(units, context, results);
    }

    // Group imports by language, deduplicating by package name
    const importsByLanguage = this.groupImportsByLanguage(units);

    for (const [language, packageMap] of importsByLanguage.entries()) {
      const builtins = BUILTIN_SETS[language];
      if (!builtins) continue;

      // Collect non-relative, non-builtin package names
      const packagesToVerify: string[] = [];
      for (const [packageName] of packageMap) {
        if (!this.isBuiltin(packageName, language, builtins)) {
          packagesToVerify.push(packageName);
        }
      }

      if (packagesToVerify.length === 0) continue;

      // Batch verify against registry
      const verifyResults = await context.registryManager.verifyBatch(
        language,
        packagesToVerify,
      );

      // Generate results for packages that don't exist
      for (const [packageName, verifyResult] of verifyResults.entries()) {
        if (!verifyResult.exists) {
          const occurrences = packageMap.get(packageName);
          if (!occurrences) continue;

          // Create a result for each occurrence
          for (const occurrence of occurrences) {
            results.push({
              detectorId: this.id,
              severity: 'error',
              category: this.category,
              messageKey: 'hallucinated-import.package-not-found',
              message: `Import "${packageName}" does not exist in the ${this.getRegistryName(language)} registry. This may be a hallucinated package name.`,
              file: occurrence.file,
              line: occurrence.line + 1, // Convert 0-based to 1-based
              confidence: 0.9,
              metadata: {
                packageName,
                language,
                registry: this.getRegistryName(language),
                raw: occurrence.raw,
              },
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Fallback detection when no registry manager is available (offline mode).
   * Flags non-relative, non-builtin, non-project imports as potentially hallucinated.
   */
  private detectWithoutRegistry(
    units: CodeUnit[],
    context: DetectorContext,
    results: DetectorResult[],
  ): DetectorResult[] {
    const projectDeps = context.projectDependencies
      ? new Set(context.projectDependencies)
      : null;

    for (const unit of units) {
      if (unit.kind !== 'file') continue;

      const builtins = BUILTIN_SETS[unit.language];
      if (!builtins) continue;

      for (const imp of unit.imports) {
        // Skip relative imports
        if (imp.isRelative) continue;

        const packageName = this.extractPackageName(imp.module, unit.language);

        // Skip builtins
        if (this.isBuiltin(packageName, unit.language, builtins)) continue;

        // Skip project dependencies
        if (projectDeps && this.matchesProjectDep(packageName, projectDeps)) continue;

        results.push({
          detectorId: this.id,
          severity: 'warning',
          category: this.category,
          messageKey: 'hallucinated-import.potential-hallucination-offline',
          message: `Import "${packageName}" is not a known built-in or project dependency and could not be verified against the ${this.getRegistryName(unit.language)} registry (offline mode). This may be a hallucinated package name.`,
          file: unit.file,
          line: imp.line + 1,
          confidence: 0.6,
          metadata: {
            packageName,
            language: unit.language,
            registry: this.getRegistryName(unit.language),
            raw: imp.raw,
            offline: true,
          },
        });
      }
    }

    return results;
  }

  /**
   * Check if a package name matches any project dependency.
   * Supports both exact match and top-level prefix match (e.g., "lodash" matches "lodash/fp").
   */
  private matchesProjectDep(packageName: string, projectDeps: Set<string>): boolean {
    if (projectDeps.has(packageName)) return true;
    // For npm scoped/regular packages, check if the import is a subpath of a known dep
    const topLevel = packageName.split('/')[0];
    if (topLevel !== packageName && projectDeps.has(topLevel)) return true;
    // For scoped packages, check top-level scope/name
    if (packageName.startsWith('@')) {
      const parts = packageName.split('/');
      if (parts.length >= 2) {
        const scopeName = `${parts[0]}/${parts[1]}`;
        if (projectDeps.has(scopeName) && scopeName !== packageName) return true;
      }
    }
    return false;
  }

  /**
   * Group imports from all CodeUnits by language and package name.
   * Returns Map<language, Map<packageName, occurrences[]>>.
   */
  private groupImportsByLanguage(
    units: CodeUnit[],
  ): Map<string, Map<string, ImportOccurrence[]>> {
    const result = new Map<string, Map<string, ImportOccurrence[]>>();

    for (const unit of units) {
      // Only process file-level units (imports are at file level)
      if (unit.kind !== 'file') continue;

      for (const imp of unit.imports) {
        // Skip relative imports
        if (imp.isRelative) continue;

        const packageName = this.extractPackageName(imp.module, unit.language);

        if (!result.has(unit.language)) {
          result.set(unit.language, new Map());
        }
        const langMap = result.get(unit.language)!;

        if (!langMap.has(packageName)) {
          langMap.set(packageName, []);
        }
        langMap.get(packageName)!.push({
          file: unit.file,
          line: imp.line,
          raw: imp.raw,
        });
      }
    }

    return result;
  }

  /**
   * Extract the top-level package name from an import path.
   * - npm: "lodash/fp" → "lodash", "@scope/name/sub" → "@scope/name"
   * - python: "flask.blueprints" → "flask"
   * - java: "com.google.gson.Gson" → "com.google.gson"
   * - go: "github.com/gin-gonic/gin/binding" → "github.com/gin-gonic/gin"
   */
  private extractPackageName(module: string, language: SupportedLanguage): string {
    switch (language) {
      case 'typescript':
      case 'javascript': {
        // Scoped packages: @scope/name
        if (module.startsWith('@')) {
          const parts = module.split('/');
          return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : module;
        }
        // Regular packages: name/subpath → name
        return module.split('/')[0];
      }

      case 'python': {
        // Python: package.submodule → package
        return module.split('.')[0];
      }

      case 'java':
      case 'kotlin': {
        // Java/Kotlin: use the full module path as-is for registry lookup
        // The registry adapter handles groupId:artifactId mapping
        return module;
      }

      case 'go': {
        // Go: github.com/user/repo/subpkg → github.com/user/repo
        const parts = module.split('/');
        if (parts.length >= 3 && module.includes('.')) {
          // Looks like a URL-based import: take first 3 segments
          return parts.slice(0, 3).join('/');
        }
        // Standard library or short path
        return parts[0];
      }

      default:
        return module;
    }
  }

  /**
   * Check if an import is a language built-in module.
   */
  private isBuiltin(
    packageName: string,
    language: string,
    builtins: Set<string>,
  ): boolean {
    // Direct match
    if (builtins.has(packageName)) return true;

    // For Java/Kotlin, check prefix match (e.g., "java.util.List" matches "java.util")
    if (language === 'java' || language === 'kotlin') {
      for (const builtin of builtins) {
        if (packageName.startsWith(builtin + '.') || packageName === builtin) {
          return true;
        }
      }
    }

    // For Go, check prefix match (e.g., "net/http" matches "net")
    if (language === 'go') {
      const topLevel = packageName.split('/')[0];
      if (builtins.has(topLevel)) return true;
    }

    return false;
  }

  /**
   * Get a human-readable registry name for a language.
   */
  private getRegistryName(language: string): string {
    switch (language) {
      case 'typescript':
      case 'javascript':
        return 'npm';
      case 'python':
        return 'PyPI';
      case 'java':
      case 'kotlin':
        return 'Maven Central';
      case 'go':
        return 'Go module proxy';
      default:
        return 'package';
    }
  }
}

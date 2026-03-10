import { defineConfig } from 'vitest/config';

/**
 * CI-specific vitest config.
 * Excludes tree-sitter WASM tests that require native WASM support
 * not available in CI runners (GitHub Actions, GitLab CI Docker).
 */
export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      // tree-sitter WASM — requires native WASM loading
      'tests/v4/parser-manager.test.ts',
      'tests/v4/go-extractor.test.ts',
      'tests/v4/java-extractor.test.ts',
      'tests/v4/kotlin-extractor.test.ts',
      'tests/v4/python-extractor.test.ts',
      'tests/v4/typescript-extractor.test.ts',
      // V4Scanner loads tree-sitter internally
      'tests/v4/integration.test.ts',
      'tests/v4/benchmark.test.ts',
      'tests/v4/v4-scanner.test.ts',
      'tests/languages.test.ts',
    ],
  },
});

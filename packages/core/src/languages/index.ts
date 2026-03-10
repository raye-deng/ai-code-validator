/**
 * Multi-Language Support — Exports
 *
 * @since 0.3.0
 */

// Types
export type {
  LanguageAdapter,
  ASTNode,
  ImportInfo,
  CallInfo,
  PackageVerifyResult,
  DeprecatedInfo,
  ComplexityMetrics,
} from './types.js';

// Registry
export { LanguageRegistry } from './registry.js';

// Adapters
export { TypeScriptAdapter } from './typescript/index.js';
export { PythonAdapter, PYTHON_BUILTIN_MODULES, PYTHON_COMMON_PACKAGES } from './python/index.js';
export { JavaAdapter, JAVA_STDLIB_PACKAGES, JAVA_COMMON_PACKAGES } from './java/index.js';
export { GoAdapter, GO_STDLIB_PACKAGES, GO_COMMON_MODULES } from './go/index.js';

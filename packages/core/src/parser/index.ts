/**
 * Open Code Review V4 — Parser Module
 *
 * Exports tree-sitter parser manager, extractor interface, and language extractors.
 *
 * @since 0.4.0
 */

export { ParserManager } from './manager.js';
export type { LanguageExtractor } from './extractor.js';
export { TypeScriptExtractor } from './extractors/typescript.js';
export { PythonExtractor } from './extractors/python.js';
export { JavaExtractor } from './extractors/java.js';
export { GoExtractor } from './extractors/go.js';
export { KotlinExtractor } from './extractors/kotlin.js';

/**
 * Open Code Review V4 — AI Pipeline Module
 *
 * Two-stage AI scan pipeline for detecting AI-generated code defects:
 * - Stage 1 (Embedding): Fast similarity-based defect detection
 * - Stage 2 (LLM): Deep analysis of suspicious code blocks
 *
 * SLA levels control which stages run:
 * - L1 Fast: Structural detectors only (no AI)
 * - L2 Standard: + Embedding recall + Local LLM (Ollama)
 * - L3 Deep: + Remote LLM (OpenAI/Claude)
 *
 * @since 0.4.0
 *
 * @example
 * ```ts
 * import {
 *   AIScanPipeline,
 *   createPipelineForSLA,
 *   LocalEmbeddingProvider,
 *   OllamaLLMProvider,
 *   DEFECT_PATTERNS,
 * } from 'open-code-review-core';
 *
 * // Create pipeline for L2 (standard) with local LLM
 * const pipeline = createPipelineForSLA('L2', {
 *   local: { provider: 'ollama', model: 'codellama:13b' },
 * });
 *
 * // Run the scan
 * const result = await pipeline.scan(codeUnits, structuralResults);
 *
 * console.log(`Found ${result.totalIssues} issues in ${result.totalDurationMs}ms`);
 * console.log(`SLA level: ${result.slaLevel}`);
 *
 * for (const stage of result.stages) {
 *   console.log(`Stage ${stage.stage}: ${stage.issues.length} issues`);
 * }
 * ```
 */

// ─── Types ───

export type {
  SLALevel,
  EmbeddingProvider,
  LLMProvider,
  LLMOptions,
  LLMResponse,
  AIConfig,
  ScanStageResult,
  AIPipelineResult,
} from './types.js';

// ─── Embedding Providers ───

export {
  LocalEmbeddingProvider,
  OpenAIEmbeddingProvider,
  OllamaEmbeddingProvider,
  tokenize,
  cosineSimilarity,
  findTopMatches,
} from './embedding/index.js';

// ─── LLM Providers ───

export { OllamaLLMProvider, OpenAILLMProvider, AnthropicLLMProvider } from './llm/index.js';

// Backward compatibility aliases
export { OllamaLLMProvider as OllamaProvider } from './llm/index.js';
export { OpenAILLMProvider as OpenAIProvider } from './llm/index.js';
export { AnthropicLLMProvider as AnthropicProvider } from './llm/index.js';

// ─── Defect Patterns ───

export type { DefectPattern } from './patterns/index.js';
export {
  DEFECT_PATTERNS,
  getPatternsByCategory,
  getPatternsForLanguage,
  getPatternText,
} from './patterns/index.js';

// ─── Pipeline ───

export { AIScanPipeline } from './pipeline.js';

// ─── SLA Router ───

export {
  SLA_DESCRIPTIONS,
  DEFAULT_SLA_CONFIGS,
  createPipelineForSLA,
  getRecommendedSLA,
  validateSLAConfig,
} from './sla.js';

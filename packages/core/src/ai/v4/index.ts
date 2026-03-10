/**
 * V4 AI Pipeline Module
 *
 * Two-stage AI scan pipeline: Embedding Recall + LLM Deep Scan.
 *
 * @since 0.4.0
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

export { LocalEmbeddingProvider, tokenize } from './embedding/local.js';
export { OpenAIEmbeddingProvider } from './embedding/openai.js';
export { cosineSimilarity, findTopMatches } from './embedding/similarity.js';

// ─── LLM Providers ───

export { OllamaLLMProvider } from './llm/ollama.js';
export { OpenAILLMProvider } from './llm/openai.js';
export { AnthropicLLMProvider } from './llm/anthropic.js';

// ─── Defect Patterns ───

export type { DefectPattern } from './patterns/defect-patterns.js';
export {
  DEFECT_PATTERNS,
  getPatternsByCategory,
  getPatternsForLanguage,
  getPatternText,
} from './patterns/defect-patterns.js';

// ─── Pipeline ───

export { AIScanPipeline } from './pipeline.js';

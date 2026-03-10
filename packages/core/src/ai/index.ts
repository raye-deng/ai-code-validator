/**
 * AI Analysis Module
 *
 * Provides AI-powered code analysis with support for local (Ollama)
 * and remote (OpenAI, Anthropic) providers.
 *
 * @since 0.3.0
 *
 * @example
 * ```ts
 * import {
 *   AIOrchestrator,
 *   OllamaProvider,
 *   OpenAIProvider,
 *   AnthropicProvider,
 *   buildAnalysisPrompt,
 * } from 'open-code-review-core';
 *
 * // Create orchestrator with config
 * const orchestrator = new AIOrchestrator({
 *   local: { enabled: true, provider: 'ollama', model: 'codellama:13b', endpoint: 'http://localhost:11434' },
 *   remote: { enabled: false, provider: 'openai', model: 'gpt-4o-mini', apiKey: '' },
 *   strategy: 'local-first',
 * });
 *
 * // Analyze files
 * const result = await orchestrator.analyze({
 *   files: [{ path: 'app.ts', content: '...', language: 'typescript' }],
 *   mode: 'deep',
 * });
 * ```
 */

// ─── Types ───

export type {
  AIProvider,
  AIAnalysisRequest,
  AIAnalysisResponse,
  AIStrategy,
  AIRawIssue,
} from './types.js';

// ─── Providers ───

export { OllamaProvider } from './ollama-provider.js';
export { OpenAIProvider } from './openai-provider.js';
export { AnthropicProvider } from './anthropic-provider.js';

// ─── Orchestrator ───

export { AIOrchestrator } from './orchestrator.js';

// ─── Prompts ───

export { buildAnalysisPrompt, mapRawCategory, mapRawSeverity } from './prompts.js';

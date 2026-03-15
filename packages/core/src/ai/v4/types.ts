/**
 * Open Code Review V4 — AI Pipeline Types
 *
 * Type definitions for the two-stage AI scan pipeline:
 * - Stage 1 (Embedding): Fast similarity-based defect detection
 * - Stage 2 (LLM): Deep analysis of suspicious code blocks
 *
 * SLA levels control which stages run:
 * - L1 Fast: Structural detectors only (no AI)
 * - L2 Standard: + Embedding recall + Local LLM (Ollama)
 * - L3 Deep: + Remote LLM (OpenAI/Claude)
 *
 * @since 0.4.0
 */

import type { DetectorResult } from '../../detectors/v4/types.js';

// ─── SLA Level ─────────────────────────────────────────────────────

/** Service Level Agreement — controls pipeline depth and cost */
export type SLALevel = 'L1' | 'L2' | 'L3';

// ─── Embedding Provider ────────────────────────────────────────────

/**
 * Embedding provider interface.
 * Generates vector embeddings from text for similarity comparison.
 */
export interface EmbeddingProvider {
  /** Provider name (e.g. 'local-tfidf', 'openai') */
  readonly name: string;

  /** Embedding vector dimension */
  readonly dimension: number;

  /** Generate embeddings for a batch of text chunks */
  embed(texts: string[]): Promise<number[][]>;
}

// ─── LLM Provider ──────────────────────────────────────────────────

/**
 * LLM provider interface.
 * Sends prompts to a language model and returns structured responses.
 */
export interface LLMProvider {
  /** Provider name (e.g. 'ollama', 'openai', 'anthropic') */
  readonly name: string;

  /** Send a prompt and get a completion */
  complete(prompt: string, options?: LLMOptions): Promise<LLMResponse>;

  /** Check if this provider is available and configured */
  isAvailable(): Promise<boolean>;
}

/** Options for LLM completion requests */
export interface LLMOptions {
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Sampling temperature (0 = deterministic, 1 = creative) */
  temperature?: number;
  /** System prompt for the model */
  system?: string;
}

/** Response from an LLM completion request */
export interface LLMResponse {
  /** Generated text content */
  content: string;
  /** Token usage statistics */
  usage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  /** Response latency in milliseconds */
  latencyMs: number;
}

// ─── LLM Provider Adapter ──────────────────────────────────────────

/**
 * Supported remote LLM providers.
 *
 * - `openai`             — OpenAI official API
 * - `openai-compatible`  — Any OpenAI-compatible API (DeepSeek, Together AI, Fireworks, Azure, etc.)
 * - `glm`                — GLM (Zhipu AI) — preset, resolves to openai-compatible
 * - `zai`                — ZAI (GLM international brand) — preset, resolves to openai-compatible
 * - `deepseek`           — DeepSeek — preset, resolves to openai-compatible
 * - `together`           — Together AI — preset, resolves to openai-compatible
 * - `fireworks`          — Fireworks AI — preset, resolves to openai-compatible
 * - `anthropic`          — Anthropic Messages API
 *
 * Provider presets auto-fill `baseUrl`. Use `openai-compatible` with explicit `--api-base`
 * for any other OpenAI-compatible service.
 */
export type LLMProviderType =
  | 'openai'
  | 'openai-compatible'
  | 'glm'
  | 'zai'
  | 'deepseek'
  | 'together'
  | 'fireworks'
  | 'anthropic';

/**
 * Remote LLM provider configuration.
 * Used by the factory to create the appropriate adapter.
 */
export interface RemoteLLMConfig {
  /** Provider name or preset */
  provider: LLMProviderType;
  /** Model name (e.g. 'gpt-4o-mini', 'pony-alpha-2') */
  model: string;
  /** API key (required for remote providers) */
  apiKey: string;
  /** Base URL override (auto-filled from presets if omitted) */
  baseUrl?: string;
}

/**
 * Provider preset configurations.
 * Each preset maps to a protocol type and default base URL.
 */
export const LLM_PROVIDER_PRESETS: Record<string, {
  protocol: 'openai' | 'openai-compatible' | 'anthropic';
  baseUrl: string;
}> = {
  openai: {
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
  },
  'openai-compatible': {
    protocol: 'openai-compatible',
    baseUrl: '', // must be provided by user
  },
  glm: {
    protocol: 'openai-compatible',
    baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
  },
  zai: {
    protocol: 'openai-compatible',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  },
  deepseek: {
    protocol: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
  },
  together: {
    protocol: 'openai-compatible',
    baseUrl: 'https://api.together.xyz/v1',
  },
  fireworks: {
    protocol: 'openai-compatible',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
  },
  anthropic: {
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
  },
};

/** All valid provider/preset names for CLI validation */
export const ALL_LLM_PROVIDERS = Object.keys(LLM_PROVIDER_PRESETS) as LLMProviderType[];

// ─── AI Config ─────────────────────────────────────────────────────

/**
 * Configuration for the AI scan pipeline.
 * Controls which stages run and how they're configured.
 */
export interface AIConfig {
  /** SLA level determines which stages run */
  sla: SLALevel;

  /** Embedding provider configuration */
  embedding?: {
    provider: 'local' | 'openai' | 'ollama';
    model?: string;
    baseUrl?: string;
  };

  /** Local LLM configuration (Ollama) */
  local?: {
    provider: 'ollama';
    model: string;
    baseUrl?: string; // default: http://localhost:11434
  };

  /** Remote LLM configuration (OpenAI / Anthropic / GLM / any OpenAI-compatible) */
  remote?: RemoteLLMConfig;

  /** Maximum code blocks to send to LLM stage (default: 20) */
  maxLLMBlocks?: number;

  /** Embedding similarity threshold for flagging blocks (default: 0.7) */
  similarityThreshold?: number;
}

// ─── Scan Stage Result ─────────────────────────────────────────────

/** Result from a single scan stage */
export interface ScanStageResult {
  /** Which stage produced these results */
  stage: 'structural' | 'embedding' | 'llm';
  /** Issues detected in this stage */
  issues: DetectorResult[];
  /** Time taken in milliseconds */
  durationMs: number;
  /** Tokens consumed (LLM stages only) */
  tokensUsed?: number;
}

// ─── AI Pipeline Result ────────────────────────────────────────────

/** Aggregate result from all pipeline stages */
export interface AIPipelineResult {
  /** Results from each stage that ran */
  stages: ScanStageResult[];
  /** Total issues across all stages */
  totalIssues: number;
  /** Total time across all stages in milliseconds */
  totalDurationMs: number;
  /** SLA level that was used */
  slaLevel: SLALevel;
}

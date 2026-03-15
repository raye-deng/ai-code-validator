/**
 * LLM Provider Factory
 *
 * Creates the appropriate LLM provider adapter based on configuration.
 * Supports:
 * - OpenAI official API
 * - Any OpenAI-compatible API (GLM, DeepSeek, Together AI, Fireworks, Azure, etc.)
 * - Anthropic Messages API
 * - Local Ollama
 *
 * Provider presets auto-fill `baseUrl`. The factory resolves presets
 * to protocol-specific adapters.
 *
 * @since 0.4.0
 */

import type { LLMProvider, LLMOptions, LLMResponse } from '../types.js';
import type { LLMProviderType, RemoteLLMConfig } from '../types.js';
import { LLM_PROVIDER_PRESETS } from '../types.js';
import { OpenAILLMProvider } from './openai.js';
import { AnthropicLLMProvider } from './anthropic.js';
import { OllamaLLMProvider } from './ollama.js';

/**
 * Resolve a provider preset to its effective config.
 */
export function resolveProviderPreset(config: RemoteLLMConfig): {
  adapter: 'openai' | 'openai-compatible' | 'anthropic';
  baseUrl: string;
} {
  const preset = LLM_PROVIDER_PRESETS[config.provider];
  if (!preset) {
    throw new Error(
      `Unknown LLM provider: "${config.provider}". ` +
      `Valid providers: ${Object.keys(LLM_PROVIDER_PRESETS).join(', ')}`,
    );
  }

  return {
    adapter: preset.protocol,
    baseUrl: config.baseUrl ?? preset.baseUrl,
  };
}

/**
 * Create a remote LLM provider from configuration.
 *
 * Automatically resolves provider presets (glm, deepseek, etc.)
 * to the appropriate adapter.
 *
 * @example
 * ```ts
 * // GLM preset (auto-resolves to OpenAI-compatible)
 * const provider = createRemoteLLMProvider({
 *   provider: 'glm',
 *   model: 'pony-alpha-2',
 *   apiKey: 'your-key',
 * });
 *
 * // Custom OpenAI-compatible service
 * const provider = createRemoteLLMProvider({
 *   provider: 'openai-compatible',
 *   model: 'my-model',
 *   apiKey: 'your-key',
 *   baseUrl: 'https://my-llm-server.com/v1',
 * });
 * ```
 */
export function createRemoteLLMProvider(config: RemoteLLMConfig): LLMProvider {
  const { adapter, baseUrl } = resolveProviderPreset(config);

  if (!baseUrl) {
    throw new Error(
      `No baseUrl for provider "${config.provider}". ` +
      `Set --api-base or provide baseUrl in config.`,
    );
  }

  switch (adapter) {
    case 'openai':
    case 'openai-compatible':
      // Both use OpenAI Chat Completions protocol
      return new OpenAILLMProvider(config.apiKey, config.model, baseUrl);

    case 'anthropic':
      return new AnthropicLLMProvider(config.apiKey, config.model, baseUrl);

    default:
      throw new Error(`Unhandled adapter type: "${adapter}"`);
  }
}

/**
 * Create a local Ollama LLM provider.
 */
export function createLocalLLMProvider(
  model: string,
  baseUrl?: string,
): OllamaLLMProvider {
  return new OllamaLLMProvider(model, baseUrl ?? 'http://localhost:11434');
}

/**
 * Validate if a provider name is a valid preset.
 */
export function isValidProvider(name: string): name is LLMProviderType {
  return name in LLM_PROVIDER_PRESETS;
}

/**
 * Ollama LLM Provider
 *
 * Local LLM provider using Ollama's HTTP API.
 * Designed for L2 SLA level with local model inference.
 *
 * Uses POST /api/generate for completions.
 *
 * @since 0.4.0
 */

import type { LLMProvider, LLMOptions, LLMResponse } from '../types.js';

/** Default Ollama endpoint */
const DEFAULT_BASE_URL = 'http://localhost:11434';

/** Default request timeout in milliseconds */
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Ollama LLM provider for local model inference.
 *
 * Requires a running Ollama instance with the specified model pulled.
 */
export class OllamaLLMProvider implements LLMProvider {
  readonly name = 'ollama';

  constructor(
    private model: string,
    private baseUrl: string = DEFAULT_BASE_URL,
    private timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  /**
   * Send a prompt to Ollama and get a completion.
   *
   * Uses the /api/generate endpoint with stream: false.
   */
  async complete(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
    const url = `${this.baseUrl}/api/generate`;
    const start = Date.now();

    const body: Record<string, unknown> = {
      model: this.model,
      prompt: options?.system ? `${options.system}\n\n${prompt}` : prompt,
      stream: false,
      options: {
        ...(options?.temperature !== undefined && { temperature: options.temperature }),
        ...(options?.maxTokens !== undefined && { num_predict: options.maxTokens }),
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown error');
      throw new Error(`Ollama API error (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      response: string;
      done: boolean;
      total_duration?: number;
      prompt_eval_count?: number;
      eval_count?: number;
    };

    const latencyMs = Date.now() - start;
    const promptTokens = data.prompt_eval_count ?? 0;
    const completionTokens = data.eval_count ?? 0;

    return {
      content: data.response,
      usage: {
        prompt: promptTokens,
        completion: completionTokens,
        total: promptTokens + completionTokens,
      },
      latencyMs,
    };
  }

  /**
   * Check if Ollama is running and the model is available.
   *
   * Sends a GET request to /api/tags and checks if the model exists.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) return false;

      const data = (await response.json()) as {
        models?: Array<{ name: string }>;
      };

      if (!data.models) return false;

      // Check if our model is in the list (handle tag variations)
      const modelBase = this.model.split(':')[0];
      return data.models.some(
        m => m.name === this.model || m.name.startsWith(`${modelBase}:`),
      );
    } catch {
      return false;
    }
  }
}

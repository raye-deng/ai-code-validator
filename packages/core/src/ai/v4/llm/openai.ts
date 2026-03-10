/**
 * OpenAI LLM Provider
 *
 * Remote LLM provider using OpenAI's Chat Completions API.
 * Designed for L3 SLA level with high-quality model inference.
 *
 * Uses POST /chat/completions endpoint.
 *
 * @since 0.4.0
 */

import type { LLMProvider, LLMOptions, LLMResponse } from '../types.js';

/** Default OpenAI API base URL */
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/** Default request timeout in milliseconds */
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * OpenAI LLM provider using the Chat Completions API.
 *
 * Requires a valid API key.
 */
export class OpenAILLMProvider implements LLMProvider {
  readonly name = 'openai';

  constructor(
    private apiKey: string,
    private model: string = 'gpt-4o-mini',
    private baseUrl: string = DEFAULT_BASE_URL,
    private timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  /**
   * Send a prompt to OpenAI Chat Completions and get a response.
   */
  async complete(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
    const url = `${this.baseUrl}/chat/completions`;
    const start = Date.now();

    const messages: Array<{ role: string; content: string }> = [];

    if (options?.system) {
      messages.push({ role: 'system', content: options.system });
    }

    messages.push({ role: 'user', content: prompt });

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      ...(options?.temperature !== undefined && { temperature: options.temperature }),
      ...(options?.maxTokens !== undefined && { max_tokens: options.maxTokens }),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown error');
      throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    const latencyMs = Date.now() - start;
    const content = data.choices?.[0]?.message?.content ?? '';

    return {
      content,
      usage: data.usage
        ? {
            prompt: data.usage.prompt_tokens,
            completion: data.usage.completion_tokens,
            total: data.usage.total_tokens,
          }
        : undefined,
      latencyMs,
    };
  }

  /**
   * Check if the OpenAI API is reachable and the key is valid.
   *
   * Sends a minimal request to verify authentication.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5_000),
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}

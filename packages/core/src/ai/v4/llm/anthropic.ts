/**
 * Anthropic LLM Provider
 *
 * Remote LLM provider using Anthropic's Messages API.
 * Designed for L3 SLA level with high-quality model inference.
 *
 * Uses POST /messages with x-api-key and anthropic-version headers.
 *
 * @since 0.4.0
 */

import type { LLMProvider, LLMOptions, LLMResponse } from '../types.js';

/** Default Anthropic API base URL */
const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1';

/** Default request timeout in milliseconds */
const DEFAULT_TIMEOUT_MS = 60_000;

/** Default Anthropic API version */
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Anthropic LLM provider using the Messages API.
 *
 * Requires a valid API key. Uses x-api-key header authentication.
 */
export class AnthropicLLMProvider implements LLMProvider {
  readonly name = 'anthropic';

  constructor(
    private apiKey: string,
    private model: string = 'claude-sonnet-4-20250514',
    private baseUrl: string = DEFAULT_BASE_URL,
    private timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  /**
   * Send a prompt to Anthropic Messages API and get a response.
   */
  async complete(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
    const url = `${this.baseUrl}/messages`;
    const start = Date.now();

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      messages: [{ role: 'user', content: prompt }],
      ...(options?.system && { system: options.system }),
      ...(options?.temperature !== undefined && { temperature: options.temperature }),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown error');
      throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
      usage?: {
        input_tokens: number;
        output_tokens: number;
      };
    };

    const latencyMs = Date.now() - start;

    // Extract text from content blocks
    const content = data.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;

    return {
      content,
      usage: data.usage
        ? {
            prompt: inputTokens,
            completion: outputTokens,
            total: inputTokens + outputTokens,
          }
        : undefined,
      latencyMs,
    };
  }

  /**
   * Check if the Anthropic API is reachable and the key is valid.
   *
   * Sends a minimal message to verify authentication.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/messages`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
        signal: AbortSignal.timeout(10_000),
      });

      // 200 = success, 401/403 = bad key
      return response.ok;
    } catch {
      return false;
    }
  }
}

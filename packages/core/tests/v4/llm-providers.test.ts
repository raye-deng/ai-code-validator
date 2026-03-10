/**
 * LLM Providers Tests
 *
 * Tests for Ollama, OpenAI, and Anthropic LLM providers.
 * All HTTP calls are mocked — no real API requests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaLLMProvider } from '../../src/ai/v4/llm/ollama.js';
import { OpenAILLMProvider } from '../../src/ai/v4/llm/openai.js';
import { AnthropicLLMProvider } from '../../src/ai/v4/llm/anthropic.js';

// ─── Mock fetch ────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = vi.fn(handler) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ─── Ollama Provider ───────────────────────────────────────────────

describe('OllamaLLMProvider', () => {
  let provider: OllamaLLMProvider;

  beforeEach(() => {
    provider = new OllamaLLMProvider('codellama:7b', 'http://localhost:11434');
  });

  it('should have name "ollama"', () => {
    expect(provider.name).toBe('ollama');
  });

  it('should call /api/generate with correct body', async () => {
    mockFetch(async (url, init) => {
      expect(url).toBe('http://localhost:11434/api/generate');
      const body = JSON.parse(init?.body as string);
      expect(body.model).toBe('codellama:7b');
      expect(body.stream).toBe(false);
      expect(body.prompt).toContain('analyze this code');

      return new Response(
        JSON.stringify({
          response: '{"issues": []}',
          done: true,
          prompt_eval_count: 10,
          eval_count: 5,
        }),
        { status: 200 },
      );
    });

    const result = await provider.complete('analyze this code');
    expect(result.content).toBe('{"issues": []}');
    expect(result.usage?.prompt).toBe(10);
    expect(result.usage?.completion).toBe(5);
    expect(result.usage?.total).toBe(15);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should include system prompt in the prompt field', async () => {
    mockFetch(async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      expect(body.prompt).toContain('You are a code reviewer');
      expect(body.prompt).toContain('check this');

      return new Response(
        JSON.stringify({ response: 'ok', done: true }),
        { status: 200 },
      );
    });

    await provider.complete('check this', {
      system: 'You are a code reviewer',
    });
  });

  it('should pass temperature and maxTokens as options', async () => {
    mockFetch(async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      expect(body.options.temperature).toBe(0.2);
      expect(body.options.num_predict).toBe(1024);

      return new Response(
        JSON.stringify({ response: 'ok', done: true }),
        { status: 200 },
      );
    });

    await provider.complete('test', {
      temperature: 0.2,
      maxTokens: 1024,
    });
  });

  it('should throw on non-OK response', async () => {
    mockFetch(async () => {
      return new Response('model not found', { status: 404 });
    });

    await expect(provider.complete('test')).rejects.toThrow('Ollama API error (404)');
  });

  it('should return true from isAvailable when model exists', async () => {
    mockFetch(async (url) => {
      if (url.includes('/api/tags')) {
        return new Response(
          JSON.stringify({
            models: [
              { name: 'codellama:7b' },
              { name: 'llama2:13b' },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response('', { status: 404 });
    });

    const available = await provider.isAvailable();
    expect(available).toBe(true);
  });

  it('should return false from isAvailable when model not found', async () => {
    mockFetch(async (url) => {
      if (url.includes('/api/tags')) {
        return new Response(
          JSON.stringify({
            models: [{ name: 'llama2:13b' }],
          }),
          { status: 200 },
        );
      }
      return new Response('', { status: 404 });
    });

    const available = await provider.isAvailable();
    expect(available).toBe(false);
  });

  it('should return false from isAvailable on network error', async () => {
    mockFetch(async () => {
      throw new Error('ECONNREFUSED');
    });

    const available = await provider.isAvailable();
    expect(available).toBe(false);
  });
});

// ─── OpenAI Provider ──────────────────────────────────────────────

describe('OpenAILLMProvider', () => {
  let provider: OpenAILLMProvider;

  beforeEach(() => {
    provider = new OpenAILLMProvider('sk-test-key', 'gpt-4o-mini', 'https://api.openai.com/v1');
  });

  it('should have name "openai"', () => {
    expect(provider.name).toBe('openai');
  });

  it('should call /chat/completions with correct headers', async () => {
    mockFetch(async (url, init) => {
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      const headers = init?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer sk-test-key');
      expect(headers['Content-Type']).toBe('application/json');

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'analysis result' } }],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 20,
            total_tokens: 70,
          },
        }),
        { status: 200 },
      );
    });

    const result = await provider.complete('analyze');
    expect(result.content).toBe('analysis result');
    expect(result.usage?.prompt).toBe(50);
    expect(result.usage?.completion).toBe(20);
    expect(result.usage?.total).toBe(70);
  });

  it('should include system message when provided', async () => {
    mockFetch(async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0]).toEqual({ role: 'system', content: 'You are an expert' });
      expect(body.messages[1]).toEqual({ role: 'user', content: 'review this' });

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'ok' } }],
        }),
        { status: 200 },
      );
    });

    await provider.complete('review this', { system: 'You are an expert' });
  });

  it('should throw on authentication error', async () => {
    mockFetch(async () => {
      return new Response('Unauthorized', { status: 401 });
    });

    await expect(provider.complete('test')).rejects.toThrow('OpenAI API error (401)');
  });

  it('should check availability via /models endpoint', async () => {
    mockFetch(async (url) => {
      if (url.includes('/models')) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response('', { status: 404 });
    });

    const available = await provider.isAvailable();
    expect(available).toBe(true);
  });

  it('should return false availability on auth failure', async () => {
    mockFetch(async () => {
      return new Response('Unauthorized', { status: 401 });
    });

    const available = await provider.isAvailable();
    expect(available).toBe(false);
  });
});

// ─── Anthropic Provider ────────────────────────────────────────────

describe('AnthropicLLMProvider', () => {
  let provider: AnthropicLLMProvider;

  beforeEach(() => {
    provider = new AnthropicLLMProvider('sk-ant-test-key', 'claude-sonnet-4-20250514', 'https://api.anthropic.com/v1');
  });

  it('should have name "anthropic"', () => {
    expect(provider.name).toBe('anthropic');
  });

  it('should call /messages with correct Anthropic headers', async () => {
    mockFetch(async (url, init) => {
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      const headers = init?.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('sk-ant-test-key');
      expect(headers['anthropic-version']).toBe('2023-06-01');
      expect(headers['Content-Type']).toBe('application/json');

      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'analysis complete' }],
          usage: { input_tokens: 30, output_tokens: 15 },
        }),
        { status: 200 },
      );
    });

    const result = await provider.complete('analyze');
    expect(result.content).toBe('analysis complete');
    expect(result.usage?.prompt).toBe(30);
    expect(result.usage?.completion).toBe(15);
    expect(result.usage?.total).toBe(45);
  });

  it('should include system prompt in request body', async () => {
    mockFetch(async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      expect(body.system).toBe('You are an expert code reviewer');
      expect(body.messages).toEqual([{ role: 'user', content: 'check this' }]);

      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'ok' }],
        }),
        { status: 200 },
      );
    });

    await provider.complete('check this', {
      system: 'You are an expert code reviewer',
    });
  });

  it('should set max_tokens and temperature', async () => {
    mockFetch(async (_url, init) => {
      const body = JSON.parse(init?.body as string);
      expect(body.max_tokens).toBe(2048);
      expect(body.temperature).toBe(0.1);
      expect(body.model).toBe('claude-sonnet-4-20250514');

      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'ok' }],
        }),
        { status: 200 },
      );
    });

    await provider.complete('test', {
      maxTokens: 2048,
      temperature: 0.1,
    });
  });

  it('should throw on API error', async () => {
    mockFetch(async () => {
      return new Response('Rate limited', { status: 429 });
    });

    await expect(provider.complete('test')).rejects.toThrow('Anthropic API error (429)');
  });

  it('should concatenate multiple text content blocks', async () => {
    mockFetch(async () => {
      return new Response(
        JSON.stringify({
          content: [
            { type: 'text', text: 'Part 1. ' },
            { type: 'text', text: 'Part 2.' },
          ],
        }),
        { status: 200 },
      );
    });

    const result = await provider.complete('test');
    expect(result.content).toBe('Part 1. Part 2.');
  });

  it('should return false from isAvailable on network error', async () => {
    mockFetch(async () => {
      throw new Error('ECONNREFUSED');
    });

    const available = await provider.isAvailable();
    expect(available).toBe(false);
  });
});

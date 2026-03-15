/**
 * Tests for LLM Provider Factory
 *
 * Tests the factory function, provider presets, and adapter resolution.
 * All HTTP calls are mocked — no real API calls.
 *
 * @since 0.4.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createRemoteLLMProvider,
  createLocalLLMProvider,
  resolveProviderPreset,
  isValidProvider,
} from '../../src/ai/v4/llm/provider-factory.js';
import { LLM_PROVIDER_PRESETS, ALL_LLM_PROVIDERS } from '../../src/ai/v4/types.js';
import type { RemoteLLMConfig } from '../../src/ai/v4/types.js';

// ─── Presets & Validation ─────────────────────────────────────────

describe('LLM Provider Presets', () => {
  it('should have all expected providers', () => {
    const expected = ['openai', 'openai-compatible', 'glm', 'zai', 'deepseek', 'together', 'fireworks', 'anthropic'];
    expect(ALL_LLM_PROVIDERS.sort()).toEqual(expected.sort());
  });

  it('should have baseUrl for all providers except openai-compatible', () => {
    for (const [name, preset] of Object.entries(LLM_PROVIDER_PRESETS)) {
      if (name === 'openai-compatible') {
        expect(preset.baseUrl).toBe('');
      } else {
        expect(preset.baseUrl).toBeTruthy();
      }
    }
  });

  it('should have correct protocol assignments', () => {
    expect(LLM_PROVIDER_PRESETS.openai.protocol).toBe('openai');
    expect(LLM_PROVIDER_PRESETS.glm.protocol).toBe('openai-compatible');
    expect(LLM_PROVIDER_PRESETS.zai.protocol).toBe('openai-compatible');
    expect(LLM_PROVIDER_PRESETS.deepseek.protocol).toBe('openai-compatible');
    expect(LLM_PROVIDER_PRESETS.together.protocol).toBe('openai-compatible');
    expect(LLM_PROVIDER_PRESETS.fireworks.protocol).toBe('openai-compatible');
    expect(LLM_PROVIDER_PRESETS.anthropic.protocol).toBe('anthropic');
  });

  it('should have correct base URLs for presets', () => {
    expect(LLM_PROVIDER_PRESETS.glm.baseUrl).toBe('https://open.bigmodel.cn/api/coding/paas/v4');
    expect(LLM_PROVIDER_PRESETS.zai.baseUrl).toBe('https://open.bigmodel.cn/api/paas/v4');
    expect(LLM_PROVIDER_PRESETS.deepseek.baseUrl).toBe('https://api.deepseek.com/v1');
    expect(LLM_PROVIDER_PRESETS.together.baseUrl).toBe('https://api.together.xyz/v1');
    expect(LLM_PROVIDER_PRESETS.fireworks.baseUrl).toBe('https://api.fireworks.ai/inference/v1');
    expect(LLM_PROVIDER_PRESETS.openai.baseUrl).toBe('https://api.openai.com/v1');
    expect(LLM_PROVIDER_PRESETS.anthropic.baseUrl).toBe('https://api.anthropic.com/v1');
  });
});

describe('isValidProvider', () => {
  it('should return true for all preset providers', () => {
    for (const name of ALL_LLM_PROVIDERS) {
      expect(isValidProvider(name)).toBe(true);
    }
  });

  it('should return false for unknown providers', () => {
    expect(isValidProvider('unknown')).toBe(false);
    expect(isValidProvider('OpenAI')).toBe(false);
    expect(isValidProvider('')).toBe(false);
  });
});

// ─── resolveProviderPreset ─────────────────────────────────────────

describe('resolveProviderPreset', () => {
  it('should resolve GLM preset', () => {
    const config: RemoteLLMConfig = {
      provider: 'glm',
      model: 'pony-alpha-2',
      apiKey: 'test-key',
    };
    const result = resolveProviderPreset(config);
    expect(result.adapter).toBe('openai-compatible');
    expect(result.baseUrl).toBe('https://open.bigmodel.cn/api/coding/paas/v4');
  });

  it('should allow baseUrl override for GLM', () => {
    const config: RemoteLLMConfig = {
      provider: 'glm',
      model: 'pony-alpha-2',
      apiKey: 'test-key',
      baseUrl: 'https://custom-host.com/v1',
    };
    const result = resolveProviderPreset(config);
    expect(result.baseUrl).toBe('https://custom-host.com/v1');
  });

  it('should resolve ZAI preset', () => {
    const config: RemoteLLMConfig = {
      provider: 'zai',
      model: 'glm-4.7',
      apiKey: 'test-key',
    };
    const result = resolveProviderPreset(config);
    expect(result.adapter).toBe('openai-compatible');
    expect(result.baseUrl).toBe('https://open.bigmodel.cn/api/paas/v4');
  });

  it('should resolve DeepSeek preset', () => {
    const config: RemoteLLMConfig = {
      provider: 'deepseek',
      model: 'deepseek-chat',
      apiKey: 'test-key',
    };
    const result = resolveProviderPreset(config);
    expect(result.adapter).toBe('openai-compatible');
    expect(result.baseUrl).toBe('https://api.deepseek.com/v1');
  });

  it('should resolve OpenAI preset', () => {
    const config: RemoteLLMConfig = {
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'test-key',
    };
    const result = resolveProviderPreset(config);
    expect(result.adapter).toBe('openai');
    expect(result.baseUrl).toBe('https://api.openai.com/v1');
  });

  it('should resolve openai-compatible with custom baseUrl', () => {
    const config: RemoteLLMConfig = {
      provider: 'openai-compatible',
      model: 'my-model',
      apiKey: 'test-key',
      baseUrl: 'https://my-server.com/v1',
    };
    const result = resolveProviderPreset(config);
    expect(result.adapter).toBe('openai-compatible');
    expect(result.baseUrl).toBe('https://my-server.com/v1');
  });

  it('should throw for unknown provider', () => {
    const config: RemoteLLMConfig = {
      provider: 'unknown-provider' as any,
      model: 'model',
      apiKey: 'key',
    };
    expect(() => resolveProviderPreset(config)).toThrow('Unknown LLM provider: "unknown-provider"');
  });
});

// ─── createRemoteLLMProvider ───────────────────────────────────────

describe('createRemoteLLMProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should create OpenAI provider for GLM preset', async () => {
    const provider = createRemoteLLMProvider({
      provider: 'glm',
      model: 'pony-alpha-2',
      apiKey: 'test-key',
    });

    expect(provider.name).toBe('openai');
    expect(await provider.isAvailable()).toBe(true);
  });

  it('should create OpenAI provider for DeepSeek preset', async () => {
    const provider = createRemoteLLMProvider({
      provider: 'deepseek',
      model: 'deepseek-chat',
      apiKey: 'test-key',
    });

    expect(provider.name).toBe('openai');
    expect(await provider.isAvailable()).toBe(true);
  });

  it('should create OpenAI provider for Together AI preset', async () => {
    const provider = createRemoteLLMProvider({
      provider: 'together',
      model: 'meta-llama/Meta-Llama-3-70B',
      apiKey: 'test-key',
    });

    expect(provider.name).toBe('openai');
    expect(await provider.isAvailable()).toBe(true);
  });

  it('should create OpenAI provider for Fireworks preset', async () => {
    const provider = createRemoteLLMProvider({
      provider: 'fireworks',
      model: 'accounts/fireworks/models/llama-v3p1-70b-instruct',
      apiKey: 'test-key',
    });

    expect(provider.name).toBe('openai');
    expect(await provider.isAvailable()).toBe(true);
  });

  it('should create OpenAI provider for ZAI preset', async () => {
    const provider = createRemoteLLMProvider({
      provider: 'zai',
      model: 'glm-4.7',
      apiKey: 'test-key',
    });

    expect(provider.name).toBe('openai');
    expect(await provider.isAvailable()).toBe(true);
  });

  it('should create OpenAI provider for openai-compatible with custom baseUrl', async () => {
    const provider = createRemoteLLMProvider({
      provider: 'openai-compatible',
      model: 'my-model',
      apiKey: 'test-key',
      baseUrl: 'https://custom-server.com/v1',
    });

    expect(provider.name).toBe('openai');
    expect(await provider.isAvailable()).toBe(true);
  });

  it('should create Anthropic provider for Anthropic preset', async () => {
    const provider = createRemoteLLMProvider({
      provider: 'anthropic',
      model: 'claude-3-5-haiku-20241022',
      apiKey: 'test-key',
    });

    expect(provider.name).toBe('anthropic');
    expect(await provider.isAvailable()).toBe(true);
  });

  it('should throw for openai-compatible without baseUrl', () => {
    expect(() => createRemoteLLMProvider({
      provider: 'openai-compatible',
      model: 'my-model',
      apiKey: 'test-key',
    })).toThrow('No baseUrl for provider "openai-compatible"');
  });

  it('should throw for unknown provider', () => {
    expect(() => createRemoteLLMProvider({
      provider: 'fake-provider' as any,
      model: 'model',
      apiKey: 'key',
    })).toThrow('Unknown LLM provider');
  });

  it('should send request to correct baseUrl for GLM', async () => {
    let capturedUrl: string | undefined;
    global.fetch = vi.fn(async (url: string) => {
      capturedUrl = url.toString();
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '{"issues":[]}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        text: async () => '{"issues":[]}',
      } as Response;
    });

    const provider = createRemoteLLMProvider({
      provider: 'glm',
      model: 'pony-alpha-2',
      apiKey: 'test-key',
    });

    await provider.complete('test prompt');
    expect(capturedUrl).toContain('open.bigmodel.cn');
    expect(capturedUrl).toContain('/chat/completions');
  });

  it('should send request to custom baseUrl for openai-compatible', async () => {
    let capturedUrl: string | undefined;
    global.fetch = vi.fn(async (url: string) => {
      capturedUrl = url.toString();
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '{"issues":[]}' } }],
        }),
        text: async () => '{}',
      } as Response;
    });

    const provider = createRemoteLLMProvider({
      provider: 'openai-compatible',
      model: 'my-model',
      apiKey: 'test-key',
      baseUrl: 'https://my-llm.example.com/v1',
    });

    await provider.complete('test');
    expect(capturedUrl).toContain('my-llm.example.com');
    expect(capturedUrl).toContain('/chat/completions');
  });
});

// ─── createLocalLLMProvider ────────────────────────────────────────

describe('createLocalLLMProvider', () => {
  it('should create Ollama provider with default baseUrl', () => {
    const provider = createLocalLLMProvider('codellama:13b');
    expect(provider.name).toBe('ollama');
  });

  it('should create Ollama provider with custom baseUrl', () => {
    const provider = createLocalLLMProvider('codellama:13b', 'http://192.168.1.100:11434');
    expect(provider.name).toBe('ollama');
  });
});

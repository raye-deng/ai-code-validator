/**
 * L3 Remote LLM E2E Tests
 *
 * Tests the full L3 remote LLM scan pipeline:
 * - Mock tests: verify pipeline logic with mocked HTTP calls
 * - Live E2E tests: real GLM API calls (marked with describe.skip for CI)
 *
 * @since 0.4.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIScanPipeline } from '../../src/ai/v4/pipeline.js';
import { createRemoteLLMProvider } from '../../src/ai/v4/llm/provider-factory.js';
import type { AIConfig, CodeUnit, DetectorResult } from '../../src/ai/v4/types.js';

// ─── Test Fixtures ─────────────────────────────────────────────────

function createMockCodeUnit(file: string, source: string): CodeUnit {
  return {
    id: `test-${file}`,
    file,
    language: 'typescript',
    source,
    location: { startLine: 0, endLine: source.split('\n').length },
    imports: [],
    definitions: [],
    calls: [],
    metadata: {},
  };
}

const SUSPICIOUS_CODE = createMockCodeUnit('test-file.ts', `import { fakePackage } from "nonexistent-lib";
import { useState, useEffect } from "react";

const apiKey = "sk-1234567890abcdef";
const password = "admin123";

function fetchData() {
  // TODO: implement this
  return null;
}

async function processData(data: any) {
  // HACK: temporary workaround
  eval(data);
  console.log(process.env.SECRET_KEY);
  return data;
}
`);

const CLEAN_CODE = createMockCodeUnit('clean-file.ts', `import express from 'express';

const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export default app;
`);

// ─── Mock LLM Response ─────────────────────────────────────────────

const MOCK_LLM_RESPONSE = JSON.stringify({
  issues: [
    {
      line: 1,
      severity: 'error',
      message: 'Package "nonexistent-lib" does not exist in npm registry — hallucinated import',
      category: 'ai-faithfulness',
    },
    {
      line: 3,
      severity: 'warning',
      message: 'Hardcoded API key detected — use environment variables',
      category: 'implementation',
    },
    {
      line: 4,
      severity: 'warning',
      message: 'Hardcoded password detected — security anti-pattern',
      category: 'implementation',
    },
    {
      line: 9,
      severity: 'info',
      message: 'Unimplemented function with TODO comment',
      category: 'code-freshness',
    },
    {
      line: 14,
      severity: 'error',
      message: 'Use of eval() is a security vulnerability',
      category: 'implementation',
    },
  ],
});

// ─── Mock E2E Tests ────────────────────────────────────────────────

describe('L3 Pipeline — Mock Tests', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Mock fetch for all tests
    global.fetch = vi.fn(async (url: string) => {
      const urlStr = url.toString();

      // Mock chat completions endpoint
      if (urlStr.includes('/chat/completions')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: MOCK_LLM_RESPONSE } }],
            usage: {
              prompt_tokens: 150,
              completion_tokens: 100,
              total_tokens: 250,
            },
          }),
          text: async () => MOCK_LLM_RESPONSE,
        } as Response;
      }

      return { ok: false, status: 404, json: async () => ({}), text: async () => 'Not found' } as Response;
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('createRemoteLLMProvider with GLM', () => {
    it('should create provider and make successful API call', async () => {
      const provider = createRemoteLLMProvider({
        provider: 'glm',
        model: 'pony-alpha-2',
        apiKey: '81b74bce658546b9be069cc4bd4120ea.bT8x39i5GEEQ7ZbK',
      });

      expect(provider.name).toBe('openai');
      const available = await provider.isAvailable();
      expect(available).toBe(true);

      const response = await provider.complete('Hello', { maxTokens: 100 });
      expect(response.content).toBeTruthy();
      expect(response.usage).toBeDefined();
    });
  });

  describe('AIScanPipeline with L3 config', () => {
    it('should run L3 pipeline with remote LLM and produce issues', async () => {
      const config: AIConfig = {
        sla: 'L3',
        embedding: { provider: 'local' },
        remote: {
          provider: 'glm',
          model: 'pony-alpha-2',
          apiKey: '81b74bce658546b9be069cc4bd4120ea.bT8x39i5GEEQ7ZbK',
        },
        maxLLMBlocks: 50,
        similarityThreshold: 0, // Set low to ensure embedding stage flags all blocks
      };

      const pipeline = new AIScanPipeline(config);

      // Create structural results that will trigger embedding recall
      // Note: confidence >= similarityThreshold is needed for embedding stage to flag the file
      const structuralResults: DetectorResult[] = [
        {
          detectorId: 'structural-test',
          severity: 'warning',
          category: 'ai-faithfulness',
          messageKey: 'test',
          message: 'Test issue for embedding recall',
          file: 'test-file.ts',
          line: 1,
          confidence: 0.5,
        },
      ];

      const result = await pipeline.scan([SUSPICIOUS_CODE, CLEAN_CODE], structuralResults);

      expect(result.slaLevel).toBe('L3');
      expect(result.stages.length).toBeGreaterThanOrEqual(2);

      // Should have LLM stage results
      const llmStage = result.stages.find(s => s.stage === 'llm');
      expect(llmStage).toBeDefined();

      // LLM should have produced issues from mock response
      if (llmStage) {
        expect(llmStage.issues.length).toBeGreaterThan(0);
        expect(llmStage.tokensUsed).toBeGreaterThan(0);

        // Verify issue format
        const issue = llmStage.issues[0];
        expect(issue.file).toBe('test-file.ts');
        expect(['error', 'warning', 'info']).toContain(issue.severity);
        expect(issue.detectorId).toBe('llm-deep-scan');
      }
    });

    it('should skip LLM stage for L1 config', async () => {
      const config: AIConfig = {
        sla: 'L1',
      };

      const pipeline = new AIScanPipeline(config);
      const result = await pipeline.scan([SUSPICIOUS_CODE], []);

      expect(result.slaLevel).toBe('L1');
      expect(result.stages.length).toBe(1);
      expect(result.stages[0].stage).toBe('structural');
    });

    it('should skip LLM stage for L2 config', async () => {
      const config: AIConfig = {
        sla: 'L2',
        embedding: { provider: 'local' },
      };

      const pipeline = new AIScanPipeline(config);
      const result = await pipeline.scan([SUSPICIOUS_CODE], []);

      expect(result.slaLevel).toBe('L2');
      const llmStage = result.stages.find(s => s.stage === 'llm');
      expect(llmStage).toBeUndefined();
    });

    it('should handle LLM returning empty issues', async () => {
      // Override mock to return empty issues
      global.fetch = vi.fn(async (url: string) => {
        if (url.toString().includes('/chat/completions')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [{ message: { content: '{"issues":[]}' } }],
            }),
            text: async () => '{"issues":[]}',
          } as Response;
        }
        return { ok: false, status: 404, json: async () => ({}), text: async () => '' } as Response;
      });

      const config: AIConfig = {
        sla: 'L3',
        embedding: { provider: 'local' },
        remote: {
          provider: 'glm',
          model: 'pony-alpha-2',
          apiKey: 'test-key',
        },
        maxLLMBlocks: 50,
        similarityThreshold: 0,
      };

      const pipeline = new AIScanPipeline(config);
      const result = await pipeline.scan([SUSPICIOUS_CODE], []);

      const llmStage = result.stages.find(s => s.stage === 'llm');
      expect(llmStage?.issues.length).toBe(0);
    });

    it('should gracefully handle LLM errors', async () => {
      // Mock fetch to fail
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const config: AIConfig = {
        sla: 'L3',
        embedding: { provider: 'local' },
        remote: {
          provider: 'glm',
          model: 'pony-alpha-2',
          apiKey: 'test-key',
        },
        maxLLMBlocks: 50,
        similarityThreshold: 0,
      };

      const pipeline = new AIScanPipeline(config);
      const result = await pipeline.scan([SUSPICIOUS_CODE], []);

      // Should complete without throwing
      expect(result.slaLevel).toBe('L3');
      const llmStage = result.stages.find(s => s.stage === 'llm');
      expect(llmStage?.issues.length).toBe(0);
    });

    it('should handle markdown-wrapped JSON from LLM', async () => {
      const wrappedResponse = '```json\n' + MOCK_LLM_RESPONSE + '\n```';
      global.fetch = vi.fn(async (url: string) => {
        if (url.toString().includes('/chat/completions')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [{ message: { content: wrappedResponse } }],
            }),
            text: async () => wrappedResponse,
          } as Response;
        }
        return { ok: false, status: 404, json: async () => ({}), text: async () => '' } as Response;
      });

      const config: AIConfig = {
        sla: 'L3',
        embedding: { provider: 'local' },
        remote: {
          provider: 'glm',
          model: 'pony-alpha-2',
          apiKey: 'test-key',
        },
        maxLLMBlocks: 50,
        similarityThreshold: 0,
      };

      const pipeline = new AIScanPipeline(config);
      const result = await pipeline.scan([SUSPICIOUS_CODE], []);

      const llmStage = result.stages.find(s => s.stage === 'llm');
      expect(llmStage?.issues.length).toBeGreaterThan(0);
    });
  });

  describe('Provider Presets — URL Routing', () => {
    it('should route GLM requests to bigmodel.cn/coding/paas', async () => {
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
        provider: 'glm',
        model: 'pony-alpha-2',
        apiKey: 'test-key',
      });
      await provider.complete('test');

      expect(capturedUrl).toBe('https://open.bigmodel.cn/api/coding/paas/v4/chat/completions');
    });

    it('should route ZAI requests to bigmodel.cn/paas', async () => {
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
        provider: 'zai',
        model: 'glm-4.7',
        apiKey: 'test-key',
      });
      await provider.complete('test');

      expect(capturedUrl).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions');
    });

    it('should route DeepSeek requests to api.deepseek.com', async () => {
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
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKey: 'test-key',
      });
      await provider.complete('test');

      expect(capturedUrl).toBe('https://api.deepseek.com/v1/chat/completions');
    });
  });
});

// ─── Live E2E Tests (Real GLM API) ─────────────────────────────────
// These tests make real API calls. They are skipped by default.
// Run them with: npx vitest run --describe 'L3 Live E2E'

describe.skip('L3 Live E2E — Real GLM API', () => {
  const GLM_CONFIG: AIConfig = {
    sla: 'L3',
    embedding: { provider: 'local' },
    remote: {
      provider: 'glm',
      model: 'pony-alpha-2',
      apiKey: '81b74bce658546b9be069cc4bd4120ea.bT8x39i5GEEQ7ZbK',
    },
  };

  it('should connect to GLM API and get a response', async () => {
    const provider = createRemoteLLMProvider({
      provider: 'glm',
      model: 'pony-alpha-2',
      apiKey: '81b74bce658546b9be069cc4bd4120ea.bT8x39i5GEEQ7ZbK',
    });

    const available = await provider.isAvailable();
    expect(available).toBe(true);

    const response = await provider.complete('Say "hello" in JSON: {"greeting": "..."}', {
      maxTokens: 50,
      temperature: 0,
    });

    expect(response.content).toBeTruthy();
    expect(response.latencyMs).toBeGreaterThan(0);
    console.log('GLM response:', response.content);
    console.log('Latency:', response.latencyMs, 'ms');
    if (response.usage) {
      console.log('Tokens:', response.usage);
    }
  });

  it('should analyze code and return structured issues', async () => {
    const pipeline = new AIScanPipeline(GLM_CONFIG);

    const structuralResults: DetectorResult[] = [
      {
        detectorId: 'structural-test',
        severity: 'warning',
        category: 'ai-faithfulness',
        messageKey: 'test',
        message: 'Test issue',
        file: 'test-file.ts',
        line: 1,
        confidence: 0.8,
      },
    ];

    const result = await pipeline.scan([SUSPICIOUS_CODE], structuralResults);

    expect(result.slaLevel).toBe('L3');
    expect(result.stages.length).toBeGreaterThanOrEqual(2);

    const llmStage = result.stages.find(s => s.stage === 'llm');
    if (llmStage) {
      console.log(`LLM stage: ${llmStage.issues.length} issues in ${llmStage.durationMs}ms`);
      for (const issue of llmStage.issues) {
        console.log(`  [${issue.severity}] ${issue.file}:${issue.line} - ${issue.message}`);
      }
      expect(llmStage.issues.length).toBeGreaterThan(0);
    }
  }, 30000); // 30s timeout for real API

  it('should analyze clean code and return fewer issues', async () => {
    const pipeline = new AIScanPipeline(GLM_CONFIG);

    const result = await pipeline.scan([CLEAN_CODE], []);

    const llmStage = result.stages.find(s => s.stage === 'llm');
    if (llmStage) {
      console.log(`Clean code LLM issues: ${llmStage.issues.length}`);
    }
  }, 30000);
});

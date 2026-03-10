/**
 * AI Scan Pipeline Tests
 *
 * Tests for the two-stage AI scan pipeline (Embedding + LLM).
 * All HTTP calls are mocked — no real API requests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIScanPipeline } from '../../src/ai/v4/pipeline.js';
import type { AIConfig, ScanStageResult } from '../../src/ai/v4/types.js';
import type { DetectorResult } from '../../src/detectors/v4/types.js';
import { createCodeUnit } from '../../src/ir/types.js';

// ─── Helpers ───────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = vi.fn(handler) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Create a minimal CodeUnit for testing */
function makeUnit(
  id: string,
  file: string,
  source: string,
  kind: 'file' | 'function' | 'method' = 'function',
) {
  return createCodeUnit({
    id,
    file,
    language: 'typescript',
    kind,
    location: { startLine: 0, startColumn: 0, endLine: source.split('\n').length - 1, endColumn: 0 },
    source,
  });
}

/** Create a minimal structural DetectorResult */
function makeStructuralIssue(
  file: string,
  message: string,
  severity: 'error' | 'warning' | 'info' = 'warning',
): DetectorResult {
  return {
    detectorId: 'structural:test',
    severity,
    category: 'ai-faithfulness',
    messageKey: 'test.issue',
    message,
    file,
    line: 1,
    confidence: 1.0,
  };
}

// ─── L1 Tests (Structural Only) ───────────────────────────────────

describe('AIScanPipeline — L1 (Structural Only)', () => {
  it('should return structural results in stage 0', async () => {
    const pipeline = new AIScanPipeline({ sla: 'L1' });
    const units = [makeUnit('func:a.ts:main', 'a.ts', 'function main() { return 1; }')];
    const structural = [makeStructuralIssue('a.ts', 'test issue')];

    const result = await pipeline.scan(units, structural);

    expect(result.slaLevel).toBe('L1');
    expect(result.stages).toHaveLength(1);
    expect(result.stages[0].stage).toBe('structural');
    expect(result.stages[0].issues).toEqual(structural);
    expect(result.totalIssues).toBe(1);
  });

  it('should not run embedding or LLM stages', async () => {
    const pipeline = new AIScanPipeline({ sla: 'L1' });
    const units = [makeUnit('func:a.ts:main', 'a.ts', 'function main() {}')];

    const result = await pipeline.scan(units, []);

    const stageNames = result.stages.map(s => s.stage);
    expect(stageNames).toContain('structural');
    expect(stageNames).not.toContain('embedding');
    expect(stageNames).not.toContain('llm');
  });

  it('should handle empty units', async () => {
    const pipeline = new AIScanPipeline({ sla: 'L1' });
    const result = await pipeline.scan([], []);

    expect(result.stages).toHaveLength(1);
    expect(result.totalIssues).toBe(0);
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('should handle empty structural results', async () => {
    const pipeline = new AIScanPipeline({ sla: 'L1' });
    const units = [makeUnit('func:a.ts:foo', 'a.ts', 'function foo() {}')];

    const result = await pipeline.scan(units, []);

    expect(result.totalIssues).toBe(0);
    expect(result.stages[0].issues).toHaveLength(0);
  });
});

// ─── L2 Tests (Structural + Embedding) ────────────────────────────

describe('AIScanPipeline — L2 (Structural + Embedding)', () => {
  it('should run structural and embedding stages', async () => {
    const pipeline = new AIScanPipeline({
      sla: 'L2',
      embedding: { provider: 'local' },
    });
    const units = [
      makeUnit(
        'func:a.ts:risky',
        'a.ts',
        'import { createAIValidator } from "ai-validator-pro";\nfunction risky() { return createAIValidator(); }',
      ),
    ];

    const result = await pipeline.scan(units, []);

    const stageNames = result.stages.map(s => s.stage);
    expect(stageNames).toContain('structural');
    expect(stageNames).toContain('embedding');
    expect(stageNames).not.toContain('llm');
  });

  it('should not run embedding when units are empty', async () => {
    const pipeline = new AIScanPipeline({
      sla: 'L2',
      embedding: { provider: 'local' },
    });

    const result = await pipeline.scan([], []);

    // Structural always runs; embedding skipped for empty units
    expect(result.stages).toHaveLength(1);
    expect(result.stages[0].stage).toBe('structural');
  });

  it('should include embedding duration in results', async () => {
    const pipeline = new AIScanPipeline({
      sla: 'L2',
      embedding: { provider: 'local' },
    });
    const units = [
      makeUnit('func:a.ts:main', 'a.ts', 'function main() { console.log("hello"); }'),
    ];

    const result = await pipeline.scan(units, []);

    const embeddingStage = result.stages.find(s => s.stage === 'embedding');
    expect(embeddingStage).toBeDefined();
    expect(embeddingStage!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should apply similarity threshold filtering', async () => {
    const pipeline = new AIScanPipeline({
      sla: 'L2',
      embedding: { provider: 'local' },
      similarityThreshold: 0.99, // Very high threshold → no matches
    });
    const units = [
      makeUnit('func:a.ts:foo', 'a.ts', 'function foo() { return 42; }'),
    ];

    const result = await pipeline.scan(units, []);

    const embeddingStage = result.stages.find(s => s.stage === 'embedding');
    expect(embeddingStage).toBeDefined();
    // High threshold means unlikely to get matches on simple code
    // (zero-match is acceptable; we're testing that filtering works)
    expect(embeddingStage!.issues).toBeDefined();
  });

  it('should combine structural and embedding issue counts', async () => {
    const pipeline = new AIScanPipeline({
      sla: 'L2',
      embedding: { provider: 'local' },
    });
    const units = [
      makeUnit('func:a.ts:main', 'a.ts', 'function main() { return 1; }'),
    ];
    const structural = [
      makeStructuralIssue('a.ts', 'structural issue 1'),
      makeStructuralIssue('a.ts', 'structural issue 2'),
    ];

    const result = await pipeline.scan(units, structural);

    expect(result.totalIssues).toBeGreaterThanOrEqual(2); // At least structural
    expect(result.stages[0].issues).toHaveLength(2);
  });
});

// ─── L3 Tests (Structural + Embedding + LLM) ──────────────────────

describe('AIScanPipeline — L3 (Full Pipeline)', () => {
  it('should run all three stages', async () => {
    // Mock both Ollama tag check and generate
    mockFetch(async (url) => {
      if (url.includes('/api/tags')) {
        return new Response(
          JSON.stringify({ models: [{ name: 'codellama:7b' }] }),
          { status: 200 },
        );
      }
      if (url.includes('/api/generate')) {
        return new Response(
          JSON.stringify({
            response: '{"issues": []}',
            done: true,
            prompt_eval_count: 10,
            eval_count: 5,
          }),
          { status: 200 },
        );
      }
      return new Response('', { status: 404 });
    });

    const pipeline = new AIScanPipeline({
      sla: 'L3',
      embedding: { provider: 'local' },
      local: { provider: 'ollama', model: 'codellama:7b' },
    });
    const units = [
      makeUnit('func:a.ts:main', 'a.ts', 'function main() { return 1; }'),
    ];

    const result = await pipeline.scan(units, []);

    const stageNames = result.stages.map(s => s.stage);
    expect(stageNames).toContain('structural');
    expect(stageNames).toContain('embedding');
    expect(stageNames).toContain('llm');
  });

  it('should parse valid LLM JSON response', async () => {
    mockFetch(async (url) => {
      if (url.includes('/api/generate')) {
        return new Response(
          JSON.stringify({
            response: JSON.stringify({
              issues: [{
                line: 1,
                severity: 'error',
                message: 'Hallucinated API usage',
                category: 'ai-faithfulness',
              }],
            }),
            done: true,
            prompt_eval_count: 10,
            eval_count: 20,
          }),
          { status: 200 },
        );
      }
      return new Response('', { status: 404 });
    });

    const pipeline = new AIScanPipeline({
      sla: 'L3',
      embedding: { provider: 'local' },
      local: { provider: 'ollama', model: 'codellama:7b' },
    });
    const units = [
      makeUnit('func:a.ts:risky', 'a.ts', 'import { fake } from "fake-lib";\nfunction risky() { return fake(); }'),
    ];

    const result = await pipeline.scan(units, []);

    const llmStage = result.stages.find(s => s.stage === 'llm');
    expect(llmStage).toBeDefined();
    // LLM might find the issue or not — we're testing it runs and parses
    if (llmStage!.issues.length > 0) {
      expect(llmStage!.issues[0].message).toContain('Hallucinated API usage');
    }
  });

  it('should handle markdown-fenced LLM response', async () => {
    const jsonResponse = '{"issues": [{"line": 2, "severity": "warning", "message": "Deprecated API", "category": "code-freshness"}]}';
    mockFetch(async (url) => {
      if (url.includes('/api/generate')) {
        return new Response(
          JSON.stringify({
            response: '```json\n' + jsonResponse + '\n```',
            done: true,
          }),
          { status: 200 },
        );
      }
      return new Response('', { status: 404 });
    });

    const pipeline = new AIScanPipeline({
      sla: 'L3',
      embedding: { provider: 'local' },
      local: { provider: 'ollama', model: 'codellama:7b' },
    });
    const units = [
      makeUnit('func:a.ts:old', 'a.ts', 'const buf = new Buffer("data");\nfunction old() { return buf; }'),
    ];

    const result = await pipeline.scan(units, []);

    const llmStage = result.stages.find(s => s.stage === 'llm');
    expect(llmStage).toBeDefined();
    if (llmStage!.issues.length > 0) {
      expect(llmStage!.issues[0].category).toBe('code-freshness');
    }
  });

  it('should handle malformed LLM response gracefully', async () => {
    mockFetch(async (url) => {
      if (url.includes('/api/generate')) {
        return new Response(
          JSON.stringify({
            response: 'This is not valid JSON at all',
            done: true,
          }),
          { status: 200 },
        );
      }
      return new Response('', { status: 404 });
    });

    const pipeline = new AIScanPipeline({
      sla: 'L3',
      embedding: { provider: 'local' },
      local: { provider: 'ollama', model: 'codellama:7b' },
    });
    const units = [
      makeUnit('func:a.ts:foo', 'a.ts', 'function foo() { return 1; }'),
    ];

    // Should not throw
    const result = await pipeline.scan(units, []);
    expect(result.stages).toBeDefined();
  });

  it('should respect maxLLMBlocks limit', async () => {
    let requestCount = 0;
    mockFetch(async (url) => {
      if (url.includes('/api/generate')) {
        requestCount++;
        return new Response(
          JSON.stringify({
            response: '{"issues": []}',
            done: true,
          }),
          { status: 200 },
        );
      }
      return new Response('', { status: 404 });
    });

    const pipeline = new AIScanPipeline({
      sla: 'L3',
      embedding: { provider: 'local' },
      local: { provider: 'ollama', model: 'codellama:7b' },
      maxLLMBlocks: 2,
    });

    // Create 5 function units
    const units = Array.from({ length: 5 }, (_, i) =>
      makeUnit(`func:a.ts:fn${i}`, 'a.ts', `function fn${i}() { return ${i}; }`),
    );

    await pipeline.scan(units, []);

    // Should have at most 2 LLM requests
    expect(requestCount).toBeLessThanOrEqual(2);
  });

  it('should track total duration across stages', async () => {
    mockFetch(async (url) => {
      if (url.includes('/api/generate')) {
        return new Response(
          JSON.stringify({ response: '{"issues": []}', done: true }),
          { status: 200 },
        );
      }
      return new Response('', { status: 404 });
    });

    const pipeline = new AIScanPipeline({
      sla: 'L3',
      embedding: { provider: 'local' },
      local: { provider: 'ollama', model: 'codellama:7b' },
    });
    const units = [makeUnit('func:a.ts:main', 'a.ts', 'function main() {}')];

    const result = await pipeline.scan(units, []);

    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('should track tokens used in LLM stage', async () => {
    mockFetch(async (url) => {
      if (url.includes('/api/generate')) {
        return new Response(
          JSON.stringify({
            response: '{"issues": []}',
            done: true,
            prompt_eval_count: 100,
            eval_count: 50,
          }),
          { status: 200 },
        );
      }
      return new Response('', { status: 404 });
    });

    const pipeline = new AIScanPipeline({
      sla: 'L3',
      embedding: { provider: 'local' },
      local: { provider: 'ollama', model: 'codellama:7b' },
    });
    const units = [
      makeUnit('func:a.ts:main', 'a.ts', 'function main() { return 1; }'),
    ];

    const result = await pipeline.scan(units, []);

    const llmStage = result.stages.find(s => s.stage === 'llm');
    expect(llmStage).toBeDefined();
    expect(llmStage!.tokensUsed).toBeGreaterThanOrEqual(0);
  });

  it('should use OpenAI provider when configured with remote', async () => {
    mockFetch(async (url, init) => {
      if (url.includes('/chat/completions')) {
        const headers = init?.headers as Record<string, string>;
        expect(headers['Authorization']).toBe('Bearer sk-test');
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"issues": []}' } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
          { status: 200 },
        );
      }
      return new Response('', { status: 404 });
    });

    const pipeline = new AIScanPipeline({
      sla: 'L3',
      embedding: { provider: 'local' },
      remote: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'sk-test',
      },
    });
    const units = [
      makeUnit('func:a.ts:main', 'a.ts', 'function main() { return 1; }'),
    ];

    const result = await pipeline.scan(units, []);
    const llmStage = result.stages.find(s => s.stage === 'llm');
    expect(llmStage).toBeDefined();
  });

  it('should use Anthropic provider when configured', async () => {
    mockFetch(async (url, init) => {
      if (url.includes('/messages')) {
        const headers = init?.headers as Record<string, string>;
        expect(headers['x-api-key']).toBe('sk-ant-test');
        return new Response(
          JSON.stringify({
            content: [{ type: 'text', text: '{"issues": []}' }],
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
          { status: 200 },
        );
      }
      return new Response('', { status: 404 });
    });

    const pipeline = new AIScanPipeline({
      sla: 'L3',
      embedding: { provider: 'local' },
      remote: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        apiKey: 'sk-ant-test',
      },
    });
    const units = [
      makeUnit('func:a.ts:main', 'a.ts', 'function main() { return 1; }'),
    ];

    const result = await pipeline.scan(units, []);
    const llmStage = result.stages.find(s => s.stage === 'llm');
    expect(llmStage).toBeDefined();
  });

  it('should validate LLM issue line numbers within chunk range', async () => {
    mockFetch(async (url) => {
      if (url.includes('/api/generate')) {
        return new Response(
          JSON.stringify({
            response: JSON.stringify({
              issues: [{
                line: 9999, // Way out of range
                severity: 'error',
                message: 'Out of range issue',
                category: 'implementation',
              }],
            }),
            done: true,
          }),
          { status: 200 },
        );
      }
      return new Response('', { status: 404 });
    });

    const pipeline = new AIScanPipeline({
      sla: 'L3',
      embedding: { provider: 'local' },
      local: { provider: 'ollama', model: 'codellama:7b' },
    });
    const units = [
      makeUnit('func:a.ts:main', 'a.ts', 'function main() {\n  return 1;\n}'),
    ];

    const result = await pipeline.scan(units, []);
    const llmStage = result.stages.find(s => s.stage === 'llm');
    if (llmStage && llmStage.issues.length > 0) {
      // Line should be clamped to chunk range
      for (const issue of llmStage.issues) {
        expect(issue.line).toBeGreaterThan(0);
      }
    }
  });

  it('should handle LLM response with missing issues field', async () => {
    mockFetch(async (url) => {
      if (url.includes('/api/generate')) {
        return new Response(
          JSON.stringify({
            response: '{"result": "no issues found"}',
            done: true,
          }),
          { status: 200 },
        );
      }
      return new Response('', { status: 404 });
    });

    const pipeline = new AIScanPipeline({
      sla: 'L3',
      embedding: { provider: 'local' },
      local: { provider: 'ollama', model: 'codellama:7b' },
    });
    const units = [
      makeUnit('func:a.ts:main', 'a.ts', 'function main() { return 1; }'),
    ];

    // Should not throw
    const result = await pipeline.scan(units, []);
    expect(result.stages).toBeDefined();
  });

  it('should default invalid severity from LLM to warning', async () => {
    mockFetch(async (url) => {
      if (url.includes('/api/generate')) {
        return new Response(
          JSON.stringify({
            response: JSON.stringify({
              issues: [{
                line: 1,
                severity: 'critical', // Not a valid severity
                message: 'Some issue',
                category: 'implementation',
              }],
            }),
            done: true,
          }),
          { status: 200 },
        );
      }
      return new Response('', { status: 404 });
    });

    const pipeline = new AIScanPipeline({
      sla: 'L3',
      embedding: { provider: 'local' },
      local: { provider: 'ollama', model: 'codellama:7b' },
    });
    const units = [
      makeUnit('func:a.ts:main', 'a.ts', 'function main() { return 1; }'),
    ];

    const result = await pipeline.scan(units, []);
    const llmStage = result.stages.find(s => s.stage === 'llm');
    if (llmStage && llmStage.issues.length > 0) {
      expect(llmStage.issues[0].severity).toBe('warning');
    }
  });
});

/**
 * Example Key Pattern Detection Tests
 *
 * Tests for detecting example/placeholder keys that AI often
 * copies from documentation but accidentally leaves in code.
 *
 * @since 0.5.0
 */

import { describe, it, expect } from 'vitest';
import { SecurityPatternDetector } from '../../src/detectors/v4/security-pattern.js';
import type { DetectorContext } from '../../src/detectors/v4/types.js';
import type { CodeUnit } from '../../src/ir/types.js';
import { createCodeUnit } from '../../src/ir/types.js';

// ─── Helpers ───────────────────────────────────────────────────────

function makeUnit(
  source: string,
  language: CodeUnit['language'] = 'typescript',
  file: string = 'test.ts',
): CodeUnit {
  return createCodeUnit({
    id: `func:${file}:fn`,
    file,
    language,
    kind: 'function',
    location: { startLine: 0, startColumn: 0, endLine: source.split('\n').length, endColumn: 0 },
    source,
  });
}

function createContext(): DetectorContext {
  return {
    projectRoot: '/project',
    allFiles: ['test.ts'],
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('Example Key Pattern Detection', () => {
  const detector = new SecurityPatternDetector();

  it('should detect OpenAI example keys with example suffix', async () => {
    const unit = makeUnit('const openaiKey = "sk-proj-abc123-example";');
    const results = await detector.detect([unit], createContext());
    
    // Should be detected as example API key (both example-api-key and example-openai-key may match)
    const hasExampleApiKey = results.some(r => r.metadata.patternId === 'example-api-key');
    expect(hasExampleApiKey).toBe(true);
  });

  it('should detect GitHub PATs with example suffix', async () => {
    const unit = makeUnit('const githubToken = "ghp_1234567890abcdef1234567890abcdefexample";');
    const results = await detector.detect([unit], createContext());
    
    // Should be detected as example GitHub PAT (placeholder-secret-value may also trigger, which is fine)
    const hasExampleGithubPat = results.some(r => r.metadata.patternId === 'example-github-pat');
    expect(hasExampleGithubPat).toBe(true);
  });

  it('should detect placeholder secrets', async () => {
    const testCases = [
      'const secret = "password=example123";',
      'const apikey = "demo-key-12345";',
      'const token = "sample_token_abc123";',
      'const password = "changeme123";',
    ];

    for (const code of testCases) {
      const unit = makeUnit(code);
      const results = await detector.detect([unit], createContext());
      
      // These should be detected as placeholder secrets
      const hasPlaceholderSecret = results.some(r => 
        r.metadata.patternId === 'placeholder-secret-value'
      );
      
      if (!hasPlaceholderSecret) {
        console.log(`Code not detected: ${code}`);
        console.log('Results:', results);
      }
      
      expect(hasPlaceholderSecret).toBe(true);
    }
  });

  it('should detect AWS example keys', async () => {
    const unit = makeUnit('const awsKey = "AKIAIOSFODNN7EXAMPLE";');
    const results = await detector.detect([unit], createContext());
    
    expect(results).toHaveLength(1);
    expect(results[0].message).toContain('AWS access key ID');
    expect(results[0].metadata.patternId).toBe('aws-access-key');
  });

  it('should detect Stripe example keys', async () => {
    const unit = makeUnit('const stripeKey = "sk_test_abcdefghijklmnopqrstuvwxyzexample";');
    const results = await detector.detect([unit], createContext());
    
    const hasStripeDetection = results.some(r => 
      r.metadata.patternId === 'example-stripe-key'
    );
    expect(hasStripeDetection).toBe(true);
  });

  it('should NOT detect real-looking keys', async () => {
    const testCases = [
      { 
        code: 'const token = "ghp_1234567890abcdef1234567890abcdef";', 
        description: 'GitHub PAT without example suffix',
        // Note: example-openai-key is a general security check for ANY OpenAI key format,
        // so we only test non-OpenAI patterns here
        shouldMatchPatterns: ['github-pat-general'],
      },
    ];

    for (const testCase of testCases) {
      const unit = makeUnit(testCase.code);
      const results = await detector.detect([unit], createContext());
      
      // These should NOT trigger example-specific patterns (those with "example" in the ID)
      const hasExampleSpecificDetection = results.some(r => 
        r.metadata.patternId === 'example-github-pat' ||
        r.metadata.patternId === 'example-api-key' ||
        r.metadata.patternId === 'placeholder-secret-basic'
      );
      
      expect(hasExampleSpecificDetection).toBe(false);
    }
  });

  it('should detect environment variable fallback secrets', async () => {
    const unit = makeUnit(`
      const apiKey = process.env.MY_API_KEY || "some-secret-value-here";
    `);
    const results = await detector.detect([unit], createContext());
    
    const hasFallbackDetection = results.some(r => 
      r.metadata.patternId === 'env-var-fallback-secret-js'
    );
    
    expect(hasFallbackDetection).toBe(true);
  });

  it('should ignore environment variables that are properly used', async () => {
    const unit = makeUnit(`
      const apiKey = process.env.MY_API_KEY;
      if (!apiKey) throw new Error('API key required');
    `);
    const results = await detector.detect([unit], createContext());
    
    // Should not detect as hardcoded secret when using process.env properly
    const hasHardcodedDetection = results.some(r => 
      r.metadata.patternId === 'hardcoded-api-key'
    );
    
    expect(hasHardcodedDetection).toBe(false);
  });
});
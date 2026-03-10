/**
 * Local Embedding Provider Tests
 *
 * Tests for the TF-IDF based local embedding provider including
 * tokenization, vocabulary building, embedding generation, and similarity.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LocalEmbeddingProvider,
  tokenize,
} from '../../src/ai/v4/embedding/local.js';
import {
  cosineSimilarity,
  findTopMatches,
} from '../../src/ai/v4/embedding/similarity.js';

describe('tokenize()', () => {
  it('should split camelCase into separate tokens', () => {
    const tokens = tokenize('readFileSync');
    expect(tokens).toContain('read');
    expect(tokens).toContain('file');
    expect(tokens).toContain('sync');
  });

  it('should split snake_case into separate tokens', () => {
    const tokens = tokenize('read_file_sync');
    expect(tokens).toContain('read');
    expect(tokens).toContain('file');
    expect(tokens).toContain('sync');
  });

  it('should handle PascalCase', () => {
    const tokens = tokenize('FileReader');
    expect(tokens).toContain('file');
    expect(tokens).toContain('reader');
  });

  it('should lowercase all tokens', () => {
    const tokens = tokenize('XMLParser HTTPClient');
    for (const token of tokens) {
      expect(token).toBe(token.toLowerCase());
    }
  });

  it('should filter out single-character tokens', () => {
    const tokens = tokenize('a b c def gh');
    expect(tokens).not.toContain('a');
    expect(tokens).not.toContain('b');
    expect(tokens).not.toContain('c');
    expect(tokens).toContain('def');
    expect(tokens).toContain('gh');
  });

  it('should handle dots and arrows', () => {
    const tokens = tokenize('fs.readFile response->getBody');
    expect(tokens).toContain('fs');
    expect(tokens).toContain('read');
    expect(tokens).toContain('response');
    expect(tokens).toContain('get');
    expect(tokens).toContain('body');
  });

  it('should handle empty string', () => {
    const tokens = tokenize('');
    expect(tokens).toEqual([]);
  });
});

describe('LocalEmbeddingProvider', () => {
  let provider: LocalEmbeddingProvider;

  beforeEach(() => {
    provider = new LocalEmbeddingProvider(128);
  });

  describe('constructor', () => {
    it('should set name to local-tfidf', () => {
      expect(provider.name).toBe('local-tfidf');
    });

    it('should set dimension from constructor argument', () => {
      expect(provider.dimension).toBe(128);
    });

    it('should default dimension to 512', () => {
      const defaultProvider = new LocalEmbeddingProvider();
      expect(defaultProvider.dimension).toBe(512);
    });
  });

  describe('buildVocabulary()', () => {
    it('should handle empty corpus', () => {
      expect(() => provider.buildVocabulary([])).not.toThrow();
    });

    it('should build vocabulary from texts', async () => {
      provider.buildVocabulary([
        'function readFile path callback',
        'async function writeFile data options',
      ]);
      const embeddings = await provider.embed(['readFile']);
      expect(embeddings).toHaveLength(1);
      expect(embeddings[0]).toHaveLength(128);
    });
  });

  describe('embed()', () => {
    it('should return vectors of the correct dimension', async () => {
      provider.buildVocabulary(['hello world', 'foo bar']);
      const embeddings = await provider.embed(['hello world']);
      expect(embeddings).toHaveLength(1);
      expect(embeddings[0]).toHaveLength(128);
    });

    it('should return zero vector for empty text', async () => {
      provider.buildVocabulary(['hello world']);
      const embeddings = await provider.embed(['']);
      expect(embeddings).toHaveLength(1);
      const norm = Math.sqrt(
        embeddings[0].reduce((sum, v) => sum + v * v, 0),
      );
      expect(norm).toBe(0);
    });

    it('should auto-build vocabulary if not built', async () => {
      const embeddings = await provider.embed([
        'function readFile',
        'function writeFile',
      ]);
      expect(embeddings).toHaveLength(2);
      expect(embeddings[0]).toHaveLength(128);
    });

    it('should return normalized vectors (unit length)', async () => {
      provider.buildVocabulary(['function readFile path callback error handling']);
      const embeddings = await provider.embed(['function readFile callback']);
      const norm = Math.sqrt(
        embeddings[0].reduce((sum, v) => sum + v * v, 0),
      );
      // Normalized vectors should have length ~1 (or 0 for zero vectors)
      if (norm > 0) {
        expect(norm).toBeCloseTo(1, 4);
      }
    });

    it('should produce high similarity for similar code', async () => {
      const texts = [
        'import fs from "fs"; function readFile(path) { return fs.readFileSync(path); }',
        'import fs from "fs"; function loadFile(filePath) { return fs.readFileSync(filePath); }',
        'class DatabaseConnection { constructor(host, port) { this.connect(host, port); } }',
      ];
      provider.buildVocabulary(texts);
      const embeddings = await provider.embed(texts);

      const simSimilar = cosineSimilarity(embeddings[0], embeddings[1]);
      const simDifferent = cosineSimilarity(embeddings[0], embeddings[2]);

      expect(simSimilar).toBeGreaterThan(simDifferent);
    });

    it('should produce low similarity for very different code', async () => {
      const texts = [
        'import numpy as np; matrix = np.zeros((100, 100)); result = np.dot(matrix, matrix)',
        'const express = require("express"); app.get("/", handler); app.listen(3000)',
      ];
      provider.buildVocabulary(texts);
      const embeddings = await provider.embed(texts);
      const sim = cosineSimilarity(embeddings[0], embeddings[1]);
      expect(sim).toBeLessThan(0.5);
    });

    it('should handle batch embedding correctly', async () => {
      const texts = [
        'function foo() { return 1; }',
        'function bar() { return 2; }',
        'function baz() { return 3; }',
        'class Animal { constructor(name) { this.name = name; } }',
      ];
      provider.buildVocabulary(texts);
      const embeddings = await provider.embed(texts);
      expect(embeddings).toHaveLength(4);
      for (const emb of embeddings) {
        expect(emb).toHaveLength(128);
      }
    });
  });
});

describe('cosineSimilarity()', () => {
  it('should return 1 for identical vectors', () => {
    const v = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it('should return 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it('should return 0 for zero vectors', () => {
    const zero = [0, 0, 0];
    const v = [1, 2, 3];
    expect(cosineSimilarity(zero, v)).toBe(0);
    expect(cosineSimilarity(v, zero)).toBe(0);
    expect(cosineSimilarity(zero, zero)).toBe(0);
  });

  it('should return 0 for mismatched dimensions', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it('should return 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe('findTopMatches()', () => {
  it('should return matches above threshold', () => {
    const query = [1, 0, 0];
    const candidates = [
      [1, 0, 0],   // identical
      [0, 1, 0],   // orthogonal
      [0.9, 0.1, 0], // very similar
    ];
    const matches = findTopMatches(query, candidates, 5, 0.5);
    expect(matches.length).toBeGreaterThanOrEqual(2); // identical + very similar
    expect(matches[0].score).toBeCloseTo(1, 3);
  });

  it('should respect topK limit', () => {
    const query = [1, 0, 0];
    const candidates = [
      [1, 0, 0],
      [0.9, 0.1, 0],
      [0.8, 0.2, 0],
    ];
    const matches = findTopMatches(query, candidates, 1, 0.5);
    expect(matches).toHaveLength(1);
  });

  it('should sort by descending score', () => {
    const query = [1, 0, 0];
    const candidates = [
      [0.5, 0.5, 0],  // medium
      [1, 0, 0],      // high
      [0.8, 0.2, 0],  // medium-high
    ];
    const matches = findTopMatches(query, candidates, 5, 0.1);
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i].score).toBeLessThanOrEqual(matches[i - 1].score);
    }
  });

  it('should return empty for no matches above threshold', () => {
    const query = [1, 0, 0];
    const candidates = [[0, 1, 0], [0, 0, 1]];
    const matches = findTopMatches(query, candidates, 5, 0.9);
    expect(matches).toHaveLength(0);
  });

  it('should handle empty candidates', () => {
    const matches = findTopMatches([1, 0, 0], [], 5, 0);
    expect(matches).toHaveLength(0);
  });
});

/**
 * Defect Patterns Tests
 *
 * Tests for the curated AI defect pattern database.
 * Validates structure, uniqueness, categories, and utility functions.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFECT_PATTERNS,
  getPatternsByCategory,
  getPatternsForLanguage,
  getPatternText,
  type DefectPattern,
} from '../../src/ai/v4/patterns/defect-patterns.js';
import type { DetectorCategory } from '../../src/detectors/v4/types.js';

describe('DEFECT_PATTERNS', () => {
  it('should have at least 20 patterns', () => {
    expect(DEFECT_PATTERNS.length).toBeGreaterThanOrEqual(20);
  });

  it('should have unique IDs for all patterns', () => {
    const ids = DEFECT_PATTERNS.map(p => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have required fields on every pattern', () => {
    for (const pattern of DEFECT_PATTERNS) {
      expect(pattern.id).toBeTruthy();
      expect(typeof pattern.id).toBe('string');
      expect(pattern.category).toBeTruthy();
      expect(typeof pattern.description).toBe('string');
      expect(pattern.description.length).toBeGreaterThan(0);
      expect(Array.isArray(pattern.examples)).toBe(true);
      expect(pattern.examples.length).toBeGreaterThan(0);
      expect(['error', 'warning', 'info']).toContain(pattern.severity);
      expect(Array.isArray(pattern.languages)).toBe(true);
    }
  });

  it('should have valid category values', () => {
    const validCategories: DetectorCategory[] = [
      'ai-faithfulness',
      'code-freshness',
      'context-coherence',
      'implementation',
    ];

    for (const pattern of DEFECT_PATTERNS) {
      expect(validCategories).toContain(pattern.category);
    }
  });

  it('should have valid language values when specified', () => {
    const validLanguages = [
      'typescript',
      'javascript',
      'python',
      'java',
      'go',
      'kotlin',
    ];

    for (const pattern of DEFECT_PATTERNS) {
      for (const lang of pattern.languages) {
        expect(validLanguages).toContain(lang);
      }
    }
  });

  it('should have at least 5 ai-faithfulness patterns', () => {
    const count = DEFECT_PATTERNS.filter(
      p => p.category === 'ai-faithfulness',
    ).length;
    expect(count).toBeGreaterThanOrEqual(5);
  });

  it('should have at least 5 code-freshness patterns', () => {
    const count = DEFECT_PATTERNS.filter(
      p => p.category === 'code-freshness',
    ).length;
    expect(count).toBeGreaterThanOrEqual(5);
  });

  it('should have at least 5 context-coherence patterns', () => {
    const count = DEFECT_PATTERNS.filter(
      p => p.category === 'context-coherence',
    ).length;
    expect(count).toBeGreaterThanOrEqual(5);
  });

  it('should have at least 5 implementation patterns', () => {
    const count = DEFECT_PATTERNS.filter(
      p => p.category === 'implementation',
    ).length;
    expect(count).toBeGreaterThanOrEqual(5);
  });
});

describe('getPatternsByCategory()', () => {
  it('should return only patterns of the requested category', () => {
    const patterns = getPatternsByCategory('ai-faithfulness');
    for (const p of patterns) {
      expect(p.category).toBe('ai-faithfulness');
    }
    expect(patterns.length).toBeGreaterThan(0);
  });

  it('should return all 4 categories when queried separately', () => {
    const categories: DetectorCategory[] = [
      'ai-faithfulness',
      'code-freshness',
      'context-coherence',
      'implementation',
    ];
    for (const cat of categories) {
      const patterns = getPatternsByCategory(cat);
      expect(patterns.length).toBeGreaterThan(0);
    }
  });
});

describe('getPatternsForLanguage()', () => {
  it('should return language-specific and universal patterns for TypeScript', () => {
    const patterns = getPatternsForLanguage('typescript');
    const universal = DEFECT_PATTERNS.filter(p => p.languages.length === 0);
    // Should include all universal patterns plus TS-specific ones
    expect(patterns.length).toBeGreaterThanOrEqual(universal.length);
  });

  it('should include language-specific patterns', () => {
    const pythonPatterns = getPatternsForLanguage('python');
    const hasPythonSpecific = pythonPatterns.some(
      p => p.languages.includes('python') && p.languages.length > 0,
    );
    expect(hasPythonSpecific).toBe(true);
  });

  it('should not include patterns for other languages only', () => {
    const goPatterns = getPatternsForLanguage('go');
    for (const p of goPatterns) {
      if (p.languages.length > 0) {
        expect(p.languages).toContain('go');
      }
    }
  });
});

describe('getPatternText()', () => {
  it('should combine description and examples', () => {
    const pattern = DEFECT_PATTERNS[0];
    const text = getPatternText(pattern);
    expect(text).toContain(pattern.description);
    for (const example of pattern.examples) {
      expect(text).toContain(example);
    }
  });

  it('should produce non-empty text for every pattern', () => {
    for (const pattern of DEFECT_PATTERNS) {
      const text = getPatternText(pattern);
      expect(text.length).toBeGreaterThan(0);
    }
  });
});

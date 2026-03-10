/**
 * Scoring Engine V3
 *
 * Multi-dimensional scoring engine for AI-generated code quality.
 *
 * V3 scoring dimensions (total: 100):
 *   - AI Faithfulness       (35): Hallucination — packages/APIs/methods existence
 *   - Code Freshness        (25): Timeliness — deprecated APIs and methods
 *   - Context Coherence     (20): Consistency across long files and functions
 *   - Implementation Quality (20): Completeness, error handling, complexity
 *
 * Grade scale: A+ (95-100), A (90-94), B (80-89), C (70-79), D (60-69), F (0-59)
 *
 * Backward compatible: legacy scoreFile() is preserved (deprecated).
 */

import type {
  UnifiedIssue,
  Severity,
  Grade,
  ScoringDimensionId,
  ScoringDimensionConfig,
} from '../types.js';
import { AIDefectCategory } from '../types.js';

// Re-export legacy types for backward compatibility
export type { Grade };

// ─── V3 Scoring Dimensions ─────────────────────────────────────────

export const DIMENSIONS: Record<ScoringDimensionId, ScoringDimensionConfig> = {
  aiFaithfulness: { weight: 35, name: 'AI Faithfulness' },
  codeFreshness: { weight: 25, name: 'Code Freshness' },
  contextCoherence: { weight: 20, name: 'Context Coherence' },
  implementationQuality: { weight: 20, name: 'Implementation Quality' },
};

// ─── Severity Deductions ───────────────────────────────────────────

export const SEVERITY_DEDUCTIONS: Record<Severity, number> = {
  critical: 15,
  high: 10,
  medium: 5,
  low: 2,
  info: 0,
};

// ─── Category → Dimension Mapping ──────────────────────────────────

/**
 * Maps each AIDefectCategory to a scoring dimension.
 */
export const CATEGORY_DIMENSION_MAP: Record<AIDefectCategory, ScoringDimensionId> = {
  [AIDefectCategory.HALLUCINATION]: 'aiFaithfulness',
  [AIDefectCategory.SECURITY_ANTIPATTERN]: 'aiFaithfulness',
  [AIDefectCategory.TRAINING_LEAK]: 'aiFaithfulness',
  [AIDefectCategory.STALE_KNOWLEDGE]: 'codeFreshness',
  [AIDefectCategory.CONTEXT_LOSS]: 'contextCoherence',
  [AIDefectCategory.INCOMPLETE_IMPL]: 'implementationQuality',
  [AIDefectCategory.OVER_ENGINEERING]: 'implementationQuality',
  [AIDefectCategory.DUPLICATION]: 'implementationQuality',
  [AIDefectCategory.TYPE_SAFETY]: 'implementationQuality',
  [AIDefectCategory.ERROR_HANDLING]: 'implementationQuality',
};

// ─── Score Result Types ────────────────────────────────────────────

/** Score for a single dimension */
export interface DimensionScoreV3 {
  id: ScoringDimensionId;
  name: string;
  maxScore: number;
  score: number;
  issueCount: number;
  rawDeduction: number;
  normalizedDeduction: number;
  issues: UnifiedIssue[];
}

/** Score result for a set of issues (file-level or project-level) */
export interface ScoreResult {
  totalScore: number;
  grade: Grade;
  dimensions: Record<ScoringDimensionId, DimensionScoreV3>;
  issueCount: number;
  passed: boolean;
  threshold: number;
}

/** Score result for a single file */
export interface FileScoreV3 extends ScoreResult {
  file: string;
}

/** Aggregate score across multiple files */
export interface AggregateScoreV3 {
  overallScore: number;
  grade: Grade;
  totalFiles: number;
  passedFiles: number;
  failedFiles: number;
  files: FileScoreV3[];
  dimensions: Record<ScoringDimensionId, DimensionScoreV3>;
  issueCount: number;
  passed: boolean;
  threshold: number;
  timestamp: string;
}

// ─── Legacy Types (backward compatibility) ─────────────────────────

/** @deprecated Use DimensionScoreV3 instead */
export interface DimensionScore {
  name: string;
  maxScore: number;
  score: number;
  issueCount: number;
  details: string[];
}

/** @deprecated Use FileScoreV3 instead */
export interface FileScore {
  file: string;
  totalScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  dimensions: {
    completeness: DimensionScore;
    coherence: DimensionScore;
    consistency: DimensionScore;
    conciseness: DimensionScore;
  };
  passed: boolean;
}

/** @deprecated Use AggregateScoreV3 instead */
export interface AggregateScore {
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  totalFiles: number;
  passedFiles: number;
  failedFiles: number;
  files: FileScore[];
  passed: boolean;
  timestamp: string;
}

// ─── Grade Computation ─────────────────────────────────────────────

export function computeGrade(score: number): Grade {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/** Legacy grade (without A+) for backward compatibility */
function computeLegacyGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// ─── Scoring Engine ────────────────────────────────────────────────

export class ScoringEngine {
  private threshold: number;

  constructor(threshold: number = 70) {
    this.threshold = threshold;
  }

  // ─── V3 API ────────────────────────────────────────────────────

  /**
   * Score a set of UnifiedIssues.
   * Can be used for file-level or project-level scoring.
   */
  score(issues: UnifiedIssue[]): ScoreResult {
    const dimensionIssues = this.groupByDimension(issues);
    const dimensions = this.scoreDimensions(dimensionIssues);

    const totalScore = Math.round(
      Object.values(dimensions).reduce((sum, d) => sum + d.score, 0),
    );

    return {
      totalScore,
      grade: computeGrade(totalScore),
      dimensions,
      issueCount: issues.length,
      passed: totalScore >= this.threshold,
      threshold: this.threshold,
    };
  }

  /**
   * Score issues grouped by file, returning per-file scores.
   */
  scoreByFile(issues: UnifiedIssue[]): FileScoreV3[] {
    const fileMap = new Map<string, UnifiedIssue[]>();

    for (const issue of issues) {
      const existing = fileMap.get(issue.file);
      if (existing) {
        existing.push(issue);
      } else {
        fileMap.set(issue.file, [issue]);
      }
    }

    return Array.from(fileMap.entries()).map(([file, fileIssues]) => {
      const result = this.score(fileIssues);
      return { ...result, file };
    });
  }

  /**
   * Aggregate scores across multiple files into a project-level report.
   */
  aggregateV3(issues: UnifiedIssue[]): AggregateScoreV3 {
    const fileScores = this.scoreByFile(issues);

    if (fileScores.length === 0) {
      return {
        overallScore: 100,
        grade: 'A+' as Grade,
        totalFiles: 0,
        passedFiles: 0,
        failedFiles: 0,
        files: [],
        dimensions: this.emptyDimensions(),
        issueCount: 0,
        passed: true,
        threshold: this.threshold,
        timestamp: new Date().toISOString(),
      };
    }

    // Project-level score: score ALL issues together (not average of file scores)
    const projectScore = this.score(issues);

    const passedFiles = fileScores.filter(f => f.passed).length;

    return {
      overallScore: projectScore.totalScore,
      grade: projectScore.grade,
      totalFiles: fileScores.length,
      passedFiles,
      failedFiles: fileScores.length - passedFiles,
      files: fileScores,
      dimensions: projectScore.dimensions,
      issueCount: issues.length,
      passed: projectScore.passed,
      threshold: this.threshold,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── Legacy API (backward compatibility) ───────────────────────

  /**
   * @deprecated Use `score(issues)` instead.
   * Score a single file based on legacy detector results.
   */
  scoreFile(
    filePath: string,
    hallucination: { issues: Array<{ severity: string; message: string }> } | null,
    logicGap: { issues: Array<{ severity: string; message: string }> } | null,
    duplication: { issues: Array<{ severity: string; message: string }> } | null,
    contextBreak: { issues: Array<{ severity: string; message: string }> } | null,
  ): FileScore {
    const completeness = this.scoreLegacyDimension(
      'Code Completeness', 30, hallucination?.issues ?? [],
    );
    const coherence = this.scoreLegacyDimension(
      'Logic Coherence', 25, logicGap?.issues ?? [],
    );
    const consistency = this.scoreLegacyDimension(
      'Architecture Consistency', 25, contextBreak?.issues ?? [],
    );
    const conciseness = this.scoreLegacyDimension(
      'Code Conciseness', 20, duplication?.issues ?? [],
    );

    const totalScore = Math.round(
      completeness.score + coherence.score + consistency.score + conciseness.score,
    );

    return {
      file: filePath,
      totalScore,
      grade: computeLegacyGrade(totalScore),
      dimensions: { completeness, coherence, consistency, conciseness },
      passed: totalScore >= this.threshold,
    };
  }

  /**
   * @deprecated Use `aggregateV3(issues)` instead.
   * Aggregate scores across multiple files (legacy format).
   */
  aggregate(fileScores: FileScore[]): AggregateScore {
    if (fileScores.length === 0) {
      return {
        overallScore: 100,
        grade: 'A',
        totalFiles: 0,
        passedFiles: 0,
        failedFiles: 0,
        files: [],
        passed: true,
        timestamp: new Date().toISOString(),
      };
    }

    const overallScore = Math.round(
      fileScores.reduce((sum, f) => sum + f.totalScore, 0) / fileScores.length,
    );

    const passedFiles = fileScores.filter(f => f.passed).length;

    return {
      overallScore,
      grade: computeLegacyGrade(overallScore),
      totalFiles: fileScores.length,
      passedFiles,
      failedFiles: fileScores.length - passedFiles,
      files: fileScores,
      passed: overallScore >= this.threshold,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── Internal Scoring Logic ────────────────────────────────────

  /**
   * Group issues by scoring dimension based on their category.
   */
  private groupByDimension(issues: UnifiedIssue[]): Record<ScoringDimensionId, UnifiedIssue[]> {
    const groups: Record<ScoringDimensionId, UnifiedIssue[]> = {
      aiFaithfulness: [],
      codeFreshness: [],
      contextCoherence: [],
      implementationQuality: [],
    };

    for (const issue of issues) {
      const dimensionId = CATEGORY_DIMENSION_MAP[issue.category];
      if (dimensionId) {
        groups[dimensionId].push(issue);
      } else {
        // Default unmapped categories to implementationQuality
        groups.implementationQuality.push(issue);
      }
    }

    return groups;
  }

  /**
   * Score all dimensions from grouped issues.
   */
  private scoreDimensions(
    grouped: Record<ScoringDimensionId, UnifiedIssue[]>,
  ): Record<ScoringDimensionId, DimensionScoreV3> {
    const result = {} as Record<ScoringDimensionId, DimensionScoreV3>;

    for (const [id, config] of Object.entries(DIMENSIONS) as [ScoringDimensionId, ScoringDimensionConfig][]) {
      const issues = grouped[id] ?? [];
      result[id] = this.scoreSingleDimension(id, config, issues);
    }

    return result;
  }

  /**
   * Score a single dimension.
   *
   * Deduction calculation:
   *   1. Sum raw deductions: Σ SEVERITY_DEDUCTIONS[issue.severity]
   *   2. Normalize to dimension weight range:
   *      normalizedDeduction = min(maxScore, (rawDeduction / 100) * maxScore)
   *   3. Dimension score = maxScore - normalizedDeduction (clamped to [0, maxScore])
   */
  private scoreSingleDimension(
    id: ScoringDimensionId,
    config: ScoringDimensionConfig,
    issues: UnifiedIssue[],
  ): DimensionScoreV3 {
    const maxScore = config.weight;
    let rawDeduction = 0;

    for (const issue of issues) {
      rawDeduction += SEVERITY_DEDUCTIONS[issue.severity] ?? 0;
    }

    const normalizedDeduction = Math.min(maxScore, (rawDeduction / 100) * maxScore);
    const score = Math.max(0, Math.round((maxScore - normalizedDeduction) * 100) / 100);

    return {
      id,
      name: config.name,
      maxScore,
      score,
      issueCount: issues.length,
      rawDeduction,
      normalizedDeduction: Math.round(normalizedDeduction * 100) / 100,
      issues,
    };
  }

  /**
   * Create empty dimension scores (for zero-issue projects).
   */
  private emptyDimensions(): Record<ScoringDimensionId, DimensionScoreV3> {
    const result = {} as Record<ScoringDimensionId, DimensionScoreV3>;

    for (const [id, config] of Object.entries(DIMENSIONS) as [ScoringDimensionId, ScoringDimensionConfig][]) {
      result[id] = {
        id,
        name: config.name,
        maxScore: config.weight,
        score: config.weight,
        issueCount: 0,
        rawDeduction: 0,
        normalizedDeduction: 0,
        issues: [],
      };
    }

    return result;
  }

  /**
   * Legacy dimension scoring for backward compatibility.
   */
  private scoreLegacyDimension(
    name: string,
    maxScore: number,
    issues: Array<{ severity: string; message: string }>,
  ): DimensionScore {
    const LEGACY_DEDUCTIONS = { error: 10, warning: 3 } as Record<string, number>;
    let deduction = 0;
    const details: string[] = [];

    for (const issue of issues) {
      const amount = LEGACY_DEDUCTIONS[issue.severity] ?? LEGACY_DEDUCTIONS.warning;
      deduction += amount;
      details.push(issue.message);
    }

    const normalizedDeduction = Math.min(maxScore, (deduction / 100) * maxScore);
    const score = Math.round((maxScore - normalizedDeduction) * 100) / 100;

    return {
      name,
      maxScore,
      score: Math.max(0, score),
      issueCount: issues.length,
      details: details.slice(0, 10),
    };
  }
}

export default ScoringEngine;

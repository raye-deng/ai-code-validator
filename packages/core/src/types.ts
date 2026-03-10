/**
 * Unified Type Definitions for AI Code Validator V3
 *
 * This file defines the core types shared across all modules:
 * detectors, scoring engine, SLA framework, and config system.
 *
 * NOTE: This may be overwritten by Worker A with the canonical version.
 * If so, imports should remain compatible.
 */

// ─── AI Defect Categories ──────────────────────────────────────────

export enum AIDefectCategory {
  HALLUCINATION = 'hallucination',
  STALE_KNOWLEDGE = 'stale-knowledge',
  CONTEXT_LOSS = 'context-loss',
  SECURITY_ANTIPATTERN = 'security',
  OVER_ENGINEERING = 'over-engineering',
  INCOMPLETE_IMPL = 'incomplete',
  TYPE_SAFETY = 'type-safety',
  ERROR_HANDLING = 'error-handling',
  DUPLICATION = 'duplication',
  TRAINING_LEAK = 'training-leak',
}

// ─── Severity ──────────────────────────────────────────────────────

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

// ─── Unified Issue ─────────────────────────────────────────────────

/** Unified Issue format — standard output for all detectors */
export interface UnifiedIssue {
  detector: string;
  type: string;
  severity: Severity;
  file: string;
  line: number;
  column?: number;
  message: string;
  suggestion?: string;
  category: AIDefectCategory;
  attribution: {
    rootCause: string;
    frequency: 'common' | 'occasional' | 'rare';
  };
  references?: { urls: string[]; cweId?: string };
  autoFixable: boolean;
  fixEffort: 'trivial' | 'small' | 'medium' | 'large';
  confidence: number; // 0.0 - 1.0
  source: 'static' | 'ai' | 'both';
}

// ─── Detector Interface ────────────────────────────────────────────

export interface DetectorResult {
  detector: string;
  file: string;
  issues: UnifiedIssue[];
  durationMs: number;
}

export interface AnalysisContext {
  projectRoot: string;
  config: import('./config/types.js').AICVConfig;
  astCache: Map<string, unknown>;
  registryCache: Map<string, { exists: boolean; checkedAt: number }>;
}

export interface Detector {
  readonly name: string;
  readonly tier: 1 | 2 | 3;
  analyze(
    filePath: string,
    source: string,
    ctx: AnalysisContext,
  ): DetectorResult | Promise<DetectorResult>;
}

// ─── Scoring Dimension ─────────────────────────────────────────────

/** Scoring dimension identifier */
export type ScoringDimensionId =
  | 'aiFaithfulness'
  | 'codeFreshness'
  | 'contextCoherence'
  | 'implementationQuality';

/** Scoring dimension configuration */
export interface ScoringDimensionConfig {
  weight: number;
  name: string;
}

// ─── Grade ─────────────────────────────────────────────────────────

export type Grade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

// ─── Language Support ──────────────────────────────────────────────

/** Supported programming languages */
export type SupportedLanguage = 'typescript' | 'javascript' | 'python' | 'java' | 'go' | 'kotlin';

// ─── File Analysis ─────────────────────────────────────────────────

/** Result of analyzing a single file (used by language adapters) */
export interface FileAnalysis {
  filePath: string;
  language: SupportedLanguage;
  issues: UnifiedIssue[];
  durationMs: number;
}

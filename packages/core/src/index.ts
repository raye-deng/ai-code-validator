/**
 * @ai-code-validator/core
 *
 * Core detection engine for AI-generated code quality validation.
 *
 * V3: Multi-dimensional scoring, SLA framework, unified types.
 *
 * @example
 * ```ts
 * import { ScoringEngine, ReportGenerator, SLATracker, SLALevel } from '@ai-code-validator/core';
 *
 * // V3 API
 * const engine = new ScoringEngine(70);
 * const result = engine.aggregateV3(unifiedIssues);
 *
 * const tracker = new SLATracker(SLALevel.L2_STANDARD, 47);
 * tracker.start();
 * // ... run detectors ...
 * const slaMetrics = tracker.finalize(issues, 9, 9);
 *
 * const reporter = new ReportGenerator();
 * console.log(reporter.generateV3(result, 'terminal', slaMetrics));
 * ```
 */

// ─── Unified Types ─────────────────────────────────────────────────

export { AIDefectCategory } from './types.js';
export type {
  Severity,
  UnifiedIssue,
  DetectorResult,
  AnalysisContext,
  Detector,
  Grade,
  ScoringDimensionId,
  ScoringDimensionConfig,
} from './types.js';

// ─── Detectors (legacy — will be updated by Worker A) ──────────────

export { HallucinationDetector } from './detectors/hallucination.js';
export type { HallucinationIssue, HallucinationResult, HallucinationDetectorOptions } from './detectors/hallucination.js';

export { LogicGapDetector } from './detectors/logic-gap.js';
export type { LogicGapIssue, LogicGapResult } from './detectors/logic-gap.js';

export { DuplicationDetector } from './detectors/duplication.js';
export type { DuplicationIssue, DuplicationResult } from './detectors/duplication.js';

export { ContextBreakDetector } from './detectors/context-break.js';
export type { ContextBreakIssue, ContextBreakResult } from './detectors/context-break.js';

// ─── Scorer V3 ─────────────────────────────────────────────────────

export { ScoringEngine, DIMENSIONS, SEVERITY_DEDUCTIONS, CATEGORY_DIMENSION_MAP, computeGrade } from './scorer/scoring-engine.js';
export type {
  // V3 types
  DimensionScoreV3,
  ScoreResult,
  FileScoreV3,
  AggregateScoreV3,
  // Legacy types (deprecated)
  FileScore,
  AggregateScore,
  DimensionScore,
} from './scorer/scoring-engine.js';

// ─── Report ────────────────────────────────────────────────────────

export { ReportGenerator } from './scorer/report.js';
export type { ReportFormat } from './scorer/report.js';

// ─── SLA Framework ─────────────────────────────────────────────────

export {
  SLALevel,
  SLA_TARGET_DURATIONS,
  SLA_AI_ANALYSIS,
  SLA_ACCURACY_TARGETS,
} from './sla/index.js';
export type { SLAMetrics, SLATimeoutCheck } from './sla/index.js';
export { SLATracker, parseSLALevel } from './sla/index.js';

// ─── Config ────────────────────────────────────────────────────────

export { DEFAULT_CONFIG, mergeWithDefaults, loadConfig } from './config/index.js';
export type {
  AICVConfig,
  ScanConfig,
  ScoringConfig,
  AIConfig,
  AILocalConfig,
  AIRemoteConfig,
  ReportConfig,
  ReportFormatType,
  CLIConfigOverrides,
  LoadConfigOptions,
} from './config/index.js';

// ─── AI Healer ─────────────────────────────────────────────────────

export { PromptBuilder } from './ai-healer/prompt-builder.js';
export type { FixPrompt } from './ai-healer/prompt-builder.js';

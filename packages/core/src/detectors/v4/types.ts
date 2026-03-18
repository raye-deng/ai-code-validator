/**
 * V4 Detector Types — Base interfaces for all V4 detectors.
 *
 * V4 detectors operate on the unified CodeUnit IR instead of raw source.
 * Only AI-unique detectors are included; traditional lint concerns are removed.
 *
 * @since 0.4.0
 */

import type { CodeUnit, SupportedLanguage } from '../../ir/types.js';
import type { RegistryManager } from '../../registry/registry-manager.js';

// ─── Detector Result ───────────────────────────────────────────────

/**
 * Result from a V4 detector. Each result represents a single detected issue.
 */
export interface DetectorResult {
  /** Detector identifier */
  detectorId: string;
  /** Severity: error > warning > info */
  severity: 'error' | 'warning' | 'info';
  /** Issue category for scoring */
  category: DetectorCategory;
  /** Human-readable message (i18n key) */
  messageKey: string;
  /** Fallback message (English) */
  message: string;
  /** Affected file */
  file: string;
  /** Line number (1-based for output) */
  line: number;
  /** End line (optional) */
  endLine?: number;
  /** Confidence score 0-1 */
  confidence: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ─── Detector Category ─────────────────────────────────────────────

/**
 * V4 detector categories aligned with V3 scoring dimensions.
 */
export type DetectorCategory =
  | 'ai-faithfulness'    // Hallucinated imports/APIs
  | 'code-freshness'     // Stale/deprecated APIs
  | 'context-coherence'  // Logic breaks from context window
  | 'implementation';    // Over-engineering, security, incomplete

// ─── Detector Context ──────────────────────────────────────────────

/**
 * Context provided to detectors during analysis.
 */
export interface DetectorContext {
  /** Project root directory */
  projectRoot: string;
  /** All file paths in the project */
  allFiles: string[];
  /** Registry manager for package verification */
  registryManager?: RegistryManager;
  /** Configuration overrides */
  config?: Record<string, unknown>;
  /** Project dependencies from package.json (used for offline fallback) */
  projectDependencies?: string[];
}

// ─── V4 Detector Interface ─────────────────────────────────────────

/**
 * V4 Detector — the unified detector interface for V4.
 *
 * All V4 detectors operate on CodeUnit[] (the unified IR),
 * never on raw source code or CST nodes.
 */
export interface V4Detector {
  /** Unique detector ID */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Which category this contributes to */
  readonly category: DetectorCategory;
  /** Which languages this detector supports (empty = all) */
  readonly supportedLanguages: SupportedLanguage[];

  /**
   * Analyze CodeUnits and return issues.
   * Detectors receive already-parsed, language-neutral CodeUnits.
   */
  detect(units: CodeUnit[], context: DetectorContext): Promise<DetectorResult[]>;
}

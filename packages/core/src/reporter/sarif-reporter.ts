/**
 * SARIF Reporter
 *
 * Generates SARIF 2.1.0 (Static Analysis Results Interchange Format) output.
 * SARIF is supported by GitHub Code Scanning, Azure DevOps, and many CI tools.
 *
 * @see https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 * @since 0.3.0
 */

import type { Severity } from '../types.js';
import type { ReportData } from './types.js';

// ─── SARIF Types ───────────────────────────────────────────────────

/** Top-level SARIF v2.1.0 result document. */
export interface SARIFResult {
  $schema: string;
  version: string;
  runs: SARIFRun[];
}

/** A single SARIF run containing tool info and results. */
export interface SARIFRun {
  tool: {
    driver: {
      name: string;
      version: string;
      informationUri: string;
      rules: SARIFRule[];
    };
  };
  results: SARIFResultEntry[];
}

/** SARIF rule definition. */
export interface SARIFRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  defaultConfiguration: {
    level: string;
  };
}

/** A single SARIF result entry referencing a rule and source location. */
export interface SARIFResultEntry {
  ruleId: string;
  level: string;
  message: { text: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string };
      region: {
        startLine: number;
        startColumn: number;
        endLine?: number;
        endColumn?: number;
      };
    };
  }>;
}

// ─── Severity Mapping ──────────────────────────────────────────────

function severityToSARIF(severity: Severity): string {
  const map: Record<Severity, string> = {
    critical: 'error',
    high: 'error',
    medium: 'warning',
    low: 'note',
    info: 'note',
  };
  return map[severity];
}

// ─── SARIF Generator ───────────────────────────────────────────────

/**
 * Generate a SARIF 2.1.0 compliant object from report data.
 *
 * Deduplicates rules by issue ID to ensure each rule is only listed once.
 */
export function generateSARIF(data: ReportData): SARIFResult {
  // Deduplicate rules by ID
  const rulesMap = new Map<string, SARIFRule>();
  for (const issue of data.issues) {
    if (!rulesMap.has(issue.id)) {
      rulesMap.set(issue.id, {
        id: issue.id,
        name: issue.detector,
        shortDescription: { text: issue.message },
        defaultConfiguration: {
          level: severityToSARIF(issue.severity),
        },
      });
    }
  }

  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'open-code-review',
          version: '0.3.0',
          informationUri: 'https://codes.evallab.ai',
          rules: Array.from(rulesMap.values()),
        },
      },
      results: data.issues.map(issue => ({
        ruleId: issue.id,
        level: severityToSARIF(issue.severity),
        message: { text: issue.message },
        locations: [{
          physicalLocation: {
            artifactLocation: { uri: issue.file },
            region: {
              startLine: issue.line,
              startColumn: issue.column || 1,
              ...(issue.endLine ? { endLine: issue.endLine } : {}),
              ...(issue.endColumn ? { endColumn: issue.endColumn } : {}),
            },
          },
        }],
      })),
    }],
  };
}

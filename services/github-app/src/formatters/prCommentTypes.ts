/**
 * PR Comment Types
 *
 * Type definitions for PR comment formatting.
 */

import type { AggregatedFailures, CodeAnnotation } from "@kenchi/shared";

// ==================== Consolidation Types ====================

export interface ConsolidatedTestFailure {
  readonly testName: string;
  readonly file?: string;
  readonly line?: number;
  readonly error?: string;
}

export interface ConsolidatedAnnotation {
  readonly path: string;
  readonly line: number;
  readonly message: string;
  readonly level: CodeAnnotation["level"];
  readonly title?: string;
  readonly suggestedFix?: string;
}

// ==================== Header Types ====================

/**
 * Header configuration for building the header section.
 */
export interface HeaderConfig {
  readonly commitSha: string;
  readonly failureCount: number;
  readonly confidence: number;
  readonly uncertainty?: string;
  readonly suiteCount: number;
  readonly fileCount: number;
  readonly serviceCount: number;
  readonly prContext: AggregatedFailures["prContext"];
}

// ==================== Affected Files Types ====================

/**
 * Entry representing an affected file with its display information.
 */
export interface AffectedFileEntry {
  readonly path: string;
  readonly location: string | null;
  readonly display: string;
  readonly level: CodeAnnotation["level"];
  readonly title?: string;
  readonly evidenceId?: string;
  readonly isInfra?: boolean;
}

/**
 * Groups entries by file path for deduplication display.
 */
export interface GroupedFileEntries {
  readonly file: string;
  readonly entries: readonly AffectedFileEntry[];
}

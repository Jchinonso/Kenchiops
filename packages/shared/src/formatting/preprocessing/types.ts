/**
 * Preprocessing Types
 *
 * Type definitions for the log preprocessing stage of the CI log analysis pipeline.
 * Includes sanitization, anchor selection, and test framework detection types.
 *
 * @module formatting/preprocessing/types
 */

import type { LineMapping } from "../chunking/types.js";

// ==================== CI Platform Types ====================

/**
 * CI platform types for platform-specific stripping.
 */
export type CIPlatform = "github" | "gitlab" | "circleci" | "jenkins" | "azure";

// ==================== Anchor Selection Types ====================

/**
 * Match position with tier information.
 */
export interface TieredMatch {
  /** Position in the content */
  readonly position: number;
  /** Tier level (1 = highest priority) */
  readonly tier: number;
}

/**
 * Anchor selection result with metadata.
 */
export interface AnchorResult {
  /** Selected anchor position (RAW match index, not pre-shifted) */
  readonly position: number;
  /** Tier of the anchor (0=summary, 1-4=tiered, -1=fallback) */
  readonly tier: number;
  /** Number of matches found across all tiers */
  readonly totalMatches: number;
}

// ==================== Test Framework Types ====================

/**
 * Detected test framework information with confidence.
 */
export interface TestFrameworkInfo {
  /** Framework name (e.g., "pytest", "jest", "cargo-test") */
  readonly name: string;
  /** Programming language */
  readonly language: string;
  /** How expected/actual values are labeled in this framework */
  readonly assertionHint: string;
  /** Detection confidence (0-1) based on pattern match strength */
  readonly confidence: number;
}

/**
 * Internal framework pattern definition.
 */
export interface FrameworkPatternEntry {
  /** Patterns that identify this framework (ordered by specificity) */
  readonly patterns: readonly RegExp[];
  /** Base framework info (confidence added during detection) */
  readonly framework: Omit<TestFrameworkInfo, "confidence">;
  /** Base confidence score for this framework */
  readonly baseConfidence: number;
}

// ==================== Preprocessing Result Types ====================

/**
 * Result of preprocessing logs with metadata.
 */
export interface PreprocessResult {
  /** The preprocessed log content */
  readonly logs: string;
  /** Original log size in characters */
  readonly originalSize: number;
  /** Processed log size in characters */
  readonly processedSize: number;
  /** Whether the logs were truncated */
  readonly wasTruncated: boolean;
  /** Number of secrets redacted */
  readonly secretsRedacted: number;
  /** Types of secrets that were redacted */
  readonly secretTypes: readonly string[];
  /** Detected test framework (if any) */
  readonly testFramework?: Omit<TestFrameworkInfo, "confidence">;
  /** Anchor selection metadata (for diagnostics) */
  readonly anchorInfo?: AnchorResult;
}

// ==================== Line Collapse Types ====================

/**
 * Options for line collapse function.
 */
export interface CollapseOptions {
  /** Maximum identical consecutive lines to keep (default: 3) */
  readonly maxRepeats?: number;
}

/**
 * Result of line collapse operation with statistics.
 */
export interface CollapseResult {
  /** The collapsed text */
  readonly text: string;
  /** Number of lines removed */
  readonly linesRemoved: number;
  /** Number of collapse markers inserted */
  readonly markersInserted: number;
}

// ==================== Progress Removal Types ====================

/**
 * Options for progress indicator removal.
 */
export interface ProgressRemovalOptions {
  /** Additional patterns to match (will be combined with defaults) */
  readonly additionalPatterns?: readonly RegExp[];
}

/**
 * Result of progress indicator removal with statistics.
 */
export interface ProgressRemovalResult {
  /** The cleaned text */
  readonly text: string;
  /** Number of lines removed */
  readonly linesRemoved: number;
}

// ==================== Sanitization Result Types ====================

/**
 * Result of full sanitization pipeline with statistics.
 */
export interface SanitizationResult {
  /** The sanitized text */
  readonly text: string;
  /** Original size in characters */
  readonly originalSize: number;
  /** Final size in characters */
  readonly finalSize: number;
  /** Size reduction percentage */
  readonly reductionPercent: number;
  /** Number of secrets redacted */
  readonly secretsRedacted: number;
  /** Number of repeated lines collapsed */
  readonly linesCollapsed: number;
  /** Number of progress lines removed */
  readonly progressLinesRemoved: number;
}

/**
 * Result of sanitization with line mapping for original line recovery.
 */
export interface SanitizationResultWithMapping extends SanitizationResult {
  /** Mappings from sanitized line numbers to original line numbers */
  readonly lineMappings: readonly LineMapping[];
}

// ==================== Internal Accumulator Types ====================

/**
 * Internal accumulator state for line collapse processing.
 */
export interface CollapseAccumulatorState {
  readonly result: readonly string[];
  readonly currentLine: string | null;
  readonly repeatCount: number;
  readonly linesRemoved: number;
  readonly markersInserted: number;
}

/**
 * Internal state for line mapping accumulator.
 */
export interface LineMappingAccumulator {
  readonly sanitizedLines: readonly string[];
  readonly lineMappings: readonly LineMapping[];
  readonly sanitizedLineNumber: number;
}

/**
 * Result of line transformation.
 */
export interface LineTransformResult {
  readonly transformed: string;
  readonly wasModified: boolean;
}

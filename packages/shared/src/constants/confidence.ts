/**
 * Confidence scoring constants for the Kenchi codebase.
 * Thresholds, base scores, and adjustment values for confidence calculations.
 */

/**
 * Confidence score thresholds for gating decisions.
 */
export const CONFIDENCE_THRESHOLDS = {
  VERY_LOW: 0.3,
  LOW: 0.5,
  MEDIUM: 0.7,
  HIGH: 0.85,
} as const;

/**
 * Base confidence scores mapped to LLM confidence levels.
 */
export const BASE_CONFIDENCE_SCORES = {
  VERY_HIGH: 0.85,
  HIGH: 0.75,
  MEDIUM: 0.6,
  LOW: 0.4,
  VERY_LOW: 0.2,
  DEFAULT: 0.5, // Default when confidence level is not specified
} as const;

/**
 * Default confidence threshold for action decisions.
 */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Placeholder confidence score for backward compatibility.
 */
export const PLACEHOLDER_CONFIDENCE_SCORE = 0.5;

/**
 * Uncertainty detection penalties.
 */
export const UNCERTAINTY_PENALTIES = {
  STRONG: -0.15,
  MODERATE: -0.1,
  MILD: -0.05,
  MAX: -0.3,
} as const;

/**
 * Evidence alignment adjustments.
 */
export const ALIGNMENT_ADJUSTMENTS = {
  LOG_REFERENCE: 0.15,
  COMMIT_REFERENCE: 0.1,
  HIGH_SIMILARITY_INCIDENT: 0.15,
  METRICS_REFERENCE: 0.05,
  NO_ALIGNMENT_PENALTY: -0.15,
  MAX: 0.2,
} as const;

/**
 * Completeness assessment adjustments.
 */
export const COMPLETENESS_ADJUSTMENTS = {
  CAUSE_IDENTIFIED: 0.03,
  SUBSTANTIAL_REASONING: 0.03,
  MULTIPLE_ACTIONS: 0.02,
  IMPACT_ASSESSMENT: 0.02,
  UNCERTAINTIES_LISTED: 0.03,
  MINIMAL_ANALYSIS_PENALTY: -0.15,
} as const;

/**
 * Knowledge base validation adjustments.
 */
export const VALIDATION_ADJUSTMENTS = {
  STRONG: 0.1,
  MODERATE: 0.05,
  NONE: 0,
} as const;

/**
 * Consistency checking adjustments.
 */
export const CONSISTENCY_ADJUSTMENTS = {
  HIGH_RELEVANCE: 0.05,
  NO_RELEVANCE: -0.1,
  DEFAULT: 0,
} as const;

/**
 * Similarity thresholds for knowledge base matching.
 */
export const SIMILARITY_THRESHOLDS = {
  STRONG: 0.85,
  MODERATE: 0.7,
  MINIMUM_FOR_FILTERING: 0.7, // Used in prompts.ts for filtering docs
} as const;

/**
 * Relevance ratio thresholds.
 */
export const RELEVANCE_THRESHOLDS = {
  MIN_FOR_POSITIVE: 0.5, // Minimum ratio for positive consistency adjustment
} as const;

/**
 * Minimum lengths for completeness checks.
 */
export const MIN_LENGTHS = {
  CAUSE: 20,
  REASONING: 100,
} as const;

/**
 * Minimum number of actions for bonus.
 */
export const MIN_ACTIONS_FOR_BONUS = 2;

/**
 * Confidence range type for decision matrix.
 */
export type ConfidenceRange = "very_low" | "low" | "medium" | "high" | "very_high";

/**
 * Message templates for different confidence ranges.
 */
export const CONFIDENCE_MESSAGES: Readonly<Record<ConfidenceRange, string>> = {
  very_low: "Very low confidence. Manual review required before any action.",
  low: "Low confidence. Careful review recommended.",
  medium: "Medium confidence. Approval required.",
  high: "High confidence",
  very_high: "Very high confidence",
} as const;

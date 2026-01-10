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

/**
 * Human-readable confidence labels for display in messages.
 * Used in format: "72% (high certainty)"
 */
export const CONFIDENCE_DISPLAY_LABELS: Readonly<Record<ConfidenceRange, string>> = {
  very_low: "very low certainty",
  low: "low certainty",
  medium: "moderate certainty",
  high: "high certainty",
  very_high: "very high certainty",
} as const;

/**
 * Context-based confidence adjustments for analysis quality.
 * Applied when specific conditions reduce reliability.
 */
export const CONTEXT_CONFIDENCE_ADJUSTMENTS = {
  /** Failures spread across 3+ services indicate cascading/unrelated issues */
  MULTI_SERVICE_SPREAD: -0.15,
  /** Minimum services to trigger multi-service spread adjustment */
  MULTI_SERVICE_THRESHOLD: 3,
  /** Missing file/line information reduces traceability */
  MISSING_FILE_LINE: -0.15,
  /** Only generic error messages without specific context */
  GENERIC_ERROR_ONLY: -0.2,
  /** Infrastructure issues mixed with assertion failures muddy the analysis */
  INFRA_MIXED_WITH_ASSERTIONS: -0.1,
  /** Clear primary blocker identified increases confidence */
  PRIMARY_BLOCKER_IDENTIFIED: 0.1,
  /** Single service affected increases confidence */
  SINGLE_SERVICE_AFFECTED: 0.05,
} as const;

/**
 * Thresholds for confidence display categorization (as percentages 0-100).
 */
export const CONFIDENCE_DISPLAY_THRESHOLDS = {
  /** Above this is "high certainty" */
  HIGH: 70,
  /** Above this is "moderate certainty" */
  MEDIUM: 40,
  /** Above this is "low certainty", below is "very low certainty" */
  LOW: 20,
  /** Conversion factor for score (0-1) to percentage (0-100) */
  PERCENTAGE_MULTIPLIER: 100,
} as const;

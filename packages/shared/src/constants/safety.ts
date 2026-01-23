/**
 * Safety analysis constants - patterns and rules for confidence scoring.
 */

import { UNCERTAINTY_PENALTIES } from "./confidence.js";

/**
 * Uncertainty pattern configuration type.
 */
export type UncertaintyPattern = {
  readonly pattern: RegExp;
  readonly penalty: number;
};

/**
 * Compiled uncertainty patterns with penalties.
 * Ordered by severity (strongest first).
 */
export const UNCERTAINTY_PATTERNS: Readonly<UncertaintyPattern[]> = [
  {
    pattern:
      /\b(not sure|unclear|cannot determine|insufficient information|unable to identify|unknown)\b/gi,
    penalty: UNCERTAINTY_PENALTIES.STRONG,
  },
  {
    pattern: /\b(possibly|might be|could be|may be|potentially|perhaps)\b/gi,
    penalty: UNCERTAINTY_PENALTIES.MODERATE,
  },
  {
    pattern: /\b(appears to|seems like|suggests that|probably)\b/gi,
    penalty: UNCERTAINTY_PENALTIES.MILD,
  },
] as const;

/**
 * Metric keywords to detect in reasoning.
 */
export const METRIC_KEYWORDS: Readonly<Set<string>> = new Set([
  "cpu",
  "memory",
  "error rate",
  "latency",
]);

/**
 * Invalid cause keywords that indicate an invalid root cause identification.
 */
export const INVALID_CAUSE_KEYWORDS: Readonly<Set<string>> = new Set(["unknown"]);

/**
 * Cause-action relevance mapping configuration type.
 */
export type RelevanceRule = {
  readonly causeKeywords: readonly string[];
  readonly actionKeywords: readonly string[];
};

/**
 * Relevance rules for matching causes to actions.
 */
export const RELEVANCE_RULES: Readonly<RelevanceRule[]> = [
  {
    causeKeywords: ["secret", "env"],
    actionKeywords: ["environment"],
  },
  {
    causeKeywords: ["deploy"],
    actionKeywords: ["rollback"],
  },
  {
    causeKeywords: ["config"],
    actionKeywords: ["configuration"],
  },
  {
    causeKeywords: ["test"],
    actionKeywords: ["rerun", "test"],
  },
  {
    causeKeywords: ["pipeline"],
    actionKeywords: ["rerun", "pipeline"],
  },
] as const;

/**
 * Safety levels that allow auto-approval with high confidence.
 */
export const AUTO_APPROVABLE_SAFETY_LEVELS: Readonly<Set<string>> = new Set(["safe", "low_risk"]);

/**
 * Safety-related messages for action gating and validation.
 */
export const SAFETY_MESSAGES = {
  INVALID_ACTION: "Invalid action proposal. Manual review required.",
} as const;

// ==================== Audit Constants ====================

/**
 * Default limit for audit queries.
 */
export const AUDIT_DEFAULT_QUERY_LIMIT = 100;

/**
 * Maximum in-memory audit entries (for default store).
 */
export const AUDIT_MAX_IN_MEMORY_ENTRIES = 10000;

// ==================== Prompt Injection Constants ====================

/**
 * Risk thresholds for prompt injection detection.
 */
export const INJECTION_RISK_THRESHOLDS = {
  ALLOW: 0.2,
  SANITIZE: 0.5,
  BLOCK: 0.75,
} as const;

// ==================== Hallucination Detection Constants ====================

/**
 * Default threshold for marking content as likely hallucinated.
 */
export const HALLUCINATION_DEFAULT_THRESHOLD = 0.6;

/**
 * Weight factors for hallucination risk score calculation.
 */
export const HALLUCINATION_RISK_WEIGHTS = {
  /** Weight for pattern-based indicators */
  PATTERN_INDICATORS: 0.4,
  /** Weight for unverified claims */
  UNVERIFIED_CLAIMS: 0.35,
  /** Weight for text characteristics */
  TEXT_CHARACTERISTICS: 0.25,
} as const;

// ==================== Risk Scoring Constants ====================

/**
 * Weight factors for action risk score calculation.
 */
export const ACTION_RISK_WEIGHTS = {
  BLAST_RADIUS: 0.35,
  REVERSIBILITY: 0.4,
  DATA_IMPACT: 0.25,
} as const;

/**
 * Numeric scores for blast radius levels.
 */
export const BLAST_RADIUS_SCORES = {
  single_service: 0.2,
  multiple_services: 0.6,
  infrastructure: 1.0,
} as const;

/**
 * Numeric scores for reversibility levels.
 */
export const REVERSIBILITY_SCORES = {
  instant: 0.1,
  minutes: 0.4,
  manual_only: 0.7,
  irreversible: 1.0,
} as const;

/**
 * Numeric scores for data impact levels.
 */
export const DATA_IMPACT_SCORES = {
  none: 0.0,
  read_only: 0.2,
  write: 0.6,
  destructive: 1.0,
} as const;

/**
 * Default risk assessment for unknown action types.
 */
export const DEFAULT_ACTION_RISK = {
  blastRadius: "single_service",
  reversibility: "minutes",
  dataImpact: "write",
} as const;

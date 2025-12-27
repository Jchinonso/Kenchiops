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

/**
 * Action gating module for confidence-based approval workflows.
 * Determines whether actions should be auto-approved, require approval, or be blocked.
 *
 * @module safety/actionGating
 */

import type { ActionProposal, SafetyLevel } from "../core/types.js";
import {
  CONFIDENCE_THRESHOLDS,
  AUTO_APPROVABLE_SAFETY_LEVELS,
  VALID_SAFETY_LEVELS,
  CONFIDENCE_MESSAGES,
  SAFETY_MESSAGES,
  type ConfidenceRange,
} from "../constants/index.js";
import type { GatingDecision, ActionGatingResult, ThresholdEntry } from "./types.js";
import { clampConfidenceScore } from "./helpers.js";

// Re-export types for consumers
export type { GatingDecision, ActionGatingResult } from "./types.js";

/**
 * Confidence range lookup table (ascending order - returns first match).
 */
const CONFIDENCE_RANGE_THRESHOLDS: readonly ThresholdEntry[] = [
  { threshold: CONFIDENCE_THRESHOLDS.VERY_LOW, range: "very_low" },
  { threshold: CONFIDENCE_THRESHOLDS.LOW, range: "low" },
  { threshold: CONFIDENCE_THRESHOLDS.MEDIUM, range: "medium" },
  { threshold: CONFIDENCE_THRESHOLDS.HIGH, range: "high" },
] as const;

/**
 * Default confidence range for scores above all thresholds.
 */
const DEFAULT_CONFIDENCE_RANGE: ConfidenceRange = "very_high";

/**
 * Validates that action has a valid safety level.
 * Note: Only checks safetyLevel field, not other ActionProposal properties.
 *
 * @param action - Action proposal to validate
 * @returns True if action has a valid safety level
 */
const hasValidSafetyLevel = (action: unknown): action is ActionProposal =>
  typeof action === "object" &&
  action !== null &&
  typeof (action as Record<string, unknown>).safetyLevel === "string" &&
  VALID_SAFETY_LEVELS.has((action as Record<string, unknown>).safetyLevel as string);

/**
 * Determines confidence range from score using functional lookup.
 *
 * @param score - Confidence score (already validated/clamped)
 * @returns Confidence range category
 */
const getConfidenceRange = (score: number): ConfidenceRange => {
  const matchedEntry = CONFIDENCE_RANGE_THRESHOLDS.find(({ threshold }) => score < threshold);
  return matchedEntry?.range ?? DEFAULT_CONFIDENCE_RANGE;
};

/**
 * Creates a gating result object.
 *
 * @param requiresApproval - Whether human approval gate exists
 * @param canExecute - Whether execution is permitted at all
 * @param message - Human-readable explanation
 */
const createGatingResult = (
  requiresApproval: boolean,
  canExecute: boolean,
  message: string
): ActionGatingResult => ({
  requiresApproval,
  canExecute,
  message,
});

/**
 * Maps confidence ranges to base gating decisions.
 * Single source of truth - derived from ranges, not duplicate thresholds.
 *
 * Note: High/very_high map to "auto_approve" as a base, but safety level
 * may override this to "require_approval" in determineActionGating.
 */
const RANGE_TO_DECISION: Readonly<Record<ConfidenceRange, GatingDecision>> = {
  very_low: "block",
  low: "require_approval",
  medium: "require_approval",
  high: "auto_approve",
  very_high: "auto_approve",
} as const;

/**
 * Determines basic gating decision based on confidence score alone.
 * Does NOT consider action safety level - use determineActionGating for that.
 *
 * @param confidenceScore - Confidence score from analysis (0-1, will be clamped if invalid)
 * @returns Basic gating decision (before safety level overrides)
 */
export const determineGatingDecision = (confidenceScore: number): GatingDecision => {
  const clampedScore = clampConfidenceScore(confidenceScore);
  const range = getConfidenceRange(clampedScore);
  return RANGE_TO_DECISION[range];
};

/**
 * Message templates for high confidence ranges with safety level context.
 */
const HIGH_CONFIDENCE_MESSAGE_TEMPLATES: Readonly<
  Record<"auto_approve" | "medium_risk" | "high_risk", (baseMessage: string) => string>
> = {
  auto_approve: (baseMessage: string) => `${baseMessage} with safe/low-risk action. Auto-approved.`,
  medium_risk: (baseMessage: string) => `${baseMessage} but medium risk. Approval required.`,
  high_risk: (baseMessage: string) =>
    `${baseMessage} but high/dangerous risk. Always requires approval.`,
} as const;

/**
 * Determines message context key based on safety level and auto-approval status.
 */
const getMessageContext = (
  safetyLevel: SafetyLevel,
  canAutoApprove: boolean
): keyof typeof HIGH_CONFIDENCE_MESSAGE_TEMPLATES =>
  canAutoApprove ? "auto_approve" : safetyLevel === "medium_risk" ? "medium_risk" : "high_risk";

/**
 * Message factory for high confidence ranges with safety level context.
 *
 * @param range - Confidence range (high or very_high)
 * @param safetyLevel - Action safety level
 * @param canAutoApprove - Whether action can be auto-approved
 * @returns Formatted message
 */
const createHighConfidenceMessage = (
  range: "high" | "very_high",
  safetyLevel: SafetyLevel,
  canAutoApprove: boolean
): string => {
  const baseMessage = CONFIDENCE_MESSAGES[range];
  const context = getMessageContext(safetyLevel, canAutoApprove);
  return HIGH_CONFIDENCE_MESSAGE_TEMPLATES[context](baseMessage);
};

/**
 * Range-based gating handlers.
 * Each handler processes a specific confidence range and returns a gating result.
 */
type RangeHandler = (
  range: ConfidenceRange,
  safetyLevel: SafetyLevel,
  clampedScore: number
) => ActionGatingResult;

/**
 * Handles very low confidence range - blocks all actions.
 * requiresApproval=false because approval can't help when blocked.
 */
const handleVeryLowRange: RangeHandler = (_range, _safetyLevel, _clampedScore) =>
  createGatingResult(false, false, CONFIDENCE_MESSAGES.very_low);

/**
 * Handles low/medium confidence ranges - requires approval but allows execution.
 */
const handleLowMediumRange: RangeHandler = (range, _safetyLevel, _clampedScore) =>
  createGatingResult(true, true, CONFIDENCE_MESSAGES[range]);

/**
 * Handles high/very high confidence ranges - checks safety level for auto-approval.
 */
const handleHighRange: RangeHandler = (range, safetyLevel, _clampedScore) => {
  // safetyLevel already validated by hasValidSafetyLevel before reaching handlers
  const canAutoApprove = AUTO_APPROVABLE_SAFETY_LEVELS.has(safetyLevel);
  return createGatingResult(
    !canAutoApprove,
    true,
    createHighConfidenceMessage(range as "high" | "very_high", safetyLevel, canAutoApprove)
  );
};

/**
 * Range handler lookup table.
 */
const RANGE_HANDLERS: Readonly<Record<ConfidenceRange, RangeHandler>> = {
  very_low: handleVeryLowRange,
  low: handleLowMediumRange,
  medium: handleLowMediumRange,
  high: handleHighRange,
  very_high: handleHighRange,
} as const;

/**
 * Invalid action gating result.
 * requiresApproval=false because approval can't help when blocked.
 */
const INVALID_ACTION_RESULT: ActionGatingResult = createGatingResult(
  false,
  false,
  SAFETY_MESSAGES.INVALID_ACTION
);

/**
 * Determines action gating for a specific action proposal.
 * Combines confidence score with action safety level.
 *
 * Accepts `unknown` for boundary safety - validates internally.
 * Use at service boundaries where runtime data may be untyped.
 *
 * @param action - Action proposal to evaluate (validated internally)
 * @param confidenceScore - Confidence score from analysis (0-1, will be clamped if invalid)
 * @returns Gating decision with approval requirements
 */
export const determineActionGating = (
  action: unknown,
  confidenceScore: number
): ActionGatingResult => {
  // Validate action has required safetyLevel
  if (!hasValidSafetyLevel(action)) {
    return INVALID_ACTION_RESULT;
  }

  const clampedScore = clampConfidenceScore(confidenceScore);
  const range = getConfidenceRange(clampedScore);
  const handler = RANGE_HANDLERS[range];

  return handler(range, action.safetyLevel, clampedScore);
};

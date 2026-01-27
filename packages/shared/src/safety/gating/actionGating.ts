/**
 * Action gating module for confidence-based approval workflows.
 * Determines whether actions should be auto-approved, require approval, or be blocked.
 *
 * @module safety/gating/actionGating
 */

import type { ActionProposal, SafetyLevel } from "../../core/types.js";
import {
  CONFIDENCE_THRESHOLDS,
  AUTO_APPROVABLE_SAFETY_LEVELS,
  VALID_SAFETY_LEVELS,
  CONFIDENCE_MESSAGES,
  SAFETY_MESSAGES,
  type ConfidenceRange,
} from "../../constants/index.js";
import type { GatingDecision, ActionGatingResult, ThresholdEntry, RangeHandler } from "../types.js";
import { clampConfidenceScore } from "../helpers.js";
import { invariant } from "../../core/errors.js";

// Re-export types for consumers
export type { GatingDecision, ActionGatingResult } from "../types.js";

/**
 * Confidence range lookup table (ascending order - returns first match).
 * Frozen to prevent runtime mutation of safety-critical config.
 */
const CONFIDENCE_RANGE_THRESHOLDS: readonly ThresholdEntry[] = Object.freeze(
  [
    { threshold: CONFIDENCE_THRESHOLDS.VERY_LOW, range: "very_low" as const },
    { threshold: CONFIDENCE_THRESHOLDS.LOW, range: "low" as const },
    { threshold: CONFIDENCE_THRESHOLDS.MEDIUM, range: "medium" as const },
    { threshold: CONFIDENCE_THRESHOLDS.HIGH, range: "high" as const },
  ].map(Object.freeze)
) as readonly ThresholdEntry[];

// Dev-time validation: thresholds must be valid confidence scores in [0,1] and strictly ascending
for (let i = 0; i < CONFIDENCE_RANGE_THRESHOLDS.length; i++) {
  const { threshold, range } = CONFIDENCE_RANGE_THRESHOLDS[i];

  // Validate each threshold is a valid confidence score
  invariant(
    Number.isFinite(threshold) && threshold >= 0 && threshold <= 1,
    `Threshold for "${range}" must be in [0,1], got: ${threshold}`
  );

  // Validate ascending order (skip first entry)
  if (i > 0) {
    const prev = CONFIDENCE_RANGE_THRESHOLDS[i - 1].threshold;
    invariant(
      threshold > prev,
      `CONFIDENCE_RANGE_THRESHOLDS must be ascending: "${range}" (${threshold}) <= previous (${prev})`
    );
  }
}

// Ensure HIGH threshold < 1 so very_high range is reachable for scores near 1.0
invariant(
  CONFIDENCE_THRESHOLDS.HIGH < 1,
  `HIGH threshold must be < 1 to allow very_high range, got: ${CONFIDENCE_THRESHOLDS.HIGH}`
);

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
 * Boundary semantics: Thresholds are exclusive upper bounds.
 * Scores equal to a threshold fall into the next higher range.
 * Example: score=0.3 is NOT < 0.3, so it's "low" not "very_low".
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
 * Safety level to risk description mapping (grammatically correct for "with X action").
 * Single source of truth - message reflects actual safetyLevel, not derived state.
 * This prevents drift if AUTO_APPROVABLE_SAFETY_LEVELS changes.
 */
const SAFETY_LEVEL_DESCRIPTIONS: Readonly<Record<SafetyLevel, string>> = Object.freeze({
  safe: "a safe",
  low_risk: "a low-risk",
  medium_risk: "a medium-risk",
  high_risk: "a high-risk",
  dangerous: "a dangerous",
});

/**
 * Gets risk description for a safety level with fail-stop guarantee.
 * Throws if SafetyLevel type is ever loosened and an unhandled value appears.
 */
const getRiskDescription = (safetyLevel: SafetyLevel): string => {
  // Use hasOwnProperty.call to avoid prototype chain (universally compatible)
  invariant(
    Object.prototype.hasOwnProperty.call(SAFETY_LEVEL_DESCRIPTIONS, safetyLevel),
    `Unhandled safetyLevel: ${safetyLevel}`
  );
  return SAFETY_LEVEL_DESCRIPTIONS[safetyLevel];
};

/**
 * Message factory for high confidence ranges with safety level context.
 * Composes message from: confidence base + safety description + approval status.
 * This approach prevents message/config drift by deriving from safetyLevel directly.
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
  const riskDescription = getRiskDescription(safetyLevel);
  const approvalStatus = canAutoApprove ? "Auto-approved." : "Approval required.";
  return `${baseMessage} with ${riskDescription} action. ${approvalStatus}`;
};

/**
 * Handles very low confidence range - blocks all actions.
 * requiresApproval=false because approval can't help when blocked.
 */
const handleVeryLowRange: RangeHandler = () =>
  createGatingResult(false, false, CONFIDENCE_MESSAGES.very_low);

/**
 * Handles low/medium confidence ranges - requires approval but allows execution.
 */
const handleLowMediumRange: RangeHandler = (range) =>
  createGatingResult(true, true, CONFIDENCE_MESSAGES[range]);

/**
 * Handles high/very high confidence ranges - checks safety level for auto-approval.
 */
const handleHighRange: RangeHandler = (range, safetyLevel) => {
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
 * Frozen to prevent runtime mutation.
 */
const INVALID_ACTION_RESULT: ActionGatingResult = Object.freeze(
  createGatingResult(false, false, SAFETY_MESSAGES.INVALID_ACTION)
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

  return handler(range, action.safetyLevel);
};

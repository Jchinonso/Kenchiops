/**
 * Action gating module for confidence-based approval workflows.
 * Determines whether actions should be auto-approved, require approval, or be blocked.
 *
 * @module safety/actionGating
 */

import type { ActionProposal, SafetyLevel } from "../core/types.js";
import { clampConfidenceScore } from "./confidenceUtils.js";
import {
  CONFIDENCE_THRESHOLDS,
  AUTO_APPROVABLE_SAFETY_LEVELS,
  VALID_SAFETY_LEVELS,
  CONFIDENCE_MESSAGES,
  SAFETY_MESSAGES,
  type ConfidenceRange,
} from "../constants/index.js";

/**
 * Gating decision type.
 */
type GatingDecision = "auto_approve" | "require_approval" | "block";

/**
 * Action gating result type.
 */
export type ActionGatingResult = {
  readonly requiresApproval: boolean;
  readonly autoExecutable: boolean;
  readonly message: string;
};

/**
 * Threshold entry for confidence range lookup.
 * Sorted in ascending order for first-match logic.
 */
interface ThresholdEntry {
  readonly threshold: number;
  readonly range: ConfidenceRange;
}

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
 * Validates that action has required properties.
 *
 * @param action - Action proposal to validate
 * @returns True if action is valid
 */
const isValidAction = (action: unknown): action is ActionProposal =>
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
 */
const createGatingResult = (
  requiresApproval: boolean,
  autoExecutable: boolean,
  message: string
): ActionGatingResult => ({
  requiresApproval,
  autoExecutable,
  message,
});

/**
 * Gating decision lookup table based on confidence thresholds.
 * Returns first matching decision based on score thresholds.
 */
const GATING_DECISION_THRESHOLDS: ReadonlyArray<{
  readonly threshold: number;
  readonly decision: GatingDecision;
}> = [
  { threshold: CONFIDENCE_THRESHOLDS.VERY_LOW, decision: "block" },
  { threshold: CONFIDENCE_THRESHOLDS.MEDIUM, decision: "require_approval" },
] as const;

/**
 * Default gating decision for high confidence scores.
 */
const DEFAULT_GATING_DECISION: GatingDecision = "auto_approve";

/**
 * Determines basic gating decision based on confidence score.
 * Robust: Validates and clamps input to handle edge cases.
 *
 * @param confidenceScore - Confidence score from analysis (0-1, will be clamped if invalid)
 * @returns Basic gating decision
 */
export const determineGatingDecision = (confidenceScore: number): GatingDecision => {
  const clampedScore = clampConfidenceScore(confidenceScore);
  const matchedDecision = GATING_DECISION_THRESHOLDS.find(
    ({ threshold }) => clampedScore < threshold
  );
  return matchedDecision?.decision ?? DEFAULT_GATING_DECISION;
};

/**
 * Message templates for high confidence ranges with safety level context.
 */
const HIGH_CONFIDENCE_MESSAGE_TEMPLATES: Readonly<
  Record<"auto_approve" | "medium_risk" | "high_risk", (baseMessage: string) => string>
> = {
  auto_approve: (baseMessage: string) => `${baseMessage} with safe/low-risk action. Auto-approved.`,
  medium_risk: (baseMessage: string) => `${baseMessage} but medium risk. Approval required.`,
  high_risk: () => "High/dangerous risk. Always requires approval.",
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
 */
const handleVeryLowRange: RangeHandler = () =>
  createGatingResult(true, false, CONFIDENCE_MESSAGES.very_low);

/**
 * Handles low/medium confidence ranges - requires approval but allows execution.
 */
const handleLowMediumRange: RangeHandler = (range) =>
  createGatingResult(true, true, CONFIDENCE_MESSAGES[range]);

/**
 * Handles high/very high confidence ranges - checks safety level for auto-approval.
 */
const handleHighRange: RangeHandler = (range, safetyLevel) => {
  const canAutoApprove =
    VALID_SAFETY_LEVELS.has(safetyLevel) && AUTO_APPROVABLE_SAFETY_LEVELS.has(safetyLevel);
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
 */
const INVALID_ACTION_RESULT: ActionGatingResult = createGatingResult(
  true,
  false,
  SAFETY_MESSAGES.INVALID_ACTION
);

/**
 * Determines action gating for a specific action proposal.
 * Combines confidence score with action safety level.
 * Robust: Validates inputs and handles edge cases defensively.
 * Optimized with lookup structures and functional patterns.
 *
 * @param action - Action proposal to evaluate
 * @param confidenceScore - Confidence score from analysis (0-1, will be clamped if invalid)
 * @returns Gating decision with approval requirements
 */
export const determineActionGating = (
  action: ActionProposal,
  confidenceScore: number
): ActionGatingResult => {
  // Early return for invalid actions
  if (!isValidAction(action)) {
    return INVALID_ACTION_RESULT;
  }

  const clampedScore = clampConfidenceScore(confidenceScore);
  const range = getConfidenceRange(clampedScore);
  const handler = RANGE_HANDLERS[range];

  return handler(range, action.safetyLevel, clampedScore);
};

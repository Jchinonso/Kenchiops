/**
 * Action gating module for confidence-based approval workflows.
 * Determines whether actions should be auto-approved, require approval, or be blocked.
 */

import type { ActionProposal, SafetyLevel } from '../types.js';
import { clampConfidenceScore } from './confidenceUtils.js';

/**
 * Confidence score thresholds for gating decisions.
 */
const CONFIDENCE_THRESHOLDS = {
  VERY_LOW: 0.3,
  LOW: 0.5,
  MEDIUM: 0.7,
  HIGH: 0.85,
} as const;

/**
 * Gating decision type.
 */
type GatingDecision = 'auto_approve' | 'require_approval' | 'block';

/**
 * Action gating result type.
 */
export type ActionGatingResult = {
  readonly requiresApproval: boolean;
  readonly autoExecutable: boolean;
  readonly message: string;
};

/**
 * Confidence range type for decision matrix.
 */
type ConfidenceRange = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';

/**
 * Safety levels that allow auto-approval with high confidence.
 */
const AUTO_APPROVABLE_SAFETY_LEVELS: Readonly<Set<SafetyLevel>> = new Set(['safe', 'low_risk']);

/**
 * Valid safety levels for runtime validation.
 */
const VALID_SAFETY_LEVELS: Readonly<Set<SafetyLevel>> = new Set([
  'safe',
  'low_risk',
  'medium_risk',
  'high_risk',
  'dangerous',
]);

/**
 * Validates that action has required properties.
 * 
 * @param action - Action proposal to validate
 * @returns True if action is valid
 */
const isValidAction = (action: unknown): action is ActionProposal => {
  if (!action || typeof action !== 'object') {
    return false;
  }
  
  const act = action as Record<string, unknown>;
  
  // Check required properties exist
  if (typeof act.safetyLevel !== 'string') {
    return false;
  }
  
  // Validate safetyLevel is a known value
  return VALID_SAFETY_LEVELS.has(act.safetyLevel as SafetyLevel);
};

/**
 * Determines confidence range from score.
 * 
 * @param score - Confidence score (already validated/clamped)
 * @returns Confidence range category
 */
const getConfidenceRange = (score: number): ConfidenceRange => {
  if (score < CONFIDENCE_THRESHOLDS.VERY_LOW) return 'very_low';
  if (score < CONFIDENCE_THRESHOLDS.LOW) return 'low';
  if (score < CONFIDENCE_THRESHOLDS.MEDIUM) return 'medium';
  if (score < CONFIDENCE_THRESHOLDS.HIGH) return 'high';
  return 'very_high';
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
 * Message templates for different confidence ranges.
 */
const CONFIDENCE_MESSAGES: Readonly<Record<ConfidenceRange, string>> = {
  very_low: 'Very low confidence. Manual review required before any action.',
  low: 'Low confidence. Careful review recommended.',
  medium: 'Medium confidence. Approval required.',
  high: 'High confidence',
  very_high: 'Very high confidence',
} as const;

/**
 * Determines basic gating decision based on confidence score.
 * Robust: Validates and clamps input to handle edge cases.
 * 
 * @param confidenceScore - Confidence score from analysis (0-1, will be clamped if invalid)
 * @returns Basic gating decision
 */
export const determineGatingDecision = (confidenceScore: number): GatingDecision => {
  const clampedScore = clampConfidenceScore(confidenceScore);
  
  if (clampedScore < CONFIDENCE_THRESHOLDS.VERY_LOW) {
    return 'block';
  }
  
  if (clampedScore < CONFIDENCE_THRESHOLDS.MEDIUM) {
    return 'require_approval';
  }
  
  // High confidence can auto-approve safe actions
  // But this is further refined by determineActionGating()
  return 'auto_approve';
};

/**
 * Message factory for high confidence ranges with safety level context.
 */
const createHighConfidenceMessage = (
  range: 'high' | 'very_high',
  safetyLevel: SafetyLevel,
  canAutoApprove: boolean
): string => {
  const baseMessage = CONFIDENCE_MESSAGES[range];
  
  if (canAutoApprove) {
    return `${baseMessage} with safe/low-risk action. Auto-approved.`;
  }
  
  if (safetyLevel === 'medium_risk') {
    return `${baseMessage} but medium risk. Approval required.`;
  }
  
  return 'High/dangerous risk. Always requires approval.';
};

/**
 * Determines action gating for a specific action proposal.
 * Combines confidence score with action safety level.
 * Robust: Validates inputs and handles edge cases defensively.
 * Optimized with early exits, lookup structures, and decision matrix.
 *
 * @param action - Action proposal to evaluate
 * @param confidenceScore - Confidence score from analysis (0-1, will be clamped if invalid)
 * @returns Gating decision with approval requirements
 * @throws {Error} If action is invalid or missing required properties
 */
export const determineActionGating = (
  action: ActionProposal,
  confidenceScore: number
): ActionGatingResult => {
  // Validate action
  if (!isValidAction(action)) {
    // Defensive: treat invalid action as highest risk, lowest confidence
    return createGatingResult(
      true,
      false,
      'Invalid action proposal. Manual review required.'
    );
  }

  // Validate and clamp confidence score
  const clampedScore = clampConfidenceScore(confidenceScore);
  const { safetyLevel } = action;
  const range = getConfidenceRange(clampedScore);

  // Very low confidence: block everything
  if (range === 'very_low') {
    return createGatingResult(
      true,
      false,
      CONFIDENCE_MESSAGES.very_low
    );
  }

  // Low/Medium confidence: always require approval
  if (range === 'low' || range === 'medium') {
    return createGatingResult(
      true,
      true,
      CONFIDENCE_MESSAGES[range]
    );
  }

  // High/Very high confidence: check safety level
  // Defensive: if safetyLevel is somehow invalid, treat as high risk
  const canAutoApprove = VALID_SAFETY_LEVELS.has(safetyLevel) 
    && AUTO_APPROVABLE_SAFETY_LEVELS.has(safetyLevel);
  
  return createGatingResult(
    !canAutoApprove,
    true,
    createHighConfidenceMessage(range, safetyLevel, canAutoApprove)
  );
};


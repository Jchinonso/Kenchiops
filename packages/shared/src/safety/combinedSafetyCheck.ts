/**
 * Combined Safety Check
 *
 * Performs comprehensive safety assessment combining risk scoring with restrictions.
 * Provides a single entry point for all safety validation needs.
 *
 * @module safety/combinedSafetyCheck
 */

import type { ActionProposal } from "../core/types.js";
import type { RiskAssessmentContext } from "./scoring/riskScoring/types.js";
import type {
  BlockCheckContext,
  BlockReason,
  BlockEvaluationResult,
  CombinedSafetyCheckResult,
} from "./types.js";
import { assessActionRiskWithContext } from "./scoring/riskScoring/index.js";
import { checkRestrictions } from "./gating/restrictions.js";
import { PLATFORM_THRESHOLDS } from "../constants/safety.js";

// Re-export type for backward compatibility
export type { CombinedSafetyCheckResult } from "./types.js";

// ==================== Helpers ====================

/** Block check rules evaluated in order, first blocked wins */
const BLOCK_CHECKS: ReadonlyArray<(ctx: BlockCheckContext) => BlockReason> = [
  ({ restrictionCheck }) => ({
    isBlocked: !restrictionCheck.isAllowed,
    reason: restrictionCheck.reason,
  }),
  ({ riskScore }) => ({
    isBlocked: riskScore >= PLATFORM_THRESHOLDS.MAX_BLOCK_THRESHOLD,
    reason: `Risk score ${(riskScore * 100).toFixed(0)}% exceeds block threshold`,
  }),
];

/** Evaluates block checks and returns combined result */
const evaluateBlockChecks = (ctx: BlockCheckContext): BlockEvaluationResult => {
  const blockedCheck = BLOCK_CHECKS.map((check) => check(ctx)).find(({ isBlocked }) => isBlocked);
  return {
    isAllowed: !blockedCheck,
    blockedReason: blockedCheck?.reason,
  };
};

// ==================== Main Function ====================

/**
 * Performs combined safety check including risk assessment and restrictions.
 *
 * This function:
 * 1. Checks if action is restricted (incident mode, deployment freeze, manual blocks)
 * 2. Performs context-aware risk assessment
 * 3. Determines if action should be blocked based on risk score
 * 4. Returns comprehensive result with all safety information
 *
 * @param action - Action proposal to check
 * @param context - Execution context for risk assessment
 * @returns Complete safety check result
 */
export const performCombinedSafetyCheck = async (
  action: ActionProposal,
  context: RiskAssessmentContext = {}
): Promise<CombinedSafetyCheckResult> => {
  const restrictionCheck = checkRestrictions({ actionType: action.actionType });
  const riskAssessment = await assessActionRiskWithContext(action, context);
  const { isAllowed, blockedReason } = evaluateBlockChecks({
    restrictionCheck,
    riskScore: riskAssessment.score,
  });

  return {
    isAllowed,
    riskAssessment,
    restrictionCheck,
    blockedReason,
    requiresApproval: riskAssessment.approvalRequirements.requiresApproval,
    requiresAdditionalApproval: riskAssessment.approvalRequirements.requiresAdditionalApproval,
  };
};

/**
 * Quick check if an action should be blocked.
 * Use performCombinedSafetyCheck for full details.
 *
 * @param action - Action proposal to check
 * @param context - Execution context
 * @returns True if action is blocked
 */
export const isActionSafetyBlocked = async (
  action: ActionProposal,
  context: RiskAssessmentContext = {}
): Promise<boolean> => {
  const result = await performCombinedSafetyCheck(action, context);
  return !result.isAllowed;
};

/**
 * Gets safety block reason for an action.
 * Returns undefined if action is allowed.
 *
 * @param action - Action proposal to check
 * @param context - Execution context
 * @returns Block reason or undefined
 */
export const getSafetyBlockReason = async (
  action: ActionProposal,
  context: RiskAssessmentContext = {}
): Promise<string | undefined> => {
  const result = await performCombinedSafetyCheck(action, context);
  return result.blockedReason;
};

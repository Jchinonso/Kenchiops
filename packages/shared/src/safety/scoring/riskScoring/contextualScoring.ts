/**
 * Contextual Risk Scoring
 *
 * Context-aware risk assessment that considers environment, incident mode,
 * off-hours, and custom tenant rules.
 *
 * @module safety/scoring/riskScoring/contextualScoring
 */

import type { ActionProposal } from "../../../core/types.js";
import type { BlastRadius, Reversibility, DataImpact } from "../../types.js";
import type {
  RiskAssessmentContext,
  ResolvedRiskContext,
  ContextualActionRiskAssessment,
  RecordAssessmentInput,
  OffHoursCheckContext,
  GenerateSummaryInput,
} from "./types.js";
import type { CustomRiskRule } from "../../../database/riskRules/types.js";
import {
  RISK_SCORING_VERSION,
  PLATFORM_THRESHOLDS,
  type RiskRuleCategory,
} from "../../../constants/safety.js";
import { findRiskRule } from "./rules.js";
import { getRiskRulesStore } from "./store.js";
import { createLogger, getErrorMessage } from "../../../core/index.js";
import {
  DEFAULT_TENANT_ID,
  DEFAULT_ENVIRONMENT,
  checkOffHours,
  getRiskLevel,
  calculateCompositeScore,
  calculateContextAdjustment,
  generateContextualSummary,
  determineApprovalRequirements,
  buildContextFactors,
  buildAppliedCustomRules,
  buildDeprecatedAppliedRule,
  resolveMatchedRuleCategory,
  determineRuleCategory,
  applyScoreModifier,
} from "./helpers.js";

const logger = createLogger("risk-scoring");

// ==================== Incident Mode State ====================

/**
 * Global incident mode state.
 * In production, this would be backed by a service/database.
 */
let incidentModeActive = false;

/**
 * Checks if incident mode is currently active.
 *
 * @returns True if incident mode is active
 */
export const isInIncidentMode = (): boolean => incidentModeActive;

/**
 * Sets incident mode state (for testing/manual control).
 *
 * @param active - Whether incident mode should be active
 */
export const setIncidentMode = (active: boolean): void => {
  incidentModeActive = active;
};

// ==================== Off-Hours Detection ====================

/**
 * Checks if current time is considered off-hours.
 * Off-hours: weekends or night hours (configurable via OFF_HOURS_CONFIG).
 *
 * @param now - Current time (defaults to now)
 * @returns True if off-hours
 */
export const isCurrentlyOffHours = (now: Date = new Date()): boolean => {
  const offHoursCtx: OffHoursCheckContext = {
    utcHour: now.getUTCHours(),
    utcDay: now.getUTCDay(),
  };

  return checkOffHours(offHoursCtx);
};

// ==================== Context Resolution ====================

/**
 * Resolves partial context to full context with defaults.
 *
 * SECURITY: For `incidentModeActive` and `isOffHours`, we use the MORE RESTRICTIVE
 * value (logical OR) between caller hint and system detection. This prevents
 * callers from lowering risk by claiming "no incident" or "not off-hours".
 *
 * - Caller says incident=false, system says incident=true → incident=true
 * - Caller says incident=true, system says incident=false → incident=true
 *
 * This is intentional: callers can ELEVATE risk context but never REDUCE it.
 *
 * @param partial - Partial context hints from caller
 * @returns Fully resolved authoritative context
 */
export const resolveContext = (partial: RiskAssessmentContext = {}): ResolvedRiskContext => {
  // System-detected values (authoritative source of truth)
  const systemIncidentMode = isInIncidentMode();
  const systemOffHours = isCurrentlyOffHours();

  // Use MORE RESTRICTIVE value: OR logic (true if either is true)
  // Callers can elevate risk but never reduce it
  const resolvedIncidentMode = (partial.incidentModeHint ?? false) || systemIncidentMode;
  const resolvedOffHours = (partial.offHoursHint ?? false) || systemOffHours;

  return {
    environment: partial.environment ?? DEFAULT_ENVIRONMENT,
    incidentModeActive: resolvedIncidentMode,
    isOffHours: resolvedOffHours,
    tenantId: partial.tenantId ?? DEFAULT_TENANT_ID,
    requestId: partial.requestId ?? "",
    actionProposalId: partial.actionProposalId ?? null,
  };
};

// ==================== Audit Recording ====================

/**
 * Records assessment to audit trail (fire-and-forget, non-blocking).
 *
 * DURABILITY BOUNDARY:
 * - Assessment is considered "recorded" once this function is called
 * - Actual persistence is async and may fail
 * - Failures are LOGGED (not silent) but do not block the main flow
 * - Persistent audit failures should trigger P1 alerts in monitoring
 */
const recordAssessmentAsync = (input: RecordAssessmentInput): void => {
  const store = getRiskRulesStore();
  const { resolvedContext, action, category, summary, customRule } = input;

  // Use void to explicitly mark as fire-and-forget
  void (async () => {
    try {
      await store.recordAssessment({
        tenantId: resolvedContext.tenantId,
        actionProposalId: resolvedContext.actionProposalId ?? undefined,
        actionType: action.actionType,
        blastRadius: input.blastRadius,
        reversibility: input.reversibility,
        dataImpact: input.dataImpact,
        baseScore: input.baseScore,
        contextAdjustment: input.contextAdjustment,
        finalScore: input.finalScore,
        riskLevel: input.riskLevel,
        environment: resolvedContext.environment,
        incidentModeActive: resolvedContext.incidentModeActive,
        isOffHours: resolvedContext.isOffHours,
        matchedRuleId: customRule?.id,
        matchedRuleCategory: category,
        summary,
        requestId: resolvedContext.requestId || undefined,
      });
    } catch (error) {
      logger.error("Failed to record risk assessment audit", {
        tenantId: resolvedContext.tenantId,
        actionType: action.actionType,
        requestId: resolvedContext.requestId,
        riskLevel: input.riskLevel,
        finalScore: input.finalScore,
        error: getErrorMessage(error),
      });
    }
  })();
};

// ==================== Custom Rule Fetching ====================

/**
 * Fetches custom rules for the given context.
 */
const fetchCustomRule = async (
  resolvedCtx: ResolvedRiskContext,
  actionType: string
): Promise<CustomRiskRule | undefined> => {
  if (resolvedCtx.tenantId === DEFAULT_TENANT_ID) {
    return undefined;
  }

  const store = getRiskRulesStore();
  const customRules = await store.getCustomRules({
    tenantId: resolvedCtx.tenantId,
    actionType,
    environment: resolvedCtx.environment,
    enabledOnly: true,
  });

  return customRules[0];
};

// ==================== Risk Factor Resolution ====================

/**
 * Resolves risk factors from custom rule or base rule.
 */
const resolveRiskFactors = (
  customRule: CustomRiskRule | undefined,
  baseRule: {
    blastRadius: BlastRadius;
    reversibility: Reversibility;
    dataImpact: DataImpact;
    category: RiskRuleCategory;
  }
): { blastRadius: BlastRadius; reversibility: Reversibility; dataImpact: DataImpact } => ({
  blastRadius: customRule?.blastRadius ?? baseRule.blastRadius,
  reversibility: customRule?.reversibility ?? baseRule.reversibility,
  dataImpact: customRule?.dataImpact ?? baseRule.dataImpact,
});

// ==================== Main Assessment Function ====================

/**
 * Assesses action risk with full context awareness.
 * Considers environment, incident mode, off-hours, and custom tenant rules.
 *
 * @param action - Action proposal to assess
 * @param context - Execution context (optional)
 * @returns Complete contextual risk assessment
 */
export const assessActionRiskWithContext = async (
  action: ActionProposal,
  context: RiskAssessmentContext = {}
): Promise<ContextualActionRiskAssessment> => {
  const resolvedCtx = resolveContext(context);

  // Get base rule from hardcoded rules
  const baseRule = findRiskRule(action.actionType);

  // Fetch custom rules if tenant provided
  const customRule = await fetchCustomRule(resolvedCtx, action.actionType);

  // Resolve risk factors
  const { blastRadius, reversibility, dataImpact } = resolveRiskFactors(customRule, baseRule);
  const category = determineRuleCategory(customRule, baseRule.category);

  // Calculate scores
  const compositeScore = calculateCompositeScore(blastRadius, reversibility, dataImpact);
  const baseScore = applyScoreModifier(compositeScore, customRule?.scoreModifier);

  const { adjustment: contextAdjustment, multiplier: contextMultiplier } =
    calculateContextAdjustment(baseScore, resolvedCtx, {
      production: customRule?.productionMultiplier,
      incidentMode: customRule?.incidentModeMultiplier,
      offHours: customRule?.offHoursMultiplier,
    });

  const finalScore = Math.min(1, baseScore + contextAdjustment);
  const scorePercent = Math.round(finalScore * 100);
  const riskLevel = getRiskLevel(finalScore);

  // Determine approval requirements
  const approvalRequirements = determineApprovalRequirements(finalScore, resolvedCtx, customRule);

  // Generate summary
  const summaryInput: GenerateSummaryInput = {
    riskLevel,
    finalScore,
    blastRadius,
    reversibility,
    dataImpact,
    context: resolvedCtx,
    customRuleName: customRule?.name,
  };
  const summary = generateContextualSummary(summaryInput);

  // Record assessment for audit (non-blocking)
  recordAssessmentAsync({
    resolvedContext: resolvedCtx,
    action,
    blastRadius,
    reversibility,
    dataImpact,
    baseScore,
    contextAdjustment,
    finalScore,
    riskLevel,
    category,
    summary,
    customRule,
  });

  // Build response components
  const contextFactors = buildContextFactors({ resolvedContext: resolvedCtx, contextMultiplier });
  const appliedCustomRules = buildAppliedCustomRules({ customRule });

  return {
    blastRadius,
    reversibility,
    dataImpact,
    score: finalScore,
    scorePercent,
    riskLevel,
    summary,
    matchedRule: resolveMatchedRuleCategory(category),
    baseScore,
    contextAdjustment,
    contextMultiplier,
    context: resolvedCtx,
    contextFactors,
    appliedCustomRule: buildDeprecatedAppliedRule(customRule),
    appliedCustomRules,
    approvalRequirements,
    scoringVersion: RISK_SCORING_VERSION,
  };
};

// ==================== Block Check ====================

/**
 * Checks if action is blocked based on risk score and custom rules.
 *
 * @param assessment - Contextual risk assessment
 * @param customRule - Custom rule (if any)
 * @returns True if action should be blocked
 */
export const isActionBlocked = (
  assessment: ContextualActionRiskAssessment,
  customRule?: CustomRiskRule
): boolean => {
  const blockThreshold = customRule?.blockThreshold ?? PLATFORM_THRESHOLDS.MAX_BLOCK_THRESHOLD;
  return assessment.score >= blockThreshold;
};

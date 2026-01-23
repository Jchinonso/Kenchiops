/**
 * Action Risk Scoring Module
 *
 * Provides granular risk assessment for proposed actions beyond simple safety levels.
 * Considers blast radius, reversibility, and data impact.
 *
 * @module safety/scoring/riskScoring
 */

import type { ActionProposal } from "../../core/types.js";
import type {
  BlastRadius,
  Reversibility,
  DataImpact,
  ActionRiskScore,
  RiskAssessmentRule,
} from "../types.js";
import {
  ACTION_RISK_WEIGHTS,
  BLAST_RADIUS_SCORES,
  REVERSIBILITY_SCORES,
  DATA_IMPACT_SCORES,
  DEFAULT_ACTION_RISK,
} from "../../constants/safety.js";

/**
 * Risk assessment rules by action type category.
 */
const RISK_RULES: readonly RiskAssessmentRule[] = [
  // Notification actions - very low risk
  {
    actionTypes: new Set(["notify_team", "send_alert", "create_ticket", "post_message"]),
    blastRadius: "single_service",
    reversibility: "instant",
    dataImpact: "none",
  },
  // Read-only investigation actions
  {
    actionTypes: new Set(["view_logs", "check_status", "run_diagnostics", "fetch_metrics"]),
    blastRadius: "single_service",
    reversibility: "instant",
    dataImpact: "read_only",
  },
  // Service restart/reload - moderate risk
  {
    actionTypes: new Set(["restart_service", "reload_config", "clear_cache"]),
    blastRadius: "single_service",
    reversibility: "minutes",
    dataImpact: "none",
  },
  // Configuration changes - moderate to high risk
  {
    actionTypes: new Set([
      "add_environment_variable",
      "update_config",
      "modify_secrets",
      "update_permissions",
    ]),
    blastRadius: "single_service",
    reversibility: "minutes",
    dataImpact: "write",
  },
  // Deployment actions - high risk
  {
    actionTypes: new Set(["deploy", "rollback_deployment", "scale_service"]),
    blastRadius: "multiple_services",
    reversibility: "minutes",
    dataImpact: "write",
  },
  // Database actions - very high risk
  {
    actionTypes: new Set(["run_migration", "modify_database", "truncate_table"]),
    blastRadius: "multiple_services",
    reversibility: "manual_only",
    dataImpact: "destructive",
  },
  // Infrastructure actions - critical risk
  {
    actionTypes: new Set([
      "modify_infrastructure",
      "update_dns",
      "modify_network",
      "delete_resource",
    ]),
    blastRadius: "infrastructure",
    reversibility: "manual_only",
    dataImpact: "destructive",
  },
] as const;

// ==================== Core Functions ====================

/**
 * Finds the matching risk rule for an action type.
 *
 * @param actionType - The action type to look up
 * @returns Matching rule or undefined
 */
const findRiskRule = (actionType: string): RiskAssessmentRule | undefined => {
  const normalized = actionType.toLowerCase();
  return RISK_RULES.find((rule) => rule.actionTypes.has(normalized));
};

/**
 * Calculates composite risk score from individual factors.
 *
 * @param blastRadius - Blast radius level
 * @param reversibility - Reversibility level
 * @param dataImpact - Data impact level
 * @returns Composite score (0-1)
 */
const calculateCompositeScore = (
  blastRadius: BlastRadius,
  reversibility: Reversibility,
  dataImpact: DataImpact
): number => {
  const blastScore = BLAST_RADIUS_SCORES[blastRadius] * ACTION_RISK_WEIGHTS.BLAST_RADIUS;
  const reverseScore = REVERSIBILITY_SCORES[reversibility] * ACTION_RISK_WEIGHTS.REVERSIBILITY;
  const dataScore = DATA_IMPACT_SCORES[dataImpact] * ACTION_RISK_WEIGHTS.DATA_IMPACT;

  return Math.min(1, blastScore + reverseScore + dataScore);
};

/**
 * Generates human-readable risk summary.
 *
 * @param score - Composite risk score
 * @param blastRadius - Blast radius level
 * @param reversibility - Reversibility level
 * @param dataImpact - Data impact level
 * @returns Summary string
 */
const generateSummary = (
  score: number,
  blastRadius: BlastRadius,
  reversibility: Reversibility,
  dataImpact: DataImpact
): string => {
  const riskLevel =
    score < 0.3 ? "Low" : score < 0.5 ? "Moderate" : score < 0.7 ? "High" : "Critical";

  const parts: string[] = [`${riskLevel} risk (${(score * 100).toFixed(0)}%)`];

  if (blastRadius === "infrastructure") {
    parts.push("affects infrastructure");
  } else if (blastRadius === "multiple_services") {
    parts.push("affects multiple services");
  }

  if (reversibility === "irreversible") {
    parts.push("irreversible");
  } else if (reversibility === "manual_only") {
    parts.push("requires manual rollback");
  }

  if (dataImpact === "destructive") {
    parts.push("destructive data impact");
  }

  return parts.join(", ");
};

// ==================== Types ====================

/**
 * Risk score constants structure.
 */
export interface RiskScoreConstants {
  readonly weights: typeof ACTION_RISK_WEIGHTS;
  readonly blastRadiusScores: typeof BLAST_RADIUS_SCORES;
  readonly reversibilityScores: typeof REVERSIBILITY_SCORES;
  readonly dataImpactScores: typeof DATA_IMPACT_SCORES;
}

// ==================== Exports ====================

/**
 * Assesses the risk of an action proposal.
 *
 * @param action - Action proposal to assess
 * @returns Complete risk assessment
 */
export const assessActionRisk = (action: ActionProposal): ActionRiskScore => {
  const rule = findRiskRule(action.actionType);

  const blastRadius = rule?.blastRadius ?? DEFAULT_ACTION_RISK.blastRadius;
  const reversibility = rule?.reversibility ?? DEFAULT_ACTION_RISK.reversibility;
  const dataImpact = rule?.dataImpact ?? DEFAULT_ACTION_RISK.dataImpact;

  const score = calculateCompositeScore(blastRadius, reversibility, dataImpact);
  const summary = generateSummary(score, blastRadius, reversibility, dataImpact);

  return {
    blastRadius,
    reversibility,
    dataImpact,
    score,
    summary,
  };
};

/**
 * Quick check if an action is high-risk (score >= 0.7).
 *
 * @param action - Action proposal to check
 * @returns True if high-risk
 */
export const isHighRiskAction = (action: ActionProposal): boolean =>
  assessActionRisk(action).score >= 0.7;

/**
 * Quick check if an action is irreversible.
 *
 * @param action - Action proposal to check
 * @returns True if irreversible
 */
export const isIrreversibleAction = (action: ActionProposal): boolean =>
  assessActionRisk(action).reversibility === "irreversible";

/**
 * Gets risk score constants for external configuration.
 */
export const getRiskScoreConstants = (): RiskScoreConstants => ({
  weights: ACTION_RISK_WEIGHTS,
  blastRadiusScores: BLAST_RADIUS_SCORES,
  reversibilityScores: REVERSIBILITY_SCORES,
  dataImpactScores: DATA_IMPACT_SCORES,
});

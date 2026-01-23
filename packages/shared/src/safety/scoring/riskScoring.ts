/**
 * Action Risk Scoring Module
 *
 * Provides granular risk assessment for proposed actions beyond simple safety levels.
 * Considers blast radius, reversibility, and data impact.
 *
 * @module safety/scoring/riskScoring
 */

import type { ActionProposal } from "../../core/types.js";

// ==================== Types ====================

/**
 * Blast radius of an action - how many systems/services are affected.
 */
export type BlastRadius = "single_service" | "multiple_services" | "infrastructure";

/**
 * How easily an action can be reversed.
 */
export type Reversibility = "instant" | "minutes" | "manual_only" | "irreversible";

/**
 * Impact on data.
 */
export type DataImpact = "none" | "read_only" | "write" | "destructive";

/**
 * Complete risk assessment for an action.
 */
export interface ActionRiskScore {
  /** How many systems are affected */
  readonly blastRadius: BlastRadius;
  /** How easily the action can be undone */
  readonly reversibility: Reversibility;
  /** Impact on data */
  readonly dataImpact: DataImpact;
  /** Composite risk score (0-1, higher = more risky) */
  readonly score: number;
  /** Human-readable risk summary */
  readonly summary: string;
}

/**
 * Configuration for risk assessment rules.
 */
export interface RiskAssessmentRule {
  /** Action types that match this rule */
  readonly actionTypes: ReadonlySet<string>;
  /** Default blast radius for these actions */
  readonly blastRadius: BlastRadius;
  /** Default reversibility for these actions */
  readonly reversibility: Reversibility;
  /** Default data impact for these actions */
  readonly dataImpact: DataImpact;
}

// ==================== Constants ====================

/**
 * Weight factors for composite score calculation.
 */
const RISK_WEIGHTS = {
  BLAST_RADIUS: 0.35,
  REVERSIBILITY: 0.4,
  DATA_IMPACT: 0.25,
} as const;

/**
 * Numeric scores for blast radius levels.
 */
const BLAST_RADIUS_SCORES: Readonly<Record<BlastRadius, number>> = {
  single_service: 0.2,
  multiple_services: 0.6,
  infrastructure: 1.0,
} as const;

/**
 * Numeric scores for reversibility levels.
 */
const REVERSIBILITY_SCORES: Readonly<Record<Reversibility, number>> = {
  instant: 0.1,
  minutes: 0.4,
  manual_only: 0.7,
  irreversible: 1.0,
} as const;

/**
 * Numeric scores for data impact levels.
 */
const DATA_IMPACT_SCORES: Readonly<Record<DataImpact, number>> = {
  none: 0.0,
  read_only: 0.2,
  write: 0.6,
  destructive: 1.0,
} as const;

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

/**
 * Default risk assessment for unknown action types.
 */
const DEFAULT_RISK: Omit<ActionRiskScore, "score" | "summary"> = {
  blastRadius: "single_service",
  reversibility: "minutes",
  dataImpact: "write",
} as const;

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
  const blastScore = BLAST_RADIUS_SCORES[blastRadius] * RISK_WEIGHTS.BLAST_RADIUS;
  const reverseScore = REVERSIBILITY_SCORES[reversibility] * RISK_WEIGHTS.REVERSIBILITY;
  const dataScore = DATA_IMPACT_SCORES[dataImpact] * RISK_WEIGHTS.DATA_IMPACT;

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

// ==================== Exports ====================

/**
 * Assesses the risk of an action proposal.
 *
 * @param action - Action proposal to assess
 * @returns Complete risk assessment
 */
export const assessActionRisk = (action: ActionProposal): ActionRiskScore => {
  const rule = findRiskRule(action.actionType);

  const blastRadius = rule?.blastRadius ?? DEFAULT_RISK.blastRadius;
  const reversibility = rule?.reversibility ?? DEFAULT_RISK.reversibility;
  const dataImpact = rule?.dataImpact ?? DEFAULT_RISK.dataImpact;

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
 * Risk score constants structure.
 */
export interface RiskScoreConstants {
  readonly weights: typeof RISK_WEIGHTS;
  readonly blastRadiusScores: typeof BLAST_RADIUS_SCORES;
  readonly reversibilityScores: typeof REVERSIBILITY_SCORES;
  readonly dataImpactScores: typeof DATA_IMPACT_SCORES;
}

/**
 * Gets risk score constants for external configuration.
 */
export const getRiskScoreConstants = (): RiskScoreConstants => ({
  weights: RISK_WEIGHTS,
  blastRadiusScores: BLAST_RADIUS_SCORES,
  reversibilityScores: REVERSIBILITY_SCORES,
  dataImpactScores: DATA_IMPACT_SCORES,
});

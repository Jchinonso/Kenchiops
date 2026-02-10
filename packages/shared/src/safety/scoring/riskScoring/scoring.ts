/**
 * Risk scoring calculation and helpers.
 *
 * @module safety/scoring/riskScoring/scoring
 */

import type { ActionProposal } from "../../../core/types.js";
import type { BlastRadius, Reversibility, DataImpact } from "../../types.js";
import type { ActionRiskAssessment, RiskScoreConstants, RiskLevelRule } from "./types.js";
import {
  ACTION_RISK_WEIGHTS,
  BLAST_RADIUS_SCORES,
  REVERSIBILITY_SCORES,
  DATA_IMPACT_SCORES,
  RISK_LEVEL_THRESHOLDS,
  type RiskLevel,
} from "../../../constants/safety.js";

// Import validation to ensure config is validated at module load
import "./validation.js";

import { findRiskRule } from "./rules.js";

// ==================== Risk Level Calculation ====================

/**
 * Risk level thresholds in descending order. First match wins.
 */
const RISK_LEVEL_RULES: readonly RiskLevelRule[] = [
  { minScore: RISK_LEVEL_THRESHOLDS.HIGH, level: "critical" },
  { minScore: RISK_LEVEL_THRESHOLDS.MODERATE, level: "high" },
  { minScore: RISK_LEVEL_THRESHOLDS.LOW, level: "moderate" },
  { minScore: 0, level: "low" },
];

/**
 * Determines risk level from composite score.
 */
const getRiskLevel = (score: number): RiskLevel => {
  const match = RISK_LEVEL_RULES.find((rule) => score >= rule.minScore);
  return match?.level ?? "low";
};

// ==================== Score Calculation ====================

/**
 * Calculates composite risk score from individual factors.
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

// ==================== Summary Generation ====================

/** Blast radius descriptions */
const BLAST_RADIUS_LABELS: Partial<Record<BlastRadius, string>> = {
  infrastructure: "affects infrastructure",
  multiple_services: "affects multiple services",
};

/** Reversibility descriptions (hard to undo cases) */
const REVERSIBILITY_LABELS: Partial<Record<Reversibility, string>> = {
  irreversible: "irreversible",
  manual_only: "requires manual rollback",
};

/** Data impact descriptions */
const DATA_IMPACT_LABELS: Partial<Record<DataImpact, string>> = {
  destructive: "destructive data impact",
};

/**
 * Generates human-readable risk summary.
 */
const generateSummary = (
  riskLevel: RiskLevel,
  score: number,
  blastRadius: BlastRadius,
  reversibility: Reversibility,
  dataImpact: DataImpact
): string => {
  const levelLabel = riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1);
  const header = `${levelLabel} risk (${(score * 100).toFixed(0)}%)`;

  const details = [
    BLAST_RADIUS_LABELS[blastRadius],
    REVERSIBILITY_LABELS[reversibility],
    DATA_IMPACT_LABELS[dataImpact],
  ].filter(Boolean);

  return [header, ...details].join(", ");
};

// ==================== Main Assessment Function ====================

/**
 * Assesses the risk of an action proposal.
 *
 * @param action - Action proposal to assess
 * @returns Complete risk assessment with matched rule
 */
export const assessActionRisk = (action: ActionProposal): ActionRiskAssessment => {
  const { blastRadius, reversibility, dataImpact, category } = findRiskRule(action.actionType);

  const score = calculateCompositeScore(blastRadius, reversibility, dataImpact);
  const riskLevel = getRiskLevel(score);
  const summary = generateSummary(riskLevel, score, blastRadius, reversibility, dataImpact);

  return {
    blastRadius,
    reversibility,
    dataImpact,
    score,
    riskLevel,
    summary,
    matchedRule: category,
  };
};

// ==================== Helper Functions ====================

/**
 * Quick check if a risk assessment is high-risk (score >= HIGH threshold).
 * Accepts pre-computed assessment to avoid redundant calculation.
 *
 * @param risk - Pre-computed risk assessment
 * @returns True if high-risk
 */
export const isHighRisk = (risk: ActionRiskAssessment): boolean =>
  risk.score >= RISK_LEVEL_THRESHOLDS.HIGH;

/**
 * Quick check if an action is high-risk.
 * Computes risk assessment internally.
 *
 * @param action - Action proposal to check
 * @returns True if high-risk
 */
export const isHighRiskAction = (action: ActionProposal): boolean =>
  isHighRisk(assessActionRisk(action));

/** Reversibility values that require manual rollback */
const MANUAL_ROLLBACK_REVERSIBILITIES: ReadonlySet<Reversibility> = new Set([
  "manual_only",
  "irreversible",
]);

/**
 * Quick check if a risk assessment requires manual rollback.
 * Checks for manual_only OR irreversible reversibility.
 *
 * @param risk - Pre-computed risk assessment
 * @returns True if requires manual rollback
 */
export const requiresManualRollback = (risk: ActionRiskAssessment): boolean =>
  MANUAL_ROLLBACK_REVERSIBILITIES.has(risk.reversibility);

/**
 * Quick check if an action requires manual rollback.
 * Computes risk assessment internally.
 *
 * @param action - Action proposal to check
 * @returns True if requires manual rollback
 */
export const actionRequiresManualRollback = (action: ActionProposal): boolean =>
  requiresManualRollback(assessActionRisk(action));

/**
 * @deprecated Use actionRequiresManualRollback instead.
 * Kept for backward compatibility.
 */
export const isIrreversibleAction = (action: ActionProposal): boolean =>
  actionRequiresManualRollback(action);

// ==================== Constants Export ====================

/**
 * Gets risk score constants for external inspection/configuration.
 */
export const getRiskScoreConstants = (): RiskScoreConstants => ({
  weights: ACTION_RISK_WEIGHTS,
  blastRadiusScores: BLAST_RADIUS_SCORES,
  reversibilityScores: REVERSIBILITY_SCORES,
  dataImpactScores: DATA_IMPACT_SCORES,
  riskLevelThresholds: RISK_LEVEL_THRESHOLDS,
});

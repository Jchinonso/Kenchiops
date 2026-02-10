/**
 * Module initialization validation for risk scoring.
 * Validates all config constants at module load to catch programmer bugs early.
 *
 * @module safety/scoring/riskScoring/validation
 */

import {
  ACTION_RISK_WEIGHTS,
  BLAST_RADIUS_SCORES,
  REVERSIBILITY_SCORES,
  DATA_IMPACT_SCORES,
  DEFAULT_ACTION_RISK,
  RISK_LEVEL_THRESHOLDS,
} from "../../../constants/safety.js";
import { invariant } from "../../../core/errors.js";

// ==================== Weight Validation ====================

const WEIGHT_KEYS = ["BLAST_RADIUS", "REVERSIBILITY", "DATA_IMPACT"] as const;

for (const key of WEIGHT_KEYS) {
  const weight = ACTION_RISK_WEIGHTS[key];
  invariant(
    Number.isFinite(weight) && weight >= 0,
    `ACTION_RISK_WEIGHTS.${key} must be finite and >= 0, got: ${weight}`
  );
}

// Validate weights sum to 1 (with small epsilon for floating point)
const weightSum = WEIGHT_KEYS.reduce((sum, key) => sum + ACTION_RISK_WEIGHTS[key], 0);
invariant(Math.abs(weightSum - 1) < 0.001, `ACTION_RISK_WEIGHTS must sum to 1, got: ${weightSum}`);

// ==================== Score Map Validation ====================

const validateScoreMap = (map: Record<string, number>, name: string, allowZero = true): void => {
  for (const [key, score] of Object.entries(map)) {
    invariant(Number.isFinite(score), `${name}.${key} must be finite, got: ${score}`);
    invariant(score >= 0 && score <= 1, `${name}.${key} must be in [0,1], got: ${score}`);
    if (!allowZero) {
      invariant(score > 0, `${name}.${key} must be > 0, got: ${score}`);
    }
  }
};

validateScoreMap(BLAST_RADIUS_SCORES, "BLAST_RADIUS_SCORES");
validateScoreMap(REVERSIBILITY_SCORES, "REVERSIBILITY_SCORES");
validateScoreMap(DATA_IMPACT_SCORES, "DATA_IMPACT_SCORES");

// ==================== Default Risk Validation ====================

invariant(
  DEFAULT_ACTION_RISK.blastRadius in BLAST_RADIUS_SCORES,
  `DEFAULT_ACTION_RISK.blastRadius "${DEFAULT_ACTION_RISK.blastRadius}" not in BLAST_RADIUS_SCORES`
);

invariant(
  DEFAULT_ACTION_RISK.reversibility in REVERSIBILITY_SCORES,
  `DEFAULT_ACTION_RISK.reversibility "${DEFAULT_ACTION_RISK.reversibility}" not in REVERSIBILITY_SCORES`
);

invariant(
  DEFAULT_ACTION_RISK.dataImpact in DATA_IMPACT_SCORES,
  `DEFAULT_ACTION_RISK.dataImpact "${DEFAULT_ACTION_RISK.dataImpact}" not in DATA_IMPACT_SCORES`
);

// ==================== Threshold Validation ====================

invariant(
  RISK_LEVEL_THRESHOLDS.LOW > 0 && RISK_LEVEL_THRESHOLDS.LOW < 1,
  `RISK_LEVEL_THRESHOLDS.LOW must be in (0,1), got: ${RISK_LEVEL_THRESHOLDS.LOW}`
);

invariant(
  RISK_LEVEL_THRESHOLDS.MODERATE > RISK_LEVEL_THRESHOLDS.LOW && RISK_LEVEL_THRESHOLDS.MODERATE < 1,
  `RISK_LEVEL_THRESHOLDS.MODERATE must be > LOW and < 1, got: ${RISK_LEVEL_THRESHOLDS.MODERATE}`
);

invariant(
  RISK_LEVEL_THRESHOLDS.HIGH > RISK_LEVEL_THRESHOLDS.MODERATE && RISK_LEVEL_THRESHOLDS.HIGH <= 1,
  `RISK_LEVEL_THRESHOLDS.HIGH must be > MODERATE and <= 1, got: ${RISK_LEVEL_THRESHOLDS.HIGH}`
);

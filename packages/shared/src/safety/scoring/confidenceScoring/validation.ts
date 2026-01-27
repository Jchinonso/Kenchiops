/**
 * Module initialization validation for confidence scoring.
 * Validates all config constants at module load to catch programmer bugs early.
 *
 * @module safety/scoring/confidenceScoring/validation
 */

import {
  FACTOR_BOUNDS,
  FACTOR_WEIGHTS,
  TEXT_LIMITS,
  EMPTY_ANALYSIS_MAX_SCORE,
  MAX_WEIGHTED_ADJUSTMENT,
  LOG_VALUE_MAX_LENGTH,
} from "../../../constants/index.js";
import { invariant } from "../../../core/errors.js";

// ==================== Factor Weights Validation ====================

for (const [name, weight] of Object.entries(FACTOR_WEIGHTS)) {
  invariant(
    Number.isFinite(weight) && weight >= 0 && weight <= 1,
    `FACTOR_WEIGHTS.${name} must be in [0,1], got: ${weight}`
  );
}

// ==================== Factor Bounds Validation ====================

for (const [name, bounds] of Object.entries(FACTOR_BOUNDS)) {
  invariant(
    Number.isFinite(bounds.min) && Number.isFinite(bounds.max),
    `FACTOR_BOUNDS.${name} must have finite min/max`
  );
  invariant(bounds.min <= bounds.max, `FACTOR_BOUNDS.${name}.min must be <= max`);
}

// ==================== Key Alignment Validation ====================

const boundsKeys = new Set(Object.keys(FACTOR_BOUNDS));
const weightsKeys = new Set(Object.keys(FACTOR_WEIGHTS));

for (const key of boundsKeys) {
  invariant(weightsKeys.has(key), `FACTOR_BOUNDS has key "${key}" missing from FACTOR_WEIGHTS`);
}
for (const key of weightsKeys) {
  invariant(boundsKeys.has(key), `FACTOR_WEIGHTS has key "${key}" missing from FACTOR_BOUNDS`);
}

// ==================== Other Constants Validation ====================

invariant(
  MAX_WEIGHTED_ADJUSTMENT.min <= MAX_WEIGHTED_ADJUSTMENT.max,
  "MAX_WEIGHTED_ADJUSTMENT.min must be <= max"
);

invariant(
  TEXT_LIMITS.MAX_ANALYSIS_TEXT_LENGTH > 0,
  `TEXT_LIMITS.MAX_ANALYSIS_TEXT_LENGTH must be positive, got: ${TEXT_LIMITS.MAX_ANALYSIS_TEXT_LENGTH}`
);

invariant(
  EMPTY_ANALYSIS_MAX_SCORE >= 0 && EMPTY_ANALYSIS_MAX_SCORE <= 1,
  `EMPTY_ANALYSIS_MAX_SCORE must be in [0,1], got: ${EMPTY_ANALYSIS_MAX_SCORE}`
);

invariant(LOG_VALUE_MAX_LENGTH >= 16, `LOG_VALUE_MAX_LENGTH too small: ${LOG_VALUE_MAX_LENGTH}`);

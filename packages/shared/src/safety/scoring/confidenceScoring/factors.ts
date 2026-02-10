/**
 * Factor processing functions for confidence scoring.
 * Handles bounding, weighting, and summing of factor contributions.
 *
 * @module safety/scoring/confidenceScoring/factors
 */

import type { RawFactors, BoundedFactors, WeightedFactors } from "../../types.js";
import { FACTOR_BOUNDS, FACTOR_WEIGHTS } from "../../../constants/index.js";
import { clamp } from "./helpers.js";

// ==================== Factor Bounding ====================

/**
 * Clamps all factor contributions to their defined bounds.
 * Prevents any single buggy factor from dominating the final score.
 * Also handles NaN/Infinity from factor functions.
 */
export const boundFactors = (raw: RawFactors): BoundedFactors => ({
  uncertainty: clamp(raw.uncertainty, FACTOR_BOUNDS.uncertainty.min, FACTOR_BOUNDS.uncertainty.max),
  evidenceAlignment: clamp(
    raw.evidenceAlignment,
    FACTOR_BOUNDS.evidenceAlignment.min,
    FACTOR_BOUNDS.evidenceAlignment.max
  ),
  completeness: clamp(
    raw.completeness,
    FACTOR_BOUNDS.completeness.min,
    FACTOR_BOUNDS.completeness.max
  ),
  knowledgeBaseValidation: clamp(
    raw.knowledgeBaseValidation,
    FACTOR_BOUNDS.knowledgeBaseValidation.min,
    FACTOR_BOUNDS.knowledgeBaseValidation.max
  ),
  consistency: clamp(raw.consistency, FACTOR_BOUNDS.consistency.min, FACTOR_BOUNDS.consistency.max),
});

// ==================== Factor Weighting ====================

/**
 * Applies weights to bounded factor values.
 * Returns individual weighted contributions.
 */
export const computeWeightedFactors = (bounded: BoundedFactors): WeightedFactors => ({
  uncertainty: bounded.uncertainty * FACTOR_WEIGHTS.uncertainty,
  evidenceAlignment: bounded.evidenceAlignment * FACTOR_WEIGHTS.evidenceAlignment,
  completeness: bounded.completeness * FACTOR_WEIGHTS.completeness,
  knowledgeBaseValidation: bounded.knowledgeBaseValidation * FACTOR_WEIGHTS.knowledgeBaseValidation,
  consistency: bounded.consistency * FACTOR_WEIGHTS.consistency,
});

// ==================== Factor Summation ====================

/**
 * Sums weighted factor contributions.
 */
export const sumWeightedFactors = (weighted: WeightedFactors): number =>
  weighted.uncertainty +
  weighted.evidenceAlignment +
  weighted.completeness +
  weighted.knowledgeBaseValidation +
  weighted.consistency;

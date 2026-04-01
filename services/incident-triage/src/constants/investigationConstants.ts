/**
 * Investigation Constants
 *
 * Re-exports investigation pipeline constants from @kenchi/shared.
 * The canonical definitions live in packages/shared/src/investigation/constants.ts.
 *
 * INVESTIGATION_DEFAULTS is an alias for INVESTIGATION_PIPELINE_DEFAULTS
 * to maintain backward compatibility with existing local importers.
 *
 * @module constants/investigationConstants
 */

import {
  INVESTIGATION_PIPELINE_DEFAULTS,
  INVESTIGATION_RELEVANCE,
  INVESTIGATION_PATTERN_THRESHOLDS,
  VALID_SYMPTOMS,
  FALLBACK_ACTIONS_BY_SYMPTOM,
  FALLBACK_DIAGNOSIS_CONFIDENCE,
  COMMON_FACTOR_CONFIG,
} from "@kenchi/shared";

/** Alias for backward compatibility — canonical name is INVESTIGATION_PIPELINE_DEFAULTS. */
export const INVESTIGATION_DEFAULTS = INVESTIGATION_PIPELINE_DEFAULTS;

export {
  INVESTIGATION_RELEVANCE,
  INVESTIGATION_PATTERN_THRESHOLDS,
  VALID_SYMPTOMS,
  FALLBACK_ACTIONS_BY_SYMPTOM,
  FALLBACK_DIAGNOSIS_CONFIDENCE,
  COMMON_FACTOR_CONFIG,
};

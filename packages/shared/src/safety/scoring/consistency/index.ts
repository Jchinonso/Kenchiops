/**
 * Consistency checking module for confidence scoring.
 * Ensures recommended actions address the identified root cause.
 *
 * Design principles:
 * - Deterministic, no ML - uses keyword matching with rules table
 * - Word-boundary-safe - tokenizes text to avoid substring false positives
 * - Normalize once - text normalization happens at entry point
 * - Clear branching - explicit if/else over handler patterns
 * - Penalize incomplete data - missing cause/actions reduces confidence
 * - Penalize shotgun lists - many irrelevant actions reduces confidence
 * - Keywords must be single tokens (validated at module init)
 *
 * @module safety/scoring/consistency
 */

// Type exports
export type { ConsistencyDecision, AdjustmentResult, DecisionRule } from "./types.js";

// Main consistency functions
export { evaluateConsistency, checkConsistency } from "./consistency.js";

// Adjustment determination (for testing)
export { determineAdjustment, isShotgunApproach } from "./adjustment.js";

// Relevance calculation (for testing)
export {
  calculateRelevance,
  isActionRelevant,
  isGenericRemediation,
  NORMALIZED_RULES,
  NORMALIZED_GENERIC_KEYWORDS,
} from "./relevance.js";

// Helpers (for testing)
export { isSingleToken, normalizeAndValidateKeyword } from "./helpers.js";

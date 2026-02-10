/**
 * Type definitions for consistency checking.
 *
 * @module safety/scoring/consistency/types
 */

import type { RelevanceResult, ConsistencyEvaluation } from "../../types.js";

// ==================== Adjustment Types ====================

/**
 * Decision branch names for debugging/testing.
 */
export type ConsistencyDecision = ConsistencyEvaluation["decision"];

/**
 * Result of adjustment determination with decision branch name.
 */
export interface AdjustmentResult {
  readonly adjustment: number;
  readonly decision: ConsistencyDecision;
}

/**
 * Decision rule for consistency adjustment.
 * Rules are evaluated in order; first match wins.
 */
export interface DecisionRule {
  readonly matches: (relevance: RelevanceResult) => boolean;
  readonly adjustment: number;
  readonly decision: ConsistencyDecision;
}

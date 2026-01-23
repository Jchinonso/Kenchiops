/**
 * Safety Module Types
 *
 * Type definitions for AI/LLM output validation and confidence scoring.
 *
 * @module safety/types
 */

// ==================== Gating Types ====================

/**
 * Gating decision for action execution.
 * - "auto_approve": High confidence + safe action, execute automatically
 * - "require_approval": Needs human review before execution
 * - "block": Too risky or low confidence, do not execute
 */
// ==================== Re-exports from Constants ====================
// Import actual types from constants to ensure alignment

import type { ConfidenceRange } from "../constants/index.js";

export type GatingDecision = "auto_approve" | "require_approval" | "block";

/**
 * Result of action gating evaluation.
 *
 * Semantic states:
 * - block:            requiresApproval=false, canExecute=false
 * - require_approval: requiresApproval=true,  canExecute=true
 * - auto_approve:     requiresApproval=false, canExecute=true
 */
export interface ActionGatingResult {
  /**
   * Whether human approval is required before execution.
   * False when blocked (approval can't help) or auto-approved.
   */
  readonly requiresApproval: boolean;
  /**
   * Whether the action is permitted to execute at all.
   * False only when blocked due to very low confidence or invalid action.
   */
  readonly canExecute: boolean;
  /** Human-readable explanation of the gating decision */
  readonly message: string;
}

// ==================== Validation Check Types ====================

/**
 * Alignment check configuration for evidence validation.
 */
export interface AlignmentCheck {
  /** Condition function that checks alignment */
  readonly condition: (analysis: LLMAnalysisLike, evidence: EvidenceLike) => boolean;
  /** Score adjustment when condition is met */
  readonly adjustment: number;
}

/**
 * Completeness check configuration for analysis validation.
 */
export interface CompletenessCheck {
  /** Condition function that checks completeness */
  readonly condition: (analysis: LLMAnalysisLike) => boolean;
  /** Score adjustment when condition is met */
  readonly adjustment: number;
}

/**
 * Threshold entry for confidence range lookup.
 */
export interface ThresholdEntry {
  /** Score threshold value */
  readonly threshold: number;
  /** Confidence range category */
  readonly range: ConfidenceRange;
}

// ==================== Minimal Type Interfaces ====================
// These allow the safety module to work with partial data

/**
 * Minimal LLM analysis interface for safety checks.
 * Allows checking incomplete or partial analysis results.
 */
export interface LLMAnalysisLike {
  readonly confidence?: string;
  readonly summary?: string;
  readonly reasoning?: string;
  readonly identifiedCause?: string;
  readonly impactAssessment?: unknown;
  readonly uncertainties?: readonly string[];
  readonly relatedIncidents?: readonly string[];
  readonly recommendedActions?: ReadonlyArray<{
    readonly description: string;
    readonly actionType: string;
  }>;
}

/**
 * Minimal evidence interface for safety checks.
 */
export interface EvidenceLike {
  readonly eventId: string;
  readonly collectedAt?: string;
  readonly logs?: ReadonlyArray<{ readonly message: string }>;
  readonly gitHistory?: ReadonlyArray<{ readonly sha: string }>;
  readonly metrics?: { readonly summary?: unknown };
  readonly relatedDocs?: ReadonlyArray<{
    readonly id: string;
    readonly type: string;
    readonly similarity: number;
  }>;
}
export type { ConfidenceRange };

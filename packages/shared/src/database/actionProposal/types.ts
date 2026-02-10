/**
 * Action Proposal Types
 *
 * Type definitions for action proposal status tracking.
 *
 * @module database/actionProposal/types
 */

// ==================== Status Types ====================

/**
 * Action proposal status values.
 */
export type ActionProposalStatus = "proposed" | "approved" | "rejected" | "executed" | "failed";

// ==================== Input Types ====================

/**
 * Input for updating action proposal status.
 */
export interface UpdateActionStatusInput {
  readonly actionId: string;
  readonly status: ActionProposalStatus;
  readonly approvedBy?: string;
  readonly executionResult?: Record<string, unknown>;
}

// ==================== Record Types ====================

/**
 * Action proposal record from database.
 */
export interface ActionProposalRecord {
  readonly id: string;
  readonly analysisId: string;
  readonly actionType: string;
  readonly actionPayload: Record<string, unknown>;
  readonly diagnosisConfidence: number;
  readonly actionConfidence: number;
  readonly riskFactors: Record<string, unknown>;
  readonly decision: string;
  readonly status: ActionProposalStatus;
  readonly approvedBy: string | null;
  readonly approvedAt: Date | null;
  readonly executedAt: Date | null;
  readonly executionResult: Record<string, unknown> | null;
  readonly createdAt: Date;
}

/**
 * Action approval statistics.
 */
export interface ActionApprovalStats {
  readonly total: number;
  readonly approved: number;
  readonly rejected: number;
  readonly executed: number;
  readonly failed: number;
  readonly approvalRate: number;
  readonly executionSuccessRate: number;
}

// ==================== Database Row Types ====================

/**
 * Database row type for action_proposals table.
 */
export interface ActionProposalRow {
  readonly id: string;
  readonly analysis_id: string;
  readonly action_type: string;
  readonly action_payload: Record<string, unknown>;
  readonly diagnosis_confidence: number;
  readonly action_confidence: number;
  readonly risk_factors: Record<string, unknown>;
  readonly decision: string;
  readonly status: string;
  readonly approved_by: string | null;
  readonly approved_at: Date | null;
  readonly executed_at: Date | null;
  readonly execution_result: Record<string, unknown> | null;
  readonly created_at: Date;
}

/**
 * Database row type for action approval statistics query.
 */
export interface ActionStatsRow {
  readonly total: string;
  readonly approved: string;
  readonly rejected: string;
  readonly executed: string;
  readonly failed: string;
}

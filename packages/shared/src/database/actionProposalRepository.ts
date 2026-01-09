/**
 * Action Proposal Repository
 *
 * Database operations for action proposal status tracking.
 * Supports approval/rejection persistence and execution result logging.
 *
 * @module database/actionProposalRepository
 */

import { query } from "./client.js";
import { createLogger } from "../core/logger.js";

const logger = createLogger("action-proposal-repository");

// ==================== Types ====================

/**
 * Action proposal status values.
 */
export type ActionProposalStatus = "proposed" | "approved" | "rejected" | "executed" | "failed";

/**
 * Input for updating action proposal status.
 */
export interface UpdateActionStatusInput {
  readonly actionId: string;
  readonly status: ActionProposalStatus;
  readonly approvedBy?: string;
  readonly executionResult?: Record<string, unknown>;
}

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

// ==================== Row Types ====================

interface ActionProposalRow {
  id: string;
  analysis_id: string;
  action_type: string;
  action_payload: Record<string, unknown>;
  diagnosis_confidence: number;
  action_confidence: number;
  risk_factors: Record<string, unknown>;
  decision: string;
  status: string;
  approved_by: string | null;
  approved_at: Date | null;
  executed_at: Date | null;
  execution_result: Record<string, unknown> | null;
  created_at: Date;
}

interface StatsRow {
  total: string;
  approved: string;
  rejected: string;
  executed: string;
  failed: string;
}

// ==================== SQL Queries ====================

const ACTION_QUERIES = {
  UPDATE_STATUS: `
    UPDATE action_proposals
    SET status = $2,
        approved_by = COALESCE($3, approved_by),
        approved_at = CASE WHEN $2 IN ('approved', 'rejected') THEN NOW() ELSE approved_at END,
        executed_at = CASE WHEN $2 IN ('executed', 'failed') THEN NOW() ELSE executed_at END,
        execution_result = COALESCE($4, execution_result)
    WHERE id = $1
    RETURNING *
  `,

  GET_BY_ID: `
    SELECT * FROM action_proposals WHERE id = $1
  `,

  GET_BY_ANALYSIS: `
    SELECT * FROM action_proposals
    WHERE analysis_id = $1
    ORDER BY created_at DESC
  `,

  GET_APPROVAL_STATS: `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'approved') as approved,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
      COUNT(*) FILTER (WHERE status = 'executed') as executed,
      COUNT(*) FILTER (WHERE status = 'failed') as failed
    FROM action_proposals
    WHERE created_at >= NOW() - INTERVAL '1 minute' * $1
  `,
} as const;

// ==================== Mappers ====================

const mapRowToActionProposal = (row: ActionProposalRow): ActionProposalRecord => ({
  id: row.id,
  analysisId: row.analysis_id,
  actionType: row.action_type,
  actionPayload: row.action_payload,
  diagnosisConfidence: row.diagnosis_confidence,
  actionConfidence: row.action_confidence,
  riskFactors: row.risk_factors,
  decision: row.decision,
  status: row.status as ActionProposalStatus,
  approvedBy: row.approved_by,
  approvedAt: row.approved_at,
  executedAt: row.executed_at,
  executionResult: row.execution_result,
  createdAt: row.created_at,
});

// ==================== Public API ====================

/**
 * Updates action proposal status.
 *
 * @param input - Status update data
 * @returns Updated action proposal record
 */
export const updateActionProposalStatus = async (
  input: UpdateActionStatusInput
): Promise<ActionProposalRecord | null> => {
  const executionResultJson = input.executionResult ? JSON.stringify(input.executionResult) : null;

  const result = await query<ActionProposalRow>(ACTION_QUERIES.UPDATE_STATUS, [
    input.actionId,
    input.status,
    input.approvedBy ?? null,
    executionResultJson,
  ]);

  if (result.rows.length === 0) {
    logger.warn("Action proposal not found for status update", { actionId: input.actionId });
    return null;
  }

  logger.info("Updated action proposal status", {
    actionId: input.actionId,
    status: input.status,
    approvedBy: input.approvedBy,
  });

  return mapRowToActionProposal(result.rows[0]);
};

/**
 * Gets action proposal by ID.
 *
 * @param actionId - Action proposal ID
 * @returns Action proposal record or null
 */
export const getActionProposalById = async (
  actionId: string
): Promise<ActionProposalRecord | null> => {
  const result = await query<ActionProposalRow>(ACTION_QUERIES.GET_BY_ID, [actionId]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToActionProposal(result.rows[0]);
};

/**
 * Gets all action proposals for an analysis.
 *
 * @param analysisId - Analysis ID
 * @returns Array of action proposal records
 */
export const getActionProposalsByAnalysis = async (
  analysisId: string
): Promise<readonly ActionProposalRecord[]> => {
  const result = await query<ActionProposalRow>(ACTION_QUERIES.GET_BY_ANALYSIS, [analysisId]);

  return Object.freeze(result.rows.map(mapRowToActionProposal));
};

/**
 * Gets action approval statistics for a time window.
 *
 * @param windowMinutes - Time window in minutes (default: 60)
 * @returns Action approval statistics
 */
export const getActionApprovalStats = async (
  windowMinutes: number = 60
): Promise<ActionApprovalStats> => {
  const result = await query<StatsRow>(ACTION_QUERIES.GET_APPROVAL_STATS, [windowMinutes]);

  const row = result.rows[0];
  const total = parseInt(row.total, 10);
  const approved = parseInt(row.approved, 10);
  const rejected = parseInt(row.rejected, 10);
  const executed = parseInt(row.executed, 10);
  const failed = parseInt(row.failed, 10);

  const decidedCount = approved + rejected;
  const completedCount = executed + failed;

  return {
    total,
    approved,
    rejected,
    executed,
    failed,
    approvalRate: decidedCount > 0 ? approved / decidedCount : 0,
    executionSuccessRate: completedCount > 0 ? executed / completedCount : 0,
  };
};

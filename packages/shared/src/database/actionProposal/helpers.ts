/**
 * Action Proposal Repository Helpers
 *
 * Validation functions and row mappers for action proposal operations.
 *
 * @module database/actionProposal/helpers
 */

import {
  validateId,
  ValidationError,
  PARSE_INT_RADIX,
  ACTION_PROPOSAL_DEFAULTS,
  VALID_ACTION_PROPOSAL_STATUSES,
  MIN_STATS_WINDOW_MINUTES,
} from "../common.js";
import type {
  ActionProposalStatus,
  ActionProposalRecord,
  ActionApprovalStats,
  ActionProposalRow,
  ActionStatsRow,
} from "./types.js";

// ==================== Input Validation ====================

// Re-export shared validator for backwards compatibility
export { validateId };

/**
 * Validates that a status is a valid ActionProposalStatus.
 *
 * @throws ValidationError if status is invalid
 */
export const validateStatus = (status: string): void => {
  if (!VALID_ACTION_PROPOSAL_STATUSES.has(status as ActionProposalStatus)) {
    throw new ValidationError(`Invalid action proposal status: ${status}`, {
      operation: "validateStatus",
      metadata: { status, validStatuses: [...VALID_ACTION_PROPOSAL_STATUSES] },
    });
  }
};

/**
 * Validates that window minutes is a positive number.
 *
 * @throws ValidationError if windowMinutes is not positive
 */
export const validateWindowMinutes = (windowMinutes: number): void => {
  if (!Number.isFinite(windowMinutes) || windowMinutes < MIN_STATS_WINDOW_MINUTES) {
    throw new ValidationError(`Window minutes must be at least ${MIN_STATS_WINDOW_MINUTES}`, {
      operation: "validateWindowMinutes",
      metadata: { windowMinutes, minimum: MIN_STATS_WINDOW_MINUTES },
    });
  }
};

// ==================== Helpers ====================

/**
 * Calculates a safe division rate, returning default when denominator is zero.
 */
export const calculateRate = (numerator: number, denominator: number): number =>
  denominator > 0 ? numerator / denominator : ACTION_PROPOSAL_DEFAULTS.DEFAULT_RATE;

/**
 * Serializes execution result to JSON string for database storage.
 */
export const serializeExecutionResult = (
  executionResult: Record<string, unknown> | undefined
): string | null => (executionResult === undefined ? null : JSON.stringify(executionResult));

/**
 * Extracts first row from query result, returning null if empty.
 */
export const extractFirstRow = <TRow, TRecord>(
  rows: readonly TRow[],
  mapper: (row: TRow) => TRecord
): TRecord | null => (rows.length > 0 ? mapper(rows[0]) : null);

// ==================== Row Mappers ====================

/**
 * Maps database row to ActionProposalRecord.
 *
 * @param row - Database row from action_proposals table
 * @returns ActionProposalRecord domain object
 */
export const mapRowToActionProposal = (row: ActionProposalRow): ActionProposalRecord => ({
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

/**
 * Maps stats row to ActionApprovalStats with calculated rates.
 *
 * @param row - Database row from approval stats query
 * @returns ActionApprovalStats with calculated approval and execution rates
 */
export const mapRowToApprovalStats = (row: ActionStatsRow): ActionApprovalStats => {
  const total = parseInt(row.total, PARSE_INT_RADIX);
  const approved = parseInt(row.approved, PARSE_INT_RADIX);
  const rejected = parseInt(row.rejected, PARSE_INT_RADIX);
  const executed = parseInt(row.executed, PARSE_INT_RADIX);
  const failed = parseInt(row.failed, PARSE_INT_RADIX);

  const decidedCount = approved + rejected;
  const completedCount = executed + failed;

  return {
    total,
    approved,
    rejected,
    executed,
    failed,
    approvalRate: calculateRate(approved, decidedCount),
    executionSuccessRate: calculateRate(executed, completedCount),
  };
};

/**
 * Action Proposal Constants
 *
 * SQL queries and configuration for action proposal operations.
 *
 * @module constants/actionProposal
 */

import type { ActionProposalStatus } from "../database/actionProposal/types.js";

// ==================== Validation Constants ====================

/**
 * Valid action proposal status values for input validation.
 */
export const VALID_ACTION_PROPOSAL_STATUSES: ReadonlySet<ActionProposalStatus> = new Set([
  "proposed",
  "approved",
  "rejected",
  "executed",
  "failed",
]);

/**
 * Minimum valid window for statistics queries.
 */
export const MIN_STATS_WINDOW_MINUTES = 1;

// ==================== Default Values ====================

/**
 * Default configuration for action proposal operations.
 */
export const ACTION_PROPOSAL_DEFAULTS = {
  /** Default time window for statistics in minutes. */
  STATS_WINDOW_MINUTES: 60,
  /** Default rate when no decisions have been made. */
  DEFAULT_RATE: 0,
} as const;

// ==================== SQL Queries ====================

/**
 * SQL query templates for action proposal operations.
 */
export const ACTION_PROPOSAL_QUERIES = {
  UPDATE_STATUS: `
    UPDATE action_proposals
    SET status = $2,
        approved_by = COALESCE($3, approved_by),
        approved_at = CASE WHEN $2 IN ('approved', 'rejected') THEN NOW() ELSE approved_at END,
        executed_at = CASE WHEN $2 IN ('executed', 'failed') THEN NOW() ELSE executed_at END,
        execution_result = COALESCE($4, execution_result)
    WHERE id = $1 AND analysis_id IN (SELECT id FROM analyses WHERE tenant_id = $5)
    RETURNING *
  `,

  GET_BY_ID: `
    SELECT * FROM action_proposals WHERE id = $1 AND analysis_id IN (SELECT id FROM analyses WHERE tenant_id = $2)
  `,

  GET_BY_ANALYSIS: `
    SELECT * FROM action_proposals
    WHERE analysis_id = $1 AND analysis_id IN (SELECT id FROM analyses WHERE tenant_id = $2)
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

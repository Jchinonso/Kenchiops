/**
 * Action Proposal Repository
 *
 * Database operations for action proposal status tracking.
 * Supports approval/rejection persistence and execution result logging.
 *
 * @module database/actionProposal/repository
 */

import {
  query,
  createLogger,
  getErrorMessage,
  ACTION_PROPOSAL_DEFAULTS,
  ACTION_PROPOSAL_QUERIES,
} from "../common.js";
import type {
  UpdateActionStatusInput,
  ActionProposalRecord,
  ActionApprovalStats,
  ActionProposalRow,
  ActionStatsRow,
} from "./types.js";
import {
  validateId,
  validateStatus,
  validateWindowMinutes,
  serializeExecutionResult,
  extractFirstRow,
  mapRowToActionProposal,
  mapRowToApprovalStats,
} from "./helpers.js";

const logger = createLogger("action-proposal-repository");

// ==================== Public API ====================

/**
 * Updates action proposal status.
 *
 * @param input - Status update data
 * @returns Updated action proposal record or null if not found
 * @throws ValidationError if input validation fails
 * @throws Error if database operation fails
 */
export const updateActionProposalStatus = async (
  input: UpdateActionStatusInput
): Promise<ActionProposalRecord | null> => {
  validateId(input.actionId, "actionId");
  validateStatus(input.status);

  try {
    const executionResultJson = serializeExecutionResult(input.executionResult);

    const result = await query<ActionProposalRow>(ACTION_PROPOSAL_QUERIES.UPDATE_STATUS, [
      input.actionId,
      input.status,
      input.approvedBy ?? null,
      executionResultJson,
      input.tenantId,
    ]);

    const record = extractFirstRow(result.rows, mapRowToActionProposal);

    if (record === null) {
      logger.warn("Action proposal not found for status update", { actionId: input.actionId });
      return null;
    }

    logger.info("Updated action proposal status", {
      actionId: input.actionId,
      status: input.status,
      approvedBy: input.approvedBy,
    });

    return record;
  } catch (error) {
    logger.error("Failed to update action proposal status", {
      actionId: input.actionId,
      status: input.status,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets action proposal by ID.
 *
 * @param actionId - Action proposal ID
 * @returns Action proposal record or null if not found
 * @throws ValidationError if actionId is empty
 * @throws Error if database operation fails
 */
export const getActionProposalById = async (
  actionId: string,
  tenantId: string
): Promise<ActionProposalRecord | null> => {
  validateId(actionId, "actionId");
  validateId(tenantId, "tenantId");

  try {
    const result = await query<ActionProposalRow>(ACTION_PROPOSAL_QUERIES.GET_BY_ID, [
      actionId,
      tenantId,
    ]);
    return extractFirstRow(result.rows, mapRowToActionProposal);
  } catch (error) {
    logger.error("Failed to get action proposal by ID", {
      actionId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets all action proposals for an analysis.
 *
 * @param analysisId - Analysis ID
 * @returns Array of action proposal records
 * @throws ValidationError if analysisId is empty
 * @throws Error if database operation fails
 */
export const getActionProposalsByAnalysis = async (
  analysisId: string,
  tenantId: string
): Promise<readonly ActionProposalRecord[]> => {
  validateId(analysisId, "analysisId");
  validateId(tenantId, "tenantId");

  try {
    const result = await query<ActionProposalRow>(ACTION_PROPOSAL_QUERIES.GET_BY_ANALYSIS, [
      analysisId,
      tenantId,
    ]);
    return Object.freeze(result.rows.map(mapRowToActionProposal));
  } catch (error) {
    logger.error("Failed to get action proposals by analysis", {
      analysisId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets action approval statistics for a time window.
 *
 * @param windowMinutes - Time window in minutes (default: 60)
 * @returns Action approval statistics
 * @throws ValidationError if windowMinutes is not positive
 * @throws Error if database operation fails
 */
export const getActionApprovalStats = async (
  windowMinutes: number = ACTION_PROPOSAL_DEFAULTS.STATS_WINDOW_MINUTES
): Promise<ActionApprovalStats> => {
  validateWindowMinutes(windowMinutes);

  try {
    const result = await query<ActionStatsRow>(ACTION_PROPOSAL_QUERIES.GET_APPROVAL_STATS, [
      windowMinutes,
    ]);
    return mapRowToApprovalStats(result.rows[0]);
  } catch (error) {
    logger.error("Failed to get action approval stats", {
      windowMinutes,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

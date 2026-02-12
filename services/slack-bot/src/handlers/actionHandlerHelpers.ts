/**
 * Action Handler Helpers
 *
 * Helper functions for Slack action button processing.
 * Handles parsing, validation, and action execution setup.
 */

import type { ButtonAction } from "@slack/bolt";
import {
  createLogger,
  ValidationError,
  isRedisHealthy,
  updateActionProposalStatus,
  getErrorMessage,
  parseOpaqueActionValue,
  retrieveActionPayload,
  type ActionExecutionContext,
  type StoredActionPayload,
  type OpaqueActionValue,
} from "@kenchi/shared";
import { isLegacyActionValue } from "./actionHandlerTypes.js";

const logger = createLogger("slack-bot");

// ==================== Parsing Functions ====================

/**
 * Parses a JSON action value string.
 *
 * @param value - JSON string to parse
 * @returns Parsed value
 * @throws ValidationError if parsing fails
 */
export const parseActionValueJson = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new ValidationError(`Failed to parse action value: ${getErrorMessage(error)}`);
  }
};

/**
 * Parses and retrieves action payload from Slack button action.
 * Handles both new opaque ID format and legacy full payload format.
 *
 * @param action - Slack button action
 * @returns The stored action payload (retrieved from store or legacy value)
 * @throws ValidationError if action value is missing or invalid
 */
export const getActionPayload = (action: ButtonAction): StoredActionPayload => {
  if (!action.value) {
    throw new ValidationError("Action value is missing");
  }

  // let: conditionally assigned — parse attempt may fail, checked below
  let opaqueValue: OpaqueActionValue | null = null;
  try {
    opaqueValue = parseOpaqueActionValue(action.value);
  } catch (error) {
    if (!(error instanceof ValidationError)) {
      throw error;
    }
  }

  if (opaqueValue) {
    return retrieveActionPayload(opaqueValue);
  }

  const parsed = parseActionValueJson(action.value);

  // Legacy format - convert to StoredActionPayload shape
  if (isLegacyActionValue(parsed)) {
    return {
      actionType: parsed.actionType ?? "manual_investigation",
      description: parsed.description ?? "Legacy action",
      repository: parsed.repository ?? "unknown",
      commitSha: parsed.commitSha ?? "unknown",
      installationId: parsed.installationId ?? 0,
      priority: parsed.priority ?? "medium",
      checkRunId: parsed.checkRunId,
      createdAt: Date.now(),
      verificationToken: "legacy",
    };
  }

  throw new ValidationError("Unknown action value format");
};

/**
 * Extracts the opaque action ID from the action value (for cleanup).
 *
 * @param action - Slack button action
 * @returns Opaque ID if found, null otherwise
 */
export const extractOpaqueId = (action: ButtonAction): string | null => {
  if (!action.value) {
    return null;
  }
  try {
    const opaqueValue = parseOpaqueActionValue(action.value);
    return opaqueValue.id;
  } catch (error) {
    logger.debug("Failed to parse action value for opaque id", {
      error: getErrorMessage(error),
    });
    return null;
  }
};

// ==================== Context Functions ====================

/**
 * Creates execution context from stored action payload.
 *
 * @param payload - Stored action payload
 * @param approvedBy - User who approved the action
 * @returns Action execution context
 */
export const createExecutionContext = (
  payload: StoredActionPayload,
  approvedBy: string
): ActionExecutionContext => ({
  installationId: payload.installationId,
  repository: payload.repository,
  commitSha: payload.commitSha,
  checkRunId: payload.checkRunId,
  approvedBy,
  metadata: {
    priority: payload.priority,
    description: payload.description,
  },
});

// ==================== Result Formatting ====================

/**
 * Format action result message based on success/failure.
 *
 * @param success - Whether the action succeeded
 * @param actionType - Type of action executed
 * @param message - Result message
 * @returns Formatted status and text
 */
export const formatResultMessage = (
  success: boolean,
  actionType: string,
  message: string
): { status: "completed" | "failed"; text: string } => ({
  status: success ? "completed" : "failed",
  text: success
    ? `Action *${actionType}* executed successfully: ${message}`
    : `Action *${actionType}* failed: ${message}`,
});

// ==================== Infrastructure Functions ====================

/**
 * Check if async execution via Redis is available.
 *
 * @returns True if Redis is healthy and available
 */
export const canUseAsyncExecution = async (): Promise<boolean> => {
  try {
    return await isRedisHealthy();
  } catch (error) {
    logger.debug("Redis health check failed, using sync execution", {
      error: getErrorMessage(error),
    });
    return false;
  }
};

/**
 * Persists action status to database (non-blocking, logs errors).
 *
 * @param actionId - ID of the action
 * @param status - New status
 * @param approvedBy - User who approved (optional)
 * @param executionResult - Execution result data (optional)
 */
export const persistActionStatus = async (
  actionId: string,
  status: "approved" | "rejected" | "executed" | "failed",
  approvedBy?: string,
  executionResult?: Record<string, unknown>
): Promise<void> => {
  try {
    await updateActionProposalStatus({
      actionId,
      status,
      approvedBy,
      executionResult,
    });
    logger.debug("Action status persisted", { actionId, status });
  } catch (error) {
    logger.warn("Failed to persist action status", {
      actionId,
      status,
      error: getErrorMessage(error),
    });
  }
};

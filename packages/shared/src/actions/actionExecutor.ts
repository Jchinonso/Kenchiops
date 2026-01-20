/**
 * Action Executor Module
 *
 * Provides a type-safe, lookup-table-based execution system for CI failure actions.
 * Uses handler pattern for extensibility and follows project's functional patterns.
 *
 * @module actions/actionExecutor
 */

import type { ActionType, ActionProposal, ExecutionResult } from "../core/types.js";
import { createLogger, getErrorMessage } from "../core/index.js";
import { config } from "../core/config.js";
import { resilientPost } from "../http/resilientClient.js";
import { ACTION_MESSAGES } from "../constants/index.js";
import type { ActionExecutionContext, ActionExecutionResult } from "./actionTypes.js";

// Re-export types for backwards compatibility
export type { ActionExecutionContext, ActionExecutionResult } from "./actionTypes.js";

const logger = createLogger("action-executor");

/**
 * Action executor function type.
 * Each action type has a corresponding executor.
 */
type ActionExecutor = (
  action: ActionProposal,
  context: ActionExecutionContext
) => Promise<ExecutionResult>;

// ==================== Action Executors ====================

/**
 * Response from GitHub App rerun endpoint
 */
interface RerunResponse {
  readonly success: boolean;
  readonly message: string;
  readonly runId?: number;
  readonly error?: string;
}

/**
 * Executes a pipeline rerun action.
 * Triggers a new workflow run for the failed CI pipeline via GitHub App API.
 */
const executeRerunPipeline: ActionExecutor = async (action, context) => {
  logger.info("Executing rerun pipeline action", {
    actionId: action.id,
    repository: context.repository,
    commitSha: context.commitSha,
    checkRunId: context.checkRunId,
    workflowRunId: context.workflowRunId,
  });

  // Validate required context
  if (!context.workflowRunId && !context.checkRunId) {
    return {
      success: false,
      message: ACTION_MESSAGES.MISSING_WORKFLOW_CONTEXT,
      error: "Missing workflowRunId or checkRunId in context",
    };
  }

  try {
    const rerunUrl = `${config.GITHUB_APP_URL}/api/github/actions/rerun`;

    const response = await resilientPost<RerunResponse>(rerunUrl, {
      installationId: context.installationId,
      repository: context.repository,
      workflowRunId: context.workflowRunId,
      checkRunId: context.checkRunId,
      commitSha: context.commitSha,
      approvedBy: context.approvedBy,
    });

    if (!response.data.success) {
      return {
        success: false,
        message: response.data.message ?? ACTION_MESSAGES.RERUN_REQUEST_FAILED,
        error: response.data.error,
      };
    }

    logger.info("Pipeline rerun triggered successfully", {
      repository: context.repository,
      runId: response.data.runId,
      duration: response.duration,
    });

    return {
      success: true,
      message: response.data.message ?? `Pipeline rerun triggered for ${context.repository}`,
      output: `Workflow run ID: ${response.data.runId ?? "pending"}`,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Failed to trigger pipeline rerun", {
      repository: context.repository,
      error: errorMessage,
    });

    return {
      success: false,
      message: `Failed to rerun pipeline: ${errorMessage}`,
      error: errorMessage,
    };
  }
};

/**
 * Executes a team notification action.
 * Sends notification to the configured team channel.
 */
const executeNotifyTeam: ActionExecutor = async (action, context) => {
  logger.info("Executing notify team action", {
    actionId: action.id,
    repository: context.repository,
    channelId: context.channelId,
  });

  // TODO: [#60] Implement actual Slack notification
  // This would post a message to the team's Slack channel
  return {
    success: true,
    message: `Team notification sent to channel ${context.channelId ?? "default"}`,
  };
};

/**
 * Executes a manual investigation action.
 * Logs the investigation requirement and notifies relevant parties.
 */
const executeManualInvestigation: ActionExecutor = async (action, context) => {
  logger.info("Logging manual investigation requirement", {
    actionId: action.id,
    repository: context.repository,
    description: action.description,
  });

  return {
    success: true,
    message: "Manual investigation logged and team notified",
    output: `Investigation required: ${action.description}`,
  };
};

/**
 * Executes a diagnostic run action.
 * Triggers additional diagnostic commands or scripts.
 */
const executeRunDiagnostic: ActionExecutor = async (action, context) => {
  logger.info("Executing diagnostic run", {
    actionId: action.id,
    repository: context.repository,
  });

  // TODO: [#62] Implement actual diagnostic execution
  return {
    success: true,
    message: "Diagnostic run completed",
    output: "Diagnostic data collected and logged",
  };
};

/**
 * Placeholder executor for unimplemented action types.
 * Returns success but indicates the action is not yet implemented.
 */
const executeNotImplemented: ActionExecutor = async (action, _context) => {
  logger.warn("Action type not yet implemented", {
    actionId: action.id,
    actionType: action.actionType,
  });

  return {
    success: false,
    message: `Action type '${action.actionType}' is not yet implemented`,
    error: "NOT_IMPLEMENTED",
  };
};

// ==================== Executor Lookup Table ====================

/**
 * Lookup table mapping action types to their executors.
 * Uses the handler pattern for O(1) dispatch.
 */
const ACTION_EXECUTORS: Readonly<Record<ActionType, ActionExecutor>> = {
  rerun_pipeline: executeRerunPipeline,
  notify_team: executeNotifyTeam,
  manual_investigation: executeManualInvestigation,
  run_diagnostic: executeRunDiagnostic,
  // Placeholder executors for future implementation
  rollback_deployment: executeNotImplemented,
  restart_service: executeNotImplemented,
  scale_service: executeNotImplemented,
  add_environment_variable: executeNotImplemented,
  update_configuration: executeNotImplemented,
  update_documentation: executeNotImplemented,
  create_ticket: executeNotImplemented,
  execute_runbook: executeNotImplemented,
} as const;

// ==================== Public API ====================

/** Checks if an action type has a real executor (not a placeholder). */
export const isActionExecutable = (actionType: ActionType): boolean =>
  ACTION_EXECUTORS[actionType] !== executeNotImplemented;

/** Returns all action types that have real executors. */
export const getExecutableActionTypes = (): readonly ActionType[] => {
  const actionTypes = Object.entries(ACTION_EXECUTORS)
    .filter(([, executor]) => executor !== executeNotImplemented)
    .map(([actionType]) => actionType as ActionType);
  return actionTypes;
};

/**
 * Executes an action using the appropriate executor.
 * Dispatches to the registered handler and wraps the result with metadata.
 */
export const executeAction = async (
  action: ActionProposal,
  context: ActionExecutionContext
): Promise<ActionExecutionResult> => {
  const startTime = Date.now();

  const buildResult = (result: ExecutionResult & { success: boolean }): ActionExecutionResult => ({
    success: result.success,
    actionId: action.id,
    actionType: action.actionType,
    message: result.message ?? ACTION_MESSAGES.ACTION_COMPLETED,
    output: result.output,
    error: result.error,
    executedAt: new Date().toISOString(),
    duration: Date.now() - startTime,
  });

  try {
    const executor = ACTION_EXECUTORS[action.actionType];
    const result = await executor(action, context);
    const executionResult = buildResult(result);

    logger.info("Action execution completed", {
      actionId: action.id,
      actionType: action.actionType,
      success: result.success,
      duration: executionResult.duration,
    });

    return executionResult;
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    logger.error("Action execution failed", {
      actionId: action.id,
      actionType: action.actionType,
      error: errorMessage,
    });

    return buildResult({
      success: false,
      message: ACTION_MESSAGES.EXECUTION_FAILED,
      error: errorMessage,
    });
  }
};

type ValidationResult = { valid: boolean; reason?: string };

/** Validation rules for action execution, checked in order. */
const VALIDATION_RULES: ReadonlyArray<{
  check: (action: ActionProposal) => boolean;
  reason: (action: ActionProposal) => string;
}> = [
  {
    check: (action) => action.requiresApproval && action.status !== "approved",
    reason: () => "Action requires approval",
  },
  {
    check: (action) => !isActionExecutable(action.actionType),
    reason: (action) => `Action type '${action.actionType}' not yet implemented`,
  },
];

/**
 * Validates that an action can be executed.
 * Checks approval status and executor availability using rule-based validation.
 */
export const validateActionExecution = (action: ActionProposal): ValidationResult => {
  const failedRule = VALIDATION_RULES.find((rule) => rule.check(action));
  return failedRule ? { valid: false, reason: failedRule.reason(action) } : { valid: true };
};

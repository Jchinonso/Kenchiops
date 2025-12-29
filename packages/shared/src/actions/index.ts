/**
 * Actions Module
 *
 * Provides action execution capabilities for CI failure response actions.
 * Exports executor functions and types for use across services.
 */

export {
  executeAction,
  validateActionExecution,
  isActionExecutable,
  getExecutableActionTypes,
  type ActionExecutionContext,
  type ActionExecutionResult,
} from "./actionExecutor.js";

export {
  enqueueAction,
  startActionQueueWorker,
  getActionQueueStats,
  type ActionJobPayload,
  type ActionResultEvent,
} from "./actionQueueProcessor.js";

/**
 * Actions Module
 *
 * Provides action execution capabilities for CI failure response actions.
 * Exports executor functions and types for use across services.
 */

// ==================== Types ====================

export type {
  ActionExecutionContext,
  ActionExecutionResult,
  StoredActionPayload,
  OpaqueActionValue,
  ActionVerificationContext,
  ActionStoreStats,
  ActionJobPayload,
  ActionResultEvent,
  QueueStats,
} from "./actionTypes.js";

// ==================== Executor ====================

export {
  executeAction,
  validateActionExecution,
  isActionExecutable,
  getExecutableActionTypes,
} from "./actionExecutor.js";

// ==================== Queue Processor ====================

export {
  enqueueAction,
  startActionQueueWorker,
  getActionQueueStats,
} from "./actionQueueProcessor.js";

// ==================== Payload Store ====================

export {
  storeActionPayload,
  retrieveActionPayload,
  deleteActionPayload,
  parseOpaqueActionValue,
  getActionStoreStats,
  clearActionStore,
} from "./actionPayloadStore.js";

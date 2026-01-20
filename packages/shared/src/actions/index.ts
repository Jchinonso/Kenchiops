/**
 * Actions Module
 *
 * Provides action execution capabilities for CI failure response actions.
 * Exports executor functions and types for use across services.
 */

// ==================== Types ====================

export type {
  // Execution types
  ActionExecutionContext,
  ActionExecutionResult,
  ActionExecutor,
  RerunResponse,
  ValidationResult,
  // Payload store types
  StoredActionPayload,
  OpaqueActionValue,
  ActionVerificationContext,
  ActionStoreStats,
  StoredEntry,
  VerificationRule,
  ParseResult,
  // Queue types
  ActionJobPayload,
  ActionResultEvent,
  QueueStats,
  QueueStatsResult,
  WorkerOptions,
  WorkerState,
  WorkerLoop,
  WorkerErrorCallback,
} from "./types.js";

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

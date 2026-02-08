/**
 * Action Module Types
 *
 * Consolidated type definitions for the actions module.
 *
 * @module actions/types
 */

import type { ActionType, ActionProposal, ExecutionResult } from "../core/types.js";

// ==================== Execution Types ====================

/**
 * Context provided to action executors.
 * Contains all information needed to execute an action.
 */
export interface ActionExecutionContext {
  /** GitHub installation ID for API access */
  readonly installationId: number;
  /** Repository full name (owner/repo) */
  readonly repository: string;
  /** Slack channel ID for notifications */
  readonly channelId?: string;
  /** Slack thread timestamp for threaded replies */
  readonly threadTs?: string;
  /** Commit SHA associated with the action */
  readonly commitSha?: string;
  /** PR number if action is related to a PR */
  readonly prNumber?: number;
  /** Check run ID for rerunning specific checks */
  readonly checkRunId?: number;
  /** Workflow run ID for rerunning workflows */
  readonly workflowRunId?: number;
  /** User who approved the action */
  readonly approvedBy?: string;
  /** Additional context-specific data */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Result of an action execution.
 */
export interface ActionExecutionResult {
  readonly success: boolean;
  readonly actionId: string;
  readonly actionType: ActionType;
  readonly message: string;
  readonly output?: string;
  readonly error?: string;
  readonly executedAt: string;
  readonly durationMs?: number;
}

// ==================== Payload Store Types ====================

/** Full action payload stored server-side. */
export interface StoredActionPayload {
  readonly actionType: string;
  readonly description: string;
  readonly repository: string;
  readonly commitSha: string;
  readonly installationId: number;
  readonly priority: string | number;
  readonly checkRunId?: number;
  readonly createdAt: number;
  readonly createdBy?: string;
  readonly verificationToken: string;
}

/** Opaque button value for Slack (kept small to fit size limits). */
export interface OpaqueActionValue {
  readonly id: string;
  readonly v: string;
}

/** Optional context for verifying action retrieval. */
export interface ActionVerificationContext {
  readonly repository?: string;
  readonly installationId?: number;
}

/** Store statistics for monitoring. */
export interface ActionStoreStats {
  readonly size: number;
  readonly maxSize: number;
  readonly ttlMs: number;
}

// ==================== Queue Types ====================

/** Action job payload for queue processing. */
export interface ActionJobPayload {
  readonly action: ActionProposal;
  readonly context: ActionExecutionContext;
  readonly callbackChannel?: string;
}

/** Action result event published via pub/sub. */
export interface ActionResultEvent {
  readonly actionId: string;
  readonly actionType: ActionType;
  readonly result: ActionExecutionResult;
  readonly queuedAt: string;
  readonly processedAt: string;
}

/** Queue statistics for monitoring. */
export interface QueueStats {
  readonly pending: number;
  readonly processing: number;
  readonly dead: number;
}

/**
 * Result type for queue stats operations.
 * Distinguishes between success and error states.
 */
export type QueueStatsResult =
  | { readonly status: "success"; readonly stats: QueueStats }
  | { readonly status: "error"; readonly error: string };

// ==================== Executor Types ====================

/**
 * Action executor function type.
 * Each action type has a corresponding executor.
 */
export type ActionExecutor = (
  action: ActionProposal,
  context: ActionExecutionContext
) => Promise<ExecutionResult>;

/** Response from GitHub App rerun endpoint. */
export interface RerunResponse {
  readonly success: boolean;
  readonly message: string;
  readonly runId?: number;
  readonly error?: string;
}

/** Validation result for action execution. */
export type ValidationResult = { readonly valid: boolean; readonly reason?: string };

// ==================== Payload Store Internal Types ====================

/** Internal store entry with expiration. */
export interface StoredEntry {
  readonly payload: StoredActionPayload;
  readonly expiresAt: number;
}

/** Verification rule definition. */
export interface VerificationRule {
  readonly shouldReject: (
    entry: StoredEntry,
    opaqueValue: OpaqueActionValue,
    context?: ActionVerificationContext
  ) => boolean;
  readonly reject: (
    entry: StoredEntry,
    opaqueValue: OpaqueActionValue,
    context?: ActionVerificationContext
  ) => never;
}

/** Result type for safe JSON parsing. */
export type ParseResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false };

// ==================== Queue Worker Types ====================

/** Worker configuration options. */
export interface WorkerOptions {
  readonly pollIntervalMs?: number;
  readonly maxConcurrent?: number;
  /** Optional callback for worker errors (for health monitoring). */
  readonly onError?: WorkerErrorCallback;
}

/** Worker state tracking. */
export interface WorkerState {
  running: boolean;
  activeJobs: number;
}

/** Worker loop function type. */
export type WorkerLoop = () => Promise<void>;

/** Callback invoked when a worker encounters an error. */
export type WorkerErrorCallback = (error: string) => void;

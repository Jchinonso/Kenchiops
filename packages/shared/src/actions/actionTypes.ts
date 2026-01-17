/**
 * Action Module Types
 *
 * Consolidated type definitions for the actions module.
 * Internal types remain in their respective implementation files.
 *
 * @module actions/actionTypes
 */

import type { ActionType, ActionProposal } from "../core/types.js";

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
  readonly duration?: number;
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

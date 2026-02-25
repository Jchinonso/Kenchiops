/**
 * Fair Scheduler Types
 *
 * Type definitions for the fair (weighted round-robin) queue scheduler.
 * Prevents any single tenant from monopolizing shared queue resources.
 *
 * @module queue/fairSchedulerTypes
 */

import type { QueueConfig, QueueManager, QueueStats, MessageHandler } from "./types.js";

// ==================== Configuration ====================

/**
 * Configuration for a fair-scheduled queue.
 * Extends the base QueueConfig with tenant-awareness settings.
 */
export interface FairQueueConfig extends QueueConfig {
  /** Maximum tenants to serve per polling round (default: 5) */
  readonly maxTenantsPerRound?: number;
}

// ==================== Manager Interface ====================

/**
 * Extended queue manager that supports fair per-tenant scheduling.
 * Backwards-compatible: retains all base QueueManager methods.
 */
export interface FairQueueManager extends QueueManager {
  /** Enqueue a job into a tenant-specific sub-queue for fair scheduling. */
  readonly enqueueFair: <T>(
    type: string,
    payload: T,
    tenantId: string,
    metadata?: Record<string, unknown>
  ) => Promise<string>;
  /** Process a job using fair round-robin tenant selection. */
  readonly processFair: <T>(handler: MessageHandler<T>) => Promise<void>;
  /** Get queue statistics for a specific tenant. */
  readonly getTenantStats: (tenantId: string) => Promise<QueueStats>;
}

// ==================== Internal Types ====================

/**
 * Redis key names used by the fair scheduler for a given queue.
 */
export interface FairQueueKeys {
  readonly baseName: string;
  readonly processingQueue: string;
  readonly deadLetterQueue: string;
  readonly activeTenantSet: string;
  readonly tenantSubQueue: (tenantId: string) => string;
  readonly tenantProcessingQueue: (tenantId: string) => string;
}

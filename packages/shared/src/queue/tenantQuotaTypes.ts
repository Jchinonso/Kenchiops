/**
 * Tenant Quota Types
 *
 * Type definitions for per-tenant runtime resource quotas.
 * Quotas are enforced in real-time via Redis counters.
 *
 * @module queue/tenantQuotaTypes
 */

// ==================== Configuration ====================

/**
 * Runtime resource quota configuration for a single tenant.
 */
export interface TenantQuotaConfig {
  /** Maximum number of pending jobs in the queue */
  readonly maxQueueDepth: number;
  /** Maximum processing time allowed per hour in milliseconds */
  readonly maxProcessingTimePerHourMs: number;
  /** Maximum concurrent jobs running simultaneously */
  readonly maxConcurrentJobs: number;
}

// ==================== Check Result ====================

/**
 * Result of a quota check operation.
 * `allowed: false` means the operation should be rejected.
 */
export interface QuotaCheckResult {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly currentUsage?: number;
  readonly limit?: number;
}

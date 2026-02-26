/**
 * Per-Tenant Concurrency Limiter for Analysis Jobs
 *
 * Uses in-memory counters to enforce per-tenant limits on concurrent
 * analysis jobs. This prevents any single tenant from monopolizing
 * shared analysis resources during high-volume CI failure bursts.
 *
 * **Important:** This is an in-memory implementation. It does NOT
 * coordinate across multiple process instances. For multi-instance
 * deployments, use a Redis-backed semaphore instead.
 *
 * Pattern: acquireAnalysisSlot / releaseAnalysisSlot with try/finally
 *
 * @example
 * ```typescript
 * const result = acquireAnalysisSlot(tenantId);
 * if (!result.acquired) {
 *   logger.warn("Tenant concurrency limit reached", { tenantId, ...result });
 *   return; // requeue or reject
 * }
 * try {
 *   await performAnalysis(tenantId);
 * } finally {
 *   releaseAnalysisSlot(tenantId);
 * }
 * ```
 *
 * @module concurrency/tenantSemaphore
 */

import { TENANT_CONCURRENCY_DEFAULTS } from "../constants/index.js";
import type { ActiveAnalysisCounts, SlotAcquisitionResult } from "./types.js";

/**
 * In-memory slot tracker.
 * Mutable Map is acceptable here: this is a stateful runtime module
 * (not a pure helper), similar to how the existing ConcurrencyLimiter
 * in core/concurrency.ts uses mutable state for semaphore tracking.
 */
const activeSlots: Map<string, number> = new Map();

/**
 * Try to acquire an analysis slot for a tenant.
 *
 * @returns A result object indicating whether the slot was acquired,
 *          current active count, and the configured limit.
 */
export const acquireAnalysisSlot = (tenantId: string): SlotAcquisitionResult => {
  const limit = TENANT_CONCURRENCY_DEFAULTS.MAX_CONCURRENT_ANALYSES;
  const current = activeSlots.get(tenantId) ?? 0;

  if (current >= limit) {
    return { acquired: false, activeCount: current, limit };
  }

  const newCount = current + 1;
  activeSlots.set(tenantId, newCount);

  return { acquired: true, activeCount: newCount, limit };
};

/**
 * Release an analysis slot for a tenant.
 * Must be called in a finally block after a successful acquireAnalysisSlot.
 */
export const releaseAnalysisSlot = (tenantId: string): void => {
  const current = activeSlots.get(tenantId) ?? 0;

  if (current <= 1) {
    activeSlots.delete(tenantId);
  } else {
    activeSlots.set(tenantId, current - 1);
  }
};

/**
 * Get the current active analysis count for a tenant.
 */
export const getActiveAnalysisCount = (tenantId: string): number => activeSlots.get(tenantId) ?? 0;

/**
 * Get all active analysis counts across tenants (for monitoring).
 */
export const getAllActiveAnalysisCounts = (): ActiveAnalysisCounts => activeSlots;

/**
 * Reset all slots. Intended for testing only.
 */
export const resetAllSlots = (): void => {
  activeSlots.clear();
};

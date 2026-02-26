/**
 * Type definitions for per-tenant concurrency control.
 *
 * @module concurrency/types
 */

/**
 * Snapshot of active analysis counts across all tenants.
 * Used for monitoring and debugging concurrency usage.
 */
export type ActiveAnalysisCounts = ReadonlyMap<string, number>;

/**
 * Result of attempting to acquire an analysis slot.
 */
export interface SlotAcquisitionResult {
  /** Whether the slot was successfully acquired */
  readonly acquired: boolean;
  /** Current active count for the tenant (after acquisition attempt) */
  readonly activeCount: number;
  /** The configured limit */
  readonly limit: number;
}

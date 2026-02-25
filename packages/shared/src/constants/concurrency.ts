/**
 * Tenant Concurrency Constants
 *
 * Default values for per-tenant concurrency limits.
 * Prevents any single tenant from monopolizing shared analysis resources.
 */

/**
 * Per-tenant concurrency control configuration.
 */
export const TENANT_CONCURRENCY_DEFAULTS = {
  /** Maximum concurrent analysis jobs per tenant */
  MAX_CONCURRENT_ANALYSES: 5,
} as const;

/**
 * Fair queue scheduling configuration.
 *
 * Prevents a single high-volume tenant from starving others by limiting
 * how many pending jobs any single tenant can have picked per poll cycle.
 */
export const FAIR_QUEUE_DEFAULTS = {
  /** Maximum jobs a single tenant can contribute per batch fetch */
  MAX_JOBS_PER_TENANT_PER_BATCH: 2,
} as const;

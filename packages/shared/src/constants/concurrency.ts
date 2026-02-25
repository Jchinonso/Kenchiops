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
  /** Maximum tenants to serve per polling round */
  MAX_TENANTS_PER_ROUND: 5,
} as const;

/**
 * Per-tenant runtime quota defaults, keyed by plan tier.
 *
 * These quotas are enforced in real-time via Redis counters and
 * are separate from the static plan limits (max_analyses_monthly, etc.).
 */
export const TENANT_QUOTA_BY_PLAN = {
  free: {
    maxQueueDepth: 10,
    maxProcessingTimePerHourMs: 300_000,
    maxConcurrentJobs: 1,
  },
  pro: {
    maxQueueDepth: 50,
    maxProcessingTimePerHourMs: 1_800_000,
    maxConcurrentJobs: 3,
  },
  team: {
    maxQueueDepth: 200,
    maxProcessingTimePerHourMs: 3_600_000,
    maxConcurrentJobs: 5,
  },
  enterprise: {
    maxQueueDepth: 1000,
    maxProcessingTimePerHourMs: 7_200_000,
    maxConcurrentJobs: 10,
  },
} as const;

/** Default plan used when tenant has no plan or plan is unknown. */
export const TENANT_QUOTA_DEFAULT_PLAN = "free" as const;

/**
 * Redis key patterns and TTL for tenant quota tracking.
 */
export const TENANT_QUOTA_REDIS = {
  /** TTL for processing-time hour buckets (2 hours to survive bucket boundaries) */
  PROCESSING_TIME_TTL_SECONDS: 7200,
} as const;

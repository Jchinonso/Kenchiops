/**
 * Alert Budget Constants
 *
 * Per-plan limits for alert analysis, active streams, and streaming windows.
 * These budgets enforce daily cost caps per tenant across Pipeline A and B.
 *
 * @see docs/LOG_PROCESSING_STRATEGY.md — "Cost & Budget Controls"
 * @module constants/alertBudget
 */

/**
 * Per-plan alert budget configuration.
 *
 * - analyses: max LLM analysis jobs per day (Pipeline A + B combined)
 * - activeStreams: max concurrent continuous log streams
 * - windowsPerDay: max incremental analysis windows per day (0 = unlimited)
 * - dailyCostCapCents: soft daily cost cap in USD cents (0 = unlimited)
 */
export const ALERT_BUDGET_BY_PLAN = {
  free: {
    maxAnalysesPerDay: 10,
    maxActiveStreams: 1,
    maxWindowsPerDay: 12,
    dailyCostCapCents: 50,
  },
  pro: {
    maxAnalysesPerDay: 100,
    maxActiveStreams: 5,
    maxWindowsPerDay: 288,
    dailyCostCapCents: 500,
  },
  team: {
    maxAnalysesPerDay: 500,
    maxActiveStreams: 20,
    maxWindowsPerDay: 0,
    dailyCostCapCents: 2500,
  },
  enterprise: {
    maxAnalysesPerDay: 0,
    maxActiveStreams: 0,
    maxWindowsPerDay: 0,
    dailyCostCapCents: 10_000,
  },
} as const;

/** Default plan when tenant plan is unknown or missing. */
export const ALERT_BUDGET_DEFAULT_PLAN = "free" as const;

/**
 * Redis key patterns for alert budget tracking.
 *
 * - analyses: daily counter, keyed by YYYY-MM-DD bucket
 * - active-streams: gauge (INCR/DECR), no day bucket
 * - windows: daily counter, keyed by YYYY-MM-DD bucket
 */
export const ALERT_BUDGET_REDIS_KEYS = {
  ANALYSES: "kenchi:alert-budget:{tenantId}:analyses:{dayBucket}",
  ACTIVE_STREAMS: "kenchi:alert-budget:{tenantId}:active-streams",
  WINDOWS: "kenchi:alert-budget:{tenantId}:windows:{dayBucket}",
} as const;

/** TTL for daily counters: 48 hours in seconds (survives day boundary). */
export const ALERT_BUDGET_REDIS_TTL = 172_800 as const;

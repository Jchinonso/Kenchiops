/**
 * Alert Budget Quota Types
 *
 * Type definitions for per-tenant alert budget enforcement.
 * Budget limits cover daily analyses, active streams, and streaming windows.
 *
 * @module queue/alertBudgetQuotaTypes
 */

/**
 * Per-plan alert budget configuration shape.
 * Matches the value type of each plan entry in ALERT_BUDGET_BY_PLAN.
 */
export interface AlertBudgetConfig {
  /** Max LLM analyses per day (0 = unlimited) */
  readonly maxAnalysesPerDay: number;
  /** Max concurrent active streams (0 = unlimited) */
  readonly maxActiveStreams: number;
  /** Max incremental analysis windows per day (0 = unlimited) */
  readonly maxWindowsPerDay: number;
  /** Soft daily cost cap in USD cents (0 = unlimited) */
  readonly dailyCostCapCents: number;
}

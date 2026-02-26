/**
 * Types for the observability module.
 *
 * @module observability/types
 */

/**
 * Labels for per-tenant API request metrics.
 */
export interface ApiRequestLabels {
  readonly tenant_id: string;
  readonly method: string;
  readonly route: string;
  readonly status_code: string;
}

/**
 * Labels for per-tenant analysis metrics.
 */
export interface AnalysisLabels {
  readonly tenant_id: string;
  readonly status: string;
}

/**
 * Labels for external call metrics.
 */
export interface ExternalCallLabels {
  readonly tenant_id: string;
  readonly provider: string;
  readonly operation: string;
}

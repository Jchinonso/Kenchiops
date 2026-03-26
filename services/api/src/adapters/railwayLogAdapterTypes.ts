/**
 * Railway Log Adapter Vendor Types
 *
 * Internal types representing raw Railway API responses and webhook payloads.
 * Vendor-specific — never cross port boundaries.
 *
 * @module adapters/railwayLogAdapterTypes
 */

// ==================== Webhook Payloads ====================

/** Raw Railway deployment webhook payload. */
export interface RailwayWebhookPayload {
  readonly type: string;
  readonly timestamp: string;
  readonly project: {
    readonly id: string;
    readonly name: string;
  };
  readonly environment: {
    readonly id: string;
    readonly name: string;
  };
  readonly deployment: {
    readonly id: string;
    readonly status: string;
    readonly meta?: {
      readonly repo?: string;
      readonly branch?: string;
      readonly commitSha?: string;
    };
    readonly createdAt: string;
    readonly updatedAt: string;
  };
}

// ==================== GraphQL Log Response ====================

/** Response shape from Railway's deploymentLogs GraphQL query. */
export interface RailwayDeploymentLogsResponse {
  readonly data: {
    readonly deploymentLogs: readonly RailwayLogEntry[];
  };
}

/** A single Railway deployment log entry. */
export interface RailwayLogEntry {
  readonly timestamp: string;
  readonly message: string;
  readonly severity: string;
}

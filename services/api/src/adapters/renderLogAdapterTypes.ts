/**
 * Render Log Adapter Vendor Types
 *
 * Internal types representing raw Render API responses and webhook payloads.
 * Vendor-specific — never cross port boundaries.
 *
 * @module adapters/renderLogAdapterTypes
 */

// ==================== Webhook Payloads ====================

/** Raw Render deploy webhook payload. */
export interface RenderWebhookPayload {
  readonly type: string;
  readonly data: {
    readonly id: string;
    readonly serviceId: string;
    readonly serviceName: string;
    readonly status: string;
    readonly commit?: {
      readonly id: string;
      readonly message: string;
    };
    readonly branch?: string;
    readonly createdAt: string;
    readonly finishedAt?: string;
  };
}

// ==================== REST API Responses ====================

/** Response from GET /v1/services/{serviceId}/logs */
export interface RenderLogsResponse {
  readonly logs: readonly RenderLogEntry[];
}

/** A single Render log entry. */
export interface RenderLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly message: string;
  readonly level: string;
}

/**
 * Netlify Log Adapter Vendor Types
 *
 * Internal types representing raw Netlify API responses and webhook payloads.
 * Vendor-specific — never cross port boundaries.
 *
 * @module adapters/netlifyLogAdapterTypes
 */

// ==================== Webhook Payloads ====================

/** Raw Netlify deploy webhook payload (notification hook). */
export interface NetlifyWebhookPayload {
  readonly id: string;
  readonly site_id: string;
  readonly name: string;
  readonly state: string;
  readonly branch: string;
  readonly commit_ref: string;
  readonly commit_url: string;
  readonly deploy_url: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly error_message?: string;
  readonly title?: string;
}

// ==================== REST API Responses ====================

/** Response from GET /api/v1/deploys/{deploy_id}/log */
export interface NetlifyDeployLogResponse {
  readonly log: readonly NetlifyLogEntry[];
}

/** A single Netlify deploy log entry. */
export interface NetlifyLogEntry {
  readonly ts: string;
  readonly msg: string;
  readonly level: string;
  readonly section: string;
}

// ==================== Log Drain ====================

/** A single line from a Netlify log drain. */
export interface NetlifyLogDrainLine {
  readonly message: string;
  readonly timestamp: number;
  readonly deploy_id: string;
  readonly site_id: string;
  readonly level: string;
  readonly source: string;
}

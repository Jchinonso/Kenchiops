/**
 * Vercel Log Adapter Vendor Types
 *
 * Internal types representing raw Vercel API responses and webhook payloads.
 * These are vendor-specific and must never cross port boundaries.
 *
 * @module adapters/vercelLogAdapterTypes
 */

// ==================== Webhook Payloads ====================

/** Raw Vercel deployment webhook payload. */
export interface VercelWebhookPayload {
  readonly id: string;
  readonly type: string;
  readonly createdAt: number;
  readonly payload: {
    readonly deployment: VercelDeploymentPayload;
    readonly team?: {
      readonly id: string;
      readonly name: string;
    };
    readonly user?: {
      readonly id: string;
      readonly username: string;
    };
  };
}

/** Deployment object nested within the webhook payload. */
export interface VercelDeploymentPayload {
  readonly id: string;
  readonly url: string;
  readonly name: string;
  readonly meta?: Readonly<Record<string, string>>;
  readonly gitSource?: {
    readonly ref: string;
    readonly sha: string;
    readonly repoId: string;
  };
  readonly target: string | null;
  readonly projectId: string;
  readonly readyState: string;
  readonly createdAt: number;
  readonly buildingAt?: number;
  readonly ready?: number;
}

// ==================== Deployment Events API ====================

/** Response from GET /v1/deployments/{id}/events */
export interface VercelDeploymentEventsResponse {
  readonly events: readonly VercelDeploymentEvent[];
}

/** A single deployment event (build log line). */
export interface VercelDeploymentEvent {
  readonly id: string;
  readonly date: number;
  readonly text: string;
  readonly type: string;
  readonly payload?: {
    readonly text?: string;
    readonly statusCode?: number;
  };
}

// ==================== Log Drain ====================

/** A single line from a Vercel log drain (NDJSON). */
export interface VercelLogDrainLine {
  readonly id: string;
  readonly message: string;
  readonly timestamp: number;
  readonly source: string;
  readonly projectId: string;
  readonly deploymentId: string;
  readonly level: string;
}

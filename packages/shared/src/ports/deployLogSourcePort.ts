/**
 * Deploy Log Source Port Interface
 *
 * Provider-agnostic contract for ingesting deployment logs
 * from platforms like Vercel, Railway, Render, and Netlify.
 * Adapters implement this to handle webhook events, fetch logs,
 * and parse log drain batches via provider-specific APIs.
 * Vendor-specific types never cross this boundary.
 *
 * @module ports/deployLogSourcePort
 */

import type { RequestContext } from "../core/types.js";

// ==================== Domain Types ====================

/** Supported deployment platforms. */
export type DeployPlatform = "vercel" | "railway" | "render" | "netlify";

/** Deploy lifecycle status. */
export type DeployStatus = "building" | "deploying" | "success" | "failed" | "cancelled";

/** Metadata about a deployment, normalized across all providers. */
export interface DeployMetadata {
  readonly repository: string;
  readonly branch: string;
  readonly commit: string;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly status: DeployStatus;
  readonly projectId: string;
  readonly projectName: string;
}

/** Normalized result from parsing a deployment webhook event. */
export interface DeployWebhookResult {
  /** Unique deploy identifier from the provider. */
  readonly entityId: string;
  readonly platform: DeployPlatform;
  readonly eventType: "deploy_started" | "deploy_completed" | "deploy_failed" | "log_batch";
  readonly metadata: DeployMetadata;
  /** Raw log content if included in the webhook payload. */
  readonly logs: string | null;
}

/** Parameters for fetching deploy logs via provider REST API. */
export interface FetchDeployLogsParams {
  readonly entityId: string;
  readonly platform: DeployPlatform;
  readonly accessToken: string;
  readonly timeRange?: { readonly start: Date; readonly end: Date };
  readonly teamId?: string;
}

/** Result of fetching deploy logs. */
export interface DeployLogData {
  readonly entityId: string;
  readonly rawLog: string;
  readonly totalLines: number;
  readonly isTruncated: boolean;
}

/** A single normalized log line from a log drain or subscription. */
export interface LogLine {
  readonly timestamp: Date;
  readonly message: string;
  readonly level: string;
  readonly source: string;
}

/** Result of parsing a log drain batch. */
export interface LogDrainBatchResult {
  readonly entityId: string;
  readonly lines: readonly LogLine[];
  readonly platform: DeployPlatform;
}

/** Full input for the deploy analysis pipeline (maps to existing AnalyzeRequest). */
export interface DeployLogInput {
  readonly source: DeployPlatform;
  readonly deployId: string;
  readonly rawLog: string;
  readonly metadata: DeployMetadata;
}

// ==================== Port Interface ====================

/**
 * Port for ingesting deployment logs from platform providers.
 * Covers signature verification, webhook events, REST log fetching,
 * and push-based log drain batches.
 */
export interface DeployLogSourcePort {
  /** Verify the webhook signature. Returns true if valid. Must be called before processing. */
  readonly verifySignature: (rawBody: Buffer, signature: string, secret: string) => boolean;

  /** Parse an incoming webhook payload into a normalized deploy event. Returns null if the event should be skipped. */
  readonly handleWebhook: (
    payload: unknown,
    context: RequestContext
  ) => Promise<DeployWebhookResult | null>;

  /** Fetch logs for a specific deploy via the provider's REST API. */
  readonly fetchDeployLogs: (
    params: FetchDeployLogsParams,
    context: RequestContext
  ) => Promise<DeployLogData>;

  /** Parse an incoming log drain batch into normalized log lines. */
  readonly parseLogDrainBatch: (
    payload: unknown,
    context: RequestContext
  ) => Promise<LogDrainBatchResult>;

  /**
   * Subscribe to real-time log streaming (WebSocket/SSE).
   * Optional — only platforms with streaming support implement this.
   * Returns a handle to close the subscription.
   */
  readonly subscribe?: (
    entityId: string,
    onLine: (line: LogLine) => void,
    context: RequestContext
  ) => Promise<{ readonly close: () => Promise<void> }>;
}

/**
 * GitLab Connection Service Types
 *
 * Domain types for the GitLab CI provider connection service.
 * These are returned by the service layer to route handlers.
 *
 * @module services/gitlabConnectionServiceTypes
 */

// ==================== Result Types ====================

export interface GitLabConnectionResult {
  readonly connectionId: string;
  readonly webhookUrl: string;
  readonly webhookSecret: string;
  readonly status: "connected";
}

export interface GitLabConnectionStatus {
  readonly connected: boolean;
  readonly connectionId: string | null;
  readonly webhookUrl: string | null;
  readonly connectedAt: string | null;
  readonly instanceUrl: string | null;
}

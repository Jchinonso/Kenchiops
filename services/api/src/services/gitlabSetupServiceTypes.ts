/**
 * GitLab Setup Service Types
 *
 * Domain types for the GitLab project webhook setup service.
 * These are returned by the service layer to route handlers.
 *
 * @module services/gitlabSetupServiceTypes
 */

// ==================== Result Types ====================

export interface GitLabSetupResult {
  readonly connectionId: string;
  readonly webhookUrl: string;
  readonly results: readonly GitLabProjectSetupResult[];
}

export interface GitLabProjectSetupResult {
  readonly projectId: number;
  readonly projectName: string;
  readonly success: boolean;
  readonly webhookId?: number;
  readonly error?: string;
}

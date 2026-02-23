/**
 * Account Deletion Service Types
 *
 * Type definitions for the account deletion service.
 *
 * @module services/accountDeletionServiceTypes
 */

/** Resources that will be cleaned up if tenant is deleted. */
export interface AffectedResources {
  readonly providerConnections: number;
  readonly gitlabWebhooks: number;
  readonly hasSlackIntegration: boolean;
}

/** Impact assessment returned by the pre-deletion check. */
export interface DeletionImpact {
  readonly isLastMember: boolean;
  readonly tenantId: string | null;
  readonly tenantName: string | null;
  readonly memberCount: number;
  readonly willDeleteTenant: boolean;
  readonly affectedResources: AffectedResources;
}

/** Result of the external cleanup step. */
export interface ExternalCleanupResult {
  readonly gitlabWebhooksDeleted: number;
  readonly gitlabWebhooksFailed: number;
  readonly slackTokenRevoked: boolean;
}

/** Config shape for GitLab provider connections with webhook data. */
export interface GitLabWebhookConfig {
  readonly projectId: number;
  readonly webhookId: number;
}

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

/** Per-organization impact when the user is the last member. */
export interface AffectedOrganization {
  readonly tenantId: string;
  readonly tenantName: string | null;
  readonly memberCount: number;
  readonly affectedResources: AffectedResources;
}

/** Impact assessment returned by the pre-deletion check. */
export interface DeletionImpact {
  /** True if user is last member in ANY organization. */
  readonly isLastMember: boolean;
  /** Selected tenant ID (backward compat). */
  readonly tenantId: string | null;
  /** Selected tenant name (backward compat). */
  readonly tenantName: string | null;
  /** Member count of selected tenant (backward compat). */
  readonly memberCount: number;
  /** True if ANY organization will be deleted. */
  readonly willDeleteTenant: boolean;
  /** Aggregated resources across all affected orgs (backward compat). */
  readonly affectedResources: AffectedResources;
  /** Detailed per-org breakdown for all orgs where user is last member. */
  readonly affectedOrganizations: readonly AffectedOrganization[];
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

export interface AffectedResources {
  readonly providerConnections: number;
  readonly gitlabWebhooks: number;
  readonly hasSlackIntegration: boolean;
}

export interface DeletionImpact {
  readonly isLastMember: boolean;
  readonly tenantId: string | null;
  readonly tenantName: string | null;
  readonly memberCount: number;
  readonly willDeleteTenant: boolean;
  readonly affectedResources: AffectedResources;
}

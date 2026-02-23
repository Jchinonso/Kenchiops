/**
 * Cache Helpers
 *
 * Pure utility functions for cache data conversion.
 *
 * @module cache/helpers
 */

import type { Tenant, RepositoryChannelMapping } from "../core/types.js";
import type { CachedTenant, CachedMapping } from "./types.js";

/**
 * Convert full tenant to cached tenant.
 */
export const toCachedTenant = (tenant: Tenant): CachedTenant => ({
  id: tenant.id,
  githubInstallationId: tenant.githubInstallationId,
  orgName: tenant.orgName,
  slackWorkspaceId: tenant.slackWorkspaceId,
  slackTeamName: tenant.slackTeamName,
  status: tenant.status,
  createdAt: tenant.createdAt.toISOString(),
});

/**
 * Convert mapping to cached mapping.
 */
export const toCachedMapping = (mapping: RepositoryChannelMapping): CachedMapping => ({
  id: mapping.id,
  tenantId: mapping.tenantId,
  repository: mapping.repository,
  slackChannelId: mapping.slackChannelId,
  slackChannelName: mapping.slackChannelName ?? null,
});

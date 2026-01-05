/**
 * Tenant Cache Types and Converters
 *
 * Type definitions and conversion utilities for cached tenant data.
 *
 * @module cache/tenantCacheTypes
 */

import type { Tenant, RepositoryChannelMapping } from "../core/types.js";

// ==================== Types ====================

/**
 * Cached tenant (subset of full tenant for cache efficiency)
 */
export interface CachedTenant {
  readonly id: string;
  readonly githubInstallationId: number | null;
  readonly githubOrg: string;
  readonly slackWorkspaceId: string | null;
  readonly slackTeamName: string | null;
  readonly status: string;
  readonly createdAt: string;
}

/**
 * Cached mapping info
 */
export interface CachedMapping {
  readonly id: string;
  readonly tenantId: string;
  readonly repository: string;
  readonly slackChannelId: string;
  readonly slackChannelName: string | null;
}

/**
 * Tenant statistics (cached separately due to volatility)
 */
export interface CachedTenantStats {
  readonly totalAlerts: number;
  readonly lastAlertTime: string | null;
  readonly mappingCount: number;
}

// ==================== Conversion Utilities ====================

/**
 * Convert full tenant to cached tenant
 */
export const toCachedTenant = (tenant: Tenant): CachedTenant => ({
  id: tenant.id,
  githubInstallationId: tenant.githubInstallationId,
  githubOrg: tenant.githubOrg,
  slackWorkspaceId: tenant.slackWorkspaceId,
  slackTeamName: tenant.slackTeamName,
  status: tenant.status,
  createdAt: tenant.createdAt.toISOString(),
});

/**
 * Convert mapping to cached mapping
 */
export const toCachedMapping = (mapping: RepositoryChannelMapping): CachedMapping => ({
  id: mapping.id,
  tenantId: mapping.tenantId,
  repository: mapping.repository,
  slackChannelId: mapping.slackChannelId,
  slackChannelName: mapping.slackChannelName ?? null,
});

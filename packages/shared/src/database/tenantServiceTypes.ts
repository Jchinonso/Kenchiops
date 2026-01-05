/**
 * Tenant Service Types and Converters
 *
 * Type definitions, row converters, and helper functions for tenant operations.
 *
 * @module database/tenantServiceTypes
 */

import { TENANT_STATUS } from "../constants/index.js";
import type { Tenant, TenantStatus, TenantEmbeddingTier } from "../core/types.js";

// ==================== Types ====================

/**
 * Database row type for tenants table
 */
export interface TenantRow {
  readonly id: string;
  readonly github_org: string;
  readonly github_installation_id: number | null;
  readonly github_app_installed_at: Date | null;
  readonly slack_workspace_id: string | null;
  readonly slack_team_name: string | null;
  readonly slack_bot_token: string | null;
  readonly slack_bot_user_id: string | null;
  readonly slack_app_installed_at: Date | null;
  readonly status: TenantStatus;
  readonly created_at: Date;
  readonly updated_at: Date;
  // RAG budget configuration
  readonly rag_monthly_budget_usd: string | null;
  readonly rag_preferred_tier: string | null;
  readonly rag_allow_premium: boolean | null;
  readonly rag_degrade_on_budget_warning: boolean | null;
}

/**
 * Statistics for a tenant's activity
 */
export interface TenantStatistics {
  readonly failuresAnalyzedToday: number;
  readonly totalAlertsSent: number;
  readonly lastAlertTime: Date | null;
}

// ==================== Constants ====================

/**
 * Default RAG budget configuration values
 */
export const RAG_BUDGET_DEFAULTS = {
  monthlyBudgetUsd: 0,
  preferredTier: "STANDARD" as TenantEmbeddingTier,
  allowPremium: false,
  degradeOnBudgetWarning: true,
} as const;

// ==================== Row Converters ====================

/**
 * Convert database row to Tenant entity
 */
export const rowToTenant = (row: TenantRow): Tenant => ({
  id: row.id,
  githubOrg: row.github_org,
  githubInstallationId: row.github_installation_id,
  githubAppInstalledAt: row.github_app_installed_at,
  slackWorkspaceId: row.slack_workspace_id,
  slackTeamName: row.slack_team_name,
  slackBotToken: row.slack_bot_token,
  slackBotUserId: row.slack_bot_user_id,
  slackAppInstalledAt: row.slack_app_installed_at,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  // RAG budget configuration with defaults
  ragMonthlyBudgetUsd: row.rag_monthly_budget_usd
    ? parseFloat(row.rag_monthly_budget_usd)
    : RAG_BUDGET_DEFAULTS.monthlyBudgetUsd,
  ragPreferredTier:
    (row.rag_preferred_tier as TenantEmbeddingTier) ?? RAG_BUDGET_DEFAULTS.preferredTier,
  ragAllowPremium: row.rag_allow_premium ?? RAG_BUDGET_DEFAULTS.allowPremium,
  ragDegradeOnBudgetWarning:
    row.rag_degrade_on_budget_warning ?? RAG_BUDGET_DEFAULTS.degradeOnBudgetWarning,
});

// ==================== Internal Helpers ====================

/**
 * Extract first row from query result, converting to Tenant or null
 */
export const extractTenant = (rows: readonly TenantRow[]): Tenant | null =>
  rows.length > 0 ? rowToTenant(rows[0]) : null;

/**
 * Determine new status after GitHub installation
 */
export const getStatusAfterGitHubInstall = (hasSlack: boolean): TenantStatus =>
  hasSlack ? TENANT_STATUS.ACTIVE : TENANT_STATUS.PENDING_SLACK;

/**
 * Determine new status after Slack installation
 */
export const getStatusAfterSlackInstall = (hasGitHub: boolean): TenantStatus =>
  hasGitHub ? TENANT_STATUS.ACTIVE : TENANT_STATUS.PENDING_GITHUB;

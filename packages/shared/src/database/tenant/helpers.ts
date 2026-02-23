/**
 * Tenant Helpers
 *
 * Validation functions for tenant operations.
 *
 * @module database/tenant/helpers
 */

import {
  ValidationError,
  TENANT_STATUS,
  RAG_BUDGET_DEFAULTS,
  validateId,
  sharedValidateLimit,
  type CreateTenantFromGitHub,
  type LinkSlackWorkspace,
  type Tenant,
  type TenantStatus,
  type TenantEmbeddingTier,
  type TenantAuditEntry,
} from "../common.js";
import { decryptValue } from "../../security/encryption.js";
import type {
  AuditRow,
  FieldMapping,
  GitHubInstallValidationRule,
  SlackLinkValidationRule,
  TenantRAGBudgetConfig,
  TenantRow,
  UpdateQueryResult,
  UpdateRAGBudgetInput,
  UpdateRAGBudgetValidationRule,
} from "./types.js";

// ==================== Validation Rules ====================

const GITHUB_INSTALL_VALIDATION_RULES: readonly GitHubInstallValidationRule[] = [
  {
    isInvalid: (input) => input.orgName.trim().length === 0,
    getMessage: () => "Organization name cannot be empty",
    field: "orgName",
  },
  {
    isInvalid: (input) =>
      !Number.isFinite(input.githubInstallationId) || input.githubInstallationId <= 0,
    getMessage: () => "GitHub installation ID must be a positive number",
    field: "githubInstallationId",
  },
];

const SLACK_LINK_VALIDATION_RULES: readonly SlackLinkValidationRule[] = [
  {
    isInvalid: (input) => input.tenantId.trim().length === 0,
    getMessage: () => "Tenant ID cannot be empty",
    field: "tenantId",
  },
  {
    isInvalid: (input) => input.slackWorkspaceId.trim().length === 0,
    getMessage: () => "Slack workspace ID cannot be empty",
    field: "slackWorkspaceId",
  },
  {
    isInvalid: (input) => input.slackTeamName.trim().length === 0,
    getMessage: () => "Slack team name cannot be empty",
    field: "slackTeamName",
  },
  {
    isInvalid: (input) => input.slackBotToken.trim().length === 0,
    getMessage: () => "Slack bot token cannot be empty",
    field: "slackBotToken",
  },
];

const UPDATE_RAG_BUDGET_VALIDATION_RULES: readonly UpdateRAGBudgetValidationRule[] = [
  {
    isInvalid: (input) => input.tenantId.trim().length === 0,
    getMessage: () => "Tenant ID cannot be empty",
    field: "tenantId",
  },
  {
    isInvalid: (input) =>
      input.monthlyBudgetUsd !== undefined &&
      (!Number.isFinite(input.monthlyBudgetUsd) || input.monthlyBudgetUsd < 0),
    getMessage: () => "Monthly budget must be a non-negative number",
    field: "monthlyBudgetUsd",
  },
];

const RAG_BUDGET_FIELD_MAPPINGS: readonly FieldMapping[] = [
  {
    column: "rag_monthly_budget_usd",
    getValue: (input) => input.monthlyBudgetUsd,
  },
  {
    column: "rag_preferred_tier",
    getValue: (input) => input.preferredTier,
  },
  {
    column: "rag_allow_premium",
    getValue: (input) => input.allowPremium,
  },
  {
    column: "rag_degrade_on_budget_warning",
    getValue: (input) => input.degradeOnBudgetWarning,
  },
];

// ==================== Validation Functions ====================

// Re-export shared validator for backwards compatibility
export { validateId };

/**
 * Validates that limit is a positive number.
 */
export const validateLimit = (limit: number): void => {
  sharedValidateLimit(limit, 1);
};

/**
 * Validates that an installation ID is a positive number.
 */
export const validateInstallationId = (installationId: number): void => {
  if (!Number.isFinite(installationId) || installationId <= 0) {
    throw new ValidationError("Installation ID must be a positive number", {
      operation: "validateInstallationId",
      metadata: { field: "installationId" },
    });
  }
};

/**
 * Validates CreateTenantFromGitHub input using handler pattern.
 */
export const validateGitHubInstallInput = (input: CreateTenantFromGitHub): void => {
  const failedRule = GITHUB_INSTALL_VALIDATION_RULES.find((rule) => rule.isInvalid(input));

  if (failedRule === undefined) {
    return;
  }

  throw new ValidationError(failedRule.getMessage(), {
    operation: "validateGitHubInstallInput",
    metadata: { field: failedRule.field },
  });
};

/**
 * Validates LinkSlackWorkspace input using handler pattern.
 */
export const validateSlackLinkInput = (input: LinkSlackWorkspace): void => {
  const failedRule = SLACK_LINK_VALIDATION_RULES.find((rule) => rule.isInvalid(input));

  if (failedRule === undefined) {
    return;
  }

  throw new ValidationError(failedRule.getMessage(), {
    operation: "validateSlackLinkInput",
    metadata: { field: failedRule.field },
  });
};

/**
 * Validates Slack installation input (without tenantId).
 */
export const validateSlackInstallInput = (input: Omit<LinkSlackWorkspace, "tenantId">): void => {
  const validationChecks: ReadonlyArray<{
    readonly isInvalid: boolean;
    readonly message: string;
    readonly field: string;
  }> = [
    {
      isInvalid: input.slackWorkspaceId.trim().length === 0,
      message: "Slack workspace ID cannot be empty",
      field: "slackWorkspaceId",
    },
    {
      isInvalid: input.slackTeamName.trim().length === 0,
      message: "Slack team name cannot be empty",
      field: "slackTeamName",
    },
    {
      isInvalid: input.slackBotToken.trim().length === 0,
      message: "Slack bot token cannot be empty",
      field: "slackBotToken",
    },
  ];

  const failedCheck = validationChecks.find((check) => check.isInvalid);

  if (failedCheck === undefined) {
    return;
  }

  throw new ValidationError(failedCheck.message, {
    operation: "validateSlackInstallInput",
    metadata: { field: failedCheck.field },
  });
};

/**
 * Validates UpdateRAGBudgetInput using handler pattern.
 */
export const validateUpdateRAGBudgetInput = (input: UpdateRAGBudgetInput): void => {
  const failedRule = UPDATE_RAG_BUDGET_VALIDATION_RULES.find((rule) => rule.isInvalid(input));

  if (failedRule === undefined) {
    return;
  }

  throw new ValidationError(failedRule.getMessage(), {
    operation: "validateUpdateRAGBudgetInput",
    metadata: { field: failedRule.field },
  });
};

// ==================== Query Building ====================

/**
 * Builds the SQL query for updating RAG budget configuration.
 */
export const buildUpdateQuery = (input: UpdateRAGBudgetInput): UpdateQueryResult => {
  const { setClauses, values } = RAG_BUDGET_FIELD_MAPPINGS.reduce<{
    setClauses: readonly string[];
    values: ReadonlyArray<string | number | boolean>;
    paramIndex: number;
  }>(
    (accumulator, mapping) => {
      const value = mapping.getValue(input);
      if (value === undefined) {
        return accumulator;
      }

      return {
        setClauses: [...accumulator.setClauses, `${mapping.column} = $${accumulator.paramIndex}`],
        values: [...accumulator.values, value],
        paramIndex: accumulator.paramIndex + 1,
      };
    },
    { setClauses: [], values: [], paramIndex: 1 }
  );

  if (setClauses.length === 0) {
    return { query: "", values: [], hasUpdates: false };
  }

  const finalSetClauses = [...setClauses, "updated_at = NOW()"];
  const finalValues = [...values, input.tenantId];
  const paramIndex = values.length + 1;

  const updateQuery = `UPDATE tenants SET ${finalSetClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`;

  return { query: updateQuery, values: finalValues, hasUpdates: true };
};

// ==================== Row Mappers ====================

/**
 * Convert database row to Tenant entity
 */
export const rowToTenant = (row: TenantRow): Tenant => ({
  id: row.id,
  orgName: row.org_name,
  githubInstallationId: row.github_installation_id,
  githubAppInstalledAt: row.github_app_installed_at,
  slackWorkspaceId: row.slack_workspace_id,
  slackTeamName: row.slack_team_name,
  slackBotToken: (decryptValue(row.slack_bot_token) as string | null) ?? null,
  slackBotUserId: row.slack_bot_user_id,
  slackAppInstalledAt: row.slack_app_installed_at,
  gitlabGroupPath: row.gitlab_group_path,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  ragMonthlyBudgetUsd: row.rag_monthly_budget_usd
    ? parseFloat(row.rag_monthly_budget_usd)
    : RAG_BUDGET_DEFAULTS.MONTHLY_BUDGET_USD,
  ragPreferredTier:
    (row.rag_preferred_tier as TenantEmbeddingTier) ?? RAG_BUDGET_DEFAULTS.PREFERRED_TIER,
  ragAllowPremium: row.rag_allow_premium ?? RAG_BUDGET_DEFAULTS.ALLOW_PREMIUM,
  ragDegradeOnBudgetWarning:
    row.rag_degrade_on_budget_warning ?? RAG_BUDGET_DEFAULTS.DEGRADE_ON_BUDGET_WARNING,
});

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

/**
 * Maps database row to TenantAuditEntry domain object.
 */
export const mapRowToAuditEntry = (row: AuditRow): TenantAuditEntry => ({
  id: row.id,
  tenantId: row.tenant_id,
  action: row.action,
  actor: row.actor,
  metadata: row.metadata,
  createdAt: row.created_at,
});

/**
 * Maps tenant to RAG budget configuration.
 */
export const mapTenantToRAGBudgetConfig = (tenant: Tenant): TenantRAGBudgetConfig => ({
  tenantId: tenant.id,
  monthlyBudgetUsd: tenant.ragMonthlyBudgetUsd,
  preferredTier: tenant.ragPreferredTier,
  allowPremium: tenant.ragAllowPremium,
  degradeOnBudgetWarning: tenant.ragDegradeOnBudgetWarning,
});

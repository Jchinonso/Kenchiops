/**
 * Tenant Types
 *
 * Type definitions for tenant operations.
 *
 * @module database/tenant/types
 */

import type {
  CreateTenantFromGitHub,
  LinkSlackWorkspace,
  TenantAuditAction,
  TenantEmbeddingTier,
  TenantStatus,
} from "../common.js";

// ==================== Tenant Row Types ====================

/**
 * Database row type for tenants table.
 * Provider-specific columns have been moved to provider_connections.
 */
export interface TenantRow {
  readonly id: string;
  readonly org_name: string;
  readonly provider: string;
  readonly status: TenantStatus;
  readonly created_at: Date;
  readonly updated_at: Date;
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

// ==================== Audit Row Types ====================

/**
 * Database row for tenant_audit_log table.
 */
export interface AuditRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly action: TenantAuditAction;
  readonly actor: string | null;
  readonly metadata: Record<string, unknown>;
  readonly created_at: Date;
}

// ==================== RAG Config Types ====================

/**
 * Input for updating RAG budget configuration.
 */
export interface UpdateRAGBudgetInput {
  readonly tenantId: string;
  readonly monthlyBudgetUsd?: number;
  readonly preferredTier?: TenantEmbeddingTier;
  readonly allowPremium?: boolean;
  readonly degradeOnBudgetWarning?: boolean;
}

/**
 * RAG budget configuration for a tenant.
 */
export interface TenantRAGBudgetConfig {
  readonly tenantId: string;
  readonly monthlyBudgetUsd: number;
  readonly preferredTier: TenantEmbeddingTier;
  readonly allowPremium: boolean;
  readonly degradeOnBudgetWarning: boolean;
}

/**
 * Field mapping for RAG budget update query.
 */
export interface FieldMapping {
  readonly column: string;
  readonly getValue: (input: UpdateRAGBudgetInput) => string | number | boolean | undefined;
}

/**
 * Result of building the update query.
 */
export interface UpdateQueryResult {
  readonly query: string;
  readonly values: ReadonlyArray<string | number | boolean>;
  readonly hasUpdates: boolean;
}

// ==================== Validation Types ====================

/**
 * Validation rule for CreateTenantFromGitHub.
 */
export interface GitHubInstallValidationRule {
  readonly isInvalid: (input: CreateTenantFromGitHub) => boolean;
  readonly getMessage: () => string;
  readonly field: string;
}

/**
 * Validation rule for LinkSlackWorkspace.
 */
export interface SlackLinkValidationRule {
  readonly isInvalid: (input: LinkSlackWorkspace) => boolean;
  readonly getMessage: () => string;
  readonly field: string;
}

/**
 * Validation rule for UpdateRAGBudgetInput.
 */
export interface UpdateRAGBudgetValidationRule {
  readonly isInvalid: (input: UpdateRAGBudgetInput) => boolean;
  readonly getMessage: () => string;
  readonly field: string;
}

/**
 * Tenant RAG Budget Configuration
 *
 * Manages per-tenant RAG embedding budget and tier configuration.
 * Supports budget limits, preferred tiers, and automatic tier degradation.
 *
 * @module database/tenantRagConfig
 */

import { createLogger } from "../core/logger.js";
import { NotFoundError } from "../core/errors.js";
import type { TenantEmbeddingTier, Tenant } from "../core/types.js";
import { query } from "./client.js";
import { findById, rowToTenant, type TenantRow } from "./tenantService.js";

const logger = createLogger("tenant-rag-config");

// ==================== Types ====================

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

// ==================== Configuration Functions ====================

/**
 * Get RAG budget configuration for a tenant.
 */
export const getRAGBudgetConfig = async (
  tenantId: string
): Promise<TenantRAGBudgetConfig | null> => {
  const tenant = await findById(tenantId);
  if (!tenant) {
    return null;
  }

  return {
    tenantId: tenant.id,
    monthlyBudgetUsd: tenant.ragMonthlyBudgetUsd,
    preferredTier: tenant.ragPreferredTier,
    allowPremium: tenant.ragAllowPremium,
    degradeOnBudgetWarning: tenant.ragDegradeOnBudgetWarning,
  };
};

/**
 * Update RAG budget configuration for a tenant.
 */
export const updateRAGBudgetConfig = async (input: UpdateRAGBudgetInput): Promise<Tenant> => {
  const setClauses: string[] = [];
  const values: Array<string | number | boolean> = [];
  let paramIndex = 1;

  if (input.monthlyBudgetUsd !== undefined) {
    setClauses.push(`rag_monthly_budget_usd = $${paramIndex++}`);
    values.push(input.monthlyBudgetUsd);
  }

  if (input.preferredTier !== undefined) {
    setClauses.push(`rag_preferred_tier = $${paramIndex++}`);
    values.push(input.preferredTier);
  }

  if (input.allowPremium !== undefined) {
    setClauses.push(`rag_allow_premium = $${paramIndex++}`);
    values.push(input.allowPremium);
  }

  if (input.degradeOnBudgetWarning !== undefined) {
    setClauses.push(`rag_degrade_on_budget_warning = $${paramIndex++}`);
    values.push(input.degradeOnBudgetWarning);
  }

  if (setClauses.length === 0) {
    const tenant = await findById(input.tenantId);
    if (!tenant) {
      throw new NotFoundError(`Tenant not found: ${input.tenantId}`);
    }
    return tenant;
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(input.tenantId);

  const result = await query<TenantRow>(
    `UPDATE tenants SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new NotFoundError(`Tenant not found: ${input.tenantId}`);
  }

  logger.info("RAG budget config updated", {
    tenantId: input.tenantId,
    monthlyBudgetUsd: input.monthlyBudgetUsd,
    preferredTier: input.preferredTier,
  });

  return rowToTenant(result.rows[0]);
};

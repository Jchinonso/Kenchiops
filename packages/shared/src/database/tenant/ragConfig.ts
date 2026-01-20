/**
 * Tenant RAG Budget Configuration
 *
 * Manages per-tenant RAG embedding budget and tier configuration.
 *
 * @module database/tenant/ragConfig
 */

import { query, createLogger, getErrorMessage, NotFoundError, type Tenant } from "../common.js";
import { findById } from "./serviceLookup.js";
import type { TenantRow, UpdateRAGBudgetInput, TenantRAGBudgetConfig } from "./types.js";
import {
  rowToTenant,
  mapTenantToRAGBudgetConfig,
  validateUpdateRAGBudgetInput,
  validateId,
  buildUpdateQuery,
} from "./helpers.js";

const logger = createLogger("tenant-rag-config");

/**
 * Get RAG budget configuration for a tenant.
 *
 * @param tenantId - Tenant ID
 * @returns RAG budget configuration or null if tenant not found
 */
export const getRAGBudgetConfig = async (
  tenantId: string
): Promise<TenantRAGBudgetConfig | null> => {
  validateId(tenantId, "tenantId");

  try {
    const tenant = await findById(tenantId);
    if (tenant === null) {
      return null;
    }

    return mapTenantToRAGBudgetConfig(tenant);
  } catch (error) {
    logger.error("Failed to get RAG budget config", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Update RAG budget configuration for a tenant.
 *
 * @param input - Update input with tenant ID and fields to update
 * @returns Updated tenant
 */
export const updateRAGBudgetConfig = async (input: UpdateRAGBudgetInput): Promise<Tenant> => {
  validateUpdateRAGBudgetInput(input);

  try {
    const { query: updateQuery, values, hasUpdates } = buildUpdateQuery(input);

    if (!hasUpdates) {
      const tenant = await findById(input.tenantId);
      if (tenant === null) {
        throw new NotFoundError(`Tenant not found: ${input.tenantId}`);
      }
      return tenant;
    }

    const result = await query<TenantRow>(updateQuery, [...values]);

    if (result.rows.length === 0) {
      throw new NotFoundError(`Tenant not found: ${input.tenantId}`);
    }

    logger.info("RAG budget config updated", {
      tenantId: input.tenantId,
      monthlyBudgetUsd: input.monthlyBudgetUsd,
      preferredTier: input.preferredTier,
    });

    return rowToTenant(result.rows[0]);
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }

    logger.error("Failed to update RAG budget config", {
      tenantId: input.tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

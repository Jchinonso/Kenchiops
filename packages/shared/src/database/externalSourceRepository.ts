/**
 * External Source Repository
 *
 * Database operations for external knowledge sources with tenant opt-in tracking.
 * Supports cross-repo knowledge ingestion from various external platforms.
 *
 * @module database/externalSourceRepository
 */

import { query } from "./client.js";
import { createLogger } from "../core/logger.js";
import { generateEventId } from "../core/utils.js";
import {
  EXTERNAL_SOURCE_CONFIG,
  type ExternalSourceType,
  type TechStackTag,
} from "../constants/index.js";

const logger = createLogger("external-source-repository");

// ==================== Types ====================

/**
 * Database row for external source.
 */
interface ExternalSourceRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly source_type: string;
  readonly name: string;
  readonly base_url: string | null;
  readonly auth_config: Record<string, unknown> | null;
  readonly tech_stack_tags: string[] | null;
  readonly is_enabled: boolean;
  readonly credibility_score: string;
  readonly last_sync_at: string | null;
  readonly sync_frequency_hours: number;
  readonly doc_count: number;
  readonly error_count: number;
  readonly metadata: Record<string, unknown> | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * External source record.
 */
export interface ExternalSource {
  readonly id: string;
  readonly tenantId: string;
  readonly sourceType: ExternalSourceType;
  readonly name: string;
  readonly baseUrl?: string;
  readonly authConfig?: Record<string, unknown>;
  readonly techStackTags: readonly TechStackTag[];
  readonly isEnabled: boolean;
  readonly credibilityScore: number;
  readonly lastSyncAt?: string;
  readonly syncFrequencyHours: number;
  readonly docCount: number;
  readonly errorCount: number;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Input for creating an external source.
 */
export interface CreateExternalSourceInput {
  readonly tenantId: string;
  readonly sourceType: ExternalSourceType;
  readonly name: string;
  readonly baseUrl?: string;
  readonly authConfig?: Record<string, unknown>;
  readonly techStackTags?: readonly TechStackTag[];
  readonly syncFrequencyHours?: number;
  readonly credibilityScore?: number;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Input for updating an external source.
 */
export interface UpdateExternalSourceInput {
  readonly name?: string;
  readonly baseUrl?: string;
  readonly authConfig?: Record<string, unknown>;
  readonly techStackTags?: readonly TechStackTag[];
  readonly isEnabled?: boolean;
  readonly credibilityScore?: number;
  readonly syncFrequencyHours?: number;
  readonly metadata?: Record<string, unknown>;
}

// ==================== SQL Queries ====================

const EXTERNAL_SOURCE_QUERIES = {
  INSERT: `
    INSERT INTO external_sources (
      id, tenant_id, source_type, name, base_url, auth_config,
      tech_stack_tags, is_enabled, credibility_score, sync_frequency_hours, metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $9, $10)
    RETURNING *
  `,

  GET_BY_ID: `SELECT * FROM external_sources WHERE id = $1`,

  GET_BY_TENANT: `
    SELECT * FROM external_sources
    WHERE tenant_id = $1
    ORDER BY created_at DESC
  `,

  GET_ENABLED_BY_TENANT: `
    SELECT * FROM external_sources
    WHERE tenant_id = $1 AND is_enabled = TRUE
    ORDER BY credibility_score DESC
  `,

  GET_BY_TYPE: `
    SELECT * FROM external_sources
    WHERE tenant_id = $1 AND source_type = $2
  `,

  GET_DUE_FOR_SYNC: `
    SELECT * FROM external_sources
    WHERE is_enabled = TRUE
      AND (last_sync_at IS NULL OR
           last_sync_at < NOW() - (sync_frequency_hours || ' hours')::INTERVAL)
    ORDER BY last_sync_at ASC NULLS FIRST
    LIMIT $1
  `,

  UPDATE: `
    UPDATE external_sources SET
      name = COALESCE($2, name),
      base_url = COALESCE($3, base_url),
      auth_config = COALESCE($4, auth_config),
      tech_stack_tags = COALESCE($5, tech_stack_tags),
      is_enabled = COALESCE($6, is_enabled),
      credibility_score = COALESCE($7, credibility_score),
      sync_frequency_hours = COALESCE($8, sync_frequency_hours),
      metadata = COALESCE($9, metadata),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `,

  UPDATE_SYNC_STATUS: `
    UPDATE external_sources SET
      last_sync_at = NOW(),
      doc_count = $2,
      error_count = $3,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `,

  DELETE: `DELETE FROM external_sources WHERE id = $1`,

  DELETE_BY_TENANT: `DELETE FROM external_sources WHERE tenant_id = $1`,

  COUNT_BY_TENANT: `
    SELECT COUNT(*) as count FROM external_sources WHERE tenant_id = $1
  `,
} as const;

// ==================== Mappers ====================

/**
 * Maps database row to ExternalSource.
 */
const mapRowToExternalSource = (row: ExternalSourceRow): ExternalSource => ({
  id: row.id,
  tenantId: row.tenant_id,
  sourceType: row.source_type as ExternalSourceType,
  name: row.name,
  baseUrl: row.base_url ?? undefined,
  authConfig: row.auth_config ?? undefined,
  techStackTags: (row.tech_stack_tags ?? []) as readonly TechStackTag[],
  isEnabled: row.is_enabled,
  credibilityScore: parseFloat(row.credibility_score),
  lastSyncAt: row.last_sync_at ?? undefined,
  syncFrequencyHours: row.sync_frequency_hours,
  docCount: row.doc_count,
  errorCount: row.error_count,
  metadata: row.metadata ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// ==================== Public API ====================

/**
 * Creates a new external source.
 */
export const createExternalSource = async (
  input: CreateExternalSourceInput
): Promise<ExternalSource> => {
  const id = generateEventId();

  const result = await query<ExternalSourceRow>(EXTERNAL_SOURCE_QUERIES.INSERT, [
    id,
    input.tenantId,
    input.sourceType,
    input.name,
    input.baseUrl ?? null,
    input.authConfig ? JSON.stringify(input.authConfig) : null,
    input.techStackTags ?? [],
    input.credibilityScore ?? EXTERNAL_SOURCE_CONFIG.DEFAULT_CREDIBILITY_SCORE,
    input.syncFrequencyHours ?? EXTERNAL_SOURCE_CONFIG.DEFAULT_SYNC_FREQUENCY_HOURS,
    input.metadata ? JSON.stringify(input.metadata) : null,
  ]);

  logger.info("Created external source", {
    id,
    tenantId: input.tenantId,
    sourceType: input.sourceType,
    name: input.name,
  });

  return mapRowToExternalSource(result.rows[0]);
};

/**
 * Gets an external source by ID.
 */
export const getExternalSourceById = async (sourceId: string): Promise<ExternalSource | null> => {
  const result = await query<ExternalSourceRow>(EXTERNAL_SOURCE_QUERIES.GET_BY_ID, [sourceId]);
  return result.rows.length === 0 ? null : mapRowToExternalSource(result.rows[0]);
};

/**
 * Gets all external sources for a tenant.
 */
export const getExternalSourcesByTenant = async (
  tenantId: string
): Promise<readonly ExternalSource[]> => {
  const result = await query<ExternalSourceRow>(EXTERNAL_SOURCE_QUERIES.GET_BY_TENANT, [tenantId]);
  return Object.freeze(result.rows.map(mapRowToExternalSource));
};

/**
 * Gets enabled external sources for a tenant.
 */
export const getEnabledExternalSources = async (
  tenantId: string
): Promise<readonly ExternalSource[]> => {
  const result = await query<ExternalSourceRow>(EXTERNAL_SOURCE_QUERIES.GET_ENABLED_BY_TENANT, [
    tenantId,
  ]);
  return Object.freeze(result.rows.map(mapRowToExternalSource));
};

/**
 * Gets external sources by type for a tenant.
 */
export const getExternalSourcesByType = async (
  tenantId: string,
  sourceType: ExternalSourceType
): Promise<readonly ExternalSource[]> => {
  const result = await query<ExternalSourceRow>(EXTERNAL_SOURCE_QUERIES.GET_BY_TYPE, [
    tenantId,
    sourceType,
  ]);
  return Object.freeze(result.rows.map(mapRowToExternalSource));
};

/**
 * Gets external sources due for sync.
 */
export const getSourcesDueForSync = async (
  limit: number = 10
): Promise<readonly ExternalSource[]> => {
  const result = await query<ExternalSourceRow>(EXTERNAL_SOURCE_QUERIES.GET_DUE_FOR_SYNC, [limit]);
  return Object.freeze(result.rows.map(mapRowToExternalSource));
};

/**
 * Updates an external source.
 */
export const updateExternalSource = async (
  sourceId: string,
  input: UpdateExternalSourceInput
): Promise<ExternalSource | null> => {
  const result = await query<ExternalSourceRow>(EXTERNAL_SOURCE_QUERIES.UPDATE, [
    sourceId,
    input.name ?? null,
    input.baseUrl ?? null,
    input.authConfig ? JSON.stringify(input.authConfig) : null,
    input.techStackTags ?? null,
    input.isEnabled ?? null,
    input.credibilityScore ?? null,
    input.syncFrequencyHours ?? null,
    input.metadata ? JSON.stringify(input.metadata) : null,
  ]);

  if (result.rows.length === 0) {
    return null;
  }

  logger.info("Updated external source", { sourceId });
  return mapRowToExternalSource(result.rows[0]);
};

/**
 * Updates sync status after a sync operation.
 */
export const updateSyncStatus = async (
  sourceId: string,
  docCount: number,
  errorCount: number
): Promise<ExternalSource | null> => {
  const result = await query<ExternalSourceRow>(EXTERNAL_SOURCE_QUERIES.UPDATE_SYNC_STATUS, [
    sourceId,
    docCount,
    errorCount,
  ]);

  if (result.rows.length === 0) {
    return null;
  }

  logger.debug("Updated external source sync status", { sourceId, docCount, errorCount });
  return mapRowToExternalSource(result.rows[0]);
};

/**
 * Deletes an external source.
 */
export const deleteExternalSource = async (sourceId: string): Promise<boolean> => {
  const result = await query(EXTERNAL_SOURCE_QUERIES.DELETE, [sourceId]);
  if (result.rowCount === 0) {
    return false;
  }
  logger.info("Deleted external source", { sourceId });
  return true;
};

/**
 * Deletes all external sources for a tenant.
 */
export const deleteExternalSourcesByTenant = async (tenantId: string): Promise<number> => {
  const result = await query(EXTERNAL_SOURCE_QUERIES.DELETE_BY_TENANT, [tenantId]);
  logger.info("Deleted external sources for tenant", { tenantId, count: result.rowCount });
  return result.rowCount;
};

/**
 * Gets count of external sources for a tenant.
 */
export const getExternalSourceCount = async (tenantId: string): Promise<number> => {
  const result = await query<{ count: string }>(EXTERNAL_SOURCE_QUERIES.COUNT_BY_TENANT, [
    tenantId,
  ]);
  return parseInt(result.rows[0]?.count ?? "0", 10);
};

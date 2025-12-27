/**
 * Repository Channel Service
 *
 * Manages mappings between GitHub repositories and Slack channels.
 * Each repository can be mapped to exactly one channel per tenant,
 * enabling targeted CI failure notifications to the right team.
 */

import { query } from "./client.js";
import { createLogger, parseDbCount } from "../core/index.js";
import type { RepositoryChannelMapping, CreateRepositoryChannelMapping } from "../core/types.js";

const logger = createLogger("repository-channel-service");

// ==================== Types ====================

/**
 * Database row type for repository_channel_mappings table
 */
interface MappingRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly repository: string;
  readonly slack_channel_id: string;
  readonly slack_channel_name: string | null;
  readonly created_by: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

// ==================== Row Converters ====================

/**
 * Convert database row to RepositoryChannelMapping entity
 */
const rowToMapping = (row: MappingRow): RepositoryChannelMapping => ({
  id: row.id,
  tenantId: row.tenant_id,
  repository: row.repository,
  slackChannelId: row.slack_channel_id,
  slackChannelName: row.slack_channel_name,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// ==================== Internal Helpers ====================

/**
 * Extract first row from query result, converting to Mapping or null
 */
const extractMapping = (rows: readonly MappingRow[]): RepositoryChannelMapping | null =>
  rows.length > 0 ? rowToMapping(rows[0]) : null;

/**
 * Get row count with fallback to 0
 */
const getRowCount = (rowCount: number | null | undefined): number => rowCount ?? 0;

// ==================== Lookup Methods ====================

/**
 * Find the Slack channel mapped to a repository.
 * Used when routing CI failure notifications.
 */
export const findChannelForRepository = async (
  tenantId: string,
  repository: string
): Promise<RepositoryChannelMapping | null> => {
  const result = await query<MappingRow>(
    `SELECT * FROM repository_channel_mappings
     WHERE tenant_id = $1 AND repository = $2`,
    [tenantId, repository]
  );
  return extractMapping(result.rows);
};

/**
 * Find all mappings for a specific channel.
 * Used to show what repos are configured for a channel.
 */
export const findMappingsForChannel = async (
  tenantId: string,
  channelId: string
): Promise<readonly RepositoryChannelMapping[]> => {
  const result = await query<MappingRow>(
    `SELECT * FROM repository_channel_mappings
     WHERE tenant_id = $1 AND slack_channel_id = $2
     ORDER BY repository`,
    [tenantId, channelId]
  );
  return result.rows.map(rowToMapping);
};

/**
 * Find all mappings for a tenant.
 * Used for admin views and debugging.
 */
export const findAllMappingsForTenant = async (
  tenantId: string
): Promise<readonly RepositoryChannelMapping[]> => {
  const result = await query<MappingRow>(
    `SELECT * FROM repository_channel_mappings
     WHERE tenant_id = $1
     ORDER BY repository`,
    [tenantId]
  );
  return result.rows.map(rowToMapping);
};

/**
 * Get all repositories that are already mapped for a tenant.
 * Used to filter dropdown options when selecting a repo.
 */
export const getMappedRepositories = async (tenantId: string): Promise<Set<string>> => {
  const result = await query<{ repository: string }>(
    `SELECT repository FROM repository_channel_mappings WHERE tenant_id = $1`,
    [tenantId]
  );
  return new Set(result.rows.map((row) => row.repository));
};

// ==================== Mutation Methods ====================

/**
 * Create a new repository-to-channel mapping.
 * Replaces any existing mapping for the same repository.
 */
export const createMapping = async (
  data: CreateRepositoryChannelMapping
): Promise<RepositoryChannelMapping> => {
  const result = await query<MappingRow>(
    `INSERT INTO repository_channel_mappings
       (tenant_id, repository, slack_channel_id, slack_channel_name, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, repository)
     DO UPDATE SET
       slack_channel_id = EXCLUDED.slack_channel_id,
       slack_channel_name = EXCLUDED.slack_channel_name,
       updated_at = NOW()
     RETURNING *`,
    [
      data.tenantId,
      data.repository,
      data.slackChannelId,
      data.slackChannelName ?? null,
      data.createdBy ?? null,
    ]
  );

  const mapping = rowToMapping(result.rows[0]);

  logger.info("Repository-channel mapping created", {
    tenantId: data.tenantId,
    repository: data.repository,
    channelId: data.slackChannelId,
    channelName: data.slackChannelName,
  });

  return mapping;
};

/**
 * Delete a repository-to-channel mapping.
 * @returns true if deleted, false if not found
 */
export const deleteMapping = async (tenantId: string, repository: string): Promise<boolean> => {
  const result = await query(
    `DELETE FROM repository_channel_mappings
     WHERE tenant_id = $1 AND repository = $2`,
    [tenantId, repository]
  );

  const deleted = getRowCount(result.rowCount) > 0;

  if (deleted) {
    logger.info("Repository-channel mapping deleted", { tenantId, repository });
  }

  return deleted;
};

/**
 * Delete all mappings for a channel.
 * Used when bot is removed from a channel.
 * @returns Number of deleted mappings
 */
export const deleteMappingsForChannel = async (
  tenantId: string,
  channelId: string
): Promise<number> => {
  const result = await query(
    `DELETE FROM repository_channel_mappings
     WHERE tenant_id = $1 AND slack_channel_id = $2`,
    [tenantId, channelId]
  );

  const count = getRowCount(result.rowCount);

  if (count > 0) {
    logger.info("Deleted mappings for channel", {
      tenantId,
      channelId,
      deletedCount: count,
    });
  }

  return count;
};

// ==================== Validation ====================

/**
 * Check if a repository is already mapped to a channel.
 */
export const isMapped = async (tenantId: string, repository: string): Promise<boolean> => {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM repository_channel_mappings
     WHERE tenant_id = $1 AND repository = $2`,
    [tenantId, repository]
  );
  return parseDbCount(result.rows) > 0;
};

/**
 * Repository Channel Service
 *
 * Manages mappings between GitHub repositories and Slack channels.
 * Each repository can be mapped to exactly one channel per tenant,
 * enabling targeted CI failure notifications to the right team.
 *
 * Security: All queries use parameterized statements to prevent SQL injection.
 * Input validation ensures only valid data types are accepted.
 *
 * @module database/repositoryChannel/service
 */

import {
  query,
  createLogger,
  getErrorMessage,
  parseDbCount,
  REPOSITORY_CHANNEL_QUERIES,
} from "../common.js";
import type {
  RepositoryChannelMapping,
  CreateRepositoryChannelMapping,
  MappingRow,
  RepositoryRow,
  CountRow,
} from "./types.js";
import {
  mapRowToMapping,
  extractFirstMapping,
  mapRowsToRepositorySet,
  getRowCount,
  validateCreateMappingInput,
  validateId,
} from "./helpers.js";

const logger = createLogger("repository-channel-service");

// ==================== Lookup Methods ====================

/**
 * Find the Slack channel mapped to a repository.
 * Used when routing CI failure notifications.
 *
 * @param tenantId - Tenant ID
 * @param repository - Repository name (owner/repo)
 * @returns Mapping or null if not found
 * @throws ValidationError if parameters are invalid
 * @throws Error if database operation fails
 */
export const findChannelForRepository = async (
  tenantId: string,
  repository: string
): Promise<RepositoryChannelMapping | null> => {
  validateId(tenantId, "tenantId");
  validateId(repository, "repository");

  try {
    const result = await query<MappingRow>(REPOSITORY_CHANNEL_QUERIES.FIND_BY_REPOSITORY, [
      tenantId,
      repository,
    ]);
    return extractFirstMapping(result.rows);
  } catch (error) {
    logger.error("Failed to find channel for repository", {
      tenantId,
      repository,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Find all mappings for a specific channel.
 * Used to show what repos are configured for a channel.
 *
 * @param tenantId - Tenant ID
 * @param channelId - Slack channel ID
 * @returns Array of mappings for the channel
 * @throws ValidationError if parameters are invalid
 * @throws Error if database operation fails
 */
export const findMappingsForChannel = async (
  tenantId: string,
  channelId: string
): Promise<readonly RepositoryChannelMapping[]> => {
  validateId(tenantId, "tenantId");
  validateId(channelId, "channelId");

  try {
    const result = await query<MappingRow>(REPOSITORY_CHANNEL_QUERIES.FIND_BY_CHANNEL, [
      tenantId,
      channelId,
    ]);
    return Object.freeze(result.rows.map(mapRowToMapping));
  } catch (error) {
    logger.error("Failed to find mappings for channel", {
      tenantId,
      channelId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Find all mappings for a tenant.
 * Used for admin views and debugging.
 *
 * @param tenantId - Tenant ID
 * @returns Array of all mappings for tenant
 * @throws ValidationError if tenantId is empty
 * @throws Error if database operation fails
 */
export const findAllMappingsForTenant = async (
  tenantId: string
): Promise<readonly RepositoryChannelMapping[]> => {
  validateId(tenantId, "tenantId");

  try {
    const result = await query<MappingRow>(REPOSITORY_CHANNEL_QUERIES.FIND_ALL_BY_TENANT, [
      tenantId,
    ]);
    return Object.freeze(result.rows.map(mapRowToMapping));
  } catch (error) {
    logger.error("Failed to find all mappings for tenant", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Get all repositories that are already mapped for a tenant.
 * Used to filter dropdown options when selecting a repo.
 *
 * @param tenantId - Tenant ID
 * @returns Set of mapped repository names
 * @throws ValidationError if tenantId is empty
 * @throws Error if database operation fails
 */
export const getMappedRepositories = async (tenantId: string): Promise<Set<string>> => {
  validateId(tenantId, "tenantId");

  try {
    const result = await query<RepositoryRow>(REPOSITORY_CHANNEL_QUERIES.GET_MAPPED_REPOSITORIES, [
      tenantId,
    ]);
    return mapRowsToRepositorySet(result.rows);
  } catch (error) {
    logger.error("Failed to get mapped repositories", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

// ==================== Mutation Methods ====================

/**
 * Create a new repository-to-channel mapping.
 * Replaces any existing mapping for the same repository.
 *
 * @param data - Mapping data
 * @returns The created or updated mapping
 * @throws ValidationError if data is invalid
 * @throws Error if database operation fails
 */
export const createMapping = async (
  data: CreateRepositoryChannelMapping
): Promise<RepositoryChannelMapping> => {
  validateCreateMappingInput(data);

  try {
    const result = await query<MappingRow>(REPOSITORY_CHANNEL_QUERIES.INSERT_OR_UPDATE, [
      data.tenantId,
      data.repository,
      data.slackChannelId,
      data.slackChannelName ?? null,
      data.createdBy ?? null,
    ]);

    const mapping = mapRowToMapping(result.rows[0]);

    logger.info("Repository-channel mapping created", {
      tenantId: data.tenantId,
      repository: data.repository,
      channelId: data.slackChannelId,
      channelName: data.slackChannelName,
    });

    return mapping;
  } catch (error) {
    logger.error("Failed to create repository-channel mapping", {
      tenantId: data.tenantId,
      repository: data.repository,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Delete a repository-to-channel mapping.
 *
 * @param tenantId - Tenant ID
 * @param repository - Repository name
 * @returns True if deleted, false if not found
 * @throws ValidationError if parameters are invalid
 * @throws Error if database operation fails
 */
export const deleteMapping = async (tenantId: string, repository: string): Promise<boolean> => {
  validateId(tenantId, "tenantId");
  validateId(repository, "repository");

  try {
    const result = await query(REPOSITORY_CHANNEL_QUERIES.DELETE_BY_REPOSITORY, [
      tenantId,
      repository,
    ]);

    const deleted = getRowCount(result.rowCount) > 0;

    if (deleted) {
      logger.info("Repository-channel mapping deleted", { tenantId, repository });
    }

    return deleted;
  } catch (error) {
    logger.error("Failed to delete repository-channel mapping", {
      tenantId,
      repository,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Delete all mappings for a channel.
 * Used when bot is removed from a channel.
 *
 * @param tenantId - Tenant ID
 * @param channelId - Slack channel ID
 * @returns Number of deleted mappings
 * @throws ValidationError if parameters are invalid
 * @throws Error if database operation fails
 */
export const deleteMappingsForChannel = async (
  tenantId: string,
  channelId: string
): Promise<number> => {
  validateId(tenantId, "tenantId");
  validateId(channelId, "channelId");

  try {
    const result = await query(REPOSITORY_CHANNEL_QUERIES.DELETE_BY_CHANNEL, [tenantId, channelId]);

    const count = getRowCount(result.rowCount);

    if (count > 0) {
      logger.info("Deleted mappings for channel", {
        tenantId,
        channelId,
        deletedCount: count,
      });
    }

    return count;
  } catch (error) {
    logger.error("Failed to delete mappings for channel", {
      tenantId,
      channelId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

// ==================== Validation Queries ====================

/**
 * Check if a repository is already mapped to a channel.
 *
 * @param tenantId - Tenant ID
 * @param repository - Repository name
 * @returns True if mapped, false otherwise
 * @throws ValidationError if parameters are invalid
 * @throws Error if database operation fails
 */
export const isMapped = async (tenantId: string, repository: string): Promise<boolean> => {
  validateId(tenantId, "tenantId");
  validateId(repository, "repository");

  try {
    const result = await query<CountRow>(REPOSITORY_CHANNEL_QUERIES.COUNT_BY_REPOSITORY, [
      tenantId,
      repository,
    ]);
    return parseDbCount(result.rows) > 0;
  } catch (error) {
    logger.error("Failed to check if repository is mapped", {
      tenantId,
      repository,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

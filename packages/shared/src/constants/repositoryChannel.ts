/**
 * Repository Channel Service Constants
 *
 * SQL queries and configuration for repository-channel mapping operations.
 *
 * @module constants/repositoryChannel
 */

// ==================== SQL Queries ====================

/**
 * SQL query templates for repository-channel mapping operations.
 * All queries use parameterized statements for SQL injection prevention.
 */
export const REPOSITORY_CHANNEL_QUERIES = {
  FIND_BY_REPOSITORY: `
    SELECT * FROM repository_channel_mappings
    WHERE tenant_id = $1 AND repository = $2
  `,

  FIND_BY_CHANNEL: `
    SELECT * FROM repository_channel_mappings
    WHERE tenant_id = $1 AND slack_channel_id = $2
    ORDER BY repository
  `,

  FIND_ALL_BY_TENANT: `
    SELECT * FROM repository_channel_mappings
    WHERE tenant_id = $1
    ORDER BY repository
  `,

  GET_MAPPED_REPOSITORIES: `
    SELECT repository FROM repository_channel_mappings
    WHERE tenant_id = $1
  `,

  INSERT_OR_UPDATE: `
    INSERT INTO repository_channel_mappings
      (tenant_id, repository, slack_channel_id, slack_channel_name, created_by)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (tenant_id, repository)
    DO UPDATE SET
      slack_channel_id = EXCLUDED.slack_channel_id,
      slack_channel_name = EXCLUDED.slack_channel_name,
      updated_at = NOW()
    RETURNING *
  `,

  DELETE_BY_REPOSITORY: `
    DELETE FROM repository_channel_mappings
    WHERE tenant_id = $1 AND repository = $2
  `,

  DELETE_BY_CHANNEL: `
    DELETE FROM repository_channel_mappings
    WHERE tenant_id = $1 AND slack_channel_id = $2
  `,

  COUNT_BY_REPOSITORY: `
    SELECT COUNT(*) as count FROM repository_channel_mappings
    WHERE tenant_id = $1 AND repository = $2
  `,
} as const;

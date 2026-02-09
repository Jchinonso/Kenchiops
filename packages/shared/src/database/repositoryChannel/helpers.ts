/**
 * Repository Channel Service Helpers
 *
 * Validation functions and row mappers for repository-channel mapping operations.
 *
 * @module database/repositoryChannel/helpers
 */

import { ValidationError, type RepositoryChannelMapping, validateId } from "../common.js";
import type {
  CreateRepositoryChannelMapping,
  CreateMappingValidationRule,
  MappingRow,
  RepositoryRow,
} from "./types.js";

// ==================== Validation Rules ====================

/**
 * Validation rules for creating repository-channel mappings.
 */
const CREATE_MAPPING_VALIDATION_RULES: readonly CreateMappingValidationRule[] = [
  {
    isInvalid: (input) => input.tenantId.trim().length === 0,
    getMessage: () => "Tenant ID cannot be empty",
    field: "tenantId",
  },
  {
    isInvalid: (input) => input.repository.trim().length === 0,
    getMessage: () => "Repository cannot be empty",
    field: "repository",
  },
  {
    isInvalid: (input) => input.slackChannelId.trim().length === 0,
    getMessage: () => "Slack channel ID cannot be empty",
    field: "slackChannelId",
  },
];

// ==================== Validation Functions ====================

/**
 * Validates CreateRepositoryChannelMapping input using handler pattern.
 *
 * @param input - Input to validate
 * @throws ValidationError if input is invalid
 */
export const validateCreateMappingInput = (input: CreateRepositoryChannelMapping): void => {
  const failedRule = CREATE_MAPPING_VALIDATION_RULES.find((rule) => rule.isInvalid(input));

  if (failedRule === undefined) {
    return;
  }

  throw new ValidationError(failedRule.getMessage(), {
    operation: "validateCreateMappingInput",
    metadata: { field: failedRule.field },
  });
};

// Re-export shared validators for backwards compatibility
export { validateId };

// ==================== Row Mappers ====================

/**
 * Maps database row to RepositoryChannelMapping domain object.
 *
 * @param row - Database row from repository_channel_mappings table
 * @returns RepositoryChannelMapping domain object
 */
export const mapRowToMapping = (row: MappingRow): RepositoryChannelMapping => ({
  id: row.id,
  tenantId: row.tenant_id,
  repository: row.repository,
  slackChannelId: row.slack_channel_id,
  slackChannelName: row.slack_channel_name,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Extracts first mapping from query result rows.
 *
 * @param rows - Array of database rows
 * @returns First mapping or null if empty
 */
export const extractFirstMapping = (
  rows: readonly MappingRow[]
): RepositoryChannelMapping | null => (rows.length === 0 ? null : mapRowToMapping(rows[0]));

/**
 * Maps array of rows to Set of repository names.
 *
 * @param rows - Array of repository rows
 * @returns Set of repository names
 */
export const mapRowsToRepositorySet = (rows: readonly RepositoryRow[]): Set<string> =>
  new Set(rows.map((row) => row.repository));

/**
 * Gets row count with fallback to 0.
 *
 * @param rowCount - Row count from query result
 * @returns Row count or 0 if null/undefined
 */
export const getRowCount = (rowCount: number | null | undefined): number => rowCount ?? 0;

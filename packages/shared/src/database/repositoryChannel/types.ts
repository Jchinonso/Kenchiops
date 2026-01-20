/**
 * Repository Channel Service Types
 *
 * Type definitions and mappers for repository-channel mapping operations.
 *
 * @module database/repositoryChannel/types
 */

import type { CreateRepositoryChannelMapping } from "../common.js";

// Re-export core types for convenience
export type { RepositoryChannelMapping, CreateRepositoryChannelMapping } from "../common.js";

// ==================== Database Row Types ====================

/**
 * Database row for repository_channel_mappings table.
 */
export interface MappingRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly repository: string;
  readonly slack_channel_id: string;
  readonly slack_channel_name: string | null;
  readonly created_by: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/**
 * Database row for repository-only query.
 */
export interface RepositoryRow {
  readonly repository: string;
}

/**
 * Database row for count query.
 */
export interface CountRow {
  readonly count: string;
}

// ==================== Validation Types ====================

/**
 * Validation rule for CreateRepositoryChannelMapping.
 */
export interface CreateMappingValidationRule {
  readonly isInvalid: (input: CreateRepositoryChannelMapping) => boolean;
  readonly getMessage: () => string;
  readonly field: string;
}

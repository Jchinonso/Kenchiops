/**
 * External Source Repository Helpers
 *
 * Validation functions and row mappers for external source operations.
 *
 * @module database/externalSource/helpers
 */

import {
  ValidationError,
  EXTERNAL_SOURCE_DEFAULTS,
  validateNonEmptyString,
  validateMinimumNumber,
  type ExternalSourceType,
  type TechStackTag,
} from "../common.js";
import type {
  CreateExternalSourceInput,
  CreateInputValidationRule,
  ExternalSourceRow,
  ExternalSource,
} from "./types.js";

// ==================== Validation Rules ====================

/** Validation rules for CreateExternalSourceInput. */
const CREATE_INPUT_VALIDATION_RULES: readonly CreateInputValidationRule[] = [
  {
    field: "tenantId",
    isInvalid: (input) => input.tenantId.trim().length === 0,
    message: "Tenant ID cannot be empty",
  },
  {
    field: "name",
    isInvalid: (input) => input.name.trim().length === 0,
    message: "Name cannot be empty",
  },
];

// ==================== Input Validation ====================

// Re-export shared validators for backwards compatibility
export { validateNonEmptyString, validateMinimumNumber };

/**
 * Validates CreateExternalSourceInput.
 *
 * @throws ValidationError if input is invalid
 */
export const validateCreateInput = (input: CreateExternalSourceInput): void => {
  const failedRule = CREATE_INPUT_VALIDATION_RULES.find((rule) => rule.isInvalid(input));

  if (failedRule === undefined) {
    return;
  }

  const metadata: Record<string, unknown> = { field: failedRule.field };

  if (failedRule.getValue !== undefined) {
    metadata.value = failedRule.getValue(input);
  }

  throw new ValidationError(failedRule.message, {
    operation: "validateCreateInput",
    metadata,
  });
};

// ==================== Constants ====================

/** Default limit for sync queries. */
export const { DEFAULT_SYNC_LIMIT } = EXTERNAL_SOURCE_DEFAULTS;

/** Minimum query limit. */
export const { MIN_QUERY_LIMIT } = EXTERNAL_SOURCE_DEFAULTS;

/** Minimum document count. */
export const { MIN_DOC_COUNT } = EXTERNAL_SOURCE_DEFAULTS;

/** Minimum error count. */
export const { MIN_ERROR_COUNT } = EXTERNAL_SOURCE_DEFAULTS;

/** Default count value. */
export const { DEFAULT_COUNT } = EXTERNAL_SOURCE_DEFAULTS;

// ==================== Row Mappers ====================

/**
 * Maps database row to ExternalSource.
 *
 * @param row - Database row from external_sources table
 * @returns ExternalSource domain object
 */
export const mapRowToExternalSource = (row: ExternalSourceRow): ExternalSource => ({
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

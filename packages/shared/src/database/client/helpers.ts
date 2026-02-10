/**
 * Database Client Helpers
 *
 * Validation functions and utilities for database client operations.
 *
 * @module database/client/helpers
 */

import { ValidationError } from "../../core/errors.js";
import { QUERY_LOGGING } from "../../constants/index.js";
import type { ConfigValidationRule, DatabaseConfig, QueryMetadata } from "./types.js";

// ==================== Validation Rules ====================

/** Validation rules for database configuration. */
export const CONFIG_VALIDATION_RULES: readonly ConfigValidationRule[] = [
  {
    field: "connectionString",
    isInvalid: (config) => config.connectionString.trim().length === 0,
    message: "Database connection string cannot be empty",
  },
  {
    field: "maxConnections",
    isInvalid: (config) => config.maxConnections !== undefined && config.maxConnections < 1,
    message: "Max connections must be at least 1",
    getValue: (config) => config.maxConnections,
  },
  {
    field: "idleTimeoutMs",
    isInvalid: (config) => config.idleTimeoutMs !== undefined && config.idleTimeoutMs < 0,
    message: "Idle timeout cannot be negative",
    getValue: (config) => config.idleTimeoutMs,
  },
  {
    field: "connectionTimeoutMs",
    isInvalid: (config) =>
      config.connectionTimeoutMs !== undefined && config.connectionTimeoutMs < 0,
    message: "Connection timeout cannot be negative",
    getValue: (config) => config.connectionTimeoutMs,
  },
];

// ==================== Validation Functions ====================

/**
 * Validates database configuration.
 *
 * @throws ValidationError if configuration is invalid
 */
export const validateConfig = (config: DatabaseConfig): void => {
  const failedRule = CONFIG_VALIDATION_RULES.find((rule) => rule.isInvalid(config));

  if (failedRule === undefined) {
    return;
  }

  const metadata: Record<string, unknown> = { field: failedRule.field };

  if (failedRule.getValue !== undefined) {
    metadata.value = failedRule.getValue(config);
  }

  throw new ValidationError(failedRule.message, {
    operation: "validateConfig",
    metadata,
  });
};

/**
 * Validates query text is non-empty.
 *
 * @throws ValidationError if query text is empty
 */
export const validateQueryText = (text: string): void => {
  if (text.trim().length === 0) {
    throw new ValidationError("Query text cannot be empty", {
      operation: "validateQueryText",
    });
  }
};

// ==================== Logging Helpers ====================

/**
 * Truncates query text for safe logging.
 */
export const truncateQueryForLog = (text: string): string =>
  text.substring(0, QUERY_LOGGING.MAX_QUERY_LENGTH);

/**
 * Creates query metadata object for logging.
 */
export const createQueryMetadata = (
  text: string,
  duration: number,
  rowCount?: number | null,
  error?: string
): QueryMetadata => ({
  query: truncateQueryForLog(text),
  duration,
  ...(rowCount !== undefined && { rowCount }),
  ...(error !== undefined && { error }),
});

/**
 * Calculates duration from start time.
 */
export const calculateDuration = (startTime: number): number => Date.now() - startTime;

/**
 * Database Validation Helpers
 *
 * Shared validation functions for all database repository modules.
 * Consolidates duplicate validators into a single source of truth.
 *
 * @module database/validation/helpers
 */

import { ValidationError } from "../common.js";

/**
 * Validates that a string ID is non-empty.
 *
 * @param id - ID to validate
 * @param fieldName - Name of the field for error message
 * @throws {ValidationError} if ID is empty or whitespace-only
 */
export const validateId = (id: string, fieldName: string): void => {
  if (id.trim().length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`, {
      operation: "validateId",
      metadata: { field: fieldName },
    });
  }
};

/**
 * Validates that an array of IDs contains no empty entries.
 *
 * @param ids - Array of IDs to validate
 * @param fieldName - Name of the field for error message
 * @throws {ValidationError} if array contains empty IDs
 */
export const validateIds = (ids: readonly string[], fieldName: string): void => {
  if (ids.length === 0) {
    return;
  }

  const invalidIds = ids.filter((id) => id.trim().length === 0);
  if (invalidIds.length > 0) {
    throw new ValidationError(`${fieldName} contains empty IDs`, {
      operation: "validateIds",
      metadata: { field: fieldName, invalidCount: invalidIds.length },
    });
  }
};

/**
 * Validates that a string is non-empty.
 *
 * @param value - String value to validate
 * @param fieldName - Name of the field for error message
 * @throws {ValidationError} if value is empty or whitespace-only
 */
export const validateNonEmptyString = (value: string, fieldName: string): void => {
  if (value.trim().length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`, {
      operation: "validateNonEmptyString",
      metadata: { field: fieldName },
    });
  }
};

/**
 * Validates that a number meets a minimum requirement.
 *
 * @param value - Number to validate
 * @param fieldName - Name of the field for error message
 * @param minimum - Minimum allowed value (inclusive)
 * @throws {ValidationError} if value is below minimum or not finite
 */
export const validateMinimumNumber = (value: number, fieldName: string, minimum: number): void => {
  if (!Number.isFinite(value) || value < minimum) {
    throw new ValidationError(`${fieldName} must be at least ${minimum}`, {
      operation: "validateMinimumNumber",
      metadata: { field: fieldName, value, minimum },
    });
  }
};

/**
 * Validates that a number is positive (> 0).
 *
 * @param value - Number to validate
 * @param fieldName - Name of the field for error message
 * @throws {ValidationError} if value is not positive or not finite
 */
export const validatePositiveNumber = (value: number, fieldName: string): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ValidationError(`${fieldName} must be a positive number`, {
      operation: "validatePositiveNumber",
      metadata: { field: fieldName, value },
    });
  }
};

/**
 * Validates that a number is non-negative (>= 0).
 *
 * @param value - Number to validate
 * @param fieldName - Name of the field for error message
 * @throws {ValidationError} if value is negative or not finite
 */
export const validateNonNegativeNumber = (value: number, fieldName: string): void => {
  if (!Number.isFinite(value) || value < 0) {
    throw new ValidationError(`${fieldName} must be a non-negative number`, {
      operation: "validateNonNegativeNumber",
      metadata: { field: fieldName, value },
    });
  }
};

/**
 * Validates a query limit parameter against a module-specific minimum.
 *
 * @param limit - Limit value to validate
 * @param minimum - Module-specific minimum limit
 * @throws {ValidationError} if limit is below minimum or not finite
 */
export const validateLimit = (limit: number, minimum: number): void => {
  if (!Number.isFinite(limit) || limit < minimum) {
    throw new ValidationError(`Query limit must be at least ${minimum}`, {
      operation: "validateLimit",
      metadata: { limit, minimum },
    });
  }
};

/**
 * Validates an embedding vector array.
 *
 * @param embedding - Array of numbers representing the embedding
 * @throws {ValidationError} if embedding is empty or contains non-finite values
 */
export const validateEmbedding = (embedding: readonly number[]): void => {
  if (embedding.length === 0) {
    throw new ValidationError("Embedding cannot be empty", {
      operation: "validateEmbedding",
      metadata: { length: 0 },
    });
  }

  const hasInvalidValues = embedding.some((value) => !Number.isFinite(value));
  if (hasInvalidValues) {
    throw new ValidationError("Embedding contains invalid values", {
      operation: "validateEmbedding",
      metadata: { length: embedding.length },
    });
  }
};

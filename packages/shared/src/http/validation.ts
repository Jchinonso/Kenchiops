/**
 * Request validation utilities.
 */

import type { Request, Response, NextFunction } from "express";
import { ValidationError } from "../core/errors.js";
import {
  EMAIL_REGEX,
  DEFAULT_VALIDATION_ERROR_MESSAGE,
  VALIDATION_MESSAGES,
} from "../constants/index.js";
import type { Validator, ValidationSchema, ValidationSource } from "./types.js";

/**
 * Validates a data source against its schema and returns errors.
 *
 * @param source - The data source to validate (req.body, req.params, etc.)
 * @param schema - The validation schema to apply
 * @param prefix - Prefix for error messages (e.g., "body", "params")
 * @returns Array of validation error messages
 */
const validateSource = (
  source: Readonly<Record<string, unknown>>,
  schema: Readonly<Record<string, Validator>>,
  prefix: string
): string[] =>
  Object.entries(schema)
    .map(([key, validator]) => {
      const result = validator(source[key]);
      if (result === true) {
        return null;
      }
      const message = typeof result === "string" ? result : DEFAULT_VALIDATION_ERROR_MESSAGE;
      return `${prefix}.${key}: ${message}`;
    })
    .filter((error): error is string => error !== null);

/**
 * Validation middleware factory.
 * Creates Express middleware that validates request data against a schema.
 *
 * @param schema - The validation schema to apply
 * @returns Express middleware function
 * @throws {ValidationError} If validation fails
 *
 * @example
 * ```typescript
 * const validateRequest = validate({
 *   body: {
 *     email: (v) => validators.email(v),
 *     name: (v) => validators.required(v) && validators.string(v),
 *   },
 * });
 *
 * app.post('/users', validateRequest, handler);
 * ```
 */
export const validate =
  (schema: ValidationSchema) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    // Data-driven validation: build validation sources array
    const validationSources: ValidationSource[] = [
      schema.body && { source: req.body, schema: schema.body, prefix: "body" },
      schema.params && { source: req.params, schema: schema.params, prefix: "params" },
      schema.query && {
        source: req.query as Record<string, unknown>,
        schema: schema.query,
        prefix: "query",
      },
    ].filter((source): source is ValidationSource => source !== undefined);

    // Validate all sources using flatMap
    const errors = validationSources.flatMap(({ source, schema: sourceSchema, prefix }) =>
      validateSource(source, sourceSchema, prefix)
    );

    if (errors.length > 0) {
      throw new ValidationError("Validation failed", { metadata: { errors } });
    }

    next();
  };

// ==================== Validation Helpers ====================

/**
 * Type guard helper for string validation.
 * Returns the value as string if valid, or null if invalid.
 */
const asString = (value: unknown): string | null => (typeof value === "string" ? value : null);

/**
 * Creates a string-based validator with a custom check.
 * Handles the common pattern of: validate string -> apply check.
 */
const createStringValidator =
  (check: (str: string) => boolean | string): Validator =>
  (value: unknown): boolean | string => {
    const str = asString(value);
    if (str === null) {
      return VALIDATION_MESSAGES.MUST_BE_STRING;
    }
    return check(str);
  };

// ==================== Common Validators ====================

/**
 * Common validators for request validation.
 *
 * @example
 * ```typescript
 * const schema = {
 *   body: {
 *     email: validators.email,
 *     age: validators.number,
 *     name: (v) => validators.required(v) && validators.string(v) && validators.minLength(3)(v),
 *   },
 * };
 * ```
 */
export const validators = {
  /**
   * Validates that a value is required (not undefined, null, or empty string).
   */
  required: (value: unknown): boolean | string => {
    if (value === undefined || value === null || value === "") {
      return VALIDATION_MESSAGES.REQUIRED;
    }
    return true;
  },

  /**
   * Validates that a value is a string.
   */
  string: (value: unknown): boolean | string => {
    if (typeof value !== "string") {
      return VALIDATION_MESSAGES.MUST_BE_STRING;
    }
    return true;
  },

  /**
   * Validates that a value is a number.
   */
  number: (value: unknown): boolean | string => {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return VALIDATION_MESSAGES.MUST_BE_NUMBER;
    }
    return true;
  },

  /**
   * Validates that a value is a valid email address.
   */
  email: createStringValidator((str) =>
    EMAIL_REGEX.test(str) ? true : VALIDATION_MESSAGES.MUST_BE_EMAIL
  ),

  /**
   * Creates a validator that checks minimum string length.
   *
   * @param min - Minimum required length
   * @returns Validator function
   */
  minLength: (min: number): Validator =>
    createStringValidator((str) =>
      str.length >= min ? true : `must be at least ${min} characters`
    ),

  /**
   * Creates a validator that checks maximum string length.
   *
   * @param max - Maximum allowed length
   * @returns Validator function
   */
  maxLength: (max: number): Validator =>
    createStringValidator((str) =>
      str.length <= max ? true : `must be at most ${max} characters`
    ),

  /**
   * Creates a validator that checks if value is one of the allowed values.
   * Uses Array.includes - O(n) lookup.
   *
   * @param allowed - Array of allowed values
   * @returns Validator function
   *
   * @example
   * ```typescript
   * const statusValidator = validators.oneOf(['active', 'inactive', 'pending']);
   * ```
   */
  oneOf:
    <T>(allowed: readonly T[]) =>
    (value: unknown): boolean | string => {
      if (!allowed.includes(value as T)) {
        return `must be one of: ${allowed.join(", ")}`;
      }
      return true;
    },

  /**
   * Creates a validator that checks if value is in a Set of allowed values.
   * Uses Set.has - O(1) lookup. Preferred for large sets of allowed values.
   *
   * @param allowedSet - Set of allowed values
   * @param displayValues - Optional array for error message (defaults to Set values)
   * @returns Validator function
   *
   * @example
   * ```typescript
   * const statusSet = new Set(['active', 'inactive', 'pending']);
   * const statusValidator = validators.oneOfSet(statusSet);
   * ```
   */
  oneOfSet:
    <T>(allowedSet: ReadonlySet<T>, displayValues?: readonly T[]) =>
    (value: unknown): boolean | string => {
      if (!allowedSet.has(value as T)) {
        const values = displayValues ?? Array.from(allowedSet);
        return `must be one of: ${values.join(", ")}`;
      }
      return true;
    },
} as const;

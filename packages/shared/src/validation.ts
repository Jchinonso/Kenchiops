/**
 * Request validation utilities.
 */

import type { Request, Response, NextFunction } from "express";
import { ValidationError } from "./errors.js";
import { EMAIL_REGEX, DEFAULT_VALIDATION_ERROR_MESSAGE } from "./constants.js";

/**
 * Validator function type.
 * Returns true if valid, or an error message string if invalid.
 */
export type Validator = (value: unknown) => boolean | string;

/**
 * Simple validation schema interface.
 */
export interface ValidationSchema {
  readonly body?: Record<string, Validator>;
  readonly params?: Record<string, Validator>;
  readonly query?: Record<string, Validator>;
}

/**
 * Validates a data source against its schema.
 *
 * @param source - The data source to validate (req.body, req.params, etc.)
 * @param schema - The validation schema to apply
 * @param prefix - Prefix for error messages (e.g., "body", "params")
 * @param errors - Array to collect validation errors
 */
const validateSource = (
  source: Readonly<Record<string, unknown>>,
  schema: Readonly<Record<string, Validator>>,
  prefix: string,
  errors: string[]
): void => {
  for (const [key, validator] of Object.entries(schema)) {
    const value = source[key];
    const result = validator(value);
    if (result !== true) {
      const message = typeof result === "string" ? result : DEFAULT_VALIDATION_ERROR_MESSAGE;
      errors.push(`${prefix}.${key}: ${message}`);
    }
  }
};

type ValidationSource = {
  readonly source: Record<string, unknown>;
  readonly schema: Readonly<Record<string, Validator>>;
  readonly prefix: string;
};

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
export const validate = (schema: ValidationSchema) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const errors: string[] = [];

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

    // Validate all sources
    for (const { source, schema: sourceSchema, prefix } of validationSources) {
      validateSource(source, sourceSchema, prefix, errors);
    }

    if (errors.length > 0) {
      throw new ValidationError("Validation failed", { errors });
    }

    next();
  };
};

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
      return "is required";
    }
    return true;
  },

  /**
   * Validates that a value is a string.
   */
  string: (value: unknown): boolean | string => {
    if (typeof value !== "string") {
      return "must be a string";
    }
    return true;
  },

  /**
   * Validates that a value is a number.
   */
  number: (value: unknown): boolean | string => {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return "must be a number";
    }
    return true;
  },

  /**
   * Validates that a value is a valid email address.
   */
  email: (value: unknown): boolean | string => {
    const stringResult = validators.string(value);
    if (stringResult !== true) {
      return stringResult;
    }
    if (!EMAIL_REGEX.test(value as string)) {
      return "must be a valid email";
    }
    return true;
  },

  /**
   * Creates a validator that checks minimum string length.
   *
   * @param min - Minimum required length
   * @returns Validator function
   */
  minLength:
    (min: number) =>
    (value: unknown): boolean | string => {
      const stringResult = validators.string(value);
      if (stringResult !== true) {
        return stringResult;
      }
      if ((value as string).length < min) {
        return `must be at least ${min} characters`;
      }
      return true;
    },

  /**
   * Creates a validator that checks maximum string length.
   *
   * @param max - Maximum allowed length
   * @returns Validator function
   */
  maxLength:
    (max: number) =>
    (value: unknown): boolean | string => {
      const stringResult = validators.string(value);
      if (stringResult !== true) {
        return stringResult;
      }
      if ((value as string).length > max) {
        return `must be at most ${max} characters`;
      }
      return true;
    },

  /**
   * Creates a validator that checks if value is one of the allowed values.
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
} as const;

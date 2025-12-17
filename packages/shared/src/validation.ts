/**
 * Request validation utilities.
 */

import { Request, Response, NextFunction } from "express";
import { ValidationError } from "./errors.js";

/**
 * Simple validation schema interface.
 */
export interface ValidationSchema {
  body?: Record<string, (value: unknown) => boolean | string>;
  params?: Record<string, (value: unknown) => boolean | string>;
  query?: Record<string, (value: unknown) => boolean | string>;
}

/**
 * Validation middleware factory.
 * Creates middleware that validates request data against a schema.
 */
export function validate(schema: ValidationSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const errors: string[] = [];

    // Validate body
    if (schema.body) {
      for (const [key, validator] of Object.entries(schema.body)) {
        const value = req.body[key];
        const result = validator(value);
        if (result !== true) {
          errors.push(
            `body.${key}: ${typeof result === "string" ? result : "validation failed"}`
          );
        }
      }
    }

    // Validate params
    if (schema.params) {
      for (const [key, validator] of Object.entries(schema.params)) {
        const value = req.params[key];
        const result = validator(value);
        if (result !== true) {
          errors.push(
            `params.${key}: ${typeof result === "string" ? result : "validation failed"}`
          );
        }
      }
    }

    // Validate query
    if (schema.query) {
      for (const [key, validator] of Object.entries(schema.query)) {
        const value = req.query[key];
        const result = validator(value);
        if (result !== true) {
          errors.push(
            `query.${key}: ${typeof result === "string" ? result : "validation failed"}`
          );
        }
      }
    }

    if (errors.length > 0) {
      throw new ValidationError("Validation failed", { errors });
    }

    next();
  };
}

/**
 * Common validators.
 */
export const validators = {
  required: (value: unknown): boolean | string => {
    if (value === undefined || value === null || value === "") {
      return "is required";
    }
    return true;
  },

  string: (value: unknown): boolean | string => {
    if (typeof value !== "string") {
      return "must be a string";
    }
    return true;
  },

  number: (value: unknown): boolean | string => {
    if (typeof value !== "number" || isNaN(value)) {
      return "must be a number";
    }
    return true;
  },

  email: (value: unknown): boolean | string => {
    if (typeof value !== "string") {
      return "must be a string";
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return "must be a valid email";
    }
    return true;
  },

  minLength: (min: number) => (value: unknown): boolean | string => {
    if (typeof value !== "string") {
      return "must be a string";
    }
    if (value.length < min) {
      return `must be at least ${min} characters`;
    }
    return true;
  },

  maxLength: (max: number) => (value: unknown): boolean | string => {
    if (typeof value !== "string") {
      return "must be a string";
    }
    if (value.length > max) {
      return `must be at most ${max} characters`;
    }
    return true;
  },

  oneOf: <T>(allowed: T[]) => (value: unknown): boolean | string => {
    if (!allowed.includes(value as T)) {
      return `must be one of: ${allowed.join(", ")}`;
    }
    return true;
  },
};


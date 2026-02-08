/**
 * Unit tests for HTTP validation utilities.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { Request, Response, NextFunction } from "express";
import { validate, validators } from "../../http/validation.js";
import type { ValidationSchema } from "../../http/types.js";
import { ValidationError } from "../../core/errors.js";

describe("HTTP Validation", () => {
  // Mock Express objects
  const createMockRequest = (
    body: Record<string, unknown> = {},
    params: Record<string, unknown> = {},
    query: Record<string, unknown> = {}
  ): Request =>
    ({
      body,
      params,
      query,
      method: "POST",
      path: "/test",
    }) as Request;

  const createMockResponse = (): Response => ({}) as Response;

  const createMockNext = (): NextFunction => jest.fn() as unknown as NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("validate middleware", () => {
    describe("body validation", () => {
      it("should pass validation when body is valid", () => {
        const schema: ValidationSchema = {
          body: {
            email: validators.email,
          },
        };

        const middleware = validate(schema);
        const req = createMockRequest({ email: "test@example.com" });
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
      });

      it("should throw ValidationError when body field is invalid", () => {
        const schema: ValidationSchema = {
          body: {
            email: validators.email,
          },
        };

        const middleware = validate(schema);
        const req = createMockRequest({ email: "invalid-email" });
        const res = createMockResponse();
        const next = createMockNext();

        expect(() => middleware(req, res, next)).toThrow(ValidationError);
      });

      it("should include field path in error message", () => {
        const schema: ValidationSchema = {
          body: {
            username: validators.required,
          },
        };

        const middleware = validate(schema);
        const req = createMockRequest({ username: "" });
        const res = createMockResponse();
        const next = createMockNext();

        try {
          middleware(req, res, next);
          throw new Error("Should have thrown ValidationError");
        } catch (error) {
          expect(error).toBeInstanceOf(ValidationError);
          const validationError = error as ValidationError;
          expect(validationError.metadata?.errors).toContain("body.username: is required");
        }
      });

      it("should validate multiple body fields", () => {
        const schema: ValidationSchema = {
          body: {
            email: validators.email,
            name: validators.required,
            age: validators.number,
          },
        };

        const middleware = validate(schema);
        const req = createMockRequest({ email: "test@example.com", name: "John", age: 25 });
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
      });

      it("should collect all validation errors for multiple invalid fields", () => {
        const schema: ValidationSchema = {
          body: {
            email: validators.email,
            name: validators.required,
          },
        };

        const middleware = validate(schema);
        const req = createMockRequest({ email: "invalid", name: "" });
        const res = createMockResponse();
        const next = createMockNext();

        try {
          middleware(req, res, next);
          throw new Error("Should have thrown ValidationError");
        } catch (error) {
          const validationError = error as ValidationError;
          const errors = validationError.metadata?.errors as string[];
          expect(errors).toHaveLength(2);
          expect(errors).toEqual(
            expect.arrayContaining([
              expect.stringContaining("body.email"),
              expect.stringContaining("body.name"),
            ])
          );
        }
      });
    });

    describe("params validation", () => {
      it("should validate URL parameters", () => {
        const schema: ValidationSchema = {
          params: {
            id: validators.required,
          },
        };

        const middleware = validate(schema);
        const req = createMockRequest({}, { id: "123" });
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
      });

      it("should throw ValidationError for invalid params", () => {
        const schema: ValidationSchema = {
          params: {
            id: validators.required,
          },
        };

        const middleware = validate(schema);
        const req = createMockRequest({}, { id: "" });
        const res = createMockResponse();
        const next = createMockNext();

        expect(() => middleware(req, res, next)).toThrow(ValidationError);
      });

      it("should include params prefix in error message", () => {
        const schema: ValidationSchema = {
          params: {
            userId: validators.required,
          },
        };

        const middleware = validate(schema);
        const req = createMockRequest({}, { userId: null });
        const res = createMockResponse();
        const next = createMockNext();

        try {
          middleware(req, res, next);
          throw new Error("Should have thrown ValidationError");
        } catch (error) {
          const validationError = error as ValidationError;
          expect(validationError.metadata?.errors).toContain("params.userId: is required");
        }
      });
    });

    describe("query validation", () => {
      it("should validate query parameters", () => {
        const schema: ValidationSchema = {
          query: {
            page: validators.string,
          },
        };

        const middleware = validate(schema);
        const req = createMockRequest({}, {}, { page: "1" });
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
      });

      it("should throw ValidationError for invalid query params", () => {
        const schema: ValidationSchema = {
          query: {
            limit: validators.number,
          },
        };

        const middleware = validate(schema);
        const req = createMockRequest({}, {}, { limit: "not-a-number" });
        const res = createMockResponse();
        const next = createMockNext();

        expect(() => middleware(req, res, next)).toThrow(ValidationError);
      });

      it("should include query prefix in error message", () => {
        const schema: ValidationSchema = {
          query: {
            filter: validators.required,
          },
        };

        const middleware = validate(schema);
        const req = createMockRequest({}, {}, {});
        const res = createMockResponse();
        const next = createMockNext();

        try {
          middleware(req, res, next);
          throw new Error("Should have thrown ValidationError");
        } catch (error) {
          const validationError = error as ValidationError;
          expect(validationError.metadata?.errors).toContain("query.filter: is required");
        }
      });
    });

    describe("combined validation", () => {
      it("should validate body, params, and query together", () => {
        const schema: ValidationSchema = {
          body: { name: validators.required },
          params: { id: validators.required },
          query: { page: validators.string },
        };

        const middleware = validate(schema);
        const req = createMockRequest({ name: "John" }, { id: "123" }, { page: "1" });
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
      });

      it("should collect errors from all sources", () => {
        const schema: ValidationSchema = {
          body: { email: validators.email },
          params: { id: validators.required },
          query: { page: validators.number },
        };

        const middleware = validate(schema);
        const req = createMockRequest({ email: "invalid" }, { id: "" }, { page: "not-a-number" });
        const res = createMockResponse();
        const next = createMockNext();

        try {
          middleware(req, res, next);
          throw new Error("Should have thrown ValidationError");
        } catch (error) {
          const validationError = error as ValidationError;
          const errors = validationError.metadata?.errors as string[];
          expect(errors.length).toBeGreaterThanOrEqual(3);
        }
      });
    });

    describe("edge cases", () => {
      it("should pass validation with empty schema", () => {
        const schema: ValidationSchema = {};

        const middleware = validate(schema);
        const req = createMockRequest();
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
      });

      it("should handle missing body gracefully", () => {
        const schema: ValidationSchema = {
          body: { name: validators.string },
        };

        const middleware = validate(schema);
        const req = { body: undefined } as unknown as Request;
        const res = createMockResponse();
        const next = createMockNext();

        expect(() => middleware(req, res, next)).toThrow();
      });
    });
  });

  describe("validators", () => {
    describe("required", () => {
      it("should return true for non-empty string", () => {
        expect(validators.required("test")).toBe(true);
      });

      it("should return true for number 0", () => {
        expect(validators.required(0)).toBe(true);
      });

      it("should return true for boolean false", () => {
        expect(validators.required(false)).toBe(true);
      });

      it("should return true for empty array", () => {
        expect(validators.required([])).toBe(true);
      });

      it("should return true for empty object", () => {
        expect(validators.required({})).toBe(true);
      });

      it("should return error message for undefined", () => {
        expect(validators.required(undefined)).toBe("is required");
      });

      it("should return error message for null", () => {
        expect(validators.required(null)).toBe("is required");
      });

      it("should return error message for empty string", () => {
        expect(validators.required("")).toBe("is required");
      });
    });

    describe("string", () => {
      it("should return true for valid string", () => {
        expect(validators.string("hello")).toBe(true);
      });

      it("should return true for empty string", () => {
        expect(validators.string("")).toBe(true);
      });

      it("should return error message for number", () => {
        expect(validators.string(123)).toBe("must be a string");
      });

      it("should return error message for boolean", () => {
        expect(validators.string(true)).toBe("must be a string");
      });

      it("should return error message for object", () => {
        expect(validators.string({})).toBe("must be a string");
      });

      it("should return error message for array", () => {
        expect(validators.string([])).toBe("must be a string");
      });

      it("should return error message for null", () => {
        expect(validators.string(null)).toBe("must be a string");
      });

      it("should return error message for undefined", () => {
        expect(validators.string(undefined)).toBe("must be a string");
      });
    });

    describe("number", () => {
      it("should return true for positive integer", () => {
        expect(validators.number(42)).toBe(true);
      });

      it("should return true for negative integer", () => {
        expect(validators.number(-10)).toBe(true);
      });

      it("should return true for float", () => {
        expect(validators.number(3.14)).toBe(true);
      });

      it("should return true for zero", () => {
        expect(validators.number(0)).toBe(true);
      });

      it("should return error message for NaN", () => {
        expect(validators.number(NaN)).toBe("must be a number");
      });

      it("should return error message for string", () => {
        expect(validators.number("123")).toBe("must be a number");
      });

      it("should return error message for boolean", () => {
        expect(validators.number(true)).toBe("must be a number");
      });

      it("should return error message for object", () => {
        expect(validators.number({})).toBe("must be a number");
      });

      it("should return error message for null", () => {
        expect(validators.number(null)).toBe("must be a number");
      });

      it("should return error message for undefined", () => {
        expect(validators.number(undefined)).toBe("must be a number");
      });
    });

    describe("email", () => {
      it("should return true for valid email", () => {
        expect(validators.email("user@example.com")).toBe(true);
      });

      it("should return true for email with subdomain", () => {
        expect(validators.email("user@mail.example.com")).toBe(true);
      });

      it("should return true for email with plus", () => {
        expect(validators.email("user+tag@example.com")).toBe(true);
      });

      it("should return true for email with numbers", () => {
        expect(validators.email("user123@example456.com")).toBe(true);
      });

      it("should return error message for missing @", () => {
        expect(validators.email("userexample.com")).toBe("must be a valid email");
      });

      it("should return error message for missing domain", () => {
        expect(validators.email("user@")).toBe("must be a valid email");
      });

      it("should return error message for missing local part", () => {
        expect(validators.email("@example.com")).toBe("must be a valid email");
      });

      it("should return error message for spaces", () => {
        expect(validators.email("user @example.com")).toBe("must be a valid email");
      });

      it("should return error message for missing TLD", () => {
        expect(validators.email("user@example")).toBe("must be a valid email");
      });

      it("should return error message for non-string", () => {
        expect(validators.email(123)).toBe("must be a string");
      });

      it("should return error message for null", () => {
        expect(validators.email(null)).toBe("must be a string");
      });

      it("should return error message for undefined", () => {
        expect(validators.email(undefined)).toBe("must be a string");
      });
    });

    describe("minLength", () => {
      it("should return true when string meets minimum length", () => {
        const validator = validators.minLength(5);
        expect(validator("hello")).toBe(true);
      });

      it("should return true when string exceeds minimum length", () => {
        const validator = validators.minLength(3);
        expect(validator("hello world")).toBe(true);
      });

      it("should return error message when string is too short", () => {
        const validator = validators.minLength(10);
        expect(validator("hello")).toBe("must be at least 10 characters");
      });

      it("should handle minimum length of 0", () => {
        const validator = validators.minLength(0);
        expect(validator("")).toBe(true);
      });

      it("should handle minimum length of 1", () => {
        const validator = validators.minLength(1);
        expect(validator("a")).toBe(true);
        expect(validator("")).toBe("must be at least 1 characters");
      });

      it("should return error message for non-string", () => {
        const validator = validators.minLength(5);
        expect(validator(123)).toBe("must be a string");
      });

      it("should return error message for null", () => {
        const validator = validators.minLength(5);
        expect(validator(null)).toBe("must be a string");
      });

      it("should handle emoji characters (counted by JavaScript length)", () => {
        const validator = validators.minLength(4);
        // Emoji are counted as 2 characters each in JavaScript
        expect(validator("😀😁")).toBe(true); // 4 characters
      });
    });

    describe("maxLength", () => {
      it("should return true when string is within maximum length", () => {
        const validator = validators.maxLength(10);
        expect(validator("hello")).toBe(true);
      });

      it("should return true when string equals maximum length", () => {
        const validator = validators.maxLength(5);
        expect(validator("hello")).toBe(true);
      });

      it("should return error message when string exceeds maximum length", () => {
        const validator = validators.maxLength(3);
        expect(validator("hello")).toBe("must be at most 3 characters");
      });

      it("should handle maximum length of 0", () => {
        const validator = validators.maxLength(0);
        expect(validator("")).toBe(true);
        expect(validator("a")).toBe("must be at most 0 characters");
      });

      it("should return error message for non-string", () => {
        const validator = validators.maxLength(10);
        expect(validator(123)).toBe("must be a string");
      });

      it("should return error message for null", () => {
        const validator = validators.maxLength(10);
        expect(validator(null)).toBe("must be a string");
      });

      it("should handle emoji characters (counted by JavaScript length)", () => {
        const validator = validators.maxLength(4);
        // Emoji are counted as 2 characters each in JavaScript
        expect(validator("😀😁")).toBe(true); // 4 characters
        expect(validator("😀😁😂")).toBe("must be at most 4 characters"); // 6 characters
      });
    });

    describe("oneOf", () => {
      it("should return true for allowed string value", () => {
        const validator = validators.oneOf(["active", "inactive", "pending"]);
        expect(validator("active")).toBe(true);
      });

      it("should return true for allowed number value", () => {
        const validator = validators.oneOf([1, 2, 3]);
        expect(validator(2)).toBe(true);
      });

      it("should return error message for disallowed value", () => {
        const validator = validators.oneOf(["active", "inactive"]);
        expect(validator("deleted")).toBe("must be one of: active, inactive");
      });

      it("should handle empty array", () => {
        const validator = validators.oneOf([]);
        expect(validator("anything")).toBe("must be one of: ");
      });

      it("should handle single allowed value", () => {
        const validator = validators.oneOf(["only"]);
        expect(validator("only")).toBe(true);
        expect(validator("other")).toBe("must be one of: only");
      });

      it("should be case sensitive", () => {
        const validator = validators.oneOf(["Active"]);
        expect(validator("active")).toBe("must be one of: Active");
      });

      it("should handle mixed types", () => {
        const validator = validators.oneOf(["active", 1, true]);
        expect(validator("active")).toBe(true);
        expect(validator(1)).toBe(true);
        expect(validator(true)).toBe(true);
        expect(validator("1")).toBe("must be one of: active, 1, true");
      });
    });

    describe("oneOfSet", () => {
      it("should return true for value in Set", () => {
        const allowedSet = new Set(["active", "inactive", "pending"]);
        const validator = validators.oneOfSet(allowedSet);
        expect(validator("active")).toBe(true);
      });

      it("should return error message for value not in Set", () => {
        const allowedSet = new Set(["active", "inactive"]);
        const validator = validators.oneOfSet(allowedSet);
        expect(validator("deleted")).toContain("must be one of:");
        expect(validator("deleted")).toContain("active");
        expect(validator("deleted")).toContain("inactive");
      });

      it("should handle empty Set", () => {
        const allowedSet = new Set<string>();
        const validator = validators.oneOfSet(allowedSet);
        expect(validator("anything")).toBe("must be one of: ");
      });

      it("should handle single value Set", () => {
        const allowedSet = new Set(["only"]);
        const validator = validators.oneOfSet(allowedSet);
        expect(validator("only")).toBe(true);
        expect(validator("other")).toBe("must be one of: only");
      });

      it("should use custom display values when provided", () => {
        const allowedSet = new Set(["a", "b", "c"]);
        const displayValues = ["option-a", "option-b", "option-c"];
        const validator = validators.oneOfSet(allowedSet, displayValues);
        expect(validator("invalid")).toBe("must be one of: option-a, option-b, option-c");
      });

      it("should use Set values when display values not provided", () => {
        const allowedSet = new Set(["active", "inactive"]);
        const validator = validators.oneOfSet(allowedSet);
        const result = validator("invalid");
        expect(result).toContain("active");
        expect(result).toContain("inactive");
      });

      it("should handle number Set", () => {
        const allowedSet = new Set([1, 2, 3]);
        const validator = validators.oneOfSet(allowedSet);
        expect(validator(2)).toBe(true);
        expect(validator(5)).toContain("must be one of:");
      });

      it("should be faster than oneOf for large sets (O(1) vs O(n))", () => {
        // This is a conceptual test - we just verify it works with large sets
        const largeSet = new Set(Array.from({ length: 1000 }, (_, i) => `value-${i}`));
        const validator = validators.oneOfSet(largeSet);
        expect(validator("value-500")).toBe(true);
        expect(validator("not-in-set")).toContain("must be one of:");
      });
    });

    describe("validator composition", () => {
      it("should allow chaining validators with custom logic", () => {
        const composedValidator = (value: unknown): boolean | string => {
          const requiredResult = validators.required(value);
          if (requiredResult !== true) return requiredResult;

          const stringResult = validators.string(value);
          if (stringResult !== true) return stringResult;

          const minLengthValidator = validators.minLength(3);
          return minLengthValidator(value);
        };

        expect(composedValidator("hello")).toBe(true);
        expect(composedValidator("ab")).toBe("must be at least 3 characters");
        expect(composedValidator("")).toBe("is required");
        expect(composedValidator(123)).toBe("must be a string");
      });

      it("should allow custom validators", () => {
        const customValidator = (value: unknown): boolean | string => {
          if (typeof value === "string" && value.startsWith("custom-")) {
            return true;
          }
          return "must start with 'custom-'";
        };

        expect(customValidator("custom-value")).toBe(true);
        expect(customValidator("invalid")).toBe("must start with 'custom-'");
      });
    });
  });

  describe("integration scenarios", () => {
    it("should validate complex nested validation logic", () => {
      const schema: ValidationSchema = {
        body: {
          email: (value) => {
            const requiredResult = validators.required(value);
            if (requiredResult !== true) return requiredResult;
            return validators.email(value);
          },
          password: (value) => {
            const requiredResult = validators.required(value);
            if (requiredResult !== true) return requiredResult;

            const stringResult = validators.string(value);
            if (stringResult !== true) return stringResult;

            const minLength = validators.minLength(8);
            return minLength(value);
          },
        },
      };

      const middleware = validate(schema);
      const req = createMockRequest({ email: "user@example.com", password: "securepass123" });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it("should validate API pagination parameters", () => {
      const schema: ValidationSchema = {
        query: {
          page: validators.string,
          limit: validators.string,
          sort: validators.oneOf(["asc", "desc"]),
        },
      };

      const middleware = validate(schema);
      const req = createMockRequest({}, {}, { page: "1", limit: "10", sort: "asc" });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it("should validate RESTful resource identifiers", () => {
      const schema: ValidationSchema = {
        params: {
          userId: validators.required,
          postId: validators.required,
        },
      };

      const middleware = validate(schema);
      const req = createMockRequest({}, { userId: "123", postId: "456" });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });
  });
});

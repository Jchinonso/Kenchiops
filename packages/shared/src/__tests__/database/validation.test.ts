/**
 * Unit tests for database/validation shared module.
 */
import { describe, it, expect } from "@jest/globals";
import {
  validateId,
  validateIds,
  validateNonEmptyString,
  validateMinimumNumber,
  validatePositiveNumber,
  validateNonNegativeNumber,
  validateLimit,
  validateEmbedding,
} from "../../database/validation/helpers.js";

describe("database/validation", () => {
  describe("validateId", () => {
    it("accepts non-empty string", () => {
      expect(() => validateId("abc-123", "testId")).not.toThrow();
    });

    it("rejects empty string", () => {
      expect(() => validateId("", "testId")).toThrow("testId cannot be empty");
    });

    it("rejects whitespace-only string", () => {
      expect(() => validateId("   ", "testId")).toThrow("testId cannot be empty");
    });
  });

  describe("validateIds", () => {
    it("accepts empty array", () => {
      expect(() => validateIds([], "docIds")).not.toThrow();
    });

    it("accepts array of valid IDs", () => {
      expect(() => validateIds(["a", "b", "c"], "docIds")).not.toThrow();
    });

    it("rejects array containing empty ID", () => {
      expect(() => validateIds(["a", "", "c"], "docIds")).toThrow("docIds contains empty IDs");
    });

    it("rejects array containing whitespace-only ID", () => {
      expect(() => validateIds(["a", "  "], "docIds")).toThrow("docIds contains empty IDs");
    });
  });

  describe("validateNonEmptyString", () => {
    it("accepts non-empty string", () => {
      expect(() => validateNonEmptyString("hello", "name")).not.toThrow();
    });

    it("rejects empty string", () => {
      expect(() => validateNonEmptyString("", "name")).toThrow("name cannot be empty");
    });
  });

  describe("validateMinimumNumber", () => {
    it("accepts value at minimum", () => {
      expect(() => validateMinimumNumber(5, "count", 5)).not.toThrow();
    });

    it("accepts value above minimum", () => {
      expect(() => validateMinimumNumber(10, "count", 5)).not.toThrow();
    });

    it("rejects value below minimum", () => {
      expect(() => validateMinimumNumber(3, "count", 5)).toThrow("count must be at least 5");
    });

    it("rejects NaN", () => {
      expect(() => validateMinimumNumber(NaN, "count", 0)).toThrow();
    });

    it("rejects Infinity", () => {
      expect(() => validateMinimumNumber(Infinity, "count", 0)).toThrow();
    });
  });

  describe("validatePositiveNumber", () => {
    it("accepts positive number", () => {
      expect(() => validatePositiveNumber(1, "value")).not.toThrow();
    });

    it("rejects zero", () => {
      expect(() => validatePositiveNumber(0, "value")).toThrow("value must be a positive number");
    });

    it("rejects negative number", () => {
      expect(() => validatePositiveNumber(-1, "value")).toThrow("value must be a positive number");
    });
  });

  describe("validateNonNegativeNumber", () => {
    it("accepts zero", () => {
      expect(() => validateNonNegativeNumber(0, "value")).not.toThrow();
    });

    it("accepts positive number", () => {
      expect(() => validateNonNegativeNumber(5, "value")).not.toThrow();
    });

    it("rejects negative number", () => {
      expect(() => validateNonNegativeNumber(-1, "value")).toThrow(
        "value must be a non-negative number"
      );
    });
  });

  describe("validateLimit", () => {
    it("accepts limit at minimum", () => {
      expect(() => validateLimit(10, 10)).not.toThrow();
    });

    it("accepts limit above minimum", () => {
      expect(() => validateLimit(50, 10)).not.toThrow();
    });

    it("rejects limit below minimum", () => {
      expect(() => validateLimit(5, 10)).toThrow("Query limit must be at least 10");
    });
  });

  describe("validateEmbedding", () => {
    it("accepts valid embedding", () => {
      expect(() => validateEmbedding([0.1, 0.2, 0.3])).not.toThrow();
    });

    it("rejects empty embedding", () => {
      expect(() => validateEmbedding([])).toThrow("Embedding cannot be empty");
    });

    it("rejects embedding with NaN", () => {
      expect(() => validateEmbedding([0.1, NaN, 0.3])).toThrow("Embedding contains invalid values");
    });

    it("rejects embedding with Infinity", () => {
      expect(() => validateEmbedding([0.1, Infinity])).toThrow("Embedding contains invalid values");
    });
  });
});

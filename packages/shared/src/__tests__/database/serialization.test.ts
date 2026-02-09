/**
 * Unit tests for database/serialization shared module.
 */
import { describe, it, expect } from "@jest/globals";
import {
  serializeOptionalJson,
  serializeRequiredJson,
} from "../../database/serialization/helpers.js";

describe("database/serialization", () => {
  describe("serializeOptionalJson", () => {
    it("returns null for undefined", () => {
      expect(serializeOptionalJson(undefined)).toBeNull();
    });

    it("serializes object to JSON string", () => {
      const result = serializeOptionalJson({ key: "value" });
      expect(result).toBe('{"key":"value"}');
    });

    it("serializes array to JSON string", () => {
      const result = serializeOptionalJson(["a", "b"]);
      expect(result).toBe('["a","b"]');
    });

    it("serializes empty object", () => {
      expect(serializeOptionalJson({})).toBe("{}");
    });
  });

  describe("serializeRequiredJson", () => {
    it("serializes object to JSON string", () => {
      const result = serializeRequiredJson({ count: 42 });
      expect(result).toBe('{"count":42}');
    });

    it("serializes nested object", () => {
      const result = serializeRequiredJson({ nested: { deep: true } });
      expect(result).toBe('{"nested":{"deep":true}}');
    });
  });
});

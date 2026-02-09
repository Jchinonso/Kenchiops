/**
 * Tests for API key validation module.
 */

import type { Request } from "express";
import {
  createApiKeyValidator,
  defaultApiKeyValidator,
  extractApiKey,
  apiKeyRateLimitKey,
} from "../../rateLimit/apiKey.js";
import { API_KEY_DEFAULTS } from "../../rateLimit/types.js";

const createMockRequest = (apiKey?: string, header?: string): Request =>
  ({
    headers: apiKey ? { [header ?? API_KEY_DEFAULTS.HEADER_NAME.toLowerCase()]: apiKey } : {},
  }) as Request;

describe("ApiKeyValidator", () => {
  describe("validate", () => {
    it("should return missing status for absent API key", () => {
      const validator = createApiKeyValidator();
      const result = validator.validate(createMockRequest());

      expect(result.isValid).toBe(false);
      expect(result.keyId).toBeNull();
      expect(result.status).toBe("missing");
      expect(result.error).toBeUndefined();
    });

    it("should validate correct API key format and return keyId (not raw key)", () => {
      const validator = createApiKeyValidator();
      const result = validator.validate(createMockRequest("sk_test_abc123"));

      expect(result.isValid).toBe(true);
      // SECURITY: Returns hashed keyId, not raw API key
      expect(result.keyId).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should reject keys exceeding max length", () => {
      const validator = createApiKeyValidator({ maxLength: 10 });
      const result = validator.validate(createMockRequest("very_long_api_key_here"));

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("API key exceeds maximum length");
    });

    it("should reject invalid format", () => {
      const validator = createApiKeyValidator({
        validationPattern: /^sk_[a-z]+_[a-z0-9]+$/,
      });
      const result = validator.validate(createMockRequest("invalid!@#key"));

      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Invalid API key format");
    });

    it("should use custom header name", () => {
      const validator = createApiKeyValidator({ headerName: "X-Custom-Key" });
      const result = validator.validate(createMockRequest("my_key", "x-custom-key"));

      expect(result.isValid).toBe(true);
      expect(result.keyId).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should accept single-element array header", () => {
      const validator = createApiKeyValidator();
      const req = {
        headers: { "x-api-key": ["key1"] },
      } as unknown as Request;

      const result = validator.validate(req);
      expect(result.isValid).toBe(true);
      expect(result.keyId).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should reject multiple API keys in header as suspicious", () => {
      const validator = createApiKeyValidator();
      const req = {
        headers: { "x-api-key": ["key1", "key2"] },
      } as unknown as Request;

      const result = validator.validate(req);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Multiple API keys not allowed");
    });

    it("should trim whitespace from API key", () => {
      const validator = createApiKeyValidator();
      const result = validator.validate(createMockRequest("  my_key  "));

      expect(result.isValid).toBe(true);
      // Whitespace trimmed, then hashed
      expect(result.keyId).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should return consistent keyId for same API key", () => {
      const validator = createApiKeyValidator();
      const result1 = validator.validate(createMockRequest("my_api_key"));
      const result2 = validator.validate(createMockRequest("my_api_key"));

      expect(result1.keyId).toBe(result2.keyId);
    });
  });

  describe("key limits", () => {
    it("should return limit for configured key", () => {
      const validator = createApiKeyValidator({
        keyLimits: {
          premium_key: { max: 1000, windowMs: 60000 },
        },
      });

      const result = validator.validate(createMockRequest("premium_key"));

      expect(result.isValid).toBe(true);
      expect(result.limit).toEqual({ max: 1000, windowMs: 60000 });
    });

    it("should return default limit for unconfigured key", () => {
      const validator = createApiKeyValidator({
        defaultLimit: { max: 100, windowMs: 60000 },
      });

      const result = validator.validate(createMockRequest("unknown_key"));

      expect(result.isValid).toBe(true);
      expect(result.limit).toEqual({ max: 100, windowMs: 60000 });
    });

    it("should return null limit when no default configured", () => {
      const validator = createApiKeyValidator();
      const result = validator.validate(createMockRequest("some_key"));

      expect(result.isValid).toBe(true);
      expect(result.limit).toBeNull();
    });
  });

  describe("extractKey", () => {
    it("should extract API key from request", () => {
      const validator = createApiKeyValidator();
      const key = validator.extractKey(createMockRequest("my_api_key"));

      expect(key).toBe("my_api_key");
    });

    it("should return null for missing key", () => {
      const validator = createApiKeyValidator();
      const key = validator.extractKey(createMockRequest());

      expect(key).toBeNull();
    });
  });

  describe("getLimitForKey", () => {
    it("should return configured limit", () => {
      const validator = createApiKeyValidator({
        keyLimits: {
          test_key: { max: 500, windowMs: 30000 },
        },
      });

      expect(validator.getLimitForKey("test_key")).toEqual({ max: 500, windowMs: 30000 });
    });

    it("should return default limit for unconfigured key", () => {
      const validator = createApiKeyValidator({
        defaultLimit: { max: 50, windowMs: 60000 },
      });

      expect(validator.getLimitForKey("unknown")).toEqual({ max: 50, windowMs: 60000 });
    });

    it("should return null when no limit configured", () => {
      const validator = createApiKeyValidator();

      expect(validator.getLimitForKey("unknown")).toBeNull();
    });
  });

  describe("setKeyLimit / removeKeyLimit", () => {
    it("should set and remove key limits", () => {
      const validator = createApiKeyValidator();

      validator.setKeyLimit("new_key", { max: 200, windowMs: 60000 });
      expect(validator.getLimitForKey("new_key")).toEqual({ max: 200, windowMs: 60000 });

      const removed = validator.removeKeyLimit("new_key");
      expect(removed).toBe(true);
      expect(validator.getLimitForKey("new_key")).toBeNull();
    });

    it("should return false when removing non-existent key", () => {
      const validator = createApiKeyValidator();
      expect(validator.removeKeyLimit("nonexistent")).toBe(false);
    });
  });

  describe("hasKeyLimit", () => {
    it("should return true for configured keys", () => {
      const validator = createApiKeyValidator({
        keyLimits: { test_key: { max: 100, windowMs: 60000 } },
      });

      expect(validator.hasKeyLimit("test_key")).toBe(true);
      expect(validator.hasKeyLimit("unknown")).toBe(false);
    });
  });

  describe("getConfiguredKeys / getConfiguredKeyIds", () => {
    it("should return hashed key IDs (not raw keys)", () => {
      const validator = createApiKeyValidator({
        keyLimits: {
          key1: { max: 100, windowMs: 60000 },
          key2: { max: 200, windowMs: 60000 },
        },
      });

      const keyIds = validator.getConfiguredKeyIds();
      expect(keyIds).toHaveLength(2);
      // Should return SHA-256 hashes (64 hex chars), not raw keys
      keyIds.forEach((keyId) => {
        expect(keyId).toMatch(/^[a-f0-9]{64}$/);
      });
      // Raw keys should NOT be returned
      expect(keyIds).not.toContain("key1");
      expect(keyIds).not.toContain("key2");
    });

    it("getConfiguredKeys should be deprecated alias for getConfiguredKeyIds", () => {
      const validator = createApiKeyValidator({
        keyLimits: { test_key: { max: 100, windowMs: 60000 } },
      });

      expect(validator.getConfiguredKeys()).toEqual(validator.getConfiguredKeyIds());
    });
  });

  describe("defaultApiKeyValidator", () => {
    it("should be a pre-configured instance", () => {
      const result = defaultApiKeyValidator.validate(createMockRequest("test_key"));
      expect(result).toHaveProperty("isValid");
      expect(result).toHaveProperty("keyId");
    });
  });

  describe("extractApiKey helper", () => {
    it("should extract API key using default validator", () => {
      expect(extractApiKey(createMockRequest("my_key"))).toBe("my_key");
      expect(extractApiKey(createMockRequest())).toBeNull();
    });
  });

  describe("apiKeyRateLimitKey helper", () => {
    it("should include full hashed API key in rate limit key", () => {
      const key = apiKeyRateLimitKey(createMockRequest("test_api_key"), "base:123");

      // Full SHA-256 hash (64 hex chars) used for rate limiting (no collisions)
      expect(key).toMatch(/^apikey:[a-f0-9]{64}\|base:123$/);
    });

    it("should return base key when no API key present", () => {
      const key = apiKeyRateLimitKey(createMockRequest(), "base:123");

      expect(key).toBe("base:123");
    });

    it("should return base key when multiple API keys present", () => {
      const req = {
        headers: { "x-api-key": ["key1", "key2"] },
      } as unknown as Request;
      const key = apiKeyRateLimitKey(req, "base:123");

      // Multiple keys = extractKey returns null = base key only
      expect(key).toBe("base:123");
    });
  });
});

/**
 * Tests for endpoint limits module.
 */

import type { Request } from "express";
import {
  createEndpointLimiter,
  createEndpointLimiterWithDefaults,
  COMMON_ENDPOINT_LIMITS,
} from "../../rateLimit/endpointLimits.js";

const createMockRequest = (path: string, method: string = "GET"): Request =>
  ({ path, method }) as Request;

describe("EndpointLimiter", () => {
  describe("resolve", () => {
    const limiter = createEndpointLimiter({
      endpoints: [
        { pattern: "/api/auth/login", methods: ["POST"], max: 5, windowMs: 60000 },
        { pattern: /^\/api\/users\/\d+$/, max: 100, windowMs: 60000 },
        { pattern: "/health", max: 1000, windowMs: 1000, skipAuth: true },
      ],
      defaultLimit: { max: 50, windowMs: 60000 },
    });

    it("should match exact path", () => {
      const result = limiter.resolve(createMockRequest("/api/auth/login", "POST"));

      expect(result.matched).toBe(true);
      expect(result.endpoint).toBe("/api/auth/login");
      expect(result.limit).toEqual({ max: 5, windowMs: 60000 });
    });

    it("should match regex pattern", () => {
      const result = limiter.resolve(createMockRequest("/api/users/123"));

      expect(result.matched).toBe(true);
      expect(result.limit).toEqual({ max: 100, windowMs: 60000 });
    });

    it("should not match wrong method", () => {
      const result = limiter.resolve(createMockRequest("/api/auth/login", "GET"));

      expect(result.matched).toBe(false);
      expect(result.limit).toEqual({ max: 50, windowMs: 60000 });
    });

    it("should return default limit for unmatched path", () => {
      const result = limiter.resolve(createMockRequest("/unknown/path"));

      expect(result.matched).toBe(false);
      expect(result.endpoint).toBeNull();
      expect(result.limit).toEqual({ max: 50, windowMs: 60000 });
    });

    it("should return skipAuth flag", () => {
      const result = limiter.resolve(createMockRequest("/health"));

      expect(result.matched).toBe(true);
      expect(result.skipAuth).toBe(true);
    });

    it("should match path prefix", () => {
      // The /api/auth/login endpoint requires POST method
      const result = limiter.resolve(createMockRequest("/api/auth/login/subpath", "POST"));

      expect(result.matched).toBe(true);
      expect(result.endpoint).toBe("/api/auth/login");
    });
  });

  describe("method matching", () => {
    const limiter = createEndpointLimiter({
      endpoints: [
        { pattern: "/resource", methods: ["GET", "POST"], max: 100, windowMs: 60000 },
        { pattern: "/open", max: 200, windowMs: 60000 }, // No methods = all methods
      ],
      defaultLimit: { max: 50, windowMs: 60000 },
    });

    it("should match specified methods", () => {
      expect(limiter.resolve(createMockRequest("/resource", "GET")).matched).toBe(true);
      expect(limiter.resolve(createMockRequest("/resource", "POST")).matched).toBe(true);
      expect(limiter.resolve(createMockRequest("/resource", "DELETE")).matched).toBe(false);
    });

    it("should match all methods when not specified", () => {
      expect(limiter.resolve(createMockRequest("/open", "GET")).matched).toBe(true);
      expect(limiter.resolve(createMockRequest("/open", "POST")).matched).toBe(true);
      expect(limiter.resolve(createMockRequest("/open", "DELETE")).matched).toBe(true);
    });

    it("should be case-insensitive for methods", () => {
      expect(limiter.resolve(createMockRequest("/resource", "get")).matched).toBe(true);
      expect(limiter.resolve(createMockRequest("/resource", "Get")).matched).toBe(true);
    });
  });

  describe("getLimitForPath", () => {
    const limiter = createEndpointLimiter({
      endpoints: [{ pattern: "/api/test", max: 10, windowMs: 1000 }],
      defaultLimit: { max: 100, windowMs: 60000 },
    });

    it("should return limit for matching path", () => {
      const limit = limiter.getLimitForPath("/api/test");
      expect(limit).toEqual({ max: 10, windowMs: 1000 });
    });

    it("should return default for non-matching path", () => {
      const limit = limiter.getLimitForPath("/other");
      expect(limit).toEqual({ max: 100, windowMs: 60000 });
    });

    it("should accept method parameter", () => {
      const limiter2 = createEndpointLimiter({
        endpoints: [{ pattern: "/resource", methods: ["POST"], max: 5, windowMs: 1000 }],
        defaultLimit: { max: 100, windowMs: 60000 },
      });

      expect(limiter2.getLimitForPath("/resource", "POST")).toEqual({ max: 5, windowMs: 1000 });
      expect(limiter2.getLimitForPath("/resource", "GET")).toEqual({ max: 100, windowMs: 60000 });
    });
  });

  describe("generateKey", () => {
    const limiter = createEndpointLimiter({
      endpoints: [{ pattern: "/api/special", max: 10, windowMs: 1000 }],
      defaultLimit: { max: 100, windowMs: 60000 },
    });

    it("should include endpoint in key for matched paths", () => {
      const key = limiter.generateKey(createMockRequest("/api/special"), "user:123");
      expect(key).toBe("endpoint:/api/special|user:123");
    });

    it("should return base key for unmatched paths", () => {
      const key = limiter.generateKey(createMockRequest("/other"), "user:123");
      expect(key).toBe("user:123");
    });
  });

  describe("COMMON_ENDPOINT_LIMITS", () => {
    it("should include auth endpoints", () => {
      const authEndpoint = COMMON_ENDPOINT_LIMITS.find(
        (e) => e.pattern instanceof RegExp && e.pattern.source.includes("auth")
      );
      expect(authEndpoint).toBeDefined();
      expect(authEndpoint?.max).toBeLessThan(100);
    });

    it("should include login endpoint", () => {
      const loginEndpoint = COMMON_ENDPOINT_LIMITS.find((e) => e.pattern === "/login");
      expect(loginEndpoint).toBeDefined();
      expect(loginEndpoint?.methods).toContain("POST");
    });

    it("should include health endpoint with skipAuth", () => {
      const healthEndpoint = COMMON_ENDPOINT_LIMITS.find((e) => e.pattern === "/health");
      expect(healthEndpoint).toBeDefined();
      expect(healthEndpoint?.skipAuth).toBe(true);
    });

    it("should include webhook endpoint with skipAuth", () => {
      const webhookEndpoint = COMMON_ENDPOINT_LIMITS.find(
        (e) => e.pattern instanceof RegExp && e.pattern.source.includes("webhook")
      );
      expect(webhookEndpoint).toBeDefined();
      expect(webhookEndpoint?.skipAuth).toBe(true);
    });
  });

  describe("createEndpointLimiterWithDefaults", () => {
    it("should include common limits", () => {
      const limiter = createEndpointLimiterWithDefaults();

      const healthResult = limiter.resolve(createMockRequest("/health"));
      expect(healthResult.matched).toBe(true);
      expect(healthResult.skipAuth).toBe(true);
    });

    it("should prepend custom endpoints", () => {
      const limiter = createEndpointLimiterWithDefaults([
        { pattern: "/custom", max: 1, windowMs: 1000 },
      ]);

      const customResult = limiter.resolve(createMockRequest("/custom"));
      expect(customResult.matched).toBe(true);
      expect(customResult.limit.max).toBe(1);
    });

    it("should use custom default limit", () => {
      const limiter = createEndpointLimiterWithDefaults([], { max: 200, windowMs: 120000 });

      const result = limiter.resolve(createMockRequest("/unknown"));
      expect(result.limit).toEqual({ max: 200, windowMs: 120000 });
    });
  });

  describe("priority order", () => {
    it("should match first matching endpoint", () => {
      const limiter = createEndpointLimiter({
        endpoints: [
          { pattern: "/api", max: 10, windowMs: 1000 },
          { pattern: "/api/specific", max: 5, windowMs: 1000 },
        ],
        defaultLimit: { max: 100, windowMs: 60000 },
      });

      // /api/specific matches /api first due to prefix matching
      const result = limiter.resolve(createMockRequest("/api/specific"));
      expect(result.limit.max).toBe(10);
    });

    it("should allow more specific patterns first", () => {
      const limiter = createEndpointLimiter({
        endpoints: [
          { pattern: "/api/specific", max: 5, windowMs: 1000 },
          { pattern: "/api", max: 10, windowMs: 1000 },
        ],
        defaultLimit: { max: 100, windowMs: 60000 },
      });

      const result = limiter.resolve(createMockRequest("/api/specific"));
      expect(result.limit.max).toBe(5);
    });
  });
});

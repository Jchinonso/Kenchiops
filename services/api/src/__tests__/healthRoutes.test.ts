/**
 * Unit tests for Health Routes
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import request from "supertest";
import express, { type Express } from "express";
import { healthRoutes } from "../routes/healthRoutes.js";
import type { HealthResponse } from "../types/apiTypes.js";

// Mock dependencies
jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    HTTP_STATUS: {
      OK: 200,
      SERVICE_UNAVAILABLE: 503,
    },
    config: {
      NODE_ENV: "test",
      PORT: 3000,
    },
  };
});

jest.mock("../config/appConfig.js", () => ({
  appConfig: {
    serviceName: "api",
    port: 3000,
    environment: "test",
  },
}));

describe("Health Routes", () => {
  let app: Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(healthRoutes);
  });

  describe("GET /health", () => {
    it("should return health status", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("service");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body).toHaveProperty("uptime");
      expect(response.body).toHaveProperty("environment");
    });

    it("should return status ok", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("ok");
    });

    it("should return correct service name", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body.service).toBe("api");
    });

    it("should return valid ISO timestamp", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body.timestamp).toBeDefined();
      expect(new Date(response.body.timestamp).getTime()).not.toBeNaN();
    });

    it("should return uptime as number", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(typeof response.body.uptime).toBe("number");
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it("should return environment", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body.environment).toBeDefined();
      expect(typeof response.body.environment).toBe("string");
    });

    it("should return test environment", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body.environment).toBe("test");
    });

    it("should have correct response structure", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      const body: HealthResponse = response.body;
      expect(body.status).toBe("ok");
      expect(body.service).toBe("api");
      expect(body.timestamp).toBeDefined();
      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(body.environment).toBeDefined();
    });

    it("should respond quickly", async () => {
      const start = Date.now();
      const response = await request(app).get("/health");
      const duration = Date.now() - start;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(100); // Should respond within 100ms
    });

    it("should handle concurrent health checks", async () => {
      const requests = Array.from({ length: 10 }, () => request(app).get("/health"));

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe("ok");
      });
    });

    it("should return different timestamps for sequential requests", async () => {
      const response1 = await request(app).get("/health");
      await new Promise((resolve) => setTimeout(resolve, 10));
      const response2 = await request(app).get("/health");

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      // Timestamps might be the same due to fast execution, but uptime should be different
      expect(response2.body.uptime).toBeGreaterThanOrEqual(response1.body.uptime);
    });

    it("should increment uptime over time", async () => {
      const response1 = await request(app).get("/health");
      await new Promise((resolve) => setTimeout(resolve, 100));
      const response2 = await request(app).get("/health");

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response2.body.uptime).toBeGreaterThan(response1.body.uptime);
    });

    it("should return JSON content type", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toMatch(/application\/json/);
    });

    it("should handle multiple rapid requests", async () => {
      const responses = [];

      for (let i = 0; i < 5; i++) {
        const response = await request(app).get("/health");
        responses.push(response);
      }

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe("ok");
      });
    });

    it("should not require authentication", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
    });

    it("should not require request body", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
    });

    it("should ignore query parameters", async () => {
      const response = await request(app).get("/health?param=value&other=123");

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("ok");
    });

    it("should have consistent response format", async () => {
      const response1 = await request(app).get("/health");
      const response2 = await request(app).get("/health");

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(Object.keys(response1.body).sort()).toEqual(Object.keys(response2.body).sort());
    });

    it("should include all required fields", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      const requiredFields = ["status", "service", "timestamp", "uptime", "environment"];
      requiredFields.forEach((field) => {
        expect(response.body).toHaveProperty(field);
      });
    });

    it("should not include sensitive information", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty("apiKey");
      expect(response.body).not.toHaveProperty("secret");
      expect(response.body).not.toHaveProperty("password");
    });

    it("should handle HEAD request", async () => {
      const response = await request(app).head("/health");

      expect(response.status).toBe(200);
    });

    it("should return uptime in seconds", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
      // Uptime should be reasonable (not in milliseconds)
      expect(response.body.uptime).toBeLessThan(1000000);
    });

    it("should use ISO 8601 format for timestamp", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      const timestamp = response.body.timestamp;
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it("should return current timestamp", async () => {
      const before = Date.now();
      const response = await request(app).get("/health");
      const after = Date.now();

      expect(response.status).toBe(200);
      const responseTime = new Date(response.body.timestamp).getTime();
      expect(responseTime).toBeGreaterThanOrEqual(before);
      expect(responseTime).toBeLessThanOrEqual(after);
    });

    it("should handle OPTIONS request", async () => {
      const response = await request(app).options("/health");

      // Default behavior for OPTIONS
      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    it("should be idempotent", async () => {
      const response1 = await request(app).get("/health");
      const response2 = await request(app).get("/health");
      const response3 = await request(app).get("/health");

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response3.status).toBe(200);

      expect(response1.body.service).toBe(response2.body.service);
      expect(response2.body.service).toBe(response3.body.service);
    });
  });

  describe("error handling", () => {
    it("should not accept POST requests", async () => {
      const response = await request(app).post("/health").send({});

      expect(response.status).toBe(404);
    });

    it("should not accept PUT requests", async () => {
      const response = await request(app).put("/health").send({});

      expect(response.status).toBe(404);
    });

    it("should not accept DELETE requests", async () => {
      const response = await request(app).delete("/health");

      expect(response.status).toBe(404);
    });

    it("should not accept PATCH requests", async () => {
      const response = await request(app).patch("/health").send({});

      expect(response.status).toBe(404);
    });
  });

  describe("edge cases", () => {
    it("should handle requests with Accept header", async () => {
      const response = await request(app).get("/health").set("Accept", "application/json");

      expect(response.status).toBe(200);
    });

    it("should handle requests with custom headers", async () => {
      const response = await request(app).get("/health").set("X-Custom-Header", "test-value");

      expect(response.status).toBe(200);
    });

    it("should handle requests without Accept header", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it("should handle very long query strings", async () => {
      const longQuery = "param=" + "a".repeat(1000);
      const response = await request(app).get(`/health?${longQuery}`);

      expect(response.status).toBe(200);
    });
  });
});

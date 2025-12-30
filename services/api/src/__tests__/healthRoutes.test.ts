/**
 * Unit tests for Health Routes
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import request from "supertest";
import express, { type Express } from "express";

// Mock health check functions
const mockPerformHealthCheck = jest.fn<() => Promise<Record<string, unknown>>>();
const mockLivenessCheck = jest.fn<() => Record<string, unknown>>();
const mockReadinessCheck = jest.fn<() => Promise<{ ready: boolean; reason?: string }>>();

// Mock dependencies
jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    HTTP_STATUS: {
      OK: 200,
      SERVICE_UNAVAILABLE: 503,
    },
    HEALTH_STATUS: {
      OK: "ok",
      HEALTHY: "healthy",
      DEGRADED: "degraded",
      UNHEALTHY: "unhealthy",
    },
    config: {
      NODE_ENV: "test",
      PORT: 3000,
    },
    performHealthCheck: mockPerformHealthCheck,
    livenessCheck: mockLivenessCheck,
    readinessCheck: mockReadinessCheck,
    asyncHandler:
      (fn: (...args: unknown[]) => Promise<unknown>) =>
      async (req: unknown, res: unknown, next: unknown) => {
        try {
          await fn(req, res, next);
        } catch (error) {
          (next as (err: unknown) => void)(error);
        }
      },
  };
});

jest.mock("../config/appConfig.js", () => ({
  appConfig: {
    serviceName: "api",
    version: "1.0.0",
    port: 3000,
    environment: "test",
  },
}));

describe("Health Routes", () => {
  let app: Express;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default mock implementations
    mockPerformHealthCheck.mockResolvedValue({
      status: "healthy",
      service: "api",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: "test",
      components: [
        { name: "memory", status: "healthy", message: "Heap usage: 50%" },
        { name: "database", status: "healthy", message: "PostgreSQL connection OK", latencyMs: 5 },
        { name: "redis", status: "healthy", message: "Redis connection OK", latencyMs: 2 },
      ],
      memory: {
        heapUsed: 50,
        heapTotal: 100,
        heapUsedPercent: 50,
        rss: 150,
        external: 10,
      },
    });

    mockLivenessCheck.mockReturnValue({
      status: "ok",
      timestamp: new Date().toISOString(),
    });

    mockReadinessCheck.mockResolvedValue({
      ready: true,
    });

    // Need to dynamically import the routes after mocking
    const { healthRoutes } = await import("../routes/healthRoutes.js");
    app = express();
    app.use(healthRoutes);
  });

  describe("GET /health", () => {
    it("should return comprehensive health status", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("status", "healthy");
      expect(response.body).toHaveProperty("service", "api");
      expect(response.body).toHaveProperty("version");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body).toHaveProperty("uptime");
      expect(response.body).toHaveProperty("environment");
      expect(response.body).toHaveProperty("components");
      expect(response.body).toHaveProperty("memory");
    });

    it("should return 503 when unhealthy", async () => {
      mockPerformHealthCheck.mockResolvedValue({
        status: "unhealthy",
        service: "api",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        uptime: 100,
        environment: "test",
        components: [{ name: "database", status: "unhealthy", message: "Connection failed" }],
        memory: { heapUsed: 50, heapTotal: 100, heapUsedPercent: 50, rss: 150, external: 10 },
      });

      const response = await request(app).get("/health");

      expect(response.status).toBe(503);
      expect(response.body.status).toBe("unhealthy");
    });

    it("should return 200 when degraded", async () => {
      mockPerformHealthCheck.mockResolvedValue({
        status: "degraded",
        service: "api",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        uptime: 100,
        environment: "test",
        components: [{ name: "redis", status: "degraded", message: "Connection slow" }],
        memory: { heapUsed: 50, heapTotal: 100, heapUsedPercent: 50, rss: 150, external: 10 },
      });

      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("degraded");
    });

    it("should include component health details", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.components)).toBe(true);
      expect(response.body.components.length).toBeGreaterThan(0);

      const component = response.body.components[0];
      expect(component).toHaveProperty("name");
      expect(component).toHaveProperty("status");
    });

    it("should include memory health information", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body.memory).toHaveProperty("heapUsed");
      expect(response.body.memory).toHaveProperty("heapTotal");
      expect(response.body.memory).toHaveProperty("heapUsedPercent");
    });

    it("should return valid ISO timestamp", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body.timestamp).toBeDefined();
      expect(new Date(response.body.timestamp).getTime()).not.toBeNaN();
    });

    it("should return JSON content type", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toMatch(/application\/json/);
    });
  });

  describe("GET /live", () => {
    it("should return liveness status", async () => {
      const response = await request(app).get("/live");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("status", "ok");
      expect(response.body).toHaveProperty("timestamp");
    });

    it("should respond quickly", async () => {
      const start = Date.now();
      const response = await request(app).get("/live");
      const duration = Date.now() - start;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(50); // Liveness should be very fast
    });

    it("should return valid ISO timestamp", async () => {
      const response = await request(app).get("/live");

      expect(response.status).toBe(200);
      const { timestamp } = response.body;
      expect(new Date(timestamp).getTime()).not.toBeNaN();
    });
  });

  describe("GET /ready", () => {
    it("should return ready when all dependencies are healthy", async () => {
      const response = await request(app).get("/ready");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("ready", true);
    });

    it("should return 503 when not ready", async () => {
      mockReadinessCheck.mockResolvedValue({
        ready: false,
        reason: "Unhealthy components: database",
      });

      const response = await request(app).get("/ready");

      expect(response.status).toBe(503);
      expect(response.body.ready).toBe(false);
      expect(response.body.reason).toBeDefined();
    });

    it("should include reason when not ready", async () => {
      mockReadinessCheck.mockResolvedValue({
        ready: false,
        reason: "Unhealthy components: database, redis",
      });

      const response = await request(app).get("/ready");

      expect(response.status).toBe(503);
      expect(response.body.reason).toContain("database");
    });
  });

  describe("error handling", () => {
    it("should not accept POST requests on /health", async () => {
      const response = await request(app).post("/health").send({});

      expect(response.status).toBe(404);
    });

    it("should not accept POST requests on /live", async () => {
      const response = await request(app).post("/live").send({});

      expect(response.status).toBe(404);
    });

    it("should not accept POST requests on /ready", async () => {
      const response = await request(app).post("/ready").send({});

      expect(response.status).toBe(404);
    });
  });

  describe("concurrent requests", () => {
    it("should handle concurrent health checks", async () => {
      const requests = Array.from({ length: 10 }, () => request(app).get("/health"));

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe("healthy");
      });
    });

    it("should handle concurrent liveness checks", async () => {
      const requests = Array.from({ length: 10 }, () => request(app).get("/live"));

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe("ok");
      });
    });
  });
});

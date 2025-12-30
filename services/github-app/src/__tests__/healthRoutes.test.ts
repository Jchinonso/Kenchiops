/**
 * Unit tests for Health Routes
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";

// Mock health check functions
const mockPerformHealthCheck = jest.fn<() => Promise<Record<string, unknown>>>();
const mockLivenessCheck = jest.fn<() => Record<string, unknown>>();
const mockReadinessCheck = jest.fn<() => Promise<{ ready: boolean; reason?: string }>>();

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  HTTP_STATUS: {
    OK: 200,
    BAD_REQUEST: 400,
    INTERNAL_SERVER_ERROR: 500,
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
  },
  GITHUB_PAGINATION: {
    DEFAULT_PER_PAGE: 100,
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
}));

jest.mock("../config/appConfig.js", () => ({
  appConfig: {
    serviceName: "github-app",
    version: "1.0.0",
    github: {
      appId: "123456",
      privateKey:
        "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAtest...\n-----END RSA PRIVATE KEY-----",
      webhookSecret: "test-secret",
      installationId: 12345,
    },
  },
}));

jest.mock("../services/githubService.js", () => ({
  getOctokit: jest.fn(() =>
    Promise.resolve({
      rest: {
        apps: {
          listReposAccessibleToInstallation: jest.fn(() =>
            Promise.resolve({
              data: {
                total_count: 2,
                repositories: [
                  {
                    full_name: "owner/repo1",
                    private: true,
                    open_issues_count: 5,
                  },
                  {
                    full_name: "owner/repo2",
                    private: false,
                    open_issues_count: 3,
                  },
                ],
              },
            })
          ),
        },
      },
    })
  ),
}));

// Import after mocks
import { healthRoutes } from "../routes/healthRoutes.js";

describe("Health Routes", () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockPerformHealthCheck.mockResolvedValue({
      status: "healthy",
      service: "github-app",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      uptime: 12345,
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

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use(healthRoutes);

    // Mock process.uptime
    jest.spyOn(process, "uptime").mockReturnValue(12345);
  });

  describe("GET /health", () => {
    it("should return comprehensive health status", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("status", "healthy");
      expect(response.body).toHaveProperty("service", "github-app");
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
        service: "github-app",
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

    it("should include timestamp", async () => {
      const response = await request(app).get("/health");

      expect(response.body.timestamp).toBeDefined();
      expect(new Date(response.body.timestamp).getTime()).not.toBeNaN();
    });

    it("should include uptime", async () => {
      const response = await request(app).get("/health");

      expect(response.body.uptime).toBe(12345);
    });

    it("should include component health details", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.components)).toBe(true);
      expect(response.body.components.length).toBeGreaterThan(0);
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
      expect(duration).toBeLessThan(50);
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
  });

  describe("GET /health/github", () => {
    it("should return GitHub configuration status", async () => {
      const response = await request(app).get("/health/github");

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        appId: "123456",
        installationId: 12345,
        webhookSecretConfigured: true,
        privateKeyConfigured: true,
      });
    });

    it("should validate private key format", async () => {
      const response = await request(app).get("/health/github");

      expect(response.body.privateKeyValid).toBe(true);
    });

    it("should include private key length", async () => {
      const response = await request(app).get("/health/github");

      expect(response.body.privateKeyLength).toBeGreaterThan(0);
      expect(typeof response.body.privateKeyLength).toBe("number");
    });

    it("should include private key preview", async () => {
      const response = await request(app).get("/health/github");

      expect(response.body.privateKeyPreview).toBeDefined();
      expect(response.body.privateKeyPreview).toContain("BEGIN RSA PRIVATE KEY");
      expect(response.body.privateKeyPreview).toContain("...");
    });

    it("should show installation ID as string when configured", async () => {
      const response = await request(app).get("/health/github");

      expect(response.body.installationId).toBe(12345);
    });
  });

  describe("GET /health/github/repos", () => {
    it("should return accessible repositories", async () => {
      const response = await request(app).get("/health/github/repos");

      expect(response.status).toBe(200);
      expect(response.body.totalCount).toBe(2);
      expect(response.body.repositories).toHaveLength(2);
    });

    it("should include repository details", async () => {
      const response = await request(app).get("/health/github/repos");

      expect(response.body.repositories[0]).toMatchObject({
        fullName: "owner/repo1",
        private: true,
        openIssuesCount: 5,
      });
    });

    it("should handle GitHub API errors", async () => {
      const { getOctokit } = jest.requireMock("../services/githubService.js") as {
        getOctokit: jest.Mock;
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (getOctokit as any).mockRejectedValue(new Error("GitHub API error"));

      const response = await request(app).get("/health/github/repos");

      expect(response.status).toBe(500);
      expect(response.body.error).toContain("GitHub API error");
    });
  });

  describe("private key validation edge cases", () => {
    it("should handle missing private key start marker", async () => {
      const mockAppConfig = jest.requireMock("../config/appConfig.js") as {
        appConfig: {
          github: {
            privateKey: string;
            appId: string;
            webhookSecret: string;
            installationId?: number;
          };
          serviceName: string;
          version: string;
        };
      };
      mockAppConfig.appConfig.github.privateKey = "invalid key\n-----END RSA PRIVATE KEY-----";

      const response = await request(app).get("/health/github");

      expect(response.body.privateKeyValid).toBe(false);
    });

    it("should handle missing private key end marker", async () => {
      const mockAppConfig = jest.requireMock("../config/appConfig.js") as {
        appConfig: {
          github: {
            privateKey: string;
            appId: string;
            webhookSecret: string;
            installationId?: number;
          };
          serviceName: string;
          version: string;
        };
      };
      mockAppConfig.appConfig.github.privateKey = "-----BEGIN RSA PRIVATE KEY-----\ninvalid";

      const response = await request(app).get("/health/github");

      expect(response.body.privateKeyValid).toBe(false);
    });

    it("should handle empty private key", async () => {
      const mockAppConfig = jest.requireMock("../config/appConfig.js") as {
        appConfig: {
          github: {
            privateKey: string;
            appId: string;
            webhookSecret: string;
            installationId?: number;
          };
          serviceName: string;
          version: string;
        };
      };
      mockAppConfig.appConfig.github.privateKey = "";

      const response = await request(app).get("/health/github");

      expect(response.body.privateKeyConfigured).toBe(false);
      expect(response.body.privateKeyValid).toBe(false);
    });
  });

  describe("configuration edge cases", () => {
    it("should handle missing installation ID", async () => {
      const mockAppConfig = jest.requireMock("../config/appConfig.js") as {
        appConfig: {
          github: {
            privateKey: string;
            appId: string;
            webhookSecret: string;
            installationId?: number;
          };
          serviceName: string;
          version: string;
        };
      };
      mockAppConfig.appConfig.github.installationId = undefined;

      const response = await request(app).get("/health/github");

      expect(response.body.installationId).toBe("not configured");
    });

    it("should handle missing webhook secret", async () => {
      const mockAppConfig = jest.requireMock("../config/appConfig.js") as {
        appConfig: {
          github: {
            privateKey: string;
            appId: string;
            webhookSecret: string;
            installationId?: number;
          };
          serviceName: string;
          version: string;
        };
      };
      mockAppConfig.appConfig.github.webhookSecret = "";

      const response = await request(app).get("/health/github");

      expect(response.body.webhookSecretConfigured).toBe(false);
    });

    it("should handle repos endpoint without installation ID", async () => {
      const mockAppConfig = jest.requireMock("../config/appConfig.js") as {
        appConfig: {
          github: {
            privateKey: string;
            appId: string;
            webhookSecret: string;
            installationId?: number;
          };
          serviceName: string;
          version: string;
        };
      };
      mockAppConfig.appConfig.github.installationId = undefined;

      const response = await request(app).get("/health/github/repos");

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("No installation ID");
    });
  });
});

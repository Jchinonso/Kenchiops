/**
 * Unit tests for Health Routes
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  HTTP_STATUS: {
    OK: 200,
    BAD_REQUEST: 400,
    INTERNAL_SERVER_ERROR: 500,
  },
  config: {
    NODE_ENV: "test",
  },
  GITHUB_PAGINATION: {
    DEFAULT_PER_PAGE: 100,
  },
}));

jest.mock("../config/appConfig.js", () => ({
  appConfig: {
    serviceName: "github-app",
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

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use(healthRoutes);

    // Mock process.uptime
    jest.spyOn(process, "uptime").mockReturnValue(12345);
  });

  describe("GET /health", () => {
    it("should return health status", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: "ok",
        service: "github-app",
        environment: "test",
      });
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

    it("should return ISO timestamp", async () => {
      const response = await request(app).get("/health");

      const timestamp = response.body.timestamp;
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
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
        };
      };
      mockAppConfig.appConfig.github.installationId = undefined;

      const response = await request(app).get("/health/github/repos");

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("No installation ID");
    });
  });
});

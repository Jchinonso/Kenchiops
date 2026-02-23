/**
 * Unit tests for Setup Routes
 *
 * Updated for provider-neutral tenant model.
 * - findByGitHubInstallation -> findTenantByGitHubInstallation
 * - findBySlackWorkspace -> findTenantBySlackWorkspace
 * - Slack connection check uses findSlackConnection
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";

// Helper to create a provider-neutral mock tenant
const createMockTenant = (overrides = {}) => ({
  id: "tenant-123",
  orgName: "testorg",
  status: "active" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  ragMonthlyBudgetUsd: 0,
  ragPreferredTier: "STANDARD" as const,
  ragAllowPremium: false,
  ragDegradeOnBudgetWarning: true,
  ...overrides,
});

// Helper to create a mock Slack ProviderConnection
const createMockSlackConnection = (overrides = {}) => ({
  id: "prc_slack123",
  tenantId: "tenant-123",
  provider: "slack" as const,
  connectionName: "Test Team",
  externalOrgId: "T123456",
  baseUrl: null,
  config: {
    teamName: "Test Team",
    botUserId: "U123456",
    installedAt: "2024-01-01T00:00:00Z",
  },
  webhookSecret: null,
  accessToken: "xoxb-token",
  tokenExpiresAt: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  HTTP_STATUS: {
    OK: 200,
    BAD_REQUEST: 400,
    INTERNAL_SERVER_ERROR: 500,
  },
  GITHUB_SETUP_CONFIG: {
    SUCCESS_TITLE: "Setup Complete",
    SUCCESS_HEADING: "GitHub App Installed!",
    SUCCESS_MESSAGE: "Your GitHub App has been successfully installed.",
    ERROR_TITLE: "Setup Error",
    ERROR_HEADING: "Installation Error",
    PROCESSING_TITLE: "Installation Processing",
    PROCESSING_HEADING: "Please Wait...",
    PROCESSING_MESSAGE: "Installation is being processed. This page will refresh automatically.",
    REFRESH_INTERVAL_SECONDS: 3,
  },
  findTenantBySlackWorkspace: jest.fn(() => Promise.resolve(createMockTenant())),
  findTenantByGitHubInstallation: jest.fn(() => Promise.resolve(createMockTenant())),
  findSlackConnection: jest.fn(() => Promise.resolve(null)),
  linkSlackWorkspace: jest.fn(() => Promise.resolve()),
  deleteTenant: jest.fn(() => Promise.resolve()),
  getErrorMessage: jest.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  ),
}));

// Import after mocks
import { setupRoutes } from "../routes/setupRoutes.js";
import {
  findTenantBySlackWorkspace,
  findTenantByGitHubInstallation,
  findSlackConnection,
  linkSlackWorkspace,
} from "@kenchi/shared";

const mockFindTenantBySlackWorkspace = findTenantBySlackWorkspace as jest.MockedFunction<
  typeof findTenantBySlackWorkspace
>;
const mockFindTenantByGitHubInstallation = findTenantByGitHubInstallation as jest.MockedFunction<
  typeof findTenantByGitHubInstallation
>;
const mockFindSlackConnection = findSlackConnection as jest.MockedFunction<
  typeof findSlackConnection
>;
const mockLinkSlackWorkspace = linkSlackWorkspace as jest.MockedFunction<typeof linkSlackWorkspace>;

describe("Setup Routes", () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use(setupRoutes);

    // Reset mock implementations
    mockFindTenantByGitHubInstallation.mockResolvedValue(createMockTenant());

    mockFindTenantBySlackWorkspace.mockResolvedValue(createMockTenant());

    // Default: no Slack connection (pending state)
    mockFindSlackConnection.mockResolvedValue(null);

    mockLinkSlackWorkspace.mockResolvedValue(
      createMockTenant({
        status: "active" as const,
      })
    );
  });

  describe("GET /github/setup", () => {
    it("should return success page when tenant found", async () => {
      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "install",
      });

      expect(response.status).toBe(200);
      expect(response.text).toContain("GitHub App Installed");
      expect(response.text).toContain("testorg");
    });

    it("should reject missing installation_id", async () => {
      const response = await request(app).get("/github/setup").query({
        setup_action: "install",
      });

      expect(response.status).toBe(400);
      expect(response.text).toContain("Invalid Setup Request");
    });

    it("should reject invalid installation_id", async () => {
      const response = await request(app).get("/github/setup").query({
        installation_id: "invalid",
        setup_action: "install",
      });

      expect(response.status).toBe(400);
      expect(response.text).toContain("Invalid Installation ID");
    });

    it("should handle tenant not found with processing message", async () => {
      mockFindTenantByGitHubInstallation.mockResolvedValue(null);

      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "install",
      });

      expect(response.status).toBe(200);
      expect(response.text).toContain("Installation Processing");
      expect(response.text).toContain("refresh");
    });

    it("should show linked status when Slack already connected", async () => {
      // Return a Slack connection for this tenant
      mockFindSlackConnection.mockResolvedValue(createMockSlackConnection());

      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "install",
      });

      expect(response.status).toBe(200);
      expect(response.text).toContain("Test Team");
      expect(response.text).toContain("Kenchi is now active");
    });

    it("should show pending status when Slack not connected", async () => {
      // No Slack connection (default mock)
      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "install",
      });

      expect(response.status).toBe(200);
      expect(response.text).toContain("Pending connection");
      expect(response.text).toContain("Install Slack App");
    });

    it("should link Slack workspace when state provided", async () => {
      // First call: existingSlackConn for the GitHub tenant — no Slack yet
      // Second call: slackTenantConn for the Slack tenant — has bot token
      mockFindSlackConnection
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(createMockSlackConnection());

      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "install",
        state: "T123456",
      });

      expect(mockFindTenantBySlackWorkspace).toHaveBeenCalledWith("T123456");
      expect(mockLinkSlackWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-123",
          slackWorkspaceId: "T123456",
          slackTeamName: "Test Team",
        })
      );
      expect(response.text).toContain("Test Team");
    });

    it("should not link when Slack workspace not found", async () => {
      mockFindTenantBySlackWorkspace.mockResolvedValue(null);

      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "install",
        state: "T123456",
      });

      expect(mockLinkSlackWorkspace).not.toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it("should not link when tenant already has Slack connected", async () => {
      // Existing Slack connection on the GitHub tenant
      mockFindSlackConnection.mockResolvedValue(
        createMockSlackConnection({
          externalOrgId: "T999999",
          connectionName: "Existing Team",
          config: {
            teamName: "Existing Team",
            botUserId: "U999999",
            installedAt: "2024-01-01T00:00:00Z",
          },
        })
      );

      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "install",
        state: "T123456",
      });

      expect(mockLinkSlackWorkspace).not.toHaveBeenCalled();
      expect(response.text).toContain("Existing Team");
    });

    it("should handle errors gracefully", async () => {
      mockFindTenantByGitHubInstallation.mockRejectedValue(new Error("Database error"));

      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "install",
      });

      expect(response.status).toBe(500);
      expect(response.text).toContain("Setup Error");
    });

    it("should handle linking errors", async () => {
      // First call: existingSlackConn for GitHub tenant — no Slack yet
      // Second call: slackTenantConn for Slack tenant — has bot token
      mockFindSlackConnection
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(createMockSlackConnection());
      mockLinkSlackWorkspace.mockRejectedValue(new Error("Link error"));

      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "install",
        state: "T123456",
      });

      expect(response.status).toBe(500);
      expect(response.text).toContain("Setup Error");
    });

    it("should include checkmarks in success page", async () => {
      // Slack connection exists
      mockFindSlackConnection.mockResolvedValue(createMockSlackConnection());

      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "install",
      });

      expect(response.text).toContain("&#x2705;");
    });

    it("should include pending icon when Slack not connected", async () => {
      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "install",
      });

      expect(response.text).toContain("&#x23F3;");
    });

    it("should handle update action", async () => {
      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "update",
      });

      expect(response.status).toBe(200);
      expect(mockFindTenantByGitHubInstallation).toHaveBeenCalledWith(12345);
    });

    it("should require Slack bot token for linking", async () => {
      // Slack connection exists but has no accessToken
      mockFindSlackConnection.mockResolvedValue(
        createMockSlackConnection({
          accessToken: null,
        })
      );

      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "install",
        state: "T123456",
      });

      expect(mockLinkSlackWorkspace).not.toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it("should parse large installation IDs", async () => {
      await request(app).get("/github/setup").query({
        installation_id: "999999999",
        setup_action: "install",
      });

      expect(mockFindTenantByGitHubInstallation).toHaveBeenCalledWith(999999999);
    });
  });

  describe("HTML response validation", () => {
    it("should return valid HTML structure", async () => {
      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "install",
      });

      expect(response.text).toContain("<!DOCTYPE html>");
      expect(response.text).toContain("<html>");
      expect(response.text).toContain("</html>");
    });

    it("should include CSS styles", async () => {
      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "install",
      });

      expect(response.text).toContain("<style>");
      expect(response.text).toContain("</style>");
    });

    it("should include proper meta tags", async () => {
      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "install",
      });

      expect(response.text).toContain("<title>");
      expect(response.text).toContain("Kenchi");
    });
  });
});

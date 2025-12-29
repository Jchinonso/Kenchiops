/**
 * Unit tests for Setup Routes
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";

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
  findBySlackWorkspace: jest.fn(() =>
    Promise.resolve({
      id: "slack-tenant-123",
      slackWorkspaceId: "T123456",
      slackTeamName: "Test Team",
      slackBotToken: "xoxb-token",
      slackBotUserId: "U123456",
    })
  ),
  findByGitHubInstallation: jest.fn(() =>
    Promise.resolve({
      id: "tenant-123",
      githubOrg: "testorg",
      githubInstallationId: 12345,
      slackWorkspaceId: null,
      slackTeamName: null,
      slackBotToken: null,
      slackBotUserId: null,
    })
  ),
  linkSlackWorkspace: jest.fn(() => Promise.resolve()),
}));

// Import after mocks
import { setupRoutes } from "../routes/setupRoutes.js";
import { findBySlackWorkspace, findByGitHubInstallation, linkSlackWorkspace } from "@kenchi/shared";

const mockFindBySlackWorkspace = findBySlackWorkspace as jest.MockedFunction<
  typeof findBySlackWorkspace
>;
const mockFindByGitHubInstallation = findByGitHubInstallation as jest.MockedFunction<
  typeof findByGitHubInstallation
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
    mockFindByGitHubInstallation.mockResolvedValue({
      id: "tenant-123",
      githubOrg: "testorg",
      githubInstallationId: 12345,
      slackWorkspaceId: null,
      slackTeamName: null,
      slackBotToken: null,
      slackBotUserId: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    mockFindBySlackWorkspace.mockResolvedValue({
      id: "slack-tenant-123",
      slackWorkspaceId: "T123456",
      slackTeamName: "Test Team",
      slackBotToken: "xoxb-token",
      slackBotUserId: "U123456",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    mockLinkSlackWorkspace.mockResolvedValue({
      id: "tenant-123",
      githubOrg: "testorg",
      githubInstallationId: 12345,
      githubAppInstalledAt: new Date(),
      slackWorkspaceId: "T123456",
      slackTeamName: "Test Team",
      slackBotToken: "xoxb-token",
      slackBotUserId: "U123456",
      slackAppInstalledAt: new Date(),
      status: "active" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
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
      mockFindByGitHubInstallation.mockResolvedValue(null);

      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "install",
      });

      expect(response.status).toBe(200);
      expect(response.text).toContain("Installation Processing");
      expect(response.text).toContain("refresh");
    });

    it("should show linked status when Slack already connected", async () => {
      mockFindByGitHubInstallation.mockResolvedValue({
        id: "tenant-123",
        githubOrg: "testorg",
        githubInstallationId: 12345,
        slackWorkspaceId: "T123456",
        slackTeamName: "Test Team",
        slackBotToken: "xoxb-token",
        slackBotUserId: "U123456",
        githubAppInstalledAt: new Date(),
        slackAppInstalledAt: new Date(),
        status: "active" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "install",
      });

      expect(response.status).toBe(200);
      expect(response.text).toContain("Test Team");
      expect(response.text).toContain("Kenchi is now active");
    });

    it("should show pending status when Slack not connected", async () => {
      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "install",
      });

      expect(response.status).toBe(200);
      expect(response.text).toContain("Pending connection");
      expect(response.text).toContain("Install Slack App");
    });

    it("should link Slack workspace when state provided", async () => {
      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "install",
        state: "T123456",
      });

      expect(mockFindBySlackWorkspace).toHaveBeenCalledWith("T123456");
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
      mockFindBySlackWorkspace.mockResolvedValue(null);

      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "install",
        state: "T123456",
      });

      expect(mockLinkSlackWorkspace).not.toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it("should not link when tenant already has Slack connected", async () => {
      mockFindByGitHubInstallation.mockResolvedValue({
        id: "tenant-123",
        githubOrg: "testorg",
        githubInstallationId: 12345,
        slackWorkspaceId: "T999999",
        slackTeamName: "Existing Team",
        slackBotToken: "xoxb-existing",
        slackBotUserId: "U999999",
        githubAppInstalledAt: new Date(),
        slackAppInstalledAt: new Date(),
        status: "active" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "install",
        state: "T123456",
      });

      expect(mockLinkSlackWorkspace).not.toHaveBeenCalled();
      expect(response.text).toContain("Existing Team");
    });

    it("should handle errors gracefully", async () => {
      mockFindByGitHubInstallation.mockRejectedValue(new Error("Database error"));

      const response = await request(app).get("/github/setup").query({
        installation_id: "12345",
        setup_action: "install",
      });

      expect(response.status).toBe(500);
      expect(response.text).toContain("Setup Error");
    });

    it("should handle linking errors", async () => {
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
      mockFindByGitHubInstallation.mockResolvedValue({
        id: "tenant-123",
        githubOrg: "testorg",
        githubInstallationId: 12345,
        slackWorkspaceId: "T123456",
        slackTeamName: "Test Team",
        slackBotToken: "xoxb-token",
        slackBotUserId: "U123456",
        githubAppInstalledAt: new Date(),
        slackAppInstalledAt: new Date(),
        status: "active" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

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
      expect(mockFindByGitHubInstallation).toHaveBeenCalledWith(12345);
    });

    it("should require Slack bot token for linking", async () => {
      mockFindBySlackWorkspace.mockResolvedValue({
        id: "slack-tenant-123",
        slackWorkspaceId: "T123456",
        slackTeamName: "Test Team",
        slackBotToken: null,
        slackBotUserId: null,
        githubOrg: "testorg",
        githubInstallationId: null,
        githubAppInstalledAt: null,
        slackAppInstalledAt: new Date(),
        status: "pending_github" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

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

      expect(mockFindByGitHubInstallation).toHaveBeenCalledWith(999999999);
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

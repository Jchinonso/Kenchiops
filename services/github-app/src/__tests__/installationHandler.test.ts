/**
 * Unit tests for Installation Handler
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { InstallationWebhook } from "../types/githubTypes.js";
import { GITHUB_INSTALLATION_ACTIONS } from "../types/githubTypes.js";

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  createFromGitHubInstall: jest.fn(() =>
    Promise.resolve({
      id: "tenant-123",
      githubOrg: "testorg",
      githubInstallationId: 12345,
      status: "active",
      slackWorkspaceId: null,
      slackTeamName: null,
      slackBotToken: null,
      slackBotUserId: null,
    })
  ),
  handleGitHubUninstall: jest.fn(() => Promise.resolve()),
  findByGitHubInstallation: jest.fn(() =>
    Promise.resolve({
      id: "tenant-123",
      githubOrg: "testorg",
      githubInstallationId: 12345,
      status: "active",
      slackWorkspaceId: "T123456",
      slackTeamName: "Test Team",
      slackBotToken: "xoxb-token",
      slackBotUserId: "U123456",
    })
  ),
  suspend: jest.fn(() => Promise.resolve()),
  activate: jest.fn(() => Promise.resolve()),
}));

// Import handlers and mocked functions
import { handleInstallation } from "../handlers/installationHandler.js";
import {
  createFromGitHubInstall,
  handleGitHubUninstall,
  findByGitHubInstallation,
  suspend,
  activate,
} from "@kenchi/shared";

const mockCreateFromGitHubInstall = createFromGitHubInstall as jest.MockedFunction<
  typeof createFromGitHubInstall
>;
const mockHandleGitHubUninstall = handleGitHubUninstall as jest.MockedFunction<
  typeof handleGitHubUninstall
>;
const mockFindByGitHubInstallation = findByGitHubInstallation as jest.MockedFunction<
  typeof findByGitHubInstallation
>;
const mockSuspend = suspend as jest.MockedFunction<typeof suspend>;
const mockActivate = activate as jest.MockedFunction<typeof activate>;

describe("Installation Handler", () => {
  // Test fixtures
  const createMockWebhook = (
    overrides: Partial<InstallationWebhook> = {}
  ): InstallationWebhook => ({
    action: GITHUB_INSTALLATION_ACTIONS.CREATED,
    installation: {
      id: 12345,
      account: {
        login: "testorg",
        id: 67890,
        type: "Organization",
      },
      app_id: 111111,
      app_slug: "kenchi",
      target_type: "Organization",
      permissions: { contents: "read", metadata: "read" },
      events: ["check_run", "pull_request"],
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    },
    repositories: [
      {
        id: 1,
        name: "repo1",
        full_name: "testorg/repo1",
        private: true,
      },
    ],
    sender: {
      login: "admin",
      id: 99999,
      type: "User",
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset all mock implementations
    mockCreateFromGitHubInstall.mockResolvedValue({
      id: "tenant-123",
      githubOrg: "testorg",
      githubInstallationId: 12345,
      status: "active" as const,
      slackWorkspaceId: null,
      slackTeamName: null,
      slackBotToken: null,
      slackBotUserId: null,
      githubAppInstalledAt: new Date(),
      slackAppInstalledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockFindByGitHubInstallation.mockResolvedValue({
      id: "tenant-123",
      githubOrg: "testorg",
      githubInstallationId: 12345,
      status: "active" as const,
      slackWorkspaceId: "T123456",
      slackTeamName: "Test Team",
      slackBotToken: "xoxb-token",
      slackBotUserId: "U123456",
      githubAppInstalledAt: new Date(),
      slackAppInstalledAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockActivate.mockResolvedValue({
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

    mockHandleGitHubUninstall.mockResolvedValue(undefined);
    mockSuspend.mockResolvedValue({
      id: "tenant-123",
      githubOrg: "testorg",
      githubInstallationId: 12345,
      githubAppInstalledAt: new Date(),
      slackWorkspaceId: "T123456",
      slackTeamName: "Test Team",
      slackBotToken: "xoxb-token",
      slackBotUserId: "U123456",
      slackAppInstalledAt: new Date(),
      status: "suspended" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  describe("handleInstallation - created action", () => {
    it("should create tenant for new installation", async () => {
      const webhook = createMockWebhook();
      const result = await handleInstallation(webhook);

      expect(result.handled).toBe(true);
      expect(result.tenantId).toBe("tenant-123");
      expect(mockCreateFromGitHubInstall).toHaveBeenCalledWith({
        githubOrg: "testorg",
        githubInstallationId: 12345,
      });
    });

    it("should include success message with org name", async () => {
      const webhook = createMockWebhook();
      const result = await handleInstallation(webhook);

      expect(result.message).toContain("testorg");
      expect(result.message).toContain("activated");
    });

    it("should handle creation errors gracefully", async () => {
      mockCreateFromGitHubInstall.mockRejectedValue(new Error("Database error"));

      const webhook = createMockWebhook();
      const result = await handleInstallation(webhook);

      expect(result.handled).toBe(false);
      expect(result.message).toContain("Database error");
    });

    it("should handle User type installations", async () => {
      const webhook = createMockWebhook({
        installation: {
          ...createMockWebhook().installation,
          account: {
            login: "testuser",
            id: 12345,
            type: "User",
          },
          target_type: "User",
        },
      });

      const result = await handleInstallation(webhook);

      expect(result.handled).toBe(true);
      expect(mockCreateFromGitHubInstall).toHaveBeenCalledWith({
        githubOrg: "testuser",
        githubInstallationId: 12345,
      });
    });

    it("should handle tenant in pending status", async () => {
      mockCreateFromGitHubInstall.mockResolvedValue({
        id: "tenant-456",
        githubOrg: "testorg",
        githubInstallationId: 12345,
        status: "pending_slack" as const,
        slackWorkspaceId: null,
        slackTeamName: null,
        slackBotToken: null,
        slackBotUserId: null,
        githubAppInstalledAt: new Date(),
        slackAppInstalledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const webhook = createMockWebhook();
      const result = await handleInstallation(webhook);

      expect(result.handled).toBe(true);
      expect(result.message).toContain("created");
    });
  });

  describe("handleInstallation - deleted action", () => {
    it("should soft delete tenant on uninstall", async () => {
      const webhook = createMockWebhook({
        action: GITHUB_INSTALLATION_ACTIONS.DELETED,
      });

      const result = await handleInstallation(webhook);

      expect(result.handled).toBe(true);
      expect(result.message).toContain("deleted");
      expect(mockHandleGitHubUninstall).toHaveBeenCalledWith(12345);
    });

    it("should handle uninstall errors gracefully", async () => {
      mockHandleGitHubUninstall.mockRejectedValue(new Error("Delete error"));

      const webhook = createMockWebhook({
        action: GITHUB_INSTALLATION_ACTIONS.DELETED,
      });

      const result = await handleInstallation(webhook);

      expect(result.handled).toBe(false);
      expect(result.message).toContain("Delete error");
    });
  });

  describe("handleInstallation - suspend action", () => {
    it("should suspend tenant", async () => {
      const webhook = createMockWebhook({
        action: GITHUB_INSTALLATION_ACTIONS.SUSPEND,
        installation: {
          ...createMockWebhook().installation,
          suspended_by: {
            login: "admin",
            id: 99999,
            type: "User",
          },
        },
      });

      const result = await handleInstallation(webhook);

      expect(result.handled).toBe(true);
      expect(result.message).toContain("suspended");
      expect(mockSuspend).toHaveBeenCalledWith("tenant-123", "GitHub App suspended by admin");
    });

    it("should handle suspend when tenant not found", async () => {
      mockFindByGitHubInstallation.mockResolvedValue(null);

      const webhook = createMockWebhook({
        action: GITHUB_INSTALLATION_ACTIONS.SUSPEND,
      });

      const result = await handleInstallation(webhook);

      expect(result.handled).toBe(false);
      expect(result.message).toContain("not found");
    });

    it("should handle suspend errors gracefully", async () => {
      mockSuspend.mockRejectedValue(new Error("Suspend error"));

      const webhook = createMockWebhook({
        action: GITHUB_INSTALLATION_ACTIONS.SUSPEND,
      });

      const result = await handleInstallation(webhook);

      expect(result.handled).toBe(false);
      expect(result.message).toContain("Suspend error");
    });

    it("should handle suspend when suspended_by is unknown", async () => {
      const webhook = createMockWebhook({
        action: GITHUB_INSTALLATION_ACTIONS.SUSPEND,
        installation: {
          ...createMockWebhook().installation,
          suspended_by: null,
        },
      });

      await handleInstallation(webhook);

      expect(mockSuspend).toHaveBeenCalledWith("tenant-123", "GitHub App suspended by unknown");
    });
  });

  describe("handleInstallation - unsuspend action", () => {
    it("should activate tenant when Slack is connected", async () => {
      const webhook = createMockWebhook({
        action: GITHUB_INSTALLATION_ACTIONS.UNSUSPEND,
      });

      const result = await handleInstallation(webhook);

      expect(result.handled).toBe(true);
      expect(result.message).toContain("reactivated");
      expect(mockActivate).toHaveBeenCalledWith("tenant-123");
    });

    it("should not activate when Slack not connected", async () => {
      mockFindByGitHubInstallation.mockResolvedValue({
        id: "tenant-123",
        githubOrg: "testorg",
        githubInstallationId: 12345,
        status: "suspended" as const,
        slackWorkspaceId: null,
        slackTeamName: null,
        slackBotToken: null,
        slackBotUserId: null,
        githubAppInstalledAt: new Date(),
        slackAppInstalledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const webhook = createMockWebhook({
        action: GITHUB_INSTALLATION_ACTIONS.UNSUSPEND,
      });

      const result = await handleInstallation(webhook);

      expect(result.handled).toBe(true);
      expect(result.message).toContain("awaiting Slack");
      expect(mockActivate).not.toHaveBeenCalled();
    });

    it("should handle unsuspend when tenant not found", async () => {
      mockFindByGitHubInstallation.mockResolvedValue(null);

      const webhook = createMockWebhook({
        action: GITHUB_INSTALLATION_ACTIONS.UNSUSPEND,
      });

      const result = await handleInstallation(webhook);

      expect(result.handled).toBe(false);
      expect(result.message).toContain("not found");
    });

    it("should handle unsuspend errors gracefully", async () => {
      // Use mockRejectedValueOnce to avoid contaminating other tests
      mockActivate.mockRejectedValueOnce(new Error("Activation failed"));

      const webhook = createMockWebhook({
        action: GITHUB_INSTALLATION_ACTIONS.UNSUSPEND,
      });

      const result = await handleInstallation(webhook);

      expect(result.handled).toBe(false);
      expect(result.message).toContain("Activation failed");
    });
  });

  describe("handleInstallation - unknown action", () => {
    it("should handle unknown actions gracefully", async () => {
      const webhook = createMockWebhook({
        action: "unknown_action" as typeof GITHUB_INSTALLATION_ACTIONS.CREATED,
      });

      const result = await handleInstallation(webhook);

      expect(result.handled).toBe(false);
      expect(result.message).toContain("unknown_action");
      expect(result.message).toContain("not handled");
    });

    it("should not call any service methods for unknown actions", async () => {
      const webhook = createMockWebhook({
        action: GITHUB_INSTALLATION_ACTIONS.NEW_PERMISSIONS_ACCEPTED,
      });

      await handleInstallation(webhook);

      expect(mockCreateFromGitHubInstall).not.toHaveBeenCalled();
      expect(mockHandleGitHubUninstall).not.toHaveBeenCalled();
      expect(mockSuspend).not.toHaveBeenCalled();
      expect(mockActivate).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should extract error message from Error objects", async () => {
      mockCreateFromGitHubInstall.mockRejectedValue(new Error("Specific error"));

      const webhook = createMockWebhook();
      const result = await handleInstallation(webhook);

      expect(result.message).toContain("Specific error");
    });

    it("should handle non-Error objects", async () => {
      mockCreateFromGitHubInstall.mockRejectedValue("String error");

      const webhook = createMockWebhook();
      const result = await handleInstallation(webhook);

      expect(result.handled).toBe(false);
    });

    it("should handle null errors", async () => {
      mockCreateFromGitHubInstall.mockRejectedValue(null);

      const webhook = createMockWebhook();
      const result = await handleInstallation(webhook);

      expect(result.handled).toBe(false);
    });
  });
});

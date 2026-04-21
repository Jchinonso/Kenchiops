/**
 * Unit tests for Channel Handler
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
  handleBotJoinedChannel,
  getAvailableRepositories,
  getGitHubInstallUrl,
  buildRepoConfiguredMessage,
  clearRepoCache,
} from "../handlers/channelHandler.js";

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  config: {
    GITHUB_APP_SLUG: "kenchi-test-app",
  },
  findTenantBySlackWorkspace: jest.fn(),
  findGitHubAppConnection: jest.fn(),
  getMappedRepositories: jest.fn(() => Promise.resolve(new Set())),
  fetchInstallationRepositories: jest.fn(() => Promise.resolve([])),
  createMapping: jest.fn(() => Promise.resolve({ id: "rcm_123" })),
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AuthorizationError";
    }
  },
  getErrorMessage: jest.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  ),
}));

jest.mock("../handlers/modalBuilders.js", () => ({
  REPO_SELECT_MODAL_CALLBACK: "repo_select_modal",
  REPO_SELECT_ACTION_ID: "repo_select_action",
  UNCONFIGURE_MODAL_CALLBACK: "unconfigure_modal",
  UNCONFIGURE_SELECT_ACTION_ID: "unconfigure_select_action",
  buildRepoSelectModal: jest.fn(() => ({
    type: "modal",
    callback_id: "repo_select_modal",
    title: { type: "plain_text", text: "Select Repository" },
    blocks: [],
  })),
  buildNoReposModal: jest.fn(() => ({
    type: "modal",
    callback_id: "no_repos_modal",
    title: { type: "plain_text", text: "No Repositories" },
    blocks: [],
  })),
  buildUnconfigureModal: jest.fn(),
  buildNoConfiguredReposModal: jest.fn(),
}));

describe("Channel Handler", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createMockClient = (): any => {
    const client = {
      auth: {
        test: jest.fn<() => Promise<{ team_id: string }>>(),
      },
      chat: {
        postMessage: jest.fn<() => Promise<{ ok: boolean; ts: string }>>(),
        update: jest.fn<() => Promise<{ ok: boolean }>>(),
      },
      conversations: {
        info: jest.fn<() => Promise<{ channel: { name: string } }>>(),
      },
      views: {
        open: jest.fn<() => Promise<{ ok: boolean }>>(),
      },
    };
    client.auth.test.mockResolvedValue({ team_id: "T123456" });
    client.chat.postMessage.mockResolvedValue({ ok: true, ts: "1234567890.123456" });
    client.chat.update.mockResolvedValue({ ok: true });
    client.conversations.info.mockResolvedValue({ channel: { name: "general" } });
    client.views.open.mockResolvedValue({ ok: true });
    return client;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    clearRepoCache();
    mockClient = createMockClient();
  });

  describe("getGitHubInstallUrl", () => {
    it("should build correct GitHub install URL", () => {
      const url = getGitHubInstallUrl("W123456");

      expect(url).toContain("https://github.com/apps/");
      expect(url).toContain("state=W123456");
    });

    it("should use configured app slug", () => {
      const url = getGitHubInstallUrl("W123456");

      expect(url).toContain("kenchi-test-app");
    });
  });

  describe("buildRepoConfiguredMessage", () => {
    it("should include repository name", () => {
      const message = buildRepoConfiguredMessage("owner/repo", "general");

      expect(message).toContain("owner/repo");
    });

    it("should include channel name", () => {
      const message = buildRepoConfiguredMessage("owner/repo", "dev-team");

      expect(message).toContain("#dev-team");
    });

    it("should describe bot capabilities", () => {
      const message = buildRepoConfiguredMessage("owner/repo", "general");

      expect(message).toContain("Analyze the logs");
      expect(message).toContain("fix suggestions");
    });
  });

  describe("getAvailableRepositories", () => {
    it("should fetch repositories from GitHub installation", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { fetchInstallationRepositories } = jest.requireMock("@kenchi/shared") as any;
      fetchInstallationRepositories.mockResolvedValue([
        { fullName: "owner/repo1", name: "repo1" },
        { fullName: "owner/repo2", name: "repo2" },
      ]);

      const repos = await getAvailableRepositories(12345, "tenant-123");

      expect(repos).toHaveLength(2);
      expect(repos[0].fullName).toBe("owner/repo1");
    });

    it("should filter out already-mapped repositories", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { fetchInstallationRepositories, getMappedRepositories } = jest.requireMock(
        "@kenchi/shared"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any;

      fetchInstallationRepositories.mockResolvedValue([
        { fullName: "owner/repo1", name: "repo1" },
        { fullName: "owner/repo2", name: "repo2" },
        { fullName: "owner/repo3", name: "repo3" },
      ]);

      getMappedRepositories.mockResolvedValue(new Set(["owner/repo2"]));

      const repos = await getAvailableRepositories(12345, "tenant-123");

      expect(repos).toHaveLength(2);
      expect(repos.find((repo) => repo.fullName === "owner/repo2")).toBeUndefined();
    });

    it("should return empty array on error", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { fetchInstallationRepositories } = jest.requireMock("@kenchi/shared") as any;
      fetchInstallationRepositories.mockRejectedValue(new Error("API error"));

      const repos = await getAvailableRepositories(12345, "tenant-123");

      expect(repos).toEqual([]);
    });

    it("should log error when fetching fails", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { fetchInstallationRepositories, logger } = jest.requireMock("@kenchi/shared") as any;
      fetchInstallationRepositories.mockRejectedValue(new Error("API error"));

      await getAvailableRepositories(12345, "tenant-123");

      expect(logger.error).toHaveBeenCalledWith(
        "Failed to fetch available repositories",
        expect.any(Object)
      );
    });
  });

  describe("handleBotJoinedChannel", () => {
    it("should prompt to connect GitHub when no tenant exists", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace } = jest.requireMock("@kenchi/shared") as any;
      findTenantBySlackWorkspace.mockResolvedValue(null);

      await handleBotJoinedChannel(mockClient, "C123456", "T123456");

      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123456",
          text: expect.stringContaining("connect GitHub"),
        })
      );
    });

    it("should prompt to connect GitHub when tenant has no installation", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace, findGitHubAppConnection } = jest.requireMock(
        "@kenchi/shared"
      ) as any;
      findTenantBySlackWorkspace.mockResolvedValue({
        id: "tenant-123",
      });
      findGitHubAppConnection.mockResolvedValue(null);

      await handleBotJoinedChannel(mockClient, "C123456", "T123456");

      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("connect GitHub"),
        })
      );
    });

    it("should auto-map all available repos when bot joins", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const {
        findTenantBySlackWorkspace,
        findGitHubAppConnection,
        fetchInstallationRepositories,
        createMapping,
      } =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        jest.requireMock("@kenchi/shared") as any;

      findTenantBySlackWorkspace.mockResolvedValue({ id: "tenant-123" });
      findGitHubAppConnection.mockResolvedValue({ id: "prc_gh123", externalOrgId: "12345" });
      fetchInstallationRepositories.mockResolvedValue([
        { fullName: "owner/repo1", name: "repo1" },
        { fullName: "owner/repo2", name: "repo2" },
      ]);

      await handleBotJoinedChannel(mockClient, "C123456", "T123456");

      expect(createMapping).toHaveBeenCalledTimes(2);
      expect(createMapping).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-123",
          repository: "owner/repo1",
          slackChannelId: "C123456",
          createdBy: "auto",
        })
      );
      expect(createMapping).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-123",
          repository: "owner/repo2",
          slackChannelId: "C123456",
          createdBy: "auto",
        })
      );
    });

    it("should post confirmation listing mapped repos", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace, findGitHubAppConnection, fetchInstallationRepositories } =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        jest.requireMock("@kenchi/shared") as any;

      findTenantBySlackWorkspace.mockResolvedValue({ id: "tenant-123" });
      findGitHubAppConnection.mockResolvedValue({ id: "prc_gh123", externalOrgId: "12345" });
      fetchInstallationRepositories.mockResolvedValue([{ fullName: "owner/repo1", name: "repo1" }]);

      await handleBotJoinedChannel(mockClient, "C123456", "T123456");

      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123456",
          text: expect.stringContaining("owner/repo1"),
        })
      );
    });

    it("should post all-mapped message when no repos available", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const {
        findTenantBySlackWorkspace,
        findGitHubAppConnection,
        fetchInstallationRepositories,
        getMappedRepositories,
      } =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        jest.requireMock("@kenchi/shared") as any;

      findTenantBySlackWorkspace.mockResolvedValue({ id: "tenant-123" });
      findGitHubAppConnection.mockResolvedValue({ id: "prc_gh123", externalOrgId: "12345" });
      fetchInstallationRepositories.mockResolvedValue([]);
      getMappedRepositories.mockResolvedValue(new Set());

      await handleBotJoinedChannel(mockClient, "C123456", "T123456");

      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("No new repositories to connect"),
        })
      );
    });

    it("should stop mapping on plan limit and note it in confirmation", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const {
        findTenantBySlackWorkspace,
        findGitHubAppConnection,
        fetchInstallationRepositories,
        createMapping,
        AuthorizationError,
      } =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        jest.requireMock("@kenchi/shared") as any;

      findTenantBySlackWorkspace.mockResolvedValue({ id: "tenant-123" });
      findGitHubAppConnection.mockResolvedValue({ id: "prc_gh123", externalOrgId: "12345" });
      fetchInstallationRepositories.mockResolvedValue([
        { fullName: "owner/repo1", name: "repo1" },
        { fullName: "owner/repo2", name: "repo2" },
      ]);
      createMapping
        .mockResolvedValueOnce({ id: "rcm_1" })
        .mockRejectedValueOnce(new AuthorizationError("Plan limit exceeded"));

      await handleBotJoinedChannel(mockClient, "C123456", "T123456");

      expect(createMapping).toHaveBeenCalledTimes(2);
      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("plan limit"),
        })
      );
    });

    it("should continue past individual repo failures", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const {
        findTenantBySlackWorkspace,
        findGitHubAppConnection,
        fetchInstallationRepositories,
        createMapping,
      } =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        jest.requireMock("@kenchi/shared") as any;

      findTenantBySlackWorkspace.mockResolvedValue({ id: "tenant-123" });
      findGitHubAppConnection.mockResolvedValue({ id: "prc_gh123", externalOrgId: "12345" });
      fetchInstallationRepositories.mockResolvedValue([
        { fullName: "owner/repo1", name: "repo1" },
        { fullName: "owner/repo2", name: "repo2" },
        { fullName: "owner/repo3", name: "repo3" },
      ]);
      createMapping
        .mockResolvedValueOnce({ id: "rcm_1" })
        .mockRejectedValueOnce(new Error("DB error"))
        .mockResolvedValueOnce({ id: "rcm_3" });

      await handleBotJoinedChannel(mockClient, "C123456", "T123456");

      expect(createMapping).toHaveBeenCalledTimes(3);
      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("2 repositor"),
        })
      );
    });

    it("should handle errors gracefully", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace } = jest.requireMock("@kenchi/shared") as any;
      findTenantBySlackWorkspace.mockRejectedValue(new Error("DB error"));

      await expect(handleBotJoinedChannel(mockClient, "C123456", "T123456")).resolves.not.toThrow();
    });

    it("should log error when handler fails", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace, logger } = jest.requireMock("@kenchi/shared") as any;
      findTenantBySlackWorkspace.mockRejectedValue(new Error("DB error"));

      await handleBotJoinedChannel(mockClient, "C123456", "T123456");

      expect(logger.error).toHaveBeenCalledWith(
        "Failed to handle member_joined_channel event",
        expect.any(Object)
      );
    });

    it("should use workspaceId parameter instead of client.auth.test", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace } = jest.requireMock("@kenchi/shared") as any;
      findTenantBySlackWorkspace.mockResolvedValue(null);

      await handleBotJoinedChannel(mockClient, "C123456", "T123456");

      // Should use the passed workspaceId, not call client.auth.test()
      expect(findTenantBySlackWorkspace).toHaveBeenCalledWith("T123456");
      expect(mockClient.auth.test).not.toHaveBeenCalled();
    });
  });

  describe("GitHub connection check", () => {
    it("should prompt to connect GitHub when tenant exists but no GitHub connection", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace, findGitHubAppConnection } =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        jest.requireMock("@kenchi/shared") as any;

      findTenantBySlackWorkspace.mockResolvedValue({
        id: "tenant-123",
      });
      findGitHubAppConnection.mockResolvedValue(null);

      await handleBotJoinedChannel(mockClient, "C123456", "T123456");

      // Should show "connect GitHub" since no GitHub connection
      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("connect GitHub"),
        })
      );
    });

    it("should prompt to connect GitHub when GitHub connection has no externalOrgId", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace, findGitHubAppConnection } =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        jest.requireMock("@kenchi/shared") as any;

      findTenantBySlackWorkspace.mockResolvedValue({
        id: "tenant-123",
      });
      findGitHubAppConnection.mockResolvedValue({
        id: "prc_gh123",
        externalOrgId: null,
      });

      await handleBotJoinedChannel(mockClient, "C123456", "T123456");

      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("connect GitHub"),
        })
      );
    });
  });
});

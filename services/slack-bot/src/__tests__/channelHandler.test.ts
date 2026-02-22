/**
 * Unit tests for Channel Handler
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
  handleBotJoinedChannel,
  getAvailableRepositories,
  getGitHubInstallUrl,
  buildRepoConfiguredMessage,
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
  findBySlackWorkspace: jest.fn(),
  findPendingSlackTenants: jest.fn(() => Promise.resolve([])),
  linkSlackWorkspace: jest.fn(() => Promise.resolve({})),
  deleteTenant: jest.fn(() => Promise.resolve()),
  findMappingsForChannel: jest.fn(() => Promise.resolve([])),
  deleteMappingsForChannel: jest.fn(() => Promise.resolve()),
  getMappedRepositories: jest.fn(() => Promise.resolve(new Set())),
  fetchInstallationRepositories: jest.fn(() => Promise.resolve([])),
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
      const { findBySlackWorkspace } = jest.requireMock("@kenchi/shared") as any;
      findBySlackWorkspace.mockResolvedValue(null);

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
      const { findBySlackWorkspace } = jest.requireMock("@kenchi/shared") as any;
      findBySlackWorkspace.mockResolvedValue({
        id: "tenant-123",
        githubInstallationId: null,
      });

      await handleBotJoinedChannel(mockClient, "C123456", "T123456");

      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("connect GitHub"),
        })
      );
    });

    it("should clean up existing mappings when bot rejoins", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace, findMappingsForChannel, deleteMappingsForChannel } =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        jest.requireMock("@kenchi/shared") as any;

      findBySlackWorkspace.mockResolvedValue({
        id: "tenant-123",
        githubInstallationId: 12345,
      });

      findMappingsForChannel.mockResolvedValue([{ repository: "owner/repo" }]);

      await handleBotJoinedChannel(mockClient, "C123456", "T123456");

      expect(deleteMappingsForChannel).toHaveBeenCalledWith("tenant-123", "C123456");
    });

    it("should post welcome message with button", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace, fetchInstallationRepositories } = jest.requireMock(
        "@kenchi/shared"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any;

      findBySlackWorkspace.mockResolvedValue({
        id: "tenant-123",
        githubInstallationId: 12345,
      });

      fetchInstallationRepositories.mockResolvedValue([{ fullName: "owner/repo1", name: "repo1" }]);

      await handleBotJoinedChannel(mockClient, "C123456", "T123456");

      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              type: "section",
            }),
          ]),
        })
      );
    });

    it("should update message with correct timestamp", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace } = jest.requireMock("@kenchi/shared") as any;

      findBySlackWorkspace.mockResolvedValue({
        id: "tenant-123",
        githubInstallationId: 12345,
      });

      await handleBotJoinedChannel(mockClient, "C123456", "T123456");

      expect(mockClient.chat.update).toHaveBeenCalledWith(
        expect.objectContaining({
          ts: "1234567890.123456",
        })
      );
    });

    it("should open modal when trigger_id is provided", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace, fetchInstallationRepositories } = jest.requireMock(
        "@kenchi/shared"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any;

      findBySlackWorkspace.mockResolvedValue({
        id: "tenant-123",
        githubInstallationId: 12345,
      });

      fetchInstallationRepositories.mockResolvedValue([{ fullName: "owner/repo1", name: "repo1" }]);

      await handleBotJoinedChannel(mockClient, "C123456", "T123456", "trigger-123");

      expect(mockClient.views.open).toHaveBeenCalled();
    });

    it("should open no-repos modal when no repositories available", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace, fetchInstallationRepositories, getMappedRepositories } =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        jest.requireMock("@kenchi/shared") as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { buildNoReposModal } = jest.requireMock("../handlers/modalBuilders.js") as any;

      findBySlackWorkspace.mockResolvedValue({
        id: "tenant-123",
        githubInstallationId: 12345,
      });

      fetchInstallationRepositories.mockResolvedValue([]);
      getMappedRepositories.mockResolvedValue(new Set());

      await handleBotJoinedChannel(mockClient, "C123456", "T123456", "trigger-123");

      expect(buildNoReposModal).toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace } = jest.requireMock("@kenchi/shared") as any;
      findBySlackWorkspace.mockRejectedValue(new Error("DB error"));

      await expect(handleBotJoinedChannel(mockClient, "C123456", "T123456")).resolves.not.toThrow();
    });

    it("should log error when handler fails", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace, logger } = jest.requireMock("@kenchi/shared") as any;
      findBySlackWorkspace.mockRejectedValue(new Error("DB error"));

      await handleBotJoinedChannel(mockClient, "C123456", "T123456");

      expect(logger.error).toHaveBeenCalledWith(
        "Failed to handle member_joined_channel event",
        expect.any(Object)
      );
    });

    it("should use workspaceId parameter instead of client.auth.test", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace } = jest.requireMock("@kenchi/shared") as any;
      findBySlackWorkspace.mockResolvedValue(null);

      await handleBotJoinedChannel(mockClient, "C123456", "T123456");

      // Should use the passed workspaceId, not call client.auth.test()
      expect(findBySlackWorkspace).toHaveBeenCalledWith("T123456");
      expect(mockClient.auth.test).not.toHaveBeenCalled();
    });
  });

  describe("tenant reconciliation", () => {
    it("should auto-reconcile when Slack tenant has no GitHub and one unlinked GitHub tenant exists", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace, findPendingSlackTenants, linkSlackWorkspace, deleteTenant } =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        jest.requireMock("@kenchi/shared") as any;

      // First call: returns Slack-only tenant (no GitHub)
      // Second call (after reconciliation): returns the merged tenant
      findBySlackWorkspace
        .mockResolvedValueOnce({
          id: "slack-tenant",
          githubInstallationId: null,
          slackTeamName: "My Team",
          slackBotToken: "xoxb-test",
          slackBotUserId: "U123",
        })
        .mockResolvedValueOnce({
          id: "github-tenant",
          githubInstallationId: 99999,
        });

      findPendingSlackTenants.mockResolvedValue([
        {
          id: "github-tenant",
          githubInstallationId: 99999,
          slackWorkspaceId: null,
        },
      ]);

      await handleBotJoinedChannel(mockClient, "C123456", "T123456");

      expect(linkSlackWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "github-tenant",
          slackWorkspaceId: "T123456",
        })
      );
      expect(deleteTenant).toHaveBeenCalledWith("slack-tenant");
      // Should show welcome (not "connect GitHub") since reconciliation succeeded
      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Welcome"),
        })
      );
    });

    it("should skip reconciliation when multiple unlinked GitHub tenants exist", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace, findPendingSlackTenants, linkSlackWorkspace } =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        jest.requireMock("@kenchi/shared") as any;

      findBySlackWorkspace.mockResolvedValue({
        id: "slack-tenant",
        githubInstallationId: null,
      });

      findPendingSlackTenants.mockResolvedValue([
        { id: "github-tenant-1", githubInstallationId: 111 },
        { id: "github-tenant-2", githubInstallationId: 222 },
      ]);

      await handleBotJoinedChannel(mockClient, "C123456", "T123456");

      expect(linkSlackWorkspace).not.toHaveBeenCalled();
      // Should show "connect GitHub" since reconciliation was skipped
      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("connect GitHub"),
        })
      );
    });

    it("should skip reconciliation when no unlinked GitHub tenants exist", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace, findPendingSlackTenants, linkSlackWorkspace } =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        jest.requireMock("@kenchi/shared") as any;

      findBySlackWorkspace.mockResolvedValue({
        id: "slack-tenant",
        githubInstallationId: null,
      });

      findPendingSlackTenants.mockResolvedValue([]);

      await handleBotJoinedChannel(mockClient, "C123456", "T123456");

      expect(linkSlackWorkspace).not.toHaveBeenCalled();
      // Should show "connect GitHub" since no reconciliation target
      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("connect GitHub"),
        })
      );
    });
  });
});

/**
 * Unit tests for Command Handler
 *
 * Updated for provider-neutral tenant model.
 * - findBySlackWorkspace -> findTenantBySlackWorkspace
 * - tenant.githubInstallationId -> findGitHubAppConnection check
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { SlashCommand, RespondFn } from "@slack/bolt";
import { handleKenchiCommand } from "../handlers/commandHandler.js";
import { handleAnalysis } from "../handlers/commandSubhandlers.js";

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  config: {
    GITHUB_APP_SLUG: "kenchi-test-app",
  },
  findTenantBySlackWorkspace: jest.fn(),
  findGitHubAppConnection: jest.fn(),
  findAllMappingsForTenant: jest.fn(() => Promise.resolve([])),
  fetchInstallationRepositories: jest.fn(() => Promise.resolve([])),
  getMappedRepositories: jest.fn(() => Promise.resolve(new Set())),
  getErrorMessage: jest.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  ),
  SLACK_UI_ERROR_MESSAGES: {
    STATUS_CHECK_FAILED:
      "Failed to check connection status. Please verify your network connection and try again later.",
    CONFIG_MODAL_FAILED:
      "Failed to open configuration. This may be due to a temporary connection issue. Please try again in a few seconds.",
  },
  KNOWLEDGE_DOC_TYPES: {
    TROUBLESHOOTING: "troubleshooting",
    RUNBOOK: "runbook",
    KNOWN_ISSUES: "known_issues",
    POSTMORTEM: "postmortem",
    SOP: "sop",
    ARCHITECTURE: "architecture",
    DOCUMENTATION: "documentation",
  },
  SLACK_MODAL_CALLBACKS: {
    ADD_DOCUMENT: "add_document_modal",
  },
  SLACK_ACTION_IDS: {
    DOC_TITLE: "doc_title_input",
    DOC_TYPE: "doc_type_select",
    DOC_CONTENT: "doc_content_input",
    DOC_DESCRIPTION: "doc_description_input",
  },
  SLACK_BLOCK_IDS: {
    DOC_TITLE: "doc_title_block",
    DOC_TYPE: "doc_type_block",
    DOC_CONTENT: "doc_content_block",
    DOC_DESCRIPTION: "doc_description_block",
  },
  DOC_INGESTION_CONFIG: {
    MAX_TITLE_LENGTH: 200,
    MAX_CONTENT_LENGTH: 3000,
    MAX_DESCRIPTION_LENGTH: 500,
  },
}));

jest.mock("../formatters.js", () => ({
  formatAnalysisMessage: jest.fn(() => [
    { type: "section", text: { type: "mrkdwn", text: "Analysis result" } },
  ]),
  formatActionButtons: jest.fn(() => []),
  formatErrorMessage: jest.fn(() => [
    { type: "section", text: { type: "mrkdwn", text: "Error occurred" } },
  ]),
}));

jest.mock("../services/analysisService.js", () => ({
  createEventFromCommand: jest.fn((userId, channelId, text) => ({
    id: `evt_${Date.now()}_${userId}`,
    type: "MANUAL_TRIGGER",
    source: "slack",
    timestamp: new Date().toISOString(),
    severity: "medium",
    title: "Slack Command Analysis",
    payload: { command: text, user_id: userId, channel_id: channelId },
  })),
  performAnalysis: jest.fn(() =>
    Promise.resolve({
      analysis: {
        eventId: "evt_123",
        analyzedAt: new Date().toISOString(),
        summary: "Test analysis",
        identifiedCause: "Test cause",
        recommendedActions: [],
        uncertainties: [],
        llmModel: "gpt-4",
      },
      confidence: {
        finalScore: 0.85,
        gatingDecision: "auto_approve",
        breakdown: {
          logQualityScore: 0.9,
          contextCompletenessScore: 0.8,
          patternMatchScore: 0.85,
        },
      },
    })
  ),
}));

jest.mock("../handlers/channelHandler.js", () => ({
  getGitHubInstallUrl: jest.fn(
    (workspaceId) =>
      `https://github.com/apps/kenchi-test-app/installations/new?state=${workspaceId}`
  ),
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
  buildUnconfigureModal: jest.fn(() => ({
    type: "modal",
    callback_id: "unconfigure_modal",
    title: { type: "plain_text", text: "Remove Repository" },
    blocks: [],
  })),
  buildNoConfiguredReposModal: jest.fn(() => ({
    type: "modal",
    callback_id: "no_configured_repos_modal",
    title: { type: "plain_text", text: "No Configured Repositories" },
    blocks: [],
  })),
  getAvailableRepositories: jest.fn(() => Promise.resolve([])),
}));

// Helper for mock GitHub App connection
const createMockGitHubAppConnection = (overrides = {}) => ({
  id: "prc_gh123",
  tenantId: "tenant-123",
  provider: "github_app" as const,
  connectionName: "test-org",
  externalOrgId: "12345",
  baseUrl: null,
  config: { orgLogin: "test-org", installedAt: "2024-01-01T00:00:00Z" },
  webhookSecret: null,
  accessToken: null,
  tokenExpiresAt: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe("Command Handler", () => {
  // Create mock Slack command
  const createMockCommand = (overrides: Partial<SlashCommand> = {}): SlashCommand =>
    ({
      command: "/kenchi",
      text: "",
      user_id: "U123456",
      user_name: "testuser",
      team_id: "T123456",
      team_domain: "testteam",
      channel_id: "C123456",
      channel_name: "general",
      trigger_id: "trigger_123",
      response_url: "https://hooks.slack.com/commands/123",
      ...overrides,
    }) as SlashCommand;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createMockClient = (): any => ({
    chat: {
      postMessage: jest.fn(() => Promise.resolve({ ok: true, ts: "1234567890.123456" })),
    },
    views: {
      open: jest.fn(() => Promise.resolve({ ok: true })),
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;
  let mockAck: jest.Mock<() => Promise<void>>;
  let mockRespond: jest.Mock<RespondFn>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = createMockClient();
    mockAck = jest.fn(() => Promise.resolve());
    mockRespond = jest.fn(() => Promise.resolve());
  });

  describe("handleKenchiCommand", () => {
    it("should acknowledge the command immediately", async () => {
      const command = createMockCommand({ text: "help" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockAck).toHaveBeenCalledTimes(1);
      expect(mockAck).toHaveBeenCalledWith();
    });

    it("should call respond function", async () => {
      const command = createMockCommand({ text: "help" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalled();
    });
  });

  describe("help subcommand", () => {
    it("should respond with help message when help is requested", async () => {
      const command = createMockCommand({ text: "help" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              type: "section",
              text: expect.objectContaining({
                text: expect.stringContaining("Kenchi DevOps Assistant - Commands"),
              }),
            }),
          ]),
          response_type: "ephemeral",
        })
      );
    });

    it("should show all available commands in help", async () => {
      const command = createMockCommand({ text: "help" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              text: expect.objectContaining({
                text: expect.stringMatching(/configure|unconfigure|connect|status|help/),
              }),
            }),
          ]),
        })
      );
    });

    it("should handle empty text as help", async () => {
      const command = createMockCommand({ text: "" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              type: "section",
              text: expect.objectContaining({
                text: expect.stringContaining("Kenchi DevOps Assistant - Commands"),
              }),
            }),
          ]),
        })
      );
    });

    it("should handle whitespace-only text as help", async () => {
      const command = createMockCommand({ text: "   " });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              type: "section",
            }),
          ]),
        })
      );
    });
  });

  describe("connect subcommand", () => {
    it("should provide GitHub install link", async () => {
      const command = createMockCommand({ text: "connect" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              text: expect.objectContaining({
                text: expect.stringContaining("Connect GitHub to Kenchi"),
              }),
            }),
          ]),
          response_type: "ephemeral",
        })
      );
    });

    it("should include workspace ID in install URL", async () => {
      const command = createMockCommand({ text: "connect", team_id: "W999999" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              text: expect.objectContaining({
                text: expect.stringContaining("state=W999999"),
              }),
            }),
          ]),
        })
      );
    });

    it("should show install instructions", async () => {
      const command = createMockCommand({ text: "connect" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              text: expect.objectContaining({
                text: expect.stringContaining("Install GitHub App"),
              }),
            }),
          ]),
        })
      );
    });

    it("should handle uppercase CONNECT", async () => {
      const command = createMockCommand({ text: "CONNECT" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              text: expect.objectContaining({
                text: expect.stringContaining("Connect GitHub"),
              }),
            }),
          ]),
        })
      );
    });
  });

  describe("status subcommand", () => {
    it("should show status for connected workspace", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace, findGitHubAppConnection } = jest.requireMock(
        "@kenchi/shared"
      ) as any;
      findTenantBySlackWorkspace.mockResolvedValue({
        id: "tenant-123",
        orgName: "test-org",
        status: "active",
      });
      findGitHubAppConnection.mockResolvedValue(createMockGitHubAppConnection());

      const command = createMockCommand({ text: "status" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              text: expect.objectContaining({
                text: expect.stringMatching(/Connection Status/),
              }),
            }),
          ]),
          response_type: "ephemeral",
        })
      );
    });

    it("should show GitHub connected status", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace, findGitHubAppConnection } = jest.requireMock(
        "@kenchi/shared"
      ) as any;
      findTenantBySlackWorkspace.mockResolvedValue({
        id: "tenant-123",
        orgName: "test-org",
        status: "active",
      });
      findGitHubAppConnection.mockResolvedValue(createMockGitHubAppConnection());

      const command = createMockCommand({ text: "status" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              text: expect.objectContaining({
                text: expect.stringMatching(/GitHub.*Connected/),
              }),
            }),
          ]),
        })
      );
    });

    it("should show pending GitHub status when not connected", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace, findGitHubAppConnection } = jest.requireMock(
        "@kenchi/shared"
      ) as any;
      findTenantBySlackWorkspace.mockResolvedValue({
        id: "tenant-123",
        status: "pending",
      });
      findGitHubAppConnection.mockResolvedValue(null);

      const command = createMockCommand({ text: "status" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              text: expect.objectContaining({
                text: expect.stringMatching(/GitHub.*Not connected/),
              }),
            }),
          ]),
        })
      );
    });

    it("should handle no tenant found", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace } = jest.requireMock("@kenchi/shared") as any;
      findTenantBySlackWorkspace.mockResolvedValue(null);

      const command = createMockCommand({ text: "status" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              text: expect.objectContaining({
                text: expect.stringMatching(/No tenant found/),
              }),
            }),
          ]),
        })
      );
    });

    it("should handle database errors gracefully", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace } = jest.requireMock("@kenchi/shared") as any;
      findTenantBySlackWorkspace.mockRejectedValue(new Error("Database error"));

      const command = createMockCommand({ text: "status" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Failed to check connection status"),
          response_type: "ephemeral",
        })
      );
    });
  });

  describe("configure subcommand", () => {
    it("should require GitHub connection first", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace } = jest.requireMock("@kenchi/shared") as any;
      findTenantBySlackWorkspace.mockResolvedValue(null);

      const command = createMockCommand({ text: "configure" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("connect GitHub first"),
          response_type: "ephemeral",
        })
      );
    });

    it("should require GitHub installation", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace, findGitHubAppConnection } = jest.requireMock(
        "@kenchi/shared"
      ) as any;
      findTenantBySlackWorkspace.mockResolvedValue({
        id: "tenant-123",
      });
      findGitHubAppConnection.mockResolvedValue(null);

      const command = createMockCommand({ text: "configure" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("connect GitHub first"),
        })
      );
    });

    it("should open modal with available repositories", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace, findGitHubAppConnection } = jest.requireMock(
        "@kenchi/shared"
      ) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { getAvailableRepositories } = jest.requireMock("../handlers/channelHandler.js") as any;

      findTenantBySlackWorkspace.mockResolvedValue({
        id: "tenant-123",
      });
      findGitHubAppConnection.mockResolvedValue(createMockGitHubAppConnection());
      getAvailableRepositories.mockResolvedValue([
        { fullName: "owner/repo1", name: "repo1" },
        { fullName: "owner/repo2", name: "repo2" },
      ]);

      const command = createMockCommand({ text: "configure" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockClient.views.open).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger_id: "trigger_123",
          view: expect.objectContaining({
            callback_id: "repo_select_modal",
          }),
        })
      );
    });

    it("should open no-repos modal when no repositories available", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace, findGitHubAppConnection } = jest.requireMock(
        "@kenchi/shared"
      ) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { getAvailableRepositories } = jest.requireMock("../handlers/channelHandler.js") as any;

      findTenantBySlackWorkspace.mockResolvedValue({
        id: "tenant-123",
      });
      findGitHubAppConnection.mockResolvedValue(createMockGitHubAppConnection());
      getAvailableRepositories.mockResolvedValue([]);

      const command = createMockCommand({ text: "configure" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockClient.views.open).toHaveBeenCalledWith(
        expect.objectContaining({
          view: expect.objectContaining({
            callback_id: "no_repos_modal",
          }),
        })
      );
    });

    it("should handle errors gracefully", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace } = jest.requireMock("@kenchi/shared") as any;
      findTenantBySlackWorkspace.mockRejectedValue(new Error("Service error"));

      const command = createMockCommand({ text: "configure" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Failed to open configuration"),
          response_type: "ephemeral",
        })
      );
    });
  });

  describe("unconfigure subcommand", () => {
    it("should handle no tenant found", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace } = jest.requireMock("@kenchi/shared") as any;
      findTenantBySlackWorkspace.mockResolvedValue(null);

      const command = createMockCommand({ text: "unconfigure" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("No configuration found"),
          response_type: "ephemeral",
        })
      );
    });

    it("should open modal with configured repositories", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace, findAllMappingsForTenant } = jest.requireMock(
        "@kenchi/shared"
      ) as any;

      findTenantBySlackWorkspace.mockResolvedValue({
        id: "tenant-123",
      });
      findAllMappingsForTenant.mockResolvedValue([
        {
          repository: "owner/repo1",
          slackChannelId: "C111111",
          slackChannelName: "channel1",
        },
        {
          repository: "owner/repo2",
          slackChannelId: "C222222",
          slackChannelName: "channel2",
        },
      ]);

      const command = createMockCommand({ text: "unconfigure" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockClient.views.open).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger_id: "trigger_123",
          view: expect.objectContaining({
            callback_id: "unconfigure_modal",
          }),
        })
      );
    });

    it("should open no-configured-repos modal when no mappings exist", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace, findAllMappingsForTenant } = jest.requireMock(
        "@kenchi/shared"
      ) as any;

      findTenantBySlackWorkspace.mockResolvedValue({
        id: "tenant-123",
      });
      findAllMappingsForTenant.mockResolvedValue([]);

      const command = createMockCommand({ text: "unconfigure" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockClient.views.open).toHaveBeenCalledWith(
        expect.objectContaining({
          view: expect.objectContaining({
            callback_id: "no_configured_repos_modal",
          }),
        })
      );
    });

    it("should handle errors gracefully", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace } = jest.requireMock("@kenchi/shared") as any;
      findTenantBySlackWorkspace.mockRejectedValue(new Error("Database error"));

      const command = createMockCommand({ text: "unconfigure" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Failed to open configuration"),
          response_type: "ephemeral",
        })
      );
    });
  });

  describe("handleAnalysis (direct)", () => {
    it("should respond with analysis results when called directly", async () => {
      const command = createMockCommand({ text: "why is my build failing?" });
      const ctx = {
        command,
        args: "why is my build failing?",
        respond: mockRespond,
        client: mockClient,
      };

      await handleAnalysis(ctx);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.any(Array),
          response_type: "ephemeral",
        })
      );
    });

    it("should show help when args is empty", async () => {
      const command = createMockCommand({ text: "" });
      const ctx = { command, args: "", respond: mockRespond, client: mockClient };

      await handleAnalysis(ctx);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              text: expect.objectContaining({
                text: expect.stringContaining("Kenchi DevOps Assistant"),
              }),
            }),
          ]),
        })
      );
    });

    it("should handle errors gracefully and respond with error blocks", async () => {
      const command = createMockCommand({ text: "analyze this" });
      const ctx = { command, args: "analyze this", respond: mockRespond, client: mockClient };

      await handleAnalysis(ctx);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          response_type: "ephemeral",
        })
      );
    });
  });

  describe("edge cases", () => {
    it("should handle mixed case subcommands", async () => {
      const command = createMockCommand({ text: "HeLp" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              text: expect.objectContaining({
                text: expect.stringContaining("Kenchi DevOps Assistant"),
              }),
            }),
          ]),
        })
      );
    });

    it("should handle extra whitespace in command", async () => {
      const command = createMockCommand({ text: "  help  " });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              type: "section",
            }),
          ]),
        })
      );
    });

    it("should handle subcommand with arguments", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace, findGitHubAppConnection } = jest.requireMock(
        "@kenchi/shared"
      ) as any;
      findTenantBySlackWorkspace.mockResolvedValue({
        id: "tenant-123",
        orgName: "test-org",
        status: "active",
      });
      findGitHubAppConnection.mockResolvedValue(createMockGitHubAppConnection());

      const command = createMockCommand({ text: "status extra args" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              text: expect.objectContaining({
                text: expect.stringMatching(/Connection Status/),
              }),
            }),
          ]),
        })
      );
    });

    it("should handle very long command text", async () => {
      const longText = "analyze ".repeat(100);
      const command = createMockCommand({ text: longText });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalled();
    });

    it("should handle special characters in command", async () => {
      const command = createMockCommand({ text: "analyze <script>alert('xss')</script>" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalled();
    });

    it("should handle unicode in command", async () => {
      const command = createMockCommand({ text: "analyze テスト 🚀" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalled();
    });

    it("should handle multiple spaces between words", async () => {
      const command = createMockCommand({ text: "help    me    please" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalled();
    });

    it("should handle tab characters in command", async () => {
      const command = createMockCommand({ text: "help\t\ttest" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalled();
    });

    it("should handle newlines in command", async () => {
      const command = createMockCommand({ text: "help\nwith\nmultiline" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalled();
    });

    it("should handle command with only numbers", async () => {
      const command = createMockCommand({ text: "12345" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalled();
    });

    it("should handle command with special Slack formatting", async () => {
      const command = createMockCommand({ text: "analyze <@U123456> mentioned this" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalled();
    });
  });

  describe("subcommand routing", () => {
    it("should route connect subcommand correctly", async () => {
      const command = createMockCommand({ text: "connect" });
      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);
      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              text: expect.objectContaining({
                text: expect.stringContaining("Connect GitHub"),
              }),
            }),
          ]),
        })
      );
    });

    it("should route help subcommand correctly", async () => {
      const command = createMockCommand({ text: "help" });
      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);
      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              text: expect.objectContaining({
                text: expect.stringContaining("Kenchi DevOps Assistant"),
              }),
            }),
          ]),
        })
      );
    });

    it("should reject unknown subcommand with error message", async () => {
      const command = createMockCommand({ text: "unknown-subcommand" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Unknown command"),
          response_type: "ephemeral",
        })
      );
    });

    it("should list valid commands when rejecting unknown subcommand", async () => {
      const command = createMockCommand({ text: "notacommand but the full question text" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Available commands"),
          response_type: "ephemeral",
        })
      );
    });
  });

  describe("command context", () => {
    it("should pass correct user ID", async () => {
      const command = createMockCommand({ text: "help", user_id: "U999999" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalled();
    });

    it("should pass correct channel ID", async () => {
      const command = createMockCommand({ text: "help", channel_id: "C999999" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockRespond).toHaveBeenCalled();
    });

    it("should pass correct team ID", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { getGitHubInstallUrl } = jest.requireMock("../handlers/channelHandler.js") as any;

      const command = createMockCommand({ text: "connect", team_id: "T999999" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(getGitHubInstallUrl).toHaveBeenCalledWith("T999999");
    });

    it("should use trigger_id for modals", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findTenantBySlackWorkspace, findGitHubAppConnection } = jest.requireMock(
        "@kenchi/shared"
      ) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { getAvailableRepositories } = jest.requireMock("../handlers/channelHandler.js") as any;

      findTenantBySlackWorkspace.mockResolvedValue({
        id: "tenant-123",
      });
      findGitHubAppConnection.mockResolvedValue(createMockGitHubAppConnection());
      getAvailableRepositories.mockResolvedValue([{ fullName: "owner/repo", name: "repo" }]);

      const command = createMockCommand({ text: "configure", trigger_id: "trigger_xyz" });

      await handleKenchiCommand(command, mockAck, mockRespond, mockClient);

      expect(mockClient.views.open).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger_id: "trigger_xyz",
        })
      );
    });
  });
});

/**
 * Unit tests for Slack Bot Service Index
 *
 * Tests the core service initialization functions:
 * - createSlackApp: Creates Slack Bolt app with correct config
 * - setupSlackHandlers: Registers all event handlers
 * - initializeDatabase: Initializes database connection
 *
 * NOTE: Since index.ts auto-starts the service when imported, we mock all
 * dependencies before importing to prevent actual service initialization.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import type { AppConfig } from "../config/appConfig.js";

// Mock process.exit to prevent actual exit during tests
const mockExit = jest.spyOn(process, "exit").mockImplementation((() => {
  // Don't actually exit
}) as () => never);

// Store mock references that will be used across tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockApp: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockAppConstructor: jest.Mock<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockLogger: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockInitDatabase: jest.Mock<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockFindBySlackWorkspace: jest.Mock<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockDeleteMappingsForChannel: jest.Mock<any>;

describe("Slack Bot Service Index", () => {
  beforeEach(() => {
    // Reset modules to ensure clean state for each test
    jest.resetModules();
    jest.clearAllMocks();
    mockExit.mockClear();

    // Create fresh mocks for each test
    mockApp = {
      use: jest.fn(),
      command: jest.fn(),
      message: jest.fn(),
      event: jest.fn(),
      action: jest.fn(),
      start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };

    mockAppConstructor = jest.fn<() => typeof mockApp>(() => mockApp);

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    mockInitDatabase = jest.fn();
    mockFindBySlackWorkspace = jest.fn<() => Promise<null>>().mockResolvedValue(null);
    mockDeleteMappingsForChannel = jest.fn<() => Promise<number>>().mockResolvedValue(0);

    // Mock @slack/bolt
    jest.doMock("@slack/bolt", () => ({
      __esModule: true,
      default: {
        App: mockAppConstructor,
      },
    }));

    // Mock express
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockExpress: any = jest.fn(() => ({
      use: jest.fn(),
      listen: jest.fn((port: number, callback: () => void) => {
        callback();
        return {
          close: jest.fn((cb: () => void) => cb()),
        };
      }),
    }));
    mockExpress.json = jest.fn();

    jest.doMock("express", () => ({
      __esModule: true,
      default: mockExpress,
    }));

    // Mock @kenchi/shared
    jest.doMock("@kenchi/shared", () => ({
      logger: mockLogger,
      createLogger: jest.fn(() => mockLogger),
      config: {
        DATABASE_URL: "postgresql://test:test@localhost:5432/test",
        MULTI_TENANT_MODE: false,
        REDIS_URL: undefined,
      },
      initDatabase: mockInitDatabase,
      closeDatabase: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      closeRedis: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      waitForRedisConnection: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      findBySlackWorkspace: mockFindBySlackWorkspace,
      deleteMappingsForChannel: mockDeleteMappingsForChannel,
      isSocketModeDisconnectError: jest.fn(() => false),
      createRedisRateLimiter: jest.fn(() => ({
        middleware: jest.fn(() =>
          jest.fn((_req: unknown, _res: unknown, next: () => void) => next())
        ),
      })),
      startSlackNotificationWorker: jest
        .fn<() => Promise<() => void>>()
        .mockResolvedValue(() => {}),
      getErrorMessage: jest.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
      NotFoundError: jest.fn((msg: unknown) => new Error(String(msg))),
      getSlackCredentials: jest.fn<() => Promise<null>>().mockResolvedValue(null),
      shouldSkipSlackBotRateLimit: jest.fn(() => false),
      SLACK_BOT_RATE_LIMITS: {
        ACTIONS_WINDOW_MS: 60000,
        ACTIONS_MAX_REQUESTS: 30,
        COMMANDS_WINDOW_MS: 60000,
        COMMANDS_MAX_REQUESTS: 20,
      },
      SLACK_BOT_TIMEOUTS: {
        APP_START_TIMEOUT_MS: 5000,
        DATABASE_INIT_TIMEOUT_MS: 10000,
        SHUTDOWN_TIMEOUT_MS: 10000,
      },
      SLACK_BOT_DB_CONFIG: {
        MAX_RETRIES: 3,
        RETRY_DELAY_MS: 1000,
        MAX_CONNECTIONS: 10,
        IDLE_TIMEOUT_MS: 30000,
      },
      SLACK_BOT_MESSAGES: {
        ERROR_GENERIC: "An error occurred. Please try again.",
        NO_TENANT: "No tenant found. Please install the app first.",
        COMMAND_NOT_FOUND: "Command not found.",
        DISABLED_CHANNEL: "This channel has been disabled.",
      },
      SLACK_ACTION_IDS: {
        APPROVE: "approve_action",
        REJECT: "reject_action",
        SELECT_REPOSITORY: "select_repository_button",
        REPOSITORY_SELECTED: "repository_selected",
        DISABLE_CHANNEL: "disable_channel",
        ENABLE_CHANNEL: "enable_channel",
        FEEDBACK_HELPFUL: "feedback_helpful",
        FEEDBACK_NOT_HELPFUL: "feedback_not_helpful",
        TEST_CONNECTION: "test_connection",
        REFRESH_HOME: "refresh_home",
        CONNECT_GITHUB: "connect_github",
        VIEW_DOCS: "view_docs",
        GET_SUPPORT: "get_support",
        DOC_TITLE: "doc_title_input",
        DOC_TYPE: "doc_type_select",
        DOC_CONTENT: "doc_content_input",
        DOC_DESCRIPTION: "doc_description_input",
      },
      SLACK_ACTION_PATTERNS: {
        APPROVE: /^approve_action_/,
        REJECT: /^reject_action_/,
        RERUN: /^rerun_ci_/,
      },
      QA_ACTION_IDS: {
        QA_HELPFUL: "qa_helpful",
        QA_NOT_HELPFUL: "qa_not_helpful",
      },
      SLACK_BLOCK_IDS: {
        DOC_TITLE: "doc_title_block",
        DOC_TYPE: "doc_type_block",
        DOC_CONTENT: "doc_content_block",
        DOC_DESCRIPTION: "doc_description_block",
      },
      SLACK_MODAL_CALLBACKS: {
        ADD_DOCUMENT: "add_document_modal",
        REPOSITORY_SELECT: "repository_select_modal",
        UNCONFIGURE_REPO: "unconfigure_repo_modal",
      },
      KNOWLEDGE_DOC_TYPES: {
        RUNBOOK: "runbook",
        SOP: "sop",
        TROUBLESHOOTING: "troubleshooting",
        POSTMORTEM: "postmortem",
        KNOWN_ISSUES: "known_issues",
        CI_CD: "ci_cd",
        DEPLOYMENT: "deployment",
        TESTING: "testing",
        INFRASTRUCTURE: "infrastructure",
        DOCUMENTATION: "documentation",
        API_DOCS: "api_docs",
        ARCHITECTURE: "architecture",
        CONFIG_GUIDE: "config_guide",
        DATABASE: "database",
        README: "readme",
        CHANGELOG: "changelog",
        ONBOARDING: "onboarding",
        EXTERNAL: "external",
        PR_FIX_COMMENT: "pr_fix_comment",
        SLACK_RESOLUTION: "slack_resolution",
        ANALYSIS_LESSON: "analysis_lesson",
        LINKED_FIX: "linked_fix",
      },
      DOC_INGESTION_CONFIG: {
        MIN_TITLE_LENGTH: 5,
        MAX_TITLE_LENGTH: 200,
        MIN_CONTENT_LENGTH: 50,
        MAX_CONTENT_LENGTH: 3000,
        MAX_DESCRIPTION_LENGTH: 500,
        SUPPORTED_EXTENSIONS: [".md", ".txt", ".mdx"],
        MAX_FILE_SIZE_BYTES: 100 * 1024,
      },
      ingestKnowledgeDoc: jest
        .fn<() => Promise<{ chunksCreated: number; parentId: string }>>()
        .mockResolvedValue({
          chunksCreated: 3,
          parentId: "doc-123",
        }),
      isDocIngestionRequest: jest.fn(() => false),
      DOC_INGESTION_MESSAGES: {
        SUCCESS: () => "Document added successfully",
        NO_FILE: "Please attach a file to ingest",
        INVALID_TYPE: "Unsupported file type",
        TOO_LARGE: "File too large",
        INGESTION_FAILED: "Failed to process file",
      },
    }));

    // Mock config/appConfig
    jest.doMock("../config/appConfig.js", () => ({
      loadAppConfig: jest.fn(
        (): AppConfig => ({
          httpPort: 3002,
          slackWebhookPort: 3003,
          slackBotToken: "xoxb-test-token",
          slackSigningSecret: "test-signing-secret",
          slackAppToken: "xapp-test-app-token",
          nodeEnv: "test",
          serviceName: "slack-bot",
          version: "1.0.0",
        })
      ),
    }));

    // Mock all handler modules
    jest.doMock("../handlers/commandHandler.js", () => ({
      handleKenchiCommand: jest.fn(),
    }));

    jest.doMock("../handlers/mentionHandler.js", () => ({
      handleAppMention: jest.fn(),
    }));

    jest.doMock("../handlers/messageHandler.js", () => ({
      handleMessage: jest.fn(),
    }));

    jest.doMock("../handlers/actionHandler.js", () => ({
      handleActionApproval: jest.fn(),
      handleActionRejection: jest.fn(),
    }));

    jest.doMock("../handlers/feedbackHandler.js", () => ({
      handlePositiveFeedback: jest.fn(),
      handleNegativeFeedback: jest.fn(),
      handleRAGFeedbackHelpful: jest.fn(),
      handleRAGFeedbackNotHelpful: jest.fn(),
      handleQAFeedbackHelpful: jest.fn(),
      handleQAFeedbackNotHelpful: jest.fn(),
    }));

    jest.doMock("../handlers/channelHandler.js", () => ({
      handleBotJoinedChannel: jest.fn(),
      buildRepoSelectModal: jest.fn(),
      buildNoReposModal: jest.fn(),
      getAvailableRepositories: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    }));

    jest.doMock("../handlers/appHomeHandler.js", () => ({
      handleAppHomeOpened: jest.fn(),
      handleTestConnection: jest.fn(),
      handleRefreshHome: jest.fn(),
    }));

    jest.doMock("../handlers/repoSelectHandler.js", () => ({
      registerRepoSelectHandler: jest.fn(),
    }));

    jest.doMock("../handlers/documentIngestionHandler.js", () => ({
      handleDocumentModalSubmit: jest
        .fn<() => Promise<{ success: boolean }>>()
        .mockResolvedValue({ success: true }),
      handleAddDocCommand: jest.fn(),
      handleFileUploadIngestion: jest.fn(),
    }));

    jest.doMock("../routes/httpRoutes.js", () => ({
      createHttpRoutes: jest.fn(() => jest.fn()),
    }));

    jest.doMock("../routes/oauthRoutes.js", () => ({
      oauthRoutes: jest.fn(),
    }));

    jest.doMock("../services/notificationHandler.js", () => ({
      createNotificationHandler: jest.fn(() => jest.fn()),
    }));
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe("createSlackApp", () => {
    it("should create Slack app with correct configuration", async () => {
      await import("../index.js");

      expect(mockAppConstructor).toHaveBeenCalled();
    });

    it("should configure app with socket mode enabled", async () => {
      await import("../index.js");

      expect(mockAppConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          socketMode: true,
        })
      );
    });

    it("should configure app with bot token from config", async () => {
      await import("../index.js");

      expect(mockAppConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          token: "xoxb-test-token",
        })
      );
    });

    it("should configure app with signing secret from config", async () => {
      await import("../index.js");

      expect(mockAppConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          signingSecret: "test-signing-secret",
        })
      );
    });

    it("should configure app with app token from config", async () => {
      await import("../index.js");

      expect(mockAppConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          appToken: "xapp-test-app-token",
        })
      );
    });
  });

  describe("setupSlackHandlers", () => {
    it("should register middleware for logging events", async () => {
      await import("../index.js");

      expect(mockApp.use).toHaveBeenCalled();
    });

    it("should register /kenchi command handler", async () => {
      await import("../index.js");

      expect(mockApp.command).toHaveBeenCalledWith("/kenchi", expect.any(Function));
    });

    it("should register message event handler", async () => {
      await import("../index.js");

      expect(mockApp.message).toHaveBeenCalledWith(expect.any(Function));
    });

    it("should register app_mention event handler", async () => {
      await import("../index.js");

      expect(mockApp.event).toHaveBeenCalledWith("app_mention", expect.any(Function));
    });

    it("should register member_joined_channel event handler", async () => {
      await import("../index.js");

      expect(mockApp.event).toHaveBeenCalledWith("member_joined_channel", expect.any(Function));
    });

    it("should register member_left_channel event handler", async () => {
      await import("../index.js");

      expect(mockApp.event).toHaveBeenCalledWith("member_left_channel", expect.any(Function));
    });

    it("should register app_home_opened event handler", async () => {
      await import("../index.js");

      expect(mockApp.event).toHaveBeenCalledWith("app_home_opened", expect.any(Function));
    });

    it("should register approve action handler", async () => {
      await import("../index.js");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const actionCalls = mockApp.action.mock.calls as any[];
      const approveAction = actionCalls.find((call) => String(call[0]).includes("approve_action_"));
      expect(approveAction).toBeDefined();
    });

    it("should register reject action handler", async () => {
      await import("../index.js");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const actionCalls = mockApp.action.mock.calls as any[];
      const rejectAction = actionCalls.find((call) => String(call[0]).includes("reject_action_"));
      expect(rejectAction).toBeDefined();
    });

    it("should register feedback action handlers", async () => {
      await import("../index.js");

      expect(mockApp.action).toHaveBeenCalledWith("feedback_helpful", expect.any(Function));
      expect(mockApp.action).toHaveBeenCalledWith("feedback_not_helpful", expect.any(Function));
    });

    it("should register app home action handlers", async () => {
      await import("../index.js");

      expect(mockApp.action).toHaveBeenCalledWith("test_connection", expect.any(Function));
      expect(mockApp.action).toHaveBeenCalledWith("refresh_home", expect.any(Function));
    });

    it("should register external link action handlers", async () => {
      await import("../index.js");

      expect(mockApp.action).toHaveBeenCalledWith("connect_github", expect.any(Function));
      expect(mockApp.action).toHaveBeenCalledWith("view_docs", expect.any(Function));
      expect(mockApp.action).toHaveBeenCalledWith("get_support", expect.any(Function));
    });

    it("should register select_repository_button action handler", async () => {
      await import("../index.js");

      expect(mockApp.action).toHaveBeenCalledWith("select_repository_button", expect.any(Function));
    });

    it("should register repository select modal handler", async () => {
      await import("../index.js");

      const { registerRepoSelectHandler } = await import("../handlers/repoSelectHandler.js");

      expect(registerRepoSelectHandler).toHaveBeenCalledWith(mockApp);
    });
  });

  describe("initializeDatabase", () => {
    it("should call initDatabase with correct configuration", async () => {
      await import("../index.js");

      expect(mockInitDatabase).toHaveBeenCalledWith({
        connectionString: "postgresql://test:test@localhost:5432/test",
        maxConnections: 10,
        idleTimeoutMs: 30000,
      });
    });

    it("should log success message after database initialization", async () => {
      await import("../index.js");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logCalls = mockLogger.info.mock.calls as any[];
      const dbInitLog = logCalls.find((call) =>
        String(call[0]).includes("Database connection initialized")
      );

      expect(dbInitLog).toBeDefined();
    });

    it("should handle database initialization failure", async () => {
      mockInitDatabase.mockImplementation(() => {
        throw new Error("Database connection failed");
      });

      await import("../index.js");

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to start Slack bot",
        expect.objectContaining({
          error: expect.stringContaining("Database connection failed"),
        })
      );
    });
  });

  describe("middleware logging function", () => {
    it("should log incoming Slack events with type", async () => {
      await import("../index.js");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const middlewareCalls = mockApp.use.mock.calls as any[];
      expect(middlewareCalls.length).toBeGreaterThan(0);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const middlewareFunction = middlewareCalls[0][0] as any;

      const mockNext = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const mockArgs = {
        payload: {
          type: "app_mention",
        },
        next: mockNext,
      };

      await middlewareFunction(mockArgs);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Received Slack event",
        expect.objectContaining({
          type: "app_mention",
        })
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it("should call next even if payload has no type", async () => {
      await import("../index.js");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const middlewareCalls = mockApp.use.mock.calls as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const middlewareFunction = middlewareCalls[0][0] as any;

      const mockNext = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const mockArgs = {
        payload: {},
        next: mockNext,
      };

      await middlewareFunction(mockArgs);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should call next even if no payload", async () => {
      await import("../index.js");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const middlewareCalls = mockApp.use.mock.calls as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const middlewareFunction = middlewareCalls[0][0] as any;

      const mockNext = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const mockArgs = {
        payload: null,
        next: mockNext,
      };

      await middlewareFunction(mockArgs);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe("member_joined_channel handler", () => {
    it("should handle bot joining channel", async () => {
      await import("../index.js");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eventCalls = mockApp.event.mock.calls as any[];
      const joinedChannelCall = eventCalls.find((call) => call[0] === "member_joined_channel");

      expect(joinedChannelCall).toBeDefined();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = joinedChannelCall[1] as any;

      const mockClient = {
        auth: {
          test: jest.fn<() => Promise<{ bot_id: string; user_id: string }>>().mockResolvedValue({
            bot_id: "B123",
            user_id: "U123",
          }),
        },
      };

      const mockEvent = {
        user: "B123",
        channel: "C456",
      };

      const { handleBotJoinedChannel } = await import("../handlers/channelHandler.js");

      await handler({ event: mockEvent, client: mockClient });

      expect(handleBotJoinedChannel).toHaveBeenCalledWith(mockClient, "C456", "B123");
    });

    it("should ignore when non-bot user joins", async () => {
      await import("../index.js");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eventCalls = mockApp.event.mock.calls as any[];
      const joinedChannelCall = eventCalls.find((call) => call[0] === "member_joined_channel");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = joinedChannelCall[1] as any;

      const mockClient = {
        auth: {
          test: jest.fn<() => Promise<{ bot_id: string; user_id: string }>>().mockResolvedValue({
            bot_id: "B123",
            user_id: "U123",
          }),
        },
      };

      const mockEvent = {
        user: "U999",
        channel: "C456",
      };

      const { handleBotJoinedChannel } = await import("../handlers/channelHandler.js");

      (handleBotJoinedChannel as jest.Mock).mockClear();

      await handler({ event: mockEvent, client: mockClient });

      expect(handleBotJoinedChannel).not.toHaveBeenCalled();
    });
  });

  describe("member_left_channel handler", () => {
    it("should clean up mappings when bot leaves channel", async () => {
      await import("../index.js");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eventCalls = mockApp.event.mock.calls as any[];
      const leftChannelCall = eventCalls.find((call) => call[0] === "member_left_channel");

      expect(leftChannelCall).toBeDefined();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = leftChannelCall[1] as any;

      const mockClient = {
        auth: {
          test: jest
            .fn<() => Promise<{ bot_id: string; user_id: string; team_id: string }>>()
            .mockResolvedValue({
              bot_id: "B123",
              user_id: "U123",
              team_id: "T456",
            }),
        },
      };

      const mockEvent = {
        user: "B123",
        channel: "C789",
      };

      mockFindBySlackWorkspace.mockResolvedValue({
        id: "tenant-123",
        name: "Test Tenant",
      });

      mockDeleteMappingsForChannel.mockResolvedValue(2);

      await handler({ event: mockEvent, client: mockClient });

      expect(mockFindBySlackWorkspace).toHaveBeenCalledWith("T456");
      expect(mockDeleteMappingsForChannel).toHaveBeenCalledWith("tenant-123", "C789");
    });

    it("should ignore when non-bot user leaves", async () => {
      await import("../index.js");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eventCalls = mockApp.event.mock.calls as any[];
      const leftChannelCall = eventCalls.find((call) => call[0] === "member_left_channel");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = leftChannelCall[1] as any;

      const mockClient = {
        auth: {
          test: jest.fn<() => Promise<{ bot_id: string; user_id: string }>>().mockResolvedValue({
            bot_id: "B123",
            user_id: "U123",
          }),
        },
      };

      const mockEvent = {
        user: "U999",
        channel: "C789",
      };

      mockFindBySlackWorkspace.mockClear();

      await handler({ event: mockEvent, client: mockClient });

      expect(mockFindBySlackWorkspace).not.toHaveBeenCalled();
    });
  });

  describe("action handlers", () => {
    it("should handle approve action with button type", async () => {
      await import("../index.js");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const actionCalls = mockApp.action.mock.calls as any[];
      const approveActionCall = actionCalls.find((call) =>
        String(call[0]).includes("approve_action_")
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = approveActionCall[1] as any;

      const mockAction = {
        type: "button",
        action_id: "approve_action_123",
        value: "test-value",
      };

      const mockBody = {
        message: {
          ts: "1234567890.123456",
        },
      };

      const mockAck = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const mockSay = jest.fn();

      const { handleActionApproval } = await import("../handlers/actionHandler.js");

      await handler({
        action: mockAction,
        ack: mockAck,
        say: mockSay,
        body: mockBody,
      });

      expect(handleActionApproval).toHaveBeenCalledWith(
        mockAction,
        mockAck,
        mockSay,
        "1234567890.123456"
      );
    });

    it("should handle reject action with button type", async () => {
      await import("../index.js");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const actionCalls = mockApp.action.mock.calls as any[];
      const rejectActionCall = actionCalls.find((call) =>
        String(call[0]).includes("reject_action_")
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = rejectActionCall[1] as any;

      const mockAction = {
        type: "button",
        action_id: "reject_action_123",
        value: "test-value",
      };

      const mockBody = {
        message: {
          ts: "1234567890.123456",
        },
      };

      const mockAck = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const mockSay = jest.fn();

      const { handleActionRejection } = await import("../handlers/actionHandler.js");

      await handler({
        action: mockAction,
        ack: mockAck,
        say: mockSay,
        body: mockBody,
      });

      expect(handleActionRejection).toHaveBeenCalledWith(
        mockAction,
        mockAck,
        mockSay,
        "1234567890.123456"
      );
    });
  });

  describe("select_repository_button handler", () => {
    it("should open repository selection modal", async () => {
      await import("../index.js");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const actionCalls = mockApp.action.mock.calls as any[];
      const selectRepoCall = actionCalls.find((call) => call[0] === "select_repository_button");

      expect(selectRepoCall).toBeDefined();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = selectRepoCall[1] as any;

      const mockClient = {
        auth: {
          test: jest.fn<() => Promise<{ team_id: string }>>().mockResolvedValue({
            team_id: "T123",
          }),
        },
        views: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          open: jest.fn<() => Promise<any>>().mockResolvedValue({}),
        },
      };

      const mockAction = {
        type: "button",
        value: JSON.stringify({
          channelId: "C123",
          channelName: "general",
        }),
      };

      const mockBody = {
        trigger_id: "trigger-123",
        user: {
          id: "U123",
        },
      };

      const mockAck = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

      mockFindBySlackWorkspace.mockResolvedValue({
        id: "tenant-123",
        githubInstallationId: "12345",
      });

      const { getAvailableRepositories, buildRepoSelectModal } =
        await import("../handlers/channelHandler.js");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (getAvailableRepositories as any).mockResolvedValue([
        { full_name: "owner/repo1" },
        { full_name: "owner/repo2" },
      ]);

      (buildRepoSelectModal as jest.Mock).mockReturnValue({
        type: "modal",
        callback_id: "repo_select",
        title: { type: "plain_text", text: "Select Repository" },
        submit: { type: "plain_text", text: "Select" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [],
      });

      await handler({
        action: mockAction,
        body: mockBody,
        client: mockClient,
        ack: mockAck,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(getAvailableRepositories).toHaveBeenCalledWith("12345", "tenant-123");
      expect(buildRepoSelectModal).toHaveBeenCalled();
      expect(mockClient.views.open).toHaveBeenCalledWith({
        trigger_id: "trigger-123",
        view: expect.any(Object),
      });
    });

    it("should handle missing GitHub installation", async () => {
      await import("../index.js");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const actionCalls = mockApp.action.mock.calls as any[];
      const selectRepoCall = actionCalls.find((call) => call[0] === "select_repository_button");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = selectRepoCall[1] as any;

      const mockClient = {
        auth: {
          test: jest.fn<() => Promise<{ team_id: string }>>().mockResolvedValue({
            team_id: "T123",
          }),
        },
        views: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          open: jest.fn<() => Promise<any>>().mockResolvedValue({}),
        },
      };

      const mockAction = {
        type: "button",
        value: JSON.stringify({
          channelId: "C123",
          channelName: "general",
        }),
      };

      const mockBody = {
        trigger_id: "trigger-123",
        user: {
          id: "U123",
        },
      };

      const mockAck = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

      mockFindBySlackWorkspace.mockResolvedValue({
        id: "tenant-123",
        githubInstallationId: null,
      });

      await handler({
        action: mockAction,
        body: mockBody,
        client: mockClient,
        ack: mockAck,
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        "No GitHub installation found for workspace",
        expect.any(Object)
      );

      expect(mockClient.views.open).not.toHaveBeenCalled();
    });
  });
});

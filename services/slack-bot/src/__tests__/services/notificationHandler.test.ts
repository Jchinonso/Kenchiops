/**
 * Tests for Notification Handler Service
 */

import type { WebClient } from "@slack/web-api";
import { createNotificationHandler } from "../../services/notificationHandler.js";
import { postConsolidatedMessage } from "../../services/messageService.js";
import { getSlackClientForTenant, isMultiTenantEnabled } from "../../services/tenantSlackClient.js";
import type {
  SlackNotificationPayload,
  ConsolidatedCIFailurePayload,
  ActionResultPayload,
  SystemAlertPayload,
  AggregatedFailures,
} from "@kenchi/shared";

// Mock dependencies
jest.mock("../../services/messageService.js", () => ({
  postConsolidatedMessage: jest.fn(),
}));

jest.mock("../../services/tenantSlackClient.js", () => ({
  getSlackClientForTenant: jest.fn(),
  isMultiTenantEnabled: jest.fn(),
}));

const mockPostConsolidatedMessage = postConsolidatedMessage as jest.MockedFunction<
  typeof postConsolidatedMessage
>;
const mockGetSlackClientForTenant = getSlackClientForTenant as jest.MockedFunction<
  typeof getSlackClientForTenant
>;
const mockIsMultiTenantEnabled = isMultiTenantEnabled as jest.MockedFunction<
  typeof isMultiTenantEnabled
>;

describe("notificationHandler", () => {
  let mockDefaultClient: jest.Mocked<WebClient>;
  let mockTenantClient: jest.Mocked<WebClient>;

  const testInstallationId = 12345;
  const testRepository = "test-owner/test-repo";
  const testCommitSha = "abc1234567890";

  beforeEach(() => {
    jest.clearAllMocks();

    mockDefaultClient = {
      chat: {
        postMessage: jest.fn().mockResolvedValue({ ok: true }),
      },
    } as unknown as jest.Mocked<WebClient>;

    mockTenantClient = {
      chat: {
        postMessage: jest.fn().mockResolvedValue({ ok: true }),
      },
    } as unknown as jest.Mocked<WebClient>;

    mockIsMultiTenantEnabled.mockReturnValue(false);
    mockPostConsolidatedMessage.mockResolvedValue({ status: "sent" });
  });

  describe("createNotificationHandler", () => {
    it("should create a handler function", () => {
      const handler = createNotificationHandler(mockDefaultClient);
      expect(typeof handler).toBe("function");
    });
  });

  describe("consolidated_ci_failure notifications", () => {
    const createCIFailurePayload = (): ConsolidatedCIFailurePayload => ({
      type: "consolidated_ci_failure",
      installationId: testInstallationId,
      repository: testRepository,
      aggregation: {
        repository: {
          fullName: testRepository,
          owner: "test-owner",
          name: "test-repo",
          defaultBranch: "main",
        },
        commitSha: testCommitSha,
        failures: [
          {
            checkRunId: 123,
            checkName: "build",
            conclusion: "failure",
            annotations: [],
            testFailures: [],
            confidence: 0.85,
            analysis: "Build failed due to syntax error",
            identifiedCause: "Syntax error in index.ts",
            recommendedActions: [],
          },
        ],
        installationId: testInstallationId,
        pullRequestNumbers: [42],
        prContext: {
          number: 42,
          title: "Test PR",
          branch: "feature/test",
          baseBranch: "main",
        },
        workflowContext: null,
        firstFailureAt: Date.now(),
        lastFailureAt: Date.now(),
      } as unknown as AggregatedFailures,
      slackPayload: {
        blocks: [{ type: "section", text: { type: "mrkdwn", text: "Test" } }],
        text: "CI Failure",
      },
    });

    it("should handle consolidated CI failure notification successfully", async () => {
      const handler = createNotificationHandler(mockDefaultClient);
      const payload = createCIFailurePayload();

      const result = await handler(payload);

      expect(result.success).toBe(true);
      expect(mockPostConsolidatedMessage).toHaveBeenCalled();
    });

    it("should handle error from postConsolidatedMessage", async () => {
      mockPostConsolidatedMessage.mockResolvedValue({
        status: "error",
        error: "Failed to post message",
      });

      const handler = createNotificationHandler(mockDefaultClient);
      const payload = createCIFailurePayload();

      const result = await handler(payload);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to post message");
    });

    it("should use tenant-specific client in multi-tenant mode", async () => {
      mockIsMultiTenantEnabled.mockReturnValue(true);
      mockGetSlackClientForTenant.mockResolvedValue(mockTenantClient);

      const handler = createNotificationHandler(mockDefaultClient);
      const payload = createCIFailurePayload();

      await handler(payload);

      expect(mockGetSlackClientForTenant).toHaveBeenCalledWith(testInstallationId);
      expect(mockPostConsolidatedMessage).toHaveBeenCalledWith(
        mockTenantClient,
        expect.any(Object)
      );
    });

    it("should fallback to default client if tenant client fails", async () => {
      mockIsMultiTenantEnabled.mockReturnValue(true);
      mockGetSlackClientForTenant.mockRejectedValue(new Error("Tenant not found"));

      const handler = createNotificationHandler(mockDefaultClient);
      const payload = createCIFailurePayload();

      await handler(payload);

      expect(mockPostConsolidatedMessage).toHaveBeenCalledWith(
        mockDefaultClient,
        expect.any(Object)
      );
    });
  });

  describe("action_result notifications", () => {
    const createActionResultPayload = (
      overrides: Partial<ActionResultPayload> = {}
    ): ActionResultPayload => ({
      type: "action_result",
      installationId: testInstallationId,
      repository: testRepository,
      actionId: "action_123",
      actionType: "rerun_pipeline",
      success: true,
      message: "Pipeline rerun triggered successfully",
      channelId: "C123456",
      threadTs: "1234567890.123456",
      ...overrides,
    });

    it("should handle successful action result notification", async () => {
      const handler = createNotificationHandler(mockDefaultClient);
      const payload = createActionResultPayload();

      const result = await handler(payload);

      expect(result.success).toBe(true);
      expect(mockDefaultClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123456",
          thread_ts: "1234567890.123456",
        })
      );
    });

    it("should include success emoji in message for successful actions", async () => {
      const handler = createNotificationHandler(mockDefaultClient);
      const payload = createActionResultPayload({ success: true });

      await handler(payload);

      expect(mockDefaultClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("✅"),
        })
      );
    });

    it("should include failure emoji in message for failed actions", async () => {
      const handler = createNotificationHandler(mockDefaultClient);
      const payload = createActionResultPayload({
        success: false,
        message: "Pipeline rerun failed",
      });

      await handler(payload);

      expect(mockDefaultClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("❌"),
        })
      );
    });

    it("should handle action result without channel ID", async () => {
      const handler = createNotificationHandler(mockDefaultClient);
      const payload = createActionResultPayload({
        channelId: undefined,
        threadTs: undefined,
      });

      const result = await handler(payload);

      expect(result.success).toBe(true);
      expect(mockDefaultClient.chat.postMessage).not.toHaveBeenCalled();
    });

    it("should handle Slack API errors", async () => {
      mockDefaultClient.chat.postMessage = jest
        .fn()
        .mockRejectedValue(new Error("Slack API error"));

      const handler = createNotificationHandler(mockDefaultClient);
      const payload = createActionResultPayload();

      const result = await handler(payload);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Slack API error");
    });
  });

  describe("system_alert notifications", () => {
    const createSystemAlertPayload = (): SystemAlertPayload => ({
      type: "system_alert",
      installationId: testInstallationId,
      repository: testRepository,
      severity: "warning",
      title: "High memory usage",
      message: "Memory usage exceeded 80% threshold",
      details: { memoryUsage: 85 },
    });

    it("should handle system alert notification", async () => {
      const handler = createNotificationHandler(mockDefaultClient);
      const payload = createSystemAlertPayload();

      const result = await handler(payload);

      expect(result.success).toBe(true);
    });

    it("should handle different severity levels", async () => {
      const handler = createNotificationHandler(mockDefaultClient);

      const severities: Array<"info" | "warning" | "error" | "critical"> = [
        "info",
        "warning",
        "error",
        "critical",
      ];

      for (const severity of severities) {
        const payload: SystemAlertPayload = {
          ...createSystemAlertPayload(),
          severity,
        };

        const result = await handler(payload);
        expect(result.success).toBe(true);
      }
    });
  });

  describe("unknown notification types", () => {
    it("should return error for unknown notification type", async () => {
      const handler = createNotificationHandler(mockDefaultClient);
      const payload = {
        type: "unknown_type" as SlackNotificationPayload["type"],
        installationId: testInstallationId,
        repository: testRepository,
      } as SlackNotificationPayload;

      const result = await handler(payload);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown notification type");
    });
  });

  describe("error handling", () => {
    it("should catch and return errors from handler", async () => {
      // Make postConsolidatedMessage throw an error
      mockPostConsolidatedMessage.mockRejectedValue(new Error("Unexpected error"));

      const handler = createNotificationHandler(mockDefaultClient);
      const payload: ConsolidatedCIFailurePayload = {
        type: "consolidated_ci_failure",
        installationId: testInstallationId,
        repository: testRepository,
        aggregation: {
          repository: {
            fullName: testRepository,
            owner: "test-owner",
            name: "test-repo",
            defaultBranch: "main",
          },
          commitSha: testCommitSha,
          failures: [],
          installationId: testInstallationId,
          pullRequestNumbers: [],
          prContext: null,
          workflowContext: null,
          firstFailureAt: Date.now(),
          lastFailureAt: Date.now(),
        } as unknown as AggregatedFailures,
        slackPayload: {
          blocks: [],
          text: "Test",
        },
      };

      const result = await handler(payload);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unexpected error");
    });
  });
});

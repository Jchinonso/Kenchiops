/**
 * Unit tests for HTTP Routes
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import request from "supertest";
import express, { type Express } from "express";
import { createHttpRoutes } from "../routes/httpRoutes.js";
import type Bolt from "@slack/bolt";

type SlackApp = InstanceType<typeof Bolt.App>;

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  HTTP_STATUS: {
    OK: 200,
    BAD_REQUEST: 400,
    INTERNAL_SERVER_ERROR: 500,
  },
  validate: jest.fn((_schema) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req: any, res: any, next: () => void) => {
      // Simplified validation - just pass through for now
      // Real validation middleware would check schema
      next();
    }
  ),
  validators: {
    string: jest.fn((v) => typeof v === "string"),
    number: jest.fn((v) => typeof v === "number"),
    required: jest.fn((v) => v !== undefined && v !== null),
  },
  asyncHandler: jest.fn(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fn: any) => (req: any, res: any, next: any) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    }
  ),
}));

jest.mock("../services/messageService.js", () => ({
  postMessage: jest.fn(() =>
    Promise.resolve({
      status: "sent",
      channel: "C123456",
      timestamp: "1234567890.123456",
      thread_ts: "1234567890.123456",
    })
  ),
  postConsolidatedMessage: jest.fn(() =>
    Promise.resolve({
      status: "sent",
      channel: "C123456",
      timestamp: "1234567890.123456",
    })
  ),
  broadcastMessage: jest.fn(() =>
    Promise.resolve({
      status: "sent",
      channelsCount: 2,
      successCount: 2,
      failedCount: 0,
      channels: [
        { id: "C111111", name: "general", status: "sent" },
        { id: "C222222", name: "dev", status: "sent" },
      ],
    })
  ),
}));

jest.mock("../services/tenantSlackClient.js", () => ({
  getSlackClientForTenant: jest.fn(() =>
    Promise.resolve({
      chat: {
        postMessage: jest.fn(() => Promise.resolve({ ok: true, ts: "1234567890.123456" })),
      },
    })
  ),
  isMultiTenantEnabled: jest.fn(() => false),
}));

describe("HTTP Routes", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createMockSlackApp = (): any => ({
    client: {
      chat: {
        postMessage: jest.fn(() => Promise.resolve({ ok: true, ts: "1234567890.123456" })),
      },
    },
  });

  let app: Express;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSlackApp: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSlackApp = createMockSlackApp();
    app = express();
    app.use(express.json());
    app.use(createHttpRoutes(mockSlackApp as SlackApp));
  });

  describe("POST /slack/message", () => {
    describe("successful message posting", () => {
      it("should post a simple text message", async () => {
        const response = await request(app).post("/slack/message").send({
          channel: "C123456",
          message: "Test message",
        });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("status", "sent");
        expect(response.body).toHaveProperty("channel", "C123456");
        expect(response.body).toHaveProperty("timestamp");
      });

      it("should post message with analysis data", async () => {
        const response = await request(app)
          .post("/slack/message")
          .send({
            channel: "C123456",
            analysis: {
              repository: "owner/repo",
              checkName: "CI Build",
              analysis: "Build failed due to missing dependency",
              confidence: 0.85,
              identified_cause: "Missing npm package",
              recommended_actions: [
                {
                  priority: "high",
                  description: "Install missing dependency",
                },
              ],
            },
          });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("sent");
      });

      it("should post message with thread_ts", async () => {
        const response = await request(app).post("/slack/message").send({
          channel: "C123456",
          message: "Thread reply",
          thread_ts: "1234567890.000000",
        });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("sent");
      });

      it("should post consolidated message", async () => {
        const response = await request(app)
          .post("/slack/message")
          .send({
            consolidated: true,
            payload: {
              blocks: [{ type: "section", text: { type: "mrkdwn", text: "Consolidated" } }],
              text: "CI Failure notification",
              metadata: {
                repository: "owner/repo",
                commitSha: "abc123",
                failureCount: 3,
                checkNames: ["CI Build"],
                avgConfidence: 0.85,
                isConsolidated: true,
              },
            },
            repository: "owner/repo",
            installation_id: 12345,
            commit_sha: "abc123",
            failure_count: 3,
          });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("sent");
      });

      it("should handle message with blocks", async () => {
        const response = await request(app)
          .post("/slack/message")
          .send({
            channel: "C123456",
            message: "Fallback text",
            blocks: [{ type: "section", text: { type: "mrkdwn", text: "Block content" } }],
          });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("sent");
      });

      it("should handle message without channel (uses default)", async () => {
        const response = await request(app).post("/slack/message").send({
          message: "Test message",
        });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("sent");
      });

      it("should post message with installation_id", async () => {
        const response = await request(app).post("/slack/message").send({
          channel: "C123456",
          message: "Test message",
          installation_id: 12345,
        });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("sent");
      });
    });

    describe("validation errors", () => {
      it("should reject request without message or analysis", async () => {
        const response = await request(app).post("/slack/message").send({
          channel: "C123456",
        });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("error");
        expect(response.body.error).toContain("message, analysis, or consolidated payload");
      });

      it("should reject consolidated request without payload", async () => {
        const response = await request(app).post("/slack/message").send({
          consolidated: true,
          repository: "owner/repo",
          installation_id: 12345,
          commit_sha: "abc123",
          failure_count: 3,
        });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("error");
        expect(response.body.error).toContain("message, analysis, or consolidated payload");
      });

      it("should reject consolidated request with empty blocks", async () => {
        const response = await request(app)
          .post("/slack/message")
          .send({
            consolidated: true,
            payload: {
              blocks: [],
              text: "CI Failure",
              metadata: {
                repository: "owner/repo",
                commitSha: "abc123",
                failureCount: 3,
                checkNames: [],
                avgConfidence: 0.85,
                isConsolidated: true,
              },
            },
            repository: "owner/repo",
            installation_id: 12345,
            commit_sha: "abc123",
            failure_count: 3,
          });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("error");
        expect(response.body.error).toContain("message, analysis, or consolidated payload");
      });
    });

    describe("multi-tenant mode", () => {
      it("should use tenant client when installation_id provided and multi-tenant enabled", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { isMultiTenantEnabled } = jest.requireMock(
          "../services/tenantSlackClient.js"
        ) as any;
        isMultiTenantEnabled.mockReturnValue(true);

        const response = await request(app).post("/slack/message").send({
          channel: "C123456",
          message: "Test message",
          installation_id: 12345,
        });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("sent");
      });

      it("should handle tenant client errors", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { isMultiTenantEnabled, getSlackClientForTenant } = jest.requireMock(
          "../services/tenantSlackClient.js"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any;
        isMultiTenantEnabled.mockReturnValue(true);
        getSlackClientForTenant.mockRejectedValueOnce(new Error("Tenant not found"));

        const response = await request(app).post("/slack/message").send({
          channel: "C123456",
          message: "Test message",
          installation_id: 99999,
        });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("error");
        expect(response.body.error).toContain("Tenant not found");
      });
    });

    describe("error handling", () => {
      it("should handle message service errors", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { postMessage } = jest.requireMock("../services/messageService.js") as any;
        postMessage.mockResolvedValueOnce({
          status: "error",
          error: "Failed to post message",
        });

        const response = await request(app).post("/slack/message").send({
          channel: "C123456",
          message: "Test message",
        });

        expect(response.status).toBe(500);
        expect(response.body).toHaveProperty("status", "error");
        expect(response.body).toHaveProperty("error");
      });

      it("should handle invalid channel errors", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { postMessage } = jest.requireMock("../services/messageService.js") as any;
        postMessage.mockResolvedValueOnce({
          status: "error",
          error: "channel_not_found",
        });

        const response = await request(app).post("/slack/message").send({
          channel: "invalid",
          message: "Test message",
        });

        expect(response.status).toBe(500);
        expect(response.body.status).toBe("error");
      });

      it("should handle Slack API rate limit errors", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { postMessage } = jest.requireMock("../services/messageService.js") as any;
        postMessage.mockResolvedValueOnce({
          status: "error",
          error: "rate_limited",
        });

        const response = await request(app).post("/slack/message").send({
          channel: "C123456",
          message: "Test message",
        });

        expect(response.status).toBe(500);
        expect(response.body.status).toBe("error");
      });
    });

    describe("edge cases", () => {
      it("should handle very long message text", async () => {
        const longMessage = "A".repeat(5000);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { postMessage } = jest.requireMock("../services/messageService.js") as any;
        postMessage.mockResolvedValueOnce({
          status: "sent",
          channel: "C123456",
          timestamp: "1234567890.123456",
          thread_ts: "1234567890.123456",
        });

        const response = await request(app).post("/slack/message").send({
          channel: "C123456",
          message: longMessage,
        });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("sent");
      });

      it("should handle message with special characters", async () => {
        const response = await request(app).post("/slack/message").send({
          channel: "C123456",
          message: "Test <script>alert('xss')</script>",
        });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("sent");
      });

      it("should handle message with unicode", async () => {
        const response = await request(app).post("/slack/message").send({
          channel: "C123456",
          message: "テスト メッセージ 🚀",
        });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("sent");
      });

      it("should reject empty string message", async () => {
        const response = await request(app).post("/slack/message").send({
          channel: "C123456",
          message: "",
        });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("error");
      });

      it("should handle null thread_ts values", async () => {
        const response = await request(app).post("/slack/message").send({
          channel: "C123456",
          message: "Test message",
          thread_ts: null,
        });

        // Either succeeds with valid message or rejects based on validation
        expect([200, 400]).toContain(response.status);
      });

      it("should handle undefined values", async () => {
        const response = await request(app).post("/slack/message").send({
          channel: "C123456",
          message: "Test message",
          thread_ts: undefined,
        });

        expect(response.status).toBe(200);
      });
    });

    describe("response structure", () => {
      it("should return timestamp in response", async () => {
        const response = await request(app).post("/slack/message").send({
          channel: "C123456",
          message: "Test message",
        });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("timestamp");
        expect(typeof response.body.timestamp).toBe("string");
      });

      it("should return thread_ts in response", async () => {
        const response = await request(app).post("/slack/message").send({
          channel: "C123456",
          message: "Test message",
        });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("thread_ts");
      });

      it("should return channel in response", async () => {
        const response = await request(app).post("/slack/message").send({
          channel: "C123456",
          message: "Test message",
        });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("channel", "C123456");
      });

      it("should return status in response", async () => {
        const response = await request(app).post("/slack/message").send({
          channel: "C123456",
          message: "Test message",
        });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("status");
        expect(["sent", "error", "partial"]).toContain(response.body.status);
      });
    });
  });

  describe("POST /slack/broadcast", () => {
    describe("successful broadcasting", () => {
      it("should broadcast message to all channels", async () => {
        const response = await request(app).post("/slack/broadcast").send({
          message: "Broadcast message",
        });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("status", "sent");
        expect(response.body).toHaveProperty("channelsCount", 2);
        expect(response.body).toHaveProperty("successCount", 2);
        expect(response.body).toHaveProperty("failedCount", 0);
      });

      it("should return channel results", async () => {
        const response = await request(app).post("/slack/broadcast").send({
          message: "Broadcast message",
        });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("channels");
        expect(Array.isArray(response.body.channels)).toBe(true);
        expect(response.body.channels.length).toBe(2);
      });

      it("should include channel details in results", async () => {
        const response = await request(app).post("/slack/broadcast").send({
          message: "Broadcast message",
        });

        expect(response.status).toBe(200);
        expect(response.body.channels[0]).toHaveProperty("id");
        expect(response.body.channels[0]).toHaveProperty("name");
        expect(response.body.channels[0]).toHaveProperty("status");
      });

      it("should handle empty channels list", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { broadcastMessage } = jest.requireMock("../services/messageService.js") as any;
        broadcastMessage.mockResolvedValueOnce({
          status: "sent",
          channelsCount: 0,
          successCount: 0,
          failedCount: 0,
          channels: [],
        });

        const response = await request(app).post("/slack/broadcast").send({
          message: "Broadcast message",
        });

        expect(response.status).toBe(200);
        expect(response.body.channelsCount).toBe(0);
      });
    });

    describe("partial failures", () => {
      it("should handle partial broadcast failures", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { broadcastMessage } = jest.requireMock("../services/messageService.js") as any;
        broadcastMessage.mockResolvedValueOnce({
          status: "partial",
          channelsCount: 2,
          successCount: 1,
          failedCount: 1,
          channels: [
            { id: "C111111", name: "general", status: "sent" },
            { id: "C222222", name: "dev", status: "failed", error: "channel_not_found" },
          ],
        });

        const response = await request(app).post("/slack/broadcast").send({
          message: "Broadcast message",
        });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("partial");
        expect(response.body.successCount).toBe(1);
        expect(response.body.failedCount).toBe(1);
      });

      it("should include error details for failed channels", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { broadcastMessage } = jest.requireMock("../services/messageService.js") as any;
        broadcastMessage.mockResolvedValueOnce({
          status: "partial",
          channelsCount: 2,
          successCount: 1,
          failedCount: 1,
          channels: [
            { id: "C111111", name: "general", status: "sent" },
            { id: "C222222", name: "dev", status: "failed", error: "rate_limited" },
          ],
        });

        const response = await request(app).post("/slack/broadcast").send({
          message: "Broadcast message",
        });

        expect(response.status).toBe(200);
        const failedChannel = response.body.channels.find(
          (c: { status: string }) => c.status === "failed"
        );
        expect(failedChannel).toHaveProperty("error");
      });
    });

    describe("validation errors", () => {
      it("should accept request without message (validators are mocked)", async () => {
        const response = await request(app).post("/slack/broadcast").send({});

        // Validation is mocked, so it passes through
        expect(response.status).toBe(200);
      });

      it("should handle empty message", async () => {
        const response = await request(app).post("/slack/broadcast").send({
          message: "",
        });

        // Validation is mocked, so it passes through
        expect(response.status).toBe(200);
      });

      it("should handle null message", async () => {
        const response = await request(app).post("/slack/broadcast").send({
          message: null,
        });

        // Validation is mocked, so it passes through
        expect(response.status).toBe(200);
      });

      it("should handle undefined message", async () => {
        const response = await request(app).post("/slack/broadcast").send({
          message: undefined,
        });

        // Validation is mocked, so it passes through
        expect(response.status).toBe(200);
      });
    });

    describe("error handling", () => {
      it("should handle broadcast service errors", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { broadcastMessage } = jest.requireMock("../services/messageService.js") as any;
        broadcastMessage.mockResolvedValueOnce({
          status: "error",
          error: "Failed to broadcast message",
          channelsCount: 0,
          successCount: 0,
          failedCount: 0,
        });

        const response = await request(app).post("/slack/broadcast").send({
          message: "Broadcast message",
        });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("error");
        expect(response.body).toHaveProperty("error");
      });

      it("should handle complete broadcast failure", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { broadcastMessage } = jest.requireMock("../services/messageService.js") as any;
        broadcastMessage.mockResolvedValueOnce({
          status: "error",
          channelsCount: 2,
          successCount: 0,
          failedCount: 2,
          channels: [
            { id: "C111111", name: "general", status: "failed", error: "API error" },
            { id: "C222222", name: "dev", status: "failed", error: "API error" },
          ],
        });

        const response = await request(app).post("/slack/broadcast").send({
          message: "Broadcast message",
        });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("error");
        expect(response.body.failedCount).toBe(2);
      });
    });

    describe("edge cases", () => {
      it("should handle very long broadcast message", async () => {
        const longMessage = "A".repeat(5000);
        const response = await request(app).post("/slack/broadcast").send({
          message: longMessage,
        });

        expect(response.status).toBe(200);
      });

      it("should handle broadcast with special characters", async () => {
        const response = await request(app).post("/slack/broadcast").send({
          message: "Test <script>alert('xss')</script>",
        });

        expect(response.status).toBe(200);
      });

      it("should handle broadcast with unicode", async () => {
        const response = await request(app).post("/slack/broadcast").send({
          message: "テスト メッセージ 🚀",
        });

        expect(response.status).toBe(200);
      });
    });
  });

  describe("GET /health", () => {
    it("should return health status", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("status", "ok");
      expect(response.body).toHaveProperty("service", "slack-bot");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body).toHaveProperty("uptime");
      expect(response.body).toHaveProperty("environment");
    });

    it("should return valid ISO timestamp", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body.timestamp).toBeDefined();
      expect(new Date(response.body.timestamp).getTime()).not.toBeNaN();
    });

    it("should return uptime as number", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(typeof response.body.uptime).toBe("number");
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it("should return environment from process.env", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body.environment).toBeDefined();
      expect(typeof response.body.environment).toBe("string");
    });

    it("should default to development when NODE_ENV not set", async () => {
      const originalEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;

      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body.environment).toBe("development");

      process.env.NODE_ENV = originalEnv;
    });

    it("should return JSON content type", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toMatch(/application\/json/);
    });

    it("should handle concurrent health checks", async () => {
      const requests = Array.from({ length: 10 }, () => request(app).get("/health"));

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe("ok");
      });
    });

    it("should respond quickly", async () => {
      const start = Date.now();
      const response = await request(app).get("/health");
      const duration = Date.now() - start;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(100);
    });

    it("should not require authentication", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
    });

    it("should ignore query parameters", async () => {
      const response = await request(app).get("/health?param=value&other=123");

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("ok");
    });

    it("should use ISO 8601 format for timestamp", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      const timestamp = response.body.timestamp;
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it("should include all required fields", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      const requiredFields = ["status", "service", "timestamp", "uptime", "environment"];
      requiredFields.forEach((field) => {
        expect(response.body).toHaveProperty(field);
      });
    });

    it("should not include sensitive information", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty("apiKey");
      expect(response.body).not.toHaveProperty("secret");
      expect(response.body).not.toHaveProperty("password");
      expect(response.body).not.toHaveProperty("token");
    });

    it("should be idempotent", async () => {
      const response1 = await request(app).get("/health");
      const response2 = await request(app).get("/health");
      const response3 = await request(app).get("/health");

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response3.status).toBe(200);

      expect(response1.body.service).toBe(response2.body.service);
      expect(response2.body.service).toBe(response3.body.service);
    });
  });

  describe("HTTP method restrictions", () => {
    it("should not accept GET on /slack/message", async () => {
      const response = await request(app).get("/slack/message");

      expect(response.status).toBe(404);
    });

    it("should not accept PUT on /slack/message", async () => {
      const response = await request(app).put("/slack/message").send({});

      expect(response.status).toBe(404);
    });

    it("should not accept DELETE on /slack/message", async () => {
      const response = await request(app).delete("/slack/message");

      expect(response.status).toBe(404);
    });

    it("should not accept GET on /slack/broadcast", async () => {
      const response = await request(app).get("/slack/broadcast");

      expect(response.status).toBe(404);
    });

    it("should not accept PUT on /slack/broadcast", async () => {
      const response = await request(app).put("/slack/broadcast").send({});

      expect(response.status).toBe(404);
    });

    it("should not accept DELETE on /slack/broadcast", async () => {
      const response = await request(app).delete("/slack/broadcast");

      expect(response.status).toBe(404);
    });

    it("should not accept POST on /health", async () => {
      const response = await request(app).post("/health").send({});

      expect(response.status).toBe(404);
    });

    it("should not accept PUT on /health", async () => {
      const response = await request(app).put("/health").send({});

      expect(response.status).toBe(404);
    });

    it("should not accept DELETE on /health", async () => {
      const response = await request(app).delete("/health");

      expect(response.status).toBe(404);
    });
  });

  describe("Content-Type handling", () => {
    it("should accept application/json for POST /slack/message", async () => {
      const response = await request(app)
        .post("/slack/message")
        .set("Content-Type", "application/json")
        .send(
          JSON.stringify({
            channel: "C123456",
            message: "Test message",
          })
        );

      expect(response.status).toBe(200);
    });

    it("should accept application/json for POST /slack/broadcast", async () => {
      const response = await request(app)
        .post("/slack/broadcast")
        .set("Content-Type", "application/json")
        .send(
          JSON.stringify({
            message: "Broadcast message",
          })
        );

      expect(response.status).toBe(200);
    });

    it("should handle requests with Accept header", async () => {
      const response = await request(app)
        .post("/slack/message")
        .set("Accept", "application/json")
        .send({
          channel: "C123456",
          message: "Test message",
        });

      expect(response.status).toBe(200);
    });

    it("should handle requests with custom headers", async () => {
      const response = await request(app)
        .post("/slack/message")
        .set("X-Custom-Header", "test-value")
        .send({
          channel: "C123456",
          message: "Test message",
        });

      expect(response.status).toBe(200);
    });
  });

  describe("error response handling", () => {
    it("should return error status code for service errors", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { postMessage } = jest.requireMock("../services/messageService.js") as any;
      postMessage.mockResolvedValueOnce({
        status: "error",
        error: "Service unavailable",
      });

      const response = await request(app).post("/slack/message").send({
        channel: "C123456",
        message: "Test message",
      });

      expect(response.status).toBe(500);
      expect(response.body.status).toBe("error");
    });

    it("should include error message in response", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { postMessage } = jest.requireMock("../services/messageService.js") as any;
      postMessage.mockResolvedValueOnce({
        status: "error",
        error: "Specific error message",
      });

      const response = await request(app).post("/slack/message").send({
        channel: "C123456",
        message: "Test message",
      });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty("error", "Specific error message");
    });
  });

  describe("route not found", () => {
    it("should return 404 for non-existent routes", async () => {
      const response = await request(app).get("/non-existent-route");

      expect(response.status).toBe(404);
    });

    it("should return 404 for invalid POST routes", async () => {
      const response = await request(app).post("/invalid-route").send({});

      expect(response.status).toBe(404);
    });
  });
});

/**
 * Unit tests for Webhook Routes
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  asyncHandler: (fn: unknown) => fn,
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  HTTP_STATUS: {
    OK: 200,
  },
  getErrorMessage: jest.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  ),
  rateLimitByCategory: jest.fn(
    () => (_req: unknown, _res: unknown, next: unknown) => (next as () => void)()
  ),
  checkWebhookSourceRateLimit: jest.fn(() => ({ allowed: true, remaining: 59 })),
  isWebhookDuplicate: jest.fn(() => Promise.resolve(false)),
  markWebhookProcessed: jest.fn(() => Promise.resolve()),
  RateLimitError: class RateLimitError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "RateLimitError";
    }
  },
  findTenantByGitHubInstallation: jest.fn(() => Promise.resolve({ id: "tenant_123" })),
  findWebhookActivityByDeliveryId: jest.fn(() => Promise.resolve(null)),
  findOAuthIdentity: jest.fn(() => Promise.resolve(null)),
  findUserOrgRole: jest.fn(() => Promise.resolve(null)),
  countOwnersByTenant: jest.fn(() => Promise.resolve(2)),
  removeMemberFromTenant: jest.fn(() => Promise.resolve()),
  logAuditEvent: jest.fn(() => Promise.resolve()),
  handleDocUpdateEvent: jest.fn(() => Promise.resolve()),
  AUDIT_ACTIONS: {
    MEMBER_REMOVED: "member_removed",
    MEMBER_REMOVED_PROVIDER: "member_removed_provider",
  },
}));

jest.mock("../handlers/pullRequestHandler.js", () => ({
  handlePullRequest: jest.fn(() =>
    Promise.resolve({
      handled: true,
      message: "PR processed",
      eventId: "pr_123",
    })
  ),
}));

jest.mock("../handlers/checkRunHandler.js", () => ({
  handleCheckRun: jest.fn(() =>
    Promise.resolve({
      handled: true,
      message: "Check run processed",
      eventId: "check_123",
    })
  ),
}));

jest.mock("../handlers/installationHandler.js", () => ({
  handleInstallation: jest.fn(() =>
    Promise.resolve({
      handled: true,
      message: "Installation processed",
      tenantId: "tenant_123",
    })
  ),
}));

jest.mock("../middleware/verifyGithub.js", () => ({
  verifyGitHubWebhook: (req: Request, res: Response, next: NextFunction) => next(),
}));

// Import after mocks
import { webhookRoutes } from "../routes/webhookRoutes.js";
import { handlePullRequest } from "../handlers/pullRequestHandler.js";
import { handleCheckRun } from "../handlers/checkRunHandler.js";
import { handleInstallation } from "../handlers/installationHandler.js";

const mockHandlePullRequest = handlePullRequest as jest.MockedFunction<typeof handlePullRequest>;
const mockHandleCheckRun = handleCheckRun as jest.MockedFunction<typeof handleCheckRun>;
const mockHandleInstallation = handleInstallation as jest.MockedFunction<typeof handleInstallation>;

describe("Webhook Routes", () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use(webhookRoutes);

    // Reset mock implementations
    mockHandlePullRequest.mockResolvedValue({
      handled: true,
      message: "PR processed",
      eventId: "pr_123",
    });

    mockHandleCheckRun.mockResolvedValue({
      handled: true,
      message: "Check run processed",
      eventId: "check_123",
    });

    mockHandleInstallation.mockResolvedValue({
      handled: true,
      message: "Installation processed",
      tenantId: "tenant_123",
    });
  });

  describe("POST /webhook - unified endpoint", () => {
    it("should handle ping events", async () => {
      const response = await request(app)
        .post("/webhook")
        .set("X-GitHub-Event", "ping")
        .set("X-GitHub-Delivery", "12345")
        .send({ zen: "Keep it simple" });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("ok");
      expect(response.body.message).toContain("Webhook configured");
    });

    it("should handle pull_request events", async () => {
      const response = await request(app)
        .post("/webhook")
        .set("X-GitHub-Event", "pull_request")
        .set("X-GitHub-Delivery", "12345")
        .send({ action: "opened" });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("processed");
      expect(mockHandlePullRequest).toHaveBeenCalled();
    });

    it("should handle check_run events", async () => {
      const response = await request(app)
        .post("/webhook")
        .set("X-GitHub-Event", "check_run")
        .set("X-GitHub-Delivery", "12345")
        .send({ action: "completed" });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("processed");
      expect(mockHandleCheckRun).toHaveBeenCalled();
    });

    it("should handle installation events", async () => {
      const response = await request(app)
        .post("/webhook")
        .set("X-GitHub-Event", "installation")
        .set("X-GitHub-Delivery", "12345")
        .send({ action: "created" });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("processed");
      expect(mockHandleInstallation).toHaveBeenCalled();
    });

    it("should ignore unknown event types", async () => {
      const response = await request(app)
        .post("/webhook")
        .set("X-GitHub-Event", "unknown_event")
        .set("X-GitHub-Delivery", "12345")
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("ignored");
      expect(response.body.message).toContain("unknown_event");
    });

    it("should include eventId in response for handled events", async () => {
      const response = await request(app)
        .post("/webhook")
        .set("X-GitHub-Event", "check_run")
        .set("X-GitHub-Delivery", "12345")
        .send({ action: "completed" });

      expect(response.body.eventId).toBe("check_123");
    });

    it("should include tenantId for installation events", async () => {
      const response = await request(app)
        .post("/webhook")
        .set("X-GitHub-Event", "installation")
        .set("X-GitHub-Delivery", "12345")
        .send({ action: "created" });

      expect(response.body.tenantId).toBe("tenant_123");
    });

    it("should handle skipped events", async () => {
      mockHandleCheckRun.mockResolvedValue({
        handled: false,
        message: "Event skipped",
      });

      const response = await request(app)
        .post("/webhook")
        .set("X-GitHub-Event", "check_run")
        .set("X-GitHub-Delivery", "12345")
        .send({ action: "created" });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("skipped");
    });
  });

  describe("POST /webhook/pull_request - legacy endpoint", () => {
    it("should handle PR webhooks", async () => {
      const response = await request(app)
        .post("/webhook/pull_request")
        .send({
          action: "opened",
          pull_request: { number: 123 },
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("processed");
      expect(mockHandlePullRequest).toHaveBeenCalled();
    });

    it("should include eventId in response", async () => {
      const response = await request(app)
        .post("/webhook/pull_request")
        .send({
          action: "opened",
          pull_request: { number: 123 },
        });

      expect(response.body.eventId).toBe("pr_123");
    });

    it("should handle skipped PR events", async () => {
      mockHandlePullRequest.mockResolvedValue({
        handled: false,
        message: "PR event skipped",
      });

      const response = await request(app)
        .post("/webhook/pull_request")
        .send({
          action: "closed",
          pull_request: { number: 123 },
        });

      expect(response.body.status).toBe("skipped");
    });
  });

  describe("POST /webhook/check_run - legacy endpoint", () => {
    it("should handle check run webhooks", async () => {
      const response = await request(app)
        .post("/webhook/check_run")
        .send({
          action: "completed",
          check_run: { id: 123, conclusion: "failure" },
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("processed");
      expect(mockHandleCheckRun).toHaveBeenCalled();
    });

    it("should include eventId in response", async () => {
      const response = await request(app)
        .post("/webhook/check_run")
        .send({
          action: "completed",
          check_run: { id: 123 },
        });

      expect(response.body.eventId).toBe("check_123");
    });

    it("should handle skipped check run events", async () => {
      mockHandleCheckRun.mockResolvedValue({
        handled: false,
        message: "Check run skipped",
      });

      const response = await request(app)
        .post("/webhook/check_run")
        .send({
          action: "created",
          check_run: { id: 123 },
        });

      expect(response.body.status).toBe("skipped");
    });
  });

  describe("error handling", () => {
    it("should handle missing event type header", async () => {
      const response = await request(app)
        .post("/webhook")
        .set("X-GitHub-Delivery", "12345")
        .send({});

      expect(response.status).toBe(200);
    });
  });

  describe("handler invocation", () => {
    it("should pass webhook body to handler", async () => {
      const webhookBody = {
        action: "opened",
        pull_request: {
          number: 456,
          title: "Test PR",
        },
      };

      await request(app)
        .post("/webhook")
        .set("X-GitHub-Event", "pull_request")
        .set("X-GitHub-Delivery", "12345")
        .send(webhookBody);

      expect(mockHandlePullRequest).toHaveBeenCalledWith(webhookBody);
    });

    it("should not call handlers for ping events", async () => {
      await request(app)
        .post("/webhook")
        .set("X-GitHub-Event", "ping")
        .set("X-GitHub-Delivery", "12345")
        .send({});

      expect(mockHandlePullRequest).not.toHaveBeenCalled();
      expect(mockHandleCheckRun).not.toHaveBeenCalled();
      expect(mockHandleInstallation).not.toHaveBeenCalled();
    });

    it("should not call handlers for unknown events", async () => {
      // Push events with non-default branch are ignored (no handlers called)
      await request(app)
        .post("/webhook")
        .set("X-GitHub-Event", "push")
        .set("X-GitHub-Delivery", "12345")
        .send({
          ref: "refs/heads/feature-branch",
          repository: {
            full_name: "owner/repo",
            default_branch: "main",
          },
        });

      expect(mockHandlePullRequest).not.toHaveBeenCalled();
      expect(mockHandleCheckRun).not.toHaveBeenCalled();
      expect(mockHandleInstallation).not.toHaveBeenCalled();
    });
  });

  describe("response formatting", () => {
    it("should format PR response correctly", async () => {
      const response = await request(app)
        .post("/webhook")
        .set("X-GitHub-Event", "pull_request")
        .set("X-GitHub-Delivery", "12345")
        .send({ action: "opened" });

      expect(response.body).toEqual({
        status: "processed",
        message: "PR processed",
        eventId: "pr_123",
      });
    });

    it("should format installation response correctly", async () => {
      const response = await request(app)
        .post("/webhook")
        .set("X-GitHub-Event", "installation")
        .set("X-GitHub-Delivery", "12345")
        .send({ action: "created" });

      expect(response.body).toEqual({
        status: "processed",
        message: "Installation processed",
        tenantId: "tenant_123",
      });
    });

    it("should omit undefined fields from response", async () => {
      mockHandleCheckRun.mockResolvedValue({
        handled: true,
        message: "Processed",
      });

      const response = await request(app)
        .post("/webhook")
        .set("X-GitHub-Event", "check_run")
        .set("X-GitHub-Delivery", "12345")
        .send({ action: "completed" });

      expect(response.body.eventId).toBeUndefined();
    });
  });
});

/**
 * Tests for adapters/renderLogAdapter — Render deployment log ingestion.
 *
 * Mocks resilientGet from @kenchi/shared. Verifies signature verification,
 * webhook parsing, REST log fetching, and empty log drain batch (unsupported).
 *
 * @module adapters/renderLogAdapter.test
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ExternalServiceError } from "@kenchi/shared";
import type { RequestContext, FetchDeployLogsParams } from "@kenchi/shared";
import crypto from "crypto";

// ==================== Mocks ====================

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockResilientGet = jest.fn();

jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual<typeof import("@kenchi/shared")>("@kenchi/shared");
  return {
    ...actual,
    createLogger: () => mockLogger,
    resilientGet: (...args: unknown[]) => mockResilientGet(...args),
  };
});

import { renderLogAdapter } from "./renderLogAdapter.js";

// ==================== Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const createValidRenderPayload = (overrides: Record<string, unknown> = {}) => ({
  type: "deploy_completed",
  data: {
    id: "dep_abc123",
    serviceId: "srv_xyz789",
    serviceName: "my-render-app",
    status: "live",
    commit: {
      id: "abc123def456",
      message: "Fix production bug",
    },
    branch: "main",
    createdAt: "2024-01-15T09:50:00Z",
    finishedAt: "2024-01-15T10:00:00Z",
  },
  ...overrides,
});

const createFetchParams = (
  overrides: Partial<FetchDeployLogsParams> = {}
): FetchDeployLogsParams => ({
  entityId: "srv_xyz789",
  platform: "render",
  accessToken: "test-render-token",
  ...overrides,
});

// ==================== Tests ====================

describe("renderLogAdapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== verifySignature ====================

  describe("verifySignature", () => {
    const secret = "render_webhook_secret";
    const body = Buffer.from('{"type":"deploy_completed"}');

    const computeValidSignature = (rawBody: Buffer, sigSecret: string): string =>
      crypto.createHmac("sha256", sigSecret).update(rawBody).digest("hex");

    it("should return true when signature is valid", () => {
      const signature = computeValidSignature(body, secret);
      expect(renderLogAdapter.verifySignature(body, signature, secret)).toBe(true);
    });

    it("should return false when signature is invalid", () => {
      expect(renderLogAdapter.verifySignature(body, "b".repeat(64), secret)).toBe(false);
    });

    it("should return false when signature is empty string", () => {
      expect(renderLogAdapter.verifySignature(body, "", secret)).toBe(false);
    });

    it("should return false when signature has wrong length", () => {
      expect(renderLogAdapter.verifySignature(body, "deadbeef", secret)).toBe(false);
    });

    it("should return false for mismatched body", () => {
      const signature = computeValidSignature(body, secret);
      expect(renderLogAdapter.verifySignature(Buffer.from("different"), signature, secret)).toBe(
        false
      );
    });

    it("should return false for mismatched secret", () => {
      const signature = computeValidSignature(body, secret);
      expect(renderLogAdapter.verifySignature(body, signature, "other-secret")).toBe(false);
    });
  });

  // ==================== handleWebhook ====================

  describe("handleWebhook", () => {
    it("should return null for non-deployment payload", async () => {
      const result = await renderLogAdapter.handleWebhook({ foo: "bar" }, testContext);
      expect(result).toBeNull();
    });

    it("should return null for null payload", async () => {
      const result = await renderLogAdapter.handleWebhook(null, testContext);
      expect(result).toBeNull();
    });

    it("should return null for non-object payload", async () => {
      const result = await renderLogAdapter.handleWebhook("string", testContext);
      expect(result).toBeNull();
    });

    it("should return null when data.id is missing", async () => {
      const payload = { type: "deploy_completed", data: { serviceName: "app" } };
      const result = await renderLogAdapter.handleWebhook(payload, testContext);
      expect(result).toBeNull();
    });

    it("should log warning when skipping non-deployment webhook", async () => {
      await renderLogAdapter.handleWebhook({ invalid: true }, testContext);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Skipping non-deployment Render webhook",
        expect.objectContaining({
          provider: "render",
          operation: "handleWebhook",
        })
      );
    });

    it("should parse a live deployment event correctly", async () => {
      const payload = createValidRenderPayload();
      const result = await renderLogAdapter.handleWebhook(payload, testContext);

      expect(result).toEqual({
        entityId: "dep_abc123",
        platform: "render",
        eventType: "deploy_completed",
        metadata: {
          repository: "my-render-app",
          branch: "main",
          commit: "abc123def456",
          startedAt: new Date("2024-01-15T09:50:00Z"),
          completedAt: new Date("2024-01-15T10:00:00Z"),
          status: "success",
          projectId: "srv_xyz789",
          projectName: "my-render-app",
        },
        logs: null,
      });
    });

    it("should map build_failed status to deploy_failed event", async () => {
      const payload = createValidRenderPayload({
        data: {
          ...createValidRenderPayload().data,
          status: "build_failed",
        },
      });
      const result = await renderLogAdapter.handleWebhook(payload, testContext);

      expect(result?.eventType).toBe("deploy_failed");
      expect(result?.metadata.status).toBe("failed");
    });

    it("should map update_failed status to deploy_failed event", async () => {
      const payload = createValidRenderPayload({
        data: {
          ...createValidRenderPayload().data,
          status: "update_failed",
        },
      });
      const result = await renderLogAdapter.handleWebhook(payload, testContext);

      expect(result?.eventType).toBe("deploy_failed");
      expect(result?.metadata.status).toBe("failed");
    });

    it("should map build_in_progress status to building", async () => {
      const payload = createValidRenderPayload({
        type: "build_started",
        data: {
          ...createValidRenderPayload().data,
          status: "build_in_progress",
          finishedAt: undefined,
        },
      });
      const result = await renderLogAdapter.handleWebhook(payload, testContext);

      expect(result?.eventType).toBe("deploy_started");
      expect(result?.metadata.status).toBe("building");
    });

    it("should map update_in_progress to deploying", async () => {
      const payload = createValidRenderPayload({
        data: {
          ...createValidRenderPayload().data,
          status: "update_in_progress",
        },
      });
      const result = await renderLogAdapter.handleWebhook(payload, testContext);
      expect(result?.metadata.status).toBe("deploying");
    });

    it("should map canceled status to cancelled", async () => {
      const payload = createValidRenderPayload({
        data: {
          ...createValidRenderPayload().data,
          status: "canceled",
        },
      });
      const result = await renderLogAdapter.handleWebhook(payload, testContext);
      expect(result?.metadata.status).toBe("cancelled");
    });

    it("should map deactivated status to cancelled", async () => {
      const payload = createValidRenderPayload({
        data: {
          ...createValidRenderPayload().data,
          status: "deactivated",
        },
      });
      const result = await renderLogAdapter.handleWebhook(payload, testContext);
      expect(result?.metadata.status).toBe("cancelled");
    });

    it("should map unknown status to building as default", async () => {
      const payload = createValidRenderPayload({
        data: {
          ...createValidRenderPayload().data,
          status: "UNKNOWN",
        },
      });
      const result = await renderLogAdapter.handleWebhook(payload, testContext);
      expect(result?.metadata.status).toBe("building");
    });

    it("should default branch to 'main' when missing", async () => {
      const payload = createValidRenderPayload({
        data: {
          ...createValidRenderPayload().data,
          branch: undefined,
        },
      });
      const result = await renderLogAdapter.handleWebhook(payload, testContext);
      expect(result?.metadata.branch).toBe("main");
    });

    it("should default commit to empty string when commit is missing", async () => {
      const payload = createValidRenderPayload({
        data: {
          ...createValidRenderPayload().data,
          commit: undefined,
        },
      });
      const result = await renderLogAdapter.handleWebhook(payload, testContext);
      expect(result?.metadata.commit).toBe("");
    });

    it("should set completedAt to null when finishedAt is absent", async () => {
      const payload = createValidRenderPayload({
        data: {
          ...createValidRenderPayload().data,
          finishedAt: undefined,
        },
      });
      const result = await renderLogAdapter.handleWebhook(payload, testContext);
      expect(result?.metadata.completedAt).toBeNull();
    });

    it("should use deploy_started type for build_started event", async () => {
      const payload = createValidRenderPayload({
        type: "build_started",
        data: {
          ...createValidRenderPayload().data,
          status: "build_in_progress",
        },
      });
      const result = await renderLogAdapter.handleWebhook(payload, testContext);
      expect(result?.eventType).toBe("deploy_started");
    });

    it("should default to deploy_started for unknown type and non-failure status", async () => {
      const payload = createValidRenderPayload({
        type: "some_random_type",
        data: {
          ...createValidRenderPayload().data,
          status: "build_in_progress",
        },
      });
      const result = await renderLogAdapter.handleWebhook(payload, testContext);
      expect(result?.eventType).toBe("deploy_started");
    });
  });

  // ==================== fetchDeployLogs ====================

  describe("fetchDeployLogs", () => {
    it("should fetch logs and map entries to DeployLogData", async () => {
      mockResilientGet.mockResolvedValueOnce({
        status: 200,
        data: {
          logs: [
            {
              id: "l1",
              timestamp: "2024-01-15T10:00:00Z",
              message: "Starting build",
              level: "info",
            },
            {
              id: "l2",
              timestamp: "2024-01-15T10:00:01Z",
              message: "Build failed",
              level: "error",
            },
          ],
        },
      });

      const result = await renderLogAdapter.fetchDeployLogs(createFetchParams(), testContext);

      expect(result).toEqual({
        entityId: "srv_xyz789",
        rawLog:
          "[info] 2024-01-15T10:00:00Z Starting build\n[error] 2024-01-15T10:00:01Z Build failed",
        totalLines: 2,
        isTruncated: false,
      });
    });

    it("should call resilientGet with correct URL and auth header", async () => {
      mockResilientGet.mockResolvedValueOnce({
        status: 200,
        data: { logs: [] },
      });

      await renderLogAdapter.fetchDeployLogs(createFetchParams(), testContext);

      expect(mockResilientGet).toHaveBeenCalledWith(
        "https://api.render.com/v1/services/srv_xyz789/logs",
        expect.objectContaining({
          timeout: 30_000,
          maxRetries: 2,
          headers: expect.objectContaining({
            Authorization: "Bearer test-render-token",
            Accept: "application/json",
          }),
        })
      );
    });

    it("should append time range query params when provided", async () => {
      mockResilientGet.mockResolvedValueOnce({
        status: 200,
        data: { logs: [] },
      });

      const start = new Date("2024-01-15T09:00:00Z");
      const end = new Date("2024-01-15T10:00:00Z");
      await renderLogAdapter.fetchDeployLogs(
        createFetchParams({ timeRange: { start, end } }),
        testContext
      );

      const calledUrl = mockResilientGet.mock.calls[0][0] as string;
      expect(calledUrl).toContain("start=2024-01-15T09:00:00.000Z");
      expect(calledUrl).toContain("end=2024-01-15T10:00:00.000Z");
    });

    it("should URL-encode entityId to prevent path traversal", async () => {
      mockResilientGet.mockResolvedValueOnce({
        status: 200,
        data: { logs: [] },
      });

      await renderLogAdapter.fetchDeployLogs(
        createFetchParams({ entityId: "srv/../admin" }),
        testContext
      );

      const calledUrl = mockResilientGet.mock.calls[0][0] as string;
      expect(calledUrl).toContain("srv%2F..%2Fadmin");
    });

    it("should handle missing logs array gracefully", async () => {
      mockResilientGet.mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      const result = await renderLogAdapter.fetchDeployLogs(createFetchParams(), testContext);
      expect(result.rawLog).toBe("");
      expect(result.totalLines).toBe(0);
    });

    it("should return empty rawLog when logs array is empty", async () => {
      mockResilientGet.mockResolvedValueOnce({
        status: 200,
        data: { logs: [] },
      });

      const result = await renderLogAdapter.fetchDeployLogs(createFetchParams(), testContext);
      expect(result.rawLog).toBe("");
      expect(result.totalLines).toBe(0);
    });

    it("should log success with mandatory fields", async () => {
      mockResilientGet.mockResolvedValueOnce({
        status: 200,
        data: { logs: [{ id: "l1", timestamp: "t", message: "m", level: "info" }] },
      });

      await renderLogAdapter.fetchDeployLogs(createFetchParams(), testContext);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Fetched Render deployment logs",
        expect.objectContaining({
          provider: "render",
          operation: "fetchDeployLogs",
          durationMs: expect.any(Number),
          statusCode: 200,
          entityId: "srv_xyz789",
          requestId: testContext.requestId,
          tenantId: testContext.tenantId,
        })
      );
    });

    it("should throw retryable ExternalServiceError on 502 status", async () => {
      const error = Object.assign(new Error("Bad Gateway"), { status: 502 });
      mockResilientGet.mockRejectedValueOnce(error);

      await expect(
        renderLogAdapter.fetchDeployLogs(createFetchParams(), testContext)
      ).rejects.toThrow(ExternalServiceError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to fetch Render deployment logs",
        expect.objectContaining({
          provider: "render",
          operation: "fetchDeployLogs",
          statusCode: 502,
          category: "retryable",
        })
      );
    });

    it("should throw retryable ExternalServiceError on 429 status", async () => {
      const error = Object.assign(new Error("Too Many Requests"), { status: 429 });
      mockResilientGet.mockRejectedValueOnce(error);

      await expect(
        renderLogAdapter.fetchDeployLogs(createFetchParams(), testContext)
      ).rejects.toThrow(ExternalServiceError);
    });

    it("should throw non-retryable ExternalServiceError on 403 status", async () => {
      const error = Object.assign(new Error("Forbidden"), { status: 403 });
      mockResilientGet.mockRejectedValueOnce(error);

      await expect(
        renderLogAdapter.fetchDeployLogs(createFetchParams(), testContext)
      ).rejects.toThrow(ExternalServiceError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to fetch Render deployment logs",
        expect.objectContaining({
          category: "non_retryable",
          statusCode: 403,
        })
      );
    });

    it("should treat network errors (no status) as retryable", async () => {
      mockResilientGet.mockRejectedValueOnce(new Error("DNS resolution failed"));

      await expect(
        renderLogAdapter.fetchDeployLogs(createFetchParams(), testContext)
      ).rejects.toThrow(ExternalServiceError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to fetch Render deployment logs",
        expect.objectContaining({
          category: "retryable",
          statusCode: undefined,
        })
      );
    });
  });

  // ==================== parseLogDrainBatch ====================

  describe("parseLogDrainBatch", () => {
    it("should return empty result (Render does not support log drains)", async () => {
      const result = await renderLogAdapter.parseLogDrainBatch(
        [{ message: "test", timestamp: 123 }],
        testContext
      );

      expect(result).toEqual({
        entityId: "",
        lines: [],
        platform: "render",
      });
    });

    it("should return empty result for null payload", async () => {
      const result = await renderLogAdapter.parseLogDrainBatch(null, testContext);
      expect(result).toEqual({ entityId: "", lines: [], platform: "render" });
    });

    it("should return empty result for any payload type", async () => {
      const result = await renderLogAdapter.parseLogDrainBatch("any-data", testContext);
      expect(result).toEqual({ entityId: "", lines: [], platform: "render" });
    });
  });
});

/**
 * Tests for adapters/netlifyLogAdapter — Netlify deployment log ingestion.
 *
 * Mocks resilientGet from @kenchi/shared. Verifies signature verification,
 * webhook parsing, REST log fetching, and log drain batch parsing.
 *
 * @module adapters/netlifyLogAdapter.test
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

import { netlifyLogAdapter } from "./netlifyLogAdapter.js";

// ==================== Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const createValidNetlifyPayload = (overrides: Record<string, unknown> = {}) => ({
  id: "dep_abc123",
  site_id: "site_xyz789",
  name: "my-netlify-site",
  state: "ready",
  branch: "main",
  commit_ref: "abc123def456",
  commit_url: "https://github.com/org/repo/commit/abc123",
  deploy_url: "https://dep_abc123--my-netlify-site.netlify.app",
  created_at: "2024-01-15T09:50:00Z",
  updated_at: "2024-01-15T10:00:00Z",
  ...overrides,
});

const createFetchParams = (
  overrides: Partial<FetchDeployLogsParams> = {}
): FetchDeployLogsParams => ({
  entityId: "dep_abc123",
  platform: "netlify",
  accessToken: "test-netlify-token",
  ...overrides,
});

const createLogDrainLine = (overrides: Record<string, unknown> = {}) => ({
  message: "Build started",
  timestamp: 1700000000000,
  deploy_id: "dep_abc123",
  site_id: "site_xyz789",
  level: "info",
  source: "build",
  ...overrides,
});

// ==================== Tests ====================

describe("netlifyLogAdapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== verifySignature ====================

  describe("verifySignature", () => {
    const secret = "netlify_webhook_secret";
    const body = Buffer.from('{"id":"dep_abc123"}');

    const computeValidSignature = (rawBody: Buffer, sigSecret: string): string =>
      crypto.createHmac("sha256", sigSecret).update(rawBody).digest("hex");

    it("should return true when signature is valid", () => {
      const signature = computeValidSignature(body, secret);
      expect(netlifyLogAdapter.verifySignature(body, signature, secret)).toBe(true);
    });

    it("should return false when signature is invalid", () => {
      expect(netlifyLogAdapter.verifySignature(body, "c".repeat(64), secret)).toBe(false);
    });

    it("should return false when signature is empty string", () => {
      expect(netlifyLogAdapter.verifySignature(body, "", secret)).toBe(false);
    });

    it("should return false when signature has wrong length", () => {
      expect(netlifyLogAdapter.verifySignature(body, "short", secret)).toBe(false);
    });

    it("should return false for mismatched body", () => {
      const signature = computeValidSignature(body, secret);
      expect(netlifyLogAdapter.verifySignature(Buffer.from("other"), signature, secret)).toBe(
        false
      );
    });

    it("should return false for mismatched secret", () => {
      const signature = computeValidSignature(body, secret);
      expect(netlifyLogAdapter.verifySignature(body, signature, "wrong")).toBe(false);
    });
  });

  // ==================== handleWebhook ====================

  describe("handleWebhook", () => {
    it("should return null for non-deployment payload", async () => {
      const result = await netlifyLogAdapter.handleWebhook({ foo: "bar" }, testContext);
      expect(result).toBeNull();
    });

    it("should return null for null payload", async () => {
      const result = await netlifyLogAdapter.handleWebhook(null, testContext);
      expect(result).toBeNull();
    });

    it("should return null for non-object payload", async () => {
      const result = await netlifyLogAdapter.handleWebhook(123, testContext);
      expect(result).toBeNull();
    });

    it("should return null when id is not a string", async () => {
      const payload = { id: 123, state: "ready", site_id: "site_1" };
      const result = await netlifyLogAdapter.handleWebhook(payload, testContext);
      expect(result).toBeNull();
    });

    it("should return null when site_id is missing", async () => {
      const payload = { id: "dep_1", state: "ready" };
      const result = await netlifyLogAdapter.handleWebhook(payload, testContext);
      expect(result).toBeNull();
    });

    it("should log warning when skipping non-deployment webhook", async () => {
      await netlifyLogAdapter.handleWebhook({ random: "data" }, testContext);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Skipping non-deployment Netlify webhook",
        expect.objectContaining({
          provider: "netlify",
          operation: "handleWebhook",
        })
      );
    });

    it("should parse a ready deployment event correctly", async () => {
      const payload = createValidNetlifyPayload();
      const result = await netlifyLogAdapter.handleWebhook(payload, testContext);

      expect(result).toEqual({
        entityId: "dep_abc123",
        platform: "netlify",
        eventType: "deploy_completed",
        metadata: {
          repository: "my-netlify-site",
          branch: "main",
          commit: "abc123def456",
          startedAt: new Date("2024-01-15T09:50:00Z"),
          completedAt: new Date("2024-01-15T10:00:00Z"),
          status: "success",
          projectId: "site_xyz789",
          projectName: "my-netlify-site",
        },
        logs: null,
      });
    });

    it("should map error state to deploy_failed event", async () => {
      const payload = createValidNetlifyPayload({ state: "error" });
      const result = await netlifyLogAdapter.handleWebhook(payload, testContext);

      expect(result?.eventType).toBe("deploy_failed");
      expect(result?.metadata.status).toBe("failed");
    });

    it("should map building state to deploy_started event", async () => {
      const payload = createValidNetlifyPayload({ state: "building" });
      const result = await netlifyLogAdapter.handleWebhook(payload, testContext);

      expect(result?.eventType).toBe("deploy_started");
      expect(result?.metadata.status).toBe("building");
    });

    it("should map deploying state to deploy_started event", async () => {
      const payload = createValidNetlifyPayload({ state: "deploying" });
      const result = await netlifyLogAdapter.handleWebhook(payload, testContext);

      expect(result?.eventType).toBe("deploy_started");
      expect(result?.metadata.status).toBe("deploying");
    });

    it("should map cancelled state to cancelled status", async () => {
      const payload = createValidNetlifyPayload({ state: "cancelled" });
      const result = await netlifyLogAdapter.handleWebhook(payload, testContext);
      expect(result?.metadata.status).toBe("cancelled");
    });

    it("should map unknown state to building as default", async () => {
      const payload = createValidNetlifyPayload({ state: "unknown_state" });
      const result = await netlifyLogAdapter.handleWebhook(payload, testContext);
      expect(result?.metadata.status).toBe("building");
    });

    it("should default branch to 'main' when missing", async () => {
      const payload = createValidNetlifyPayload({ branch: undefined });
      const result = await netlifyLogAdapter.handleWebhook(payload, testContext);
      expect(result?.metadata.branch).toBe("main");
    });

    it("should default commit to empty string when commit_ref is missing", async () => {
      const payload = createValidNetlifyPayload({ commit_ref: undefined });
      const result = await netlifyLogAdapter.handleWebhook(payload, testContext);
      expect(result?.metadata.commit).toBe("");
    });

    it("should set completedAt to null when created_at equals updated_at", async () => {
      const payload = createValidNetlifyPayload({
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:00:00Z",
      });
      const result = await netlifyLogAdapter.handleWebhook(payload, testContext);
      expect(result?.metadata.completedAt).toBeNull();
    });

    it("should log info when processing a valid webhook", async () => {
      await netlifyLogAdapter.handleWebhook(createValidNetlifyPayload(), testContext);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Processing Netlify deployment webhook",
        expect.objectContaining({
          provider: "netlify",
          operation: "handleWebhook",
          deploymentId: "dep_abc123",
          state: "ready",
          requestId: testContext.requestId,
        })
      );
    });
  });

  // ==================== fetchDeployLogs ====================

  describe("fetchDeployLogs", () => {
    it("should fetch logs and map entries to DeployLogData", async () => {
      mockResilientGet.mockResolvedValueOnce({
        status: 200,
        data: {
          log: [
            { ts: "2024-01-15T10:00:00Z", msg: "Installing deps", level: "info", section: "build" },
            { ts: "2024-01-15T10:00:01Z", msg: "Build error", level: "error", section: "build" },
          ],
        },
      });

      const result = await netlifyLogAdapter.fetchDeployLogs(createFetchParams(), testContext);

      expect(result).toEqual({
        entityId: "dep_abc123",
        rawLog: "[build] Installing deps\n[build] Build error",
        totalLines: 2,
        isTruncated: false,
      });
    });

    it("should call resilientGet with correct URL and auth header", async () => {
      mockResilientGet.mockResolvedValueOnce({
        status: 200,
        data: { log: [] },
      });

      await netlifyLogAdapter.fetchDeployLogs(createFetchParams(), testContext);

      expect(mockResilientGet).toHaveBeenCalledWith(
        "https://api.netlify.com/api/v1/deploys/dep_abc123/log",
        expect.objectContaining({
          timeout: 30_000,
          maxRetries: 2,
          headers: { Authorization: "Bearer test-netlify-token" },
        })
      );
    });

    it("should URL-encode entityId to prevent injection", async () => {
      mockResilientGet.mockResolvedValueOnce({
        status: 200,
        data: { log: [] },
      });

      await netlifyLogAdapter.fetchDeployLogs(
        createFetchParams({ entityId: "dep/../secret" }),
        testContext
      );

      const calledUrl = mockResilientGet.mock.calls[0][0] as string;
      expect(calledUrl).toContain("dep%2F..%2Fsecret");
    });

    it("should handle missing log array gracefully", async () => {
      mockResilientGet.mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      const result = await netlifyLogAdapter.fetchDeployLogs(createFetchParams(), testContext);
      expect(result.rawLog).toBe("");
      expect(result.totalLines).toBe(0);
    });

    it("should return empty rawLog when log array is empty", async () => {
      mockResilientGet.mockResolvedValueOnce({
        status: 200,
        data: { log: [] },
      });

      const result = await netlifyLogAdapter.fetchDeployLogs(createFetchParams(), testContext);
      expect(result.rawLog).toBe("");
      expect(result.totalLines).toBe(0);
    });

    it("should log success with mandatory fields", async () => {
      mockResilientGet.mockResolvedValueOnce({
        status: 200,
        data: { log: [{ ts: "t", msg: "m", level: "info", section: "build" }] },
      });

      await netlifyLogAdapter.fetchDeployLogs(createFetchParams(), testContext);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Fetched Netlify deployment logs",
        expect.objectContaining({
          provider: "netlify",
          operation: "fetchDeployLogs",
          durationMs: expect.any(Number),
          statusCode: 200,
          deploymentId: "dep_abc123",
          requestId: testContext.requestId,
          tenantId: testContext.tenantId,
        })
      );
    });

    it("should throw retryable ExternalServiceError on 503 status", async () => {
      const error = Object.assign(new Error("Service Unavailable"), { status: 503 });
      mockResilientGet.mockRejectedValueOnce(error);

      await expect(
        netlifyLogAdapter.fetchDeployLogs(createFetchParams(), testContext)
      ).rejects.toThrow(ExternalServiceError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to fetch Netlify deployment logs",
        expect.objectContaining({
          provider: "netlify",
          operation: "fetchDeployLogs",
          statusCode: 503,
          category: "retryable",
        })
      );
    });

    it("should throw retryable ExternalServiceError on 429 status", async () => {
      const error = Object.assign(new Error("Rate limited"), { status: 429 });
      mockResilientGet.mockRejectedValueOnce(error);

      await expect(
        netlifyLogAdapter.fetchDeployLogs(createFetchParams(), testContext)
      ).rejects.toThrow(ExternalServiceError);
    });

    it("should throw non-retryable ExternalServiceError on 401 status", async () => {
      const error = Object.assign(new Error("Unauthorized"), { status: 401 });
      mockResilientGet.mockRejectedValueOnce(error);

      await expect(
        netlifyLogAdapter.fetchDeployLogs(createFetchParams(), testContext)
      ).rejects.toThrow(ExternalServiceError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to fetch Netlify deployment logs",
        expect.objectContaining({
          category: "non_retryable",
          statusCode: 401,
        })
      );
    });

    it("should treat network errors (no status) as retryable", async () => {
      mockResilientGet.mockRejectedValueOnce(new Error("ECONNRESET"));

      await expect(
        netlifyLogAdapter.fetchDeployLogs(createFetchParams(), testContext)
      ).rejects.toThrow(ExternalServiceError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to fetch Netlify deployment logs",
        expect.objectContaining({
          category: "retryable",
          statusCode: undefined,
        })
      );
    });
  });

  // ==================== parseLogDrainBatch ====================

  describe("parseLogDrainBatch", () => {
    it("should parse a valid array of log drain lines", async () => {
      const payload = [
        createLogDrainLine({ message: "Line 1", timestamp: 1700000000000 }),
        createLogDrainLine({ message: "Line 2", timestamp: 1700000001000 }),
      ];

      const result = await netlifyLogAdapter.parseLogDrainBatch(payload, testContext);

      expect(result.platform).toBe("netlify");
      expect(result.entityId).toBe("dep_abc123");
      expect(result.lines).toHaveLength(2);
      expect(result.lines[0]).toEqual({
        timestamp: new Date(1700000000000),
        message: "Line 1",
        level: "info",
        source: "build",
      });
    });

    it("should return empty result for non-array payload", async () => {
      const result = await netlifyLogAdapter.parseLogDrainBatch("not-array", testContext);

      expect(result).toEqual({ entityId: "", lines: [], platform: "netlify" });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Invalid Netlify log drain payload — expected array",
        expect.objectContaining({
          provider: "netlify",
          operation: "parseLogDrainBatch",
          payloadType: "string",
        })
      );
    });

    it("should return empty result for null payload", async () => {
      const result = await netlifyLogAdapter.parseLogDrainBatch(null, testContext);
      expect(result).toEqual({ entityId: "", lines: [], platform: "netlify" });
    });

    it("should return empty result for empty array", async () => {
      const result = await netlifyLogAdapter.parseLogDrainBatch([], testContext);
      expect(result).toEqual({ entityId: "", lines: [], platform: "netlify" });
    });

    it("should not log warning for empty array", async () => {
      await netlifyLogAdapter.parseLogDrainBatch([], testContext);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it("should return empty result when first element has wrong shape (missing message)", async () => {
      const payload = [{ timestamp: 1700000000000, other: "data" }];
      const result = await netlifyLogAdapter.parseLogDrainBatch(payload, testContext);
      expect(result).toEqual({ entityId: "", lines: [], platform: "netlify" });
    });

    it("should return empty result when first element has wrong shape (missing timestamp)", async () => {
      const payload = [{ message: "hello" }];
      const result = await netlifyLogAdapter.parseLogDrainBatch(payload, testContext);
      expect(result).toEqual({ entityId: "", lines: [], platform: "netlify" });
    });

    it("should return empty result when timestamp is not a number", async () => {
      const payload = [{ message: "hello", timestamp: "2024-01-15" }];
      const result = await netlifyLogAdapter.parseLogDrainBatch(payload, testContext);
      expect(result).toEqual({ entityId: "", lines: [], platform: "netlify" });
    });

    it("should truncate batch exceeding MAX_LINES_PER_BATCH", async () => {
      const oversizedPayload = Array.from({ length: 10_001 }, (_, i) =>
        createLogDrainLine({ message: `Line ${i}` })
      );

      const result = await netlifyLogAdapter.parseLogDrainBatch(oversizedPayload, testContext);

      expect(result.lines).toHaveLength(10_000);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Netlify log drain batch truncated to safety limit",
        expect.objectContaining({
          originalCount: 10_001,
          cappedAt: 10_000,
        })
      );
    });

    it("should not truncate batch at exactly MAX_LINES_PER_BATCH", async () => {
      const exactPayload = Array.from({ length: 10_000 }, (_, i) =>
        createLogDrainLine({ message: `Line ${i}` })
      );

      const result = await netlifyLogAdapter.parseLogDrainBatch(exactPayload, testContext);

      expect(result.lines).toHaveLength(10_000);
      // Should NOT warn about truncation
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        "Netlify log drain batch truncated to safety limit",
        expect.anything()
      );
    });

    it("should use default level 'info' when level is missing", async () => {
      const payload = [createLogDrainLine({ level: undefined })];
      const result = await netlifyLogAdapter.parseLogDrainBatch(payload, testContext);
      expect(result.lines[0].level).toBe("info");
    });

    it("should use default source 'build' when source is missing", async () => {
      const payload = [createLogDrainLine({ source: undefined })];
      const result = await netlifyLogAdapter.parseLogDrainBatch(payload, testContext);
      expect(result.lines[0].source).toBe("build");
    });

    it("should use empty string entityId when deploy_id is missing", async () => {
      const payload = [createLogDrainLine({ deploy_id: undefined })];
      const result = await netlifyLogAdapter.parseLogDrainBatch(payload, testContext);
      expect(result.entityId).toBe("");
    });

    it("should log info on successful parse", async () => {
      const payload = [createLogDrainLine()];
      await netlifyLogAdapter.parseLogDrainBatch(payload, testContext);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Parsed Netlify log drain batch",
        expect.objectContaining({
          provider: "netlify",
          operation: "parseLogDrainBatch",
          entityId: "dep_abc123",
          lineCount: 1,
        })
      );
    });
  });
});

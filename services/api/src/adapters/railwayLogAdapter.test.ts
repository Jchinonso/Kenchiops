/**
 * Tests for adapters/railwayLogAdapter — Railway deployment log ingestion.
 *
 * Mocks resilientPost from @kenchi/shared and the railwayStreamingAdapter.
 * Verifies signature verification, webhook parsing, GraphQL log fetching,
 * and empty log drain batch (unsupported in Phase 1).
 *
 * @module adapters/railwayLogAdapter.test
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

const mockResilientPost = jest.fn();
const mockSubscribeToRailwayLogs = jest.fn();

jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual<typeof import("@kenchi/shared")>("@kenchi/shared");
  return {
    ...actual,
    createLogger: () => mockLogger,
    resilientPost: (...args: unknown[]) => mockResilientPost(...args),
  };
});

jest.mock("./railwayStreamingAdapter.js", () => ({
  subscribeToRailwayLogs: (...args: unknown[]) => mockSubscribeToRailwayLogs(...args),
}));

import { railwayLogAdapter } from "./railwayLogAdapter.js";

// ==================== Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const createValidRailwayPayload = (overrides: Record<string, unknown> = {}) => ({
  type: "DEPLOY_COMPLETED",
  timestamp: "2024-01-15T10:00:00Z",
  project: {
    id: "proj_abc123",
    name: "my-railway-app",
  },
  environment: {
    id: "env_prod",
    name: "production",
  },
  deployment: {
    id: "deploy_xyz789",
    status: "SUCCESS",
    meta: {
      repo: "org/my-railway-app",
      branch: "main",
      commitSha: "def456abc789",
    },
    createdAt: "2024-01-15T09:50:00Z",
    updatedAt: "2024-01-15T10:00:00Z",
  },
  ...overrides,
});

const createFetchParams = (
  overrides: Partial<FetchDeployLogsParams> = {}
): FetchDeployLogsParams => ({
  entityId: "deploy_xyz789",
  platform: "railway",
  accessToken: "test-railway-token",
  ...overrides,
});

// ==================== Tests ====================

describe("railwayLogAdapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== verifySignature ====================

  describe("verifySignature", () => {
    const secret = "railway_webhook_secret";
    const body = Buffer.from('{"type":"DEPLOY_COMPLETED"}');

    const computeValidSignature = (rawBody: Buffer, sigSecret: string): string =>
      crypto.createHmac("sha256", sigSecret).update(rawBody).digest("hex");

    it("should return true when signature is valid", () => {
      const signature = computeValidSignature(body, secret);
      expect(railwayLogAdapter.verifySignature(body, signature, secret)).toBe(true);
    });

    it("should return false when signature is invalid", () => {
      expect(railwayLogAdapter.verifySignature(body, "a".repeat(64), secret)).toBe(false);
    });

    it("should return false when signature is empty string", () => {
      expect(railwayLogAdapter.verifySignature(body, "", secret)).toBe(false);
    });

    it("should return false when signature has wrong length", () => {
      expect(railwayLogAdapter.verifySignature(body, "ab", secret)).toBe(false);
    });

    it("should return false for different body with same signature", () => {
      const signature = computeValidSignature(body, secret);
      const differentBody = Buffer.from('{"type":"DEPLOY_FAILED"}');
      expect(railwayLogAdapter.verifySignature(differentBody, signature, secret)).toBe(false);
    });

    it("should return false for different secret", () => {
      const signature = computeValidSignature(body, secret);
      expect(railwayLogAdapter.verifySignature(body, signature, "wrong-secret")).toBe(false);
    });
  });

  // ==================== handleWebhook ====================

  describe("handleWebhook", () => {
    it("should return null for non-deployment payload", async () => {
      const result = await railwayLogAdapter.handleWebhook({ type: "OTHER" }, testContext);
      expect(result).toBeNull();
    });

    it("should return null for null payload", async () => {
      const result = await railwayLogAdapter.handleWebhook(null, testContext);
      expect(result).toBeNull();
    });

    it("should return null for non-object payload", async () => {
      const result = await railwayLogAdapter.handleWebhook(42, testContext);
      expect(result).toBeNull();
    });

    it("should return null when deployment.id is missing", async () => {
      const payload = {
        type: "DEPLOY_COMPLETED",
        deployment: { status: "SUCCESS" },
      };
      const result = await railwayLogAdapter.handleWebhook(payload, testContext);
      expect(result).toBeNull();
    });

    it("should log warning when skipping non-deployment webhook", async () => {
      await railwayLogAdapter.handleWebhook({ random: "data" }, testContext);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Skipping non-deployment Railway webhook",
        expect.objectContaining({
          provider: "railway",
          operation: "handleWebhook",
        })
      );
    });

    it("should parse DEPLOY_COMPLETED event correctly", async () => {
      const payload = createValidRailwayPayload();
      const result = await railwayLogAdapter.handleWebhook(payload, testContext);

      expect(result).toEqual({
        entityId: "deploy_xyz789",
        platform: "railway",
        eventType: "deploy_completed",
        metadata: {
          repository: "org/my-railway-app",
          branch: "main",
          commit: "def456abc789",
          startedAt: new Date("2024-01-15T09:50:00Z"),
          completedAt: new Date("2024-01-15T10:00:00Z"),
          status: "success",
          projectId: "proj_abc123",
          projectName: "my-railway-app",
        },
        logs: null,
      });
    });

    it("should map DEPLOY_FAILED to deploy_failed event", async () => {
      const payload = createValidRailwayPayload({
        type: "DEPLOY_FAILED",
        deployment: {
          ...createValidRailwayPayload().deployment,
          status: "FAILED",
        },
      });
      const result = await railwayLogAdapter.handleWebhook(payload, testContext);

      expect(result?.eventType).toBe("deploy_failed");
      expect(result?.metadata.status).toBe("failed");
    });

    it("should map DEPLOY_CRASHED to deploy_failed event", async () => {
      const payload = createValidRailwayPayload({
        type: "DEPLOY_CRASHED",
        deployment: {
          ...createValidRailwayPayload().deployment,
          status: "CRASHED",
        },
      });
      const result = await railwayLogAdapter.handleWebhook(payload, testContext);

      expect(result?.eventType).toBe("deploy_failed");
      expect(result?.metadata.status).toBe("failed");
    });

    it("should map DEPLOY_SUCCESS to deploy_completed event", async () => {
      const payload = createValidRailwayPayload({ type: "DEPLOY_SUCCESS" });
      const result = await railwayLogAdapter.handleWebhook(payload, testContext);
      expect(result?.eventType).toBe("deploy_completed");
    });

    it("should map unknown type to deploy_started", async () => {
      const payload = createValidRailwayPayload({ type: "DEPLOY_QUEUED" });
      const result = await railwayLogAdapter.handleWebhook(payload, testContext);
      expect(result?.eventType).toBe("deploy_started");
    });

    it("should fall back to project name when meta.repo is absent", async () => {
      const payload = createValidRailwayPayload({
        deployment: {
          ...createValidRailwayPayload().deployment,
          meta: undefined,
        },
      });
      const result = await railwayLogAdapter.handleWebhook(payload, testContext);
      expect(result?.metadata.repository).toBe("my-railway-app");
    });

    it("should default branch to 'main' when meta.branch is absent", async () => {
      const payload = createValidRailwayPayload({
        deployment: {
          ...createValidRailwayPayload().deployment,
          meta: { repo: "org/app" },
        },
      });
      const result = await railwayLogAdapter.handleWebhook(payload, testContext);
      expect(result?.metadata.branch).toBe("main");
    });

    it("should set completedAt to null when createdAt equals updatedAt", async () => {
      const payload = createValidRailwayPayload({
        deployment: {
          ...createValidRailwayPayload().deployment,
          createdAt: "2024-01-15T10:00:00Z",
          updatedAt: "2024-01-15T10:00:00Z",
        },
      });
      const result = await railwayLogAdapter.handleWebhook(payload, testContext);
      expect(result?.metadata.completedAt).toBeNull();
    });

    it("should map REMOVED status to cancelled", async () => {
      const payload = createValidRailwayPayload({
        deployment: {
          ...createValidRailwayPayload().deployment,
          status: "REMOVED",
        },
      });
      const result = await railwayLogAdapter.handleWebhook(payload, testContext);
      expect(result?.metadata.status).toBe("cancelled");
    });

    it("should map unknown status to building as default", async () => {
      const payload = createValidRailwayPayload({
        deployment: {
          ...createValidRailwayPayload().deployment,
          status: "UNKNOWN_STATE",
        },
      });
      const result = await railwayLogAdapter.handleWebhook(payload, testContext);
      expect(result?.metadata.status).toBe("building");
    });
  });

  // ==================== fetchDeployLogs ====================

  describe("fetchDeployLogs", () => {
    it("should fetch logs via GraphQL and format entries", async () => {
      mockResilientPost.mockResolvedValueOnce({
        status: 200,
        data: {
          data: {
            deploymentLogs: [
              { timestamp: "2024-01-15T10:00:00Z", message: "Installing deps", severity: "info" },
              { timestamp: "2024-01-15T10:00:01Z", message: "Build failed", severity: "error" },
            ],
          },
        },
      });

      const result = await railwayLogAdapter.fetchDeployLogs(createFetchParams(), testContext);

      expect(result).toEqual({
        entityId: "deploy_xyz789",
        rawLog: "[info] Installing deps\n[error] Build failed",
        totalLines: 2,
        isTruncated: false,
      });
    });

    it("should call resilientPost with correct GraphQL query and auth", async () => {
      mockResilientPost.mockResolvedValueOnce({
        status: 200,
        data: { data: { deploymentLogs: [] } },
      });

      await railwayLogAdapter.fetchDeployLogs(createFetchParams(), testContext);

      expect(mockResilientPost).toHaveBeenCalledWith(
        "https://backboard.railway.app/graphql/v2",
        expect.objectContaining({
          query: expect.stringContaining("deploymentLogs"),
          variables: { deploymentId: "deploy_xyz789" },
        }),
        expect.objectContaining({
          timeout: 30_000,
          maxRetries: 2,
          headers: expect.objectContaining({
            Authorization: "Bearer test-railway-token",
            "Content-Type": "application/json",
          }),
        })
      );
    });

    it("should handle null deploymentLogs gracefully", async () => {
      mockResilientPost.mockResolvedValueOnce({
        status: 200,
        data: { data: { deploymentLogs: null } },
      });

      const result = await railwayLogAdapter.fetchDeployLogs(createFetchParams(), testContext);
      expect(result.rawLog).toBe("");
      expect(result.totalLines).toBe(0);
    });

    it("should handle missing data envelope gracefully", async () => {
      mockResilientPost.mockResolvedValueOnce({
        status: 200,
        data: { data: null },
      });

      const result = await railwayLogAdapter.fetchDeployLogs(createFetchParams(), testContext);
      expect(result.rawLog).toBe("");
      expect(result.totalLines).toBe(0);
    });

    it("should log success with mandatory fields", async () => {
      mockResilientPost.mockResolvedValueOnce({
        status: 200,
        data: { data: { deploymentLogs: [{ timestamp: "t", message: "m", severity: "info" }] } },
      });

      await railwayLogAdapter.fetchDeployLogs(createFetchParams(), testContext);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Fetched Railway deployment logs",
        expect.objectContaining({
          provider: "railway",
          operation: "fetchDeployLogs",
          durationMs: expect.any(Number),
          statusCode: 200,
          deploymentId: "deploy_xyz789",
          requestId: testContext.requestId,
          tenantId: testContext.tenantId,
        })
      );
    });

    it("should throw retryable ExternalServiceError on 500 status", async () => {
      const error = Object.assign(new Error("Internal Server Error"), { status: 500 });
      mockResilientPost.mockRejectedValueOnce(error);

      await expect(
        railwayLogAdapter.fetchDeployLogs(createFetchParams(), testContext)
      ).rejects.toThrow(ExternalServiceError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to fetch Railway deployment logs",
        expect.objectContaining({
          provider: "railway",
          operation: "fetchDeployLogs",
          statusCode: 500,
          category: "retryable",
        })
      );
    });

    it("should throw retryable ExternalServiceError on 429 status", async () => {
      const error = Object.assign(new Error("Rate limited"), { status: 429 });
      mockResilientPost.mockRejectedValueOnce(error);

      await expect(
        railwayLogAdapter.fetchDeployLogs(createFetchParams(), testContext)
      ).rejects.toThrow(ExternalServiceError);
    });

    it("should throw non-retryable ExternalServiceError on 400 status", async () => {
      const error = Object.assign(new Error("Bad Request"), { status: 400 });
      mockResilientPost.mockRejectedValueOnce(error);

      await expect(
        railwayLogAdapter.fetchDeployLogs(createFetchParams(), testContext)
      ).rejects.toThrow(ExternalServiceError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to fetch Railway deployment logs",
        expect.objectContaining({
          category: "non_retryable",
          statusCode: 400,
        })
      );
    });

    it("should treat network errors (no status) as retryable", async () => {
      mockResilientPost.mockRejectedValueOnce(new Error("ETIMEDOUT"));

      await expect(
        railwayLogAdapter.fetchDeployLogs(createFetchParams(), testContext)
      ).rejects.toThrow(ExternalServiceError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to fetch Railway deployment logs",
        expect.objectContaining({
          category: "retryable",
          statusCode: undefined,
        })
      );
    });
  });

  // ==================== parseLogDrainBatch ====================

  describe("parseLogDrainBatch", () => {
    it("should return empty result (Railway does not support log drains)", async () => {
      const result = await railwayLogAdapter.parseLogDrainBatch(
        [{ message: "test", timestamp: 123 }],
        testContext
      );

      expect(result).toEqual({
        entityId: "",
        lines: [],
        platform: "railway",
      });
    });

    it("should return empty result regardless of payload shape", async () => {
      const result = await railwayLogAdapter.parseLogDrainBatch(null, testContext);
      expect(result).toEqual({ entityId: "", lines: [], platform: "railway" });
    });
  });

  // ==================== subscribe ====================

  describe("subscribe", () => {
    it("should delegate to subscribeToRailwayLogs", async () => {
      const mockClose = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      mockSubscribeToRailwayLogs.mockResolvedValueOnce({ close: mockClose });

      const onLine = jest.fn();
      const handle = await railwayLogAdapter.subscribe!("deploy_123", onLine, testContext);

      expect(mockSubscribeToRailwayLogs).toHaveBeenCalledWith(
        { deploymentId: "deploy_123", apiToken: "" },
        onLine,
        testContext
      );
      expect(handle.close).toBeDefined();
    });
  });
});

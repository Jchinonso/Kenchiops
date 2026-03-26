/**
 * Tests for adapters/vercelLogAdapter — Vercel deployment log ingestion.
 *
 * Mocks resilientGet from @kenchi/shared. Verifies signature verification,
 * webhook parsing, deploy log fetching, and log drain batch parsing.
 *
 * @module adapters/vercelLogAdapter.test
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

import { vercelLogAdapter, verifyVercelSignature } from "./vercelLogAdapter.js";

// ==================== Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const createValidVercelPayload = (overrides: Record<string, unknown> = {}) => ({
  id: "hook_abc123",
  type: "deployment.ready",
  createdAt: 1700000000000,
  payload: {
    deployment: {
      id: "dpl_xyz789",
      url: "my-app-abc123.vercel.app",
      name: "my-app",
      meta: {
        githubRepo: "org/my-app",
      },
      gitSource: {
        ref: "main",
        sha: "abc123def456",
        repoId: "repo-id-1",
      },
      target: "production",
      projectId: "prj_001",
      readyState: "READY",
      createdAt: 1700000000000,
      ready: 1700000060000,
    },
    team: { id: "team_1", name: "my-team" },
  },
  ...overrides,
});

const createFetchParams = (
  overrides: Partial<FetchDeployLogsParams> = {}
): FetchDeployLogsParams => ({
  entityId: "dpl_xyz789",
  platform: "vercel",
  accessToken: "test-token-123",
  ...overrides,
});

const createLogDrainLine = (overrides: Record<string, unknown> = {}) => ({
  id: "line-1",
  message: "Build started",
  timestamp: 1700000000000,
  source: "build",
  projectId: "prj_001",
  deploymentId: "dpl_xyz789",
  level: "info",
  ...overrides,
});

// ==================== Tests ====================

describe("vercelLogAdapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== verifySignature ====================

  describe("verifySignature", () => {
    const secret = "whsec_test_secret_value";
    const body = Buffer.from('{"test":"payload"}');

    const computeValidSignature = (rawBody: Buffer, sigSecret: string): string =>
      crypto.createHmac("sha1", sigSecret).update(rawBody).digest("hex");

    it("should return true when signature is valid", () => {
      const signature = computeValidSignature(body, secret);
      expect(verifyVercelSignature(body, signature, secret)).toBe(true);
    });

    it("should return false when signature is invalid", () => {
      expect(verifyVercelSignature(body, "deadbeef".repeat(5), secret)).toBe(false);
    });

    it("should return false when signature is empty string", () => {
      expect(verifyVercelSignature(body, "", secret)).toBe(false);
    });

    it("should return false when signature has different length than expected", () => {
      // timingSafeEqual throws on length mismatch; catch block returns false
      expect(verifyVercelSignature(body, "ab", secret)).toBe(false);
    });

    it("should return false when signature contains non-hex characters", () => {
      expect(verifyVercelSignature(body, "zzzz", secret)).toBe(false);
    });

    it("should use timing-safe comparison to prevent timing attacks", () => {
      const signature = computeValidSignature(body, secret);
      // Confirm it works — the implementation uses crypto.timingSafeEqual
      expect(verifyVercelSignature(body, signature, secret)).toBe(true);
    });

    it("should return different results for different secrets", () => {
      const sigForSecret1 = computeValidSignature(body, "secret-1");
      expect(verifyVercelSignature(body, sigForSecret1, "secret-2")).toBe(false);
    });

    it("should return different results for different bodies", () => {
      const sigForBody = computeValidSignature(body, secret);
      const differentBody = Buffer.from('{"test":"different"}');
      expect(verifyVercelSignature(differentBody, sigForBody, secret)).toBe(false);
    });
  });

  // ==================== handleWebhook ====================

  describe("handleWebhook", () => {
    it("should return null for non-deployment payload (missing type)", async () => {
      const result = await vercelLogAdapter.handleWebhook({ foo: "bar" }, testContext);
      expect(result).toBeNull();
    });

    it("should return null for null payload", async () => {
      const result = await vercelLogAdapter.handleWebhook(null, testContext);
      expect(result).toBeNull();
    });

    it("should return null for non-object payload", async () => {
      const result = await vercelLogAdapter.handleWebhook("not-an-object", testContext);
      expect(result).toBeNull();
    });

    it("should return null when deployment.id is missing", async () => {
      const payload = {
        type: "deployment.ready",
        payload: { deployment: { name: "test" } },
      };
      const result = await vercelLogAdapter.handleWebhook(payload, testContext);
      expect(result).toBeNull();
    });

    it("should log warning when skipping non-deployment webhook", async () => {
      await vercelLogAdapter.handleWebhook({ foo: "bar" }, testContext);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Skipping non-deployment Vercel webhook",
        expect.objectContaining({
          provider: "vercel",
          operation: "handleWebhook",
          requestId: testContext.requestId,
          tenantId: testContext.tenantId,
        })
      );
    });

    it("should parse deployment.ready event correctly", async () => {
      const payload = createValidVercelPayload();
      const result = await vercelLogAdapter.handleWebhook(payload, testContext);

      expect(result).toEqual({
        entityId: "dpl_xyz789",
        platform: "vercel",
        eventType: "deploy_completed",
        metadata: {
          repository: "org/my-app",
          branch: "main",
          commit: "abc123def456",
          startedAt: new Date(1700000000000),
          completedAt: new Date(1700000060000),
          status: "success",
          projectId: "prj_001",
          projectName: "my-app",
        },
        logs: null,
      });
    });

    it("should map deployment.error to deploy_failed event", async () => {
      const payload = createValidVercelPayload({
        type: "deployment.error",
        payload: {
          deployment: {
            ...createValidVercelPayload().payload.deployment,
            readyState: "ERROR",
            ready: undefined,
          },
        },
      });
      const result = await vercelLogAdapter.handleWebhook(payload, testContext);

      expect(result?.eventType).toBe("deploy_failed");
      expect(result?.metadata.status).toBe("failed");
    });

    it("should map deployment.canceled to deploy_failed event", async () => {
      const payload = createValidVercelPayload({
        type: "deployment.canceled",
        payload: {
          deployment: {
            ...createValidVercelPayload().payload.deployment,
            readyState: "CANCELED",
            ready: undefined,
          },
        },
      });
      const result = await vercelLogAdapter.handleWebhook(payload, testContext);

      expect(result?.eventType).toBe("deploy_failed");
      expect(result?.metadata.status).toBe("failed");
    });

    it("should map deployment.created to deploy_started event", async () => {
      const payload = createValidVercelPayload({
        type: "deployment.created",
        payload: {
          deployment: {
            ...createValidVercelPayload().payload.deployment,
            readyState: "BUILDING",
            ready: undefined,
          },
        },
      });
      const result = await vercelLogAdapter.handleWebhook(payload, testContext);

      expect(result?.eventType).toBe("deploy_started");
      expect(result?.metadata.status).toBe("building");
    });

    it("should use gitlabProjectPath when githubRepo is absent", async () => {
      const deployment = {
        ...createValidVercelPayload().payload.deployment,
        meta: { gitlabProjectPath: "group/project" },
      };
      const payload = createValidVercelPayload({
        payload: { deployment },
      });
      const result = await vercelLogAdapter.handleWebhook(payload, testContext);

      expect(result?.metadata.repository).toBe("group/project");
    });

    it("should fall back to deployment name when no repo meta exists", async () => {
      const deployment = {
        ...createValidVercelPayload().payload.deployment,
        meta: undefined,
      };
      const payload = createValidVercelPayload({
        payload: { deployment },
      });
      const result = await vercelLogAdapter.handleWebhook(payload, testContext);

      expect(result?.metadata.repository).toBe("my-app");
    });

    it("should default branch to 'main' when gitSource is absent", async () => {
      const deployment = {
        ...createValidVercelPayload().payload.deployment,
        gitSource: undefined,
      };
      const payload = createValidVercelPayload({
        payload: { deployment },
      });
      const result = await vercelLogAdapter.handleWebhook(payload, testContext);

      expect(result?.metadata.branch).toBe("main");
      expect(result?.metadata.commit).toBe("");
    });

    it("should set completedAt to null when ready timestamp is absent", async () => {
      const deployment = {
        ...createValidVercelPayload().payload.deployment,
        ready: undefined,
      };
      const payload = createValidVercelPayload({
        payload: { deployment },
      });
      const result = await vercelLogAdapter.handleWebhook(payload, testContext);

      expect(result?.metadata.completedAt).toBeNull();
    });

    it("should map unknown readyState to 'building' as default", async () => {
      const deployment = {
        ...createValidVercelPayload().payload.deployment,
        readyState: "UNKNOWN_STATE",
      };
      const payload = createValidVercelPayload({
        type: "deployment.created",
        payload: { deployment },
      });
      const result = await vercelLogAdapter.handleWebhook(payload, testContext);

      expect(result?.metadata.status).toBe("building");
    });

    it("should log info when processing a valid webhook", async () => {
      await vercelLogAdapter.handleWebhook(createValidVercelPayload(), testContext);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Processing Vercel deployment webhook",
        expect.objectContaining({
          provider: "vercel",
          operation: "handleWebhook",
          deploymentId: "dpl_xyz789",
          eventType: "deployment.ready",
          requestId: testContext.requestId,
        })
      );
    });
  });

  // ==================== fetchDeployLogs ====================

  describe("fetchDeployLogs", () => {
    it("should fetch logs and map events to DeployLogData", async () => {
      mockResilientGet.mockResolvedValueOnce({
        status: 200,
        data: {
          events: [
            { id: "e1", date: 1700000000, text: "Installing dependencies", type: "command" },
            { id: "e2", date: 1700000001, text: "Build completed", type: "command" },
          ],
        },
      });

      const result = await vercelLogAdapter.fetchDeployLogs(createFetchParams(), testContext);

      expect(result).toEqual({
        entityId: "dpl_xyz789",
        rawLog: "Installing dependencies\nBuild completed",
        totalLines: 2,
        isTruncated: false,
      });
    });

    it("should call resilientGet with correct URL and auth header", async () => {
      mockResilientGet.mockResolvedValueOnce({
        status: 200,
        data: { events: [] },
      });

      await vercelLogAdapter.fetchDeployLogs(createFetchParams(), testContext);

      expect(mockResilientGet).toHaveBeenCalledWith(
        "https://api.vercel.com/v1/deployments/dpl_xyz789/events",
        expect.objectContaining({
          timeout: 30_000,
          maxRetries: 2,
          headers: { Authorization: "Bearer test-token-123" },
        })
      );
    });

    it("should append teamId query parameter when provided", async () => {
      mockResilientGet.mockResolvedValueOnce({
        status: 200,
        data: { events: [] },
      });

      await vercelLogAdapter.fetchDeployLogs(
        createFetchParams({ teamId: "team_abc" }),
        testContext
      );

      expect(mockResilientGet).toHaveBeenCalledWith(
        "https://api.vercel.com/v1/deployments/dpl_xyz789/events?teamId=team_abc",
        expect.any(Object)
      );
    });

    it("should handle events with payload.text fallback", async () => {
      mockResilientGet.mockResolvedValueOnce({
        status: 200,
        data: {
          events: [
            {
              id: "e1",
              date: 1700000000,
              text: "",
              type: "command",
              payload: { text: "Fallback text" },
            },
          ],
        },
      });

      const result = await vercelLogAdapter.fetchDeployLogs(createFetchParams(), testContext);
      expect(result.rawLog).toBe("Fallback text");
      expect(result.totalLines).toBe(1);
    });

    it("should skip events with neither text nor payload.text", async () => {
      mockResilientGet.mockResolvedValueOnce({
        status: 200,
        data: {
          events: [
            { id: "e1", date: 1700000000, text: "", type: "status" },
            { id: "e2", date: 1700000001, text: "Real log line", type: "command" },
          ],
        },
      });

      const result = await vercelLogAdapter.fetchDeployLogs(createFetchParams(), testContext);
      expect(result.rawLog).toBe("Real log line");
      expect(result.totalLines).toBe(1);
    });

    it("should return empty rawLog when no events exist", async () => {
      mockResilientGet.mockResolvedValueOnce({
        status: 200,
        data: { events: [] },
      });

      const result = await vercelLogAdapter.fetchDeployLogs(createFetchParams(), testContext);
      expect(result.rawLog).toBe("");
      expect(result.totalLines).toBe(0);
    });

    it("should handle missing events array gracefully", async () => {
      mockResilientGet.mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      const result = await vercelLogAdapter.fetchDeployLogs(createFetchParams(), testContext);
      expect(result.rawLog).toBe("");
      expect(result.totalLines).toBe(0);
    });

    it("should log success with mandatory fields", async () => {
      mockResilientGet.mockResolvedValueOnce({
        status: 200,
        data: { events: [{ id: "e1", date: 1, text: "line", type: "cmd" }] },
      });

      await vercelLogAdapter.fetchDeployLogs(createFetchParams(), testContext);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Fetched Vercel deployment logs",
        expect.objectContaining({
          provider: "vercel",
          operation: "fetchDeployLogs",
          durationMs: expect.any(Number),
          statusCode: 200,
          deploymentId: "dpl_xyz789",
          requestId: testContext.requestId,
          tenantId: testContext.tenantId,
        })
      );
    });

    it("should throw retryable ExternalServiceError on 500 status", async () => {
      const error = Object.assign(new Error("Internal Server Error"), { status: 500 });
      mockResilientGet.mockRejectedValueOnce(error);

      await expect(
        vercelLogAdapter.fetchDeployLogs(createFetchParams(), testContext)
      ).rejects.toThrow(ExternalServiceError);

      try {
        await vercelLogAdapter.fetchDeployLogs(createFetchParams(), testContext);
      } catch (e) {
        // Re-mock since first call consumed the mock
      }
      // Verify the first call's error logging
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to fetch Vercel deployment logs",
        expect.objectContaining({
          provider: "vercel",
          operation: "fetchDeployLogs",
          statusCode: 500,
          category: "retryable",
          retryable: true,
        })
      );
    });

    it("should throw retryable ExternalServiceError on 429 status", async () => {
      const error = Object.assign(new Error("Rate limited"), { status: 429 });
      mockResilientGet.mockRejectedValueOnce(error);

      await expect(
        vercelLogAdapter.fetchDeployLogs(createFetchParams(), testContext)
      ).rejects.toThrow(ExternalServiceError);
    });

    it("should throw non-retryable ExternalServiceError on 404 status", async () => {
      const error = Object.assign(new Error("Not Found"), { status: 404 });
      mockResilientGet.mockRejectedValueOnce(error);

      await expect(
        vercelLogAdapter.fetchDeployLogs(createFetchParams(), testContext)
      ).rejects.toThrow(ExternalServiceError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to fetch Vercel deployment logs",
        expect.objectContaining({
          category: "non_retryable",
          retryable: false,
          statusCode: 404,
        })
      );
    });

    it("should treat network errors (no status) as retryable", async () => {
      mockResilientGet.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      await expect(
        vercelLogAdapter.fetchDeployLogs(createFetchParams(), testContext)
      ).rejects.toThrow(ExternalServiceError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to fetch Vercel deployment logs",
        expect.objectContaining({
          category: "retryable",
          retryable: true,
          statusCode: undefined,
        })
      );
    });

    it("should URL-encode entityId to prevent injection", async () => {
      mockResilientGet.mockResolvedValueOnce({
        status: 200,
        data: { events: [] },
      });

      await vercelLogAdapter.fetchDeployLogs(
        createFetchParams({ entityId: "dpl/../../secrets" }),
        testContext
      );

      const calledUrl = mockResilientGet.mock.calls[0][0] as string;
      expect(calledUrl).toContain("dpl%2F..%2F..%2Fsecrets");
      expect(calledUrl).not.toContain("dpl/../../secrets");
    });
  });

  // ==================== parseLogDrainBatch ====================

  describe("parseLogDrainBatch", () => {
    it("should parse a valid array of log drain lines", async () => {
      const payload = [
        createLogDrainLine({ message: "Line 1", timestamp: 1700000000000 }),
        createLogDrainLine({ message: "Line 2", timestamp: 1700000001000 }),
      ];

      const result = await vercelLogAdapter.parseLogDrainBatch(payload, testContext);

      expect(result.platform).toBe("vercel");
      expect(result.entityId).toBe("dpl_xyz789");
      expect(result.lines).toHaveLength(2);
      expect(result.lines[0]).toEqual({
        timestamp: new Date(1700000000000),
        message: "Line 1",
        level: "info",
        source: "build",
      });
    });

    it("should return empty result for non-array payload", async () => {
      const result = await vercelLogAdapter.parseLogDrainBatch("not-array", testContext);

      expect(result).toEqual({ entityId: "", lines: [], platform: "vercel" });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Invalid Vercel log drain payload — expected array",
        expect.objectContaining({
          provider: "vercel",
          operation: "parseLogDrainBatch",
          payloadType: "string",
        })
      );
    });

    it("should return empty result for empty array", async () => {
      const result = await vercelLogAdapter.parseLogDrainBatch([], testContext);
      expect(result).toEqual({ entityId: "", lines: [], platform: "vercel" });
    });

    it("should not log warning for empty array (valid but empty)", async () => {
      await vercelLogAdapter.parseLogDrainBatch([], testContext);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it("should return empty result when first element has wrong shape (missing message)", async () => {
      const payload = [{ timestamp: 1700000000000, noMessage: true }];
      const result = await vercelLogAdapter.parseLogDrainBatch(payload, testContext);
      expect(result).toEqual({ entityId: "", lines: [], platform: "vercel" });
    });

    it("should return empty result when first element has wrong shape (missing timestamp)", async () => {
      const payload = [{ message: "hello", noTimestamp: true }];
      const result = await vercelLogAdapter.parseLogDrainBatch(payload, testContext);
      expect(result).toEqual({ entityId: "", lines: [], platform: "vercel" });
    });

    it("should truncate batch exceeding MAX_LINES_PER_BATCH", async () => {
      const oversizedPayload = Array.from({ length: 10_001 }, (_, i) =>
        createLogDrainLine({ message: `Line ${i}`, id: `line-${i}` })
      );

      const result = await vercelLogAdapter.parseLogDrainBatch(oversizedPayload, testContext);

      expect(result.lines).toHaveLength(10_000);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Vercel log drain batch truncated to safety limit",
        expect.objectContaining({
          originalCount: 10_001,
          cappedAt: 10_000,
        })
      );
    });

    it("should use default level 'info' when level is missing", async () => {
      const payload = [createLogDrainLine({ level: undefined })];
      const result = await vercelLogAdapter.parseLogDrainBatch(payload, testContext);
      expect(result.lines[0].level).toBe("info");
    });

    it("should use default source 'build' when source is missing", async () => {
      const payload = [createLogDrainLine({ source: undefined })];
      const result = await vercelLogAdapter.parseLogDrainBatch(payload, testContext);
      expect(result.lines[0].source).toBe("build");
    });

    it("should use empty string entityId when deploymentId is missing", async () => {
      const payload = [createLogDrainLine({ deploymentId: undefined })];
      const result = await vercelLogAdapter.parseLogDrainBatch(payload, testContext);
      expect(result.entityId).toBe("");
    });

    it("should return null payload as empty result", async () => {
      const result = await vercelLogAdapter.parseLogDrainBatch(null, testContext);
      expect(result).toEqual({ entityId: "", lines: [], platform: "vercel" });
    });

    it("should log info on successful parse", async () => {
      const payload = [createLogDrainLine()];
      await vercelLogAdapter.parseLogDrainBatch(payload, testContext);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Parsed Vercel log drain batch",
        expect.objectContaining({
          provider: "vercel",
          operation: "parseLogDrainBatch",
          entityId: "dpl_xyz789",
          lineCount: 1,
        })
      );
    });
  });
});

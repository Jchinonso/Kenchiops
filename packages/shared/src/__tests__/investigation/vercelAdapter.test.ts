/**
 * Vercel Monitoring Adapter Tests
 *
 * Tests for the Vercel monitoring adapter: configuration check,
 * Bearer token auth, deployment state filtering (ERROR/CANCELED),
 * deployment-to-evidence mapping, and error resilience.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockResilientGet = jest.fn();
const mockLoggerInstance = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
const mockCreateLogger = jest.fn(() => mockLoggerInstance);

jest.mock("../../http/resilientClient.js", () => ({
  resilientGet: (...args: unknown[]) => mockResilientGet(...args),
}));

jest.mock("../../core/logger.js", () => ({
  createLogger: (...args: unknown[]) => mockCreateLogger(...args),
}));

import { createVercelMonitoringAdapter } from "../../investigation/adapters/vercelAdapter.js";
import type { MonitoringQuery } from "../../investigation/monitoringTypes.js";
import { MONITORING_DEFAULTS, VERCEL_API } from "../../investigation/monitoringConstants.js";
import { INVESTIGATION_RELEVANCE } from "../../investigation/constants.js";
import type { RequestContext } from "../../core/types.js";

// ==================== Test Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const TEST_API_TOKEN = "vercel-token-abc";
const TEST_TEAM_ID = "team-123";

const createTestQuery = (overrides: Partial<MonitoringQuery> = {}): MonitoringQuery => ({
  tenantId: "test-tenant",
  serviceName: "payments-api",
  environment: "production",
  symptom: "deployment_failure",
  hoursBack: 6,
  limit: 25,
  ...overrides,
});

const createDeploymentsResponse = (deployments: ReadonlyArray<Record<string, unknown>> = []) => ({
  data: { deployments },
  status: 200,
  retryCount: 0,
  duration: 90,
});

const createTestDeployment = (overrides: Record<string, unknown> = {}) => ({
  uid: "dpl-abc123",
  name: "payments-api",
  state: "ERROR",
  created: 1708351200000,
  meta: {
    githubCommitSha: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    githubCommitMessage: "feat: add payment retry logic",
  },
  creator: {
    uid: "user-456",
    username: "johndoe",
  },
  inspectorUrl: "https://vercel.com/kenchi/payments-api/dpl-abc123",
  errorCode: "BUILD_FAILED",
  errorMessage: "Command 'npm run build' exited with 1",
  ...overrides,
});

// ==================== Tests ====================

describe("createVercelMonitoringAdapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("isConfigured", () => {
    it("should return true when API token is provided", () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);

      expect(adapter.isConfigured()).toBe(true);
    });

    it("should return false when API token is empty", () => {
      const adapter = createVercelMonitoringAdapter("", TEST_TEAM_ID);

      expect(adapter.isConfigured()).toBe(false);
    });

    it("should return true even when teamId is empty (only token matters)", () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, "");

      expect(adapter.isConfigured()).toBe(true);
    });
  });

  describe("name", () => {
    it("should have name 'vercel'", () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);

      expect(adapter.name).toBe("vercel");
    });
  });

  describe("fetchEvidence", () => {
    it("should fetch deployments from Vercel API", async () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createDeploymentsResponse([createTestDeployment()]));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(mockResilientGet).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
    });

    it("should use Vercel deployments endpoint", async () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createDeploymentsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const url = mockResilientGet.mock.calls[0][0] as string;
      expect(url).toContain(VERCEL_API.DEPLOYMENTS);
    });

    it("should pass Bearer token auth header", async () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createDeploymentsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const options = mockResilientGet.mock.calls[0][1];
      expect(options).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${TEST_API_TOKEN}`,
          }),
        })
      );
    });

    it("should include teamId in URL when provided", async () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createDeploymentsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const url = mockResilientGet.mock.calls[0][0] as string;
      expect(url).toContain(`teamId=${TEST_TEAM_ID}`);
    });

    it("should omit teamId from URL when empty", async () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, "");
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createDeploymentsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const url = mockResilientGet.mock.calls[0][0] as string;
      expect(url).not.toContain("teamId=");
    });

    it("should include limit and since parameters in URL", async () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);
      const query = createTestQuery({ limit: 10 });

      mockResilientGet.mockResolvedValueOnce(createDeploymentsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const url = mockResilientGet.mock.calls[0][0] as string;
      expect(url).toContain("limit=10");
      expect(url).toContain("since=");
    });

    it("should filter deployments to only ERROR and CANCELED states", async () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);
      const query = createTestQuery();

      const errorDeploy = createTestDeployment({ uid: "dpl-error", state: "ERROR" });
      const canceledDeploy = createTestDeployment({ uid: "dpl-canceled", state: "CANCELED" });
      const readyDeploy = createTestDeployment({ uid: "dpl-ready", state: "READY" });
      const buildingDeploy = createTestDeployment({ uid: "dpl-building", state: "BUILDING" });

      mockResilientGet.mockResolvedValueOnce(
        createDeploymentsResponse([errorDeploy, canceledDeploy, readyDeploy, buildingDeploy])
      );

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result).toHaveLength(2);
      expect(result.map((e) => e.id)).toEqual(
        expect.arrayContaining(["vercel-deploy-dpl-error", "vercel-deploy-dpl-canceled"])
      );
    });

    it("should map deployment to evidence with correct source type", async () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createDeploymentsResponse([createTestDeployment()]));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result[0].source).toBe("vercel_deployments");
      expect(result[0].id).toBe("vercel-deploy-dpl-abc123");
      expect(result[0].title).toContain("Vercel Deployment:");
      expect(result[0].title).toContain("payments-api");
      expect(result[0].title).toContain("ERROR");
    });

    it("should include deployment metadata (commit, error, creator)", async () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createDeploymentsResponse([createTestDeployment()]));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result[0].metadata).toEqual(
        expect.objectContaining({
          deploymentUid: "dpl-abc123",
          projectName: "payments-api",
          state: "ERROR",
          errorCode: "BUILD_FAILED",
          errorMessage: "Command 'npm run build' exited with 1",
          commitSha: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
          commitMessage: "feat: add payment retry logic",
          creatorUsername: "johndoe",
        })
      );
    });

    it("should include error message and commit sha in summary", async () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createDeploymentsResponse([createTestDeployment()]));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result[0].summary).toContain("dpl-abc123");
      expect(result[0].summary).toContain("a1b2c3d4"); // First 8 chars of commit sha
    });

    it("should assign alert-service-match relevance for error deployment matching service", async () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);
      const query = createTestQuery({ serviceName: "payments-api" });

      mockResilientGet.mockResolvedValueOnce(
        createDeploymentsResponse([createTestDeployment({ name: "payments-api", state: "ERROR" })])
      );

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result[0].relevance).toBe(INVESTIGATION_RELEVANCE.MONITORING_ALERT_SERVICE_MATCH);
    });

    it("should assign alert-base relevance for error deployment not matching service", async () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);
      const query = createTestQuery({ serviceName: "auth-service" });

      mockResilientGet.mockResolvedValueOnce(
        createDeploymentsResponse([createTestDeployment({ name: "payments-api", state: "ERROR" })])
      );

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result[0].relevance).toBe(INVESTIGATION_RELEVANCE.MONITORING_ALERT_BASE);
    });

    it("should handle deployment without meta (no commit info)", async () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(
        createDeploymentsResponse([createTestDeployment({ meta: undefined })])
      );

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result[0].metadata).toEqual(
        expect.objectContaining({
          commitSha: null,
          commitMessage: null,
        })
      );
    });

    it("should handle deployment without creator", async () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(
        createDeploymentsResponse([createTestDeployment({ creator: undefined })])
      );

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result[0].metadata).toEqual(
        expect.objectContaining({
          creatorUsername: null,
        })
      );
    });

    it("should handle deployment without error fields", async () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(
        createDeploymentsResponse([
          createTestDeployment({
            state: "CANCELED",
            errorCode: undefined,
            errorMessage: undefined,
          }),
        ])
      );

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result[0].metadata).toEqual(
        expect.objectContaining({
          errorCode: null,
          errorMessage: null,
        })
      );
    });

    it("should convert created timestamp (epoch ms) to ISO string", async () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);
      const query = createTestQuery();
      const epochMs = 1708351200000;

      mockResilientGet.mockResolvedValueOnce(
        createDeploymentsResponse([createTestDeployment({ created: epochMs })])
      );

      const result = await adapter.fetchEvidence(query, testContext);

      const expectedDate = new Date(epochMs).toISOString();
      expect(result[0].timestamp).toBe(expectedDate);
    });

    it("should handle missing deployments in response", async () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce({
        data: {},
        status: 200,
        retryCount: 0,
        duration: 80,
      });

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result).toEqual([]);
    });

    it("should limit results to MAX_RESULTS_PER_PROVIDER", async () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);
      const query = createTestQuery();

      const manyDeploys = Array.from({ length: 20 }, (_, i) =>
        createTestDeployment({ uid: `dpl-${String(i)}`, state: "ERROR" })
      );

      mockResilientGet.mockResolvedValueOnce(createDeploymentsResponse(manyDeploys));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result.length).toBeLessThanOrEqual(MONITORING_DEFAULTS.MAX_RESULTS_PER_PROVIDER);
    });

    it("should pass timeout and maxRetries from MONITORING_DEFAULTS", async () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createDeploymentsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const options = mockResilientGet.mock.calls[0][1];
      expect(options).toEqual(
        expect.objectContaining({
          timeout: MONITORING_DEFAULTS.REQUEST_TIMEOUT_MS,
          maxRetries: MONITORING_DEFAULTS.MAX_RETRIES,
        })
      );
    });
  });

  describe("error resilience", () => {
    it("should return empty array when fetch fails", async () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);
      const query = createTestQuery();

      mockResilientGet.mockRejectedValueOnce(new Error("Vercel API timeout"));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result).toEqual([]);
    });

    it("should log warning when fetch fails", async () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);
      const query = createTestQuery();

      mockResilientGet.mockRejectedValueOnce(new Error("Connection refused"));

      await adapter.fetchEvidence(query, testContext);

      expect(mockLoggerInstance.warn).toHaveBeenCalled();
    });

    it("should never throw even on unexpected errors", async () => {
      const adapter = createVercelMonitoringAdapter(TEST_API_TOKEN, TEST_TEAM_ID);
      const query = createTestQuery();

      mockResilientGet.mockRejectedValueOnce(new TypeError("Cannot read properties of null"));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result).toEqual([]);
    });
  });
});

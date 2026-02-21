/**
 * Netlify Monitoring Adapter Tests
 *
 * Tests for the Netlify monitoring adapter: configuration check,
 * Bearer token auth, site_id URL substitution, deploy state filtering
 * (error/build_failed), deploy-to-evidence mapping, and error resilience.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { RequestContext } from "@kenchi/shared";

const mockResilientGet = jest.fn();
const mockLoggerInstance = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
const mockCreateLogger = jest.fn(() => mockLoggerInstance);

jest.mock("@kenchi/shared", () => ({
  ...jest.requireActual("@kenchi/shared"),
  resilientGet: (...args: unknown[]) => mockResilientGet(...args),
  createLogger: (...args: unknown[]) => mockCreateLogger(...args),
}));

import { createNetlifyMonitoringAdapter } from "../../adapters/netlifyMonitoringAdapter.js";
import type { MonitoringQuery } from "../../types/monitoringTypes.js";
import { MONITORING_DEFAULTS, NETLIFY_API } from "../../constants/monitoringConstants.js";
import { INVESTIGATION_RELEVANCE } from "../../constants/investigationConstants.js";

// ==================== Test Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const TEST_API_TOKEN = "netlify-token-abc";
const TEST_SITE_ID = "site-xyz-123";

const createTestQuery = (overrides: Partial<MonitoringQuery> = {}): MonitoringQuery => ({
  tenantId: "test-tenant",
  serviceName: "payments-app",
  environment: "production",
  symptom: "deployment_failure",
  hoursBack: 6,
  limit: 25,
  ...overrides,
});

const createDeploysResponse = (deploys: ReadonlyArray<Record<string, unknown>> = []) => ({
  data: deploys,
  status: 200,
  retryCount: 0,
  duration: 85,
});

/** Creates a deploy with created_at within the default hoursBack window */
const createTestDeploy = (overrides: Record<string, unknown> = {}) => ({
  id: "deploy-abc123def456",
  site_id: TEST_SITE_ID,
  state: "error",
  name: "payments-app",
  url: "https://payments-app.netlify.app",
  deploy_url: "https://deploy-abc123def456--payments-app.netlify.app",
  created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
  updated_at: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
  error_message: "Build script returned non-zero exit code: 1",
  branch: "main",
  commit_ref: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  commit_url: "https://github.com/kenchi-inc/payments-app/commit/a1b2c3d4",
  title: "feat: add payment retry logic",
  context: "production",
  ...overrides,
});

// ==================== Tests ====================

describe("createNetlifyMonitoringAdapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("isConfigured", () => {
    it("should return true when both API token and site ID are provided", () => {
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, TEST_SITE_ID);

      expect(adapter.isConfigured()).toBe(true);
    });

    it("should return false when API token is empty", () => {
      const adapter = createNetlifyMonitoringAdapter("", TEST_SITE_ID);

      expect(adapter.isConfigured()).toBe(false);
    });

    it("should return false when site ID is empty", () => {
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, "");

      expect(adapter.isConfigured()).toBe(false);
    });

    it("should return false when both are empty", () => {
      const adapter = createNetlifyMonitoringAdapter("", "");

      expect(adapter.isConfigured()).toBe(false);
    });
  });

  describe("name", () => {
    it("should have name 'netlify'", () => {
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, TEST_SITE_ID);

      expect(adapter.name).toBe("netlify");
    });
  });

  describe("fetchEvidence", () => {
    it("should fetch deploys from Netlify API", async () => {
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, TEST_SITE_ID);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createDeploysResponse([createTestDeploy()]));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(mockResilientGet).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
    });

    it("should construct URL with site_id substituted", async () => {
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, TEST_SITE_ID);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createDeploysResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const url = mockResilientGet.mock.calls[0][0] as string;
      expect(url).toContain(
        `${NETLIFY_API.BASE_URL}${NETLIFY_API.DEPLOYS_PATH_PREFIX}${TEST_SITE_ID}${NETLIFY_API.DEPLOYS_PATH_SUFFIX}`
      );
    });

    it("should encode site_id in URL for special characters", async () => {
      const siteIdWithSpecialChars = "site/with spaces";
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, siteIdWithSpecialChars);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createDeploysResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const url = mockResilientGet.mock.calls[0][0] as string;
      expect(url).toContain(encodeURIComponent(siteIdWithSpecialChars));
    });

    it("should pass Bearer token auth header", async () => {
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, TEST_SITE_ID);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createDeploysResponse([]));

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

    it("should include per_page parameter in URL", async () => {
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, TEST_SITE_ID);
      const query = createTestQuery({ limit: 15 });

      mockResilientGet.mockResolvedValueOnce(createDeploysResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const url = mockResilientGet.mock.calls[0][0] as string;
      // per_page should be min(limit, MAX_RESULTS_PER_PROVIDER)
      const expectedPerPage = Math.min(15, MONITORING_DEFAULTS.MAX_RESULTS_PER_PROVIDER);
      expect(url).toContain(`per_page=${String(expectedPerPage)}`);
    });

    it("should cap per_page to MAX_RESULTS_PER_PROVIDER", async () => {
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, TEST_SITE_ID);
      const query = createTestQuery({ limit: 100 });

      mockResilientGet.mockResolvedValueOnce(createDeploysResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const url = mockResilientGet.mock.calls[0][0] as string;
      expect(url).toContain(`per_page=${String(MONITORING_DEFAULTS.MAX_RESULTS_PER_PROVIDER)}`);
    });

    it("should filter deploys to error and build_failed states", async () => {
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, TEST_SITE_ID);
      const query = createTestQuery();

      const errorDeploy = createTestDeploy({ id: "deploy-error", state: "error" });
      const buildFailedDeploy = createTestDeploy({
        id: "deploy-build-failed",
        state: "build_failed",
      });
      const readyDeploy = createTestDeploy({
        id: "deploy-ready",
        state: "ready",
        error_message: undefined,
      });
      const buildingDeploy = createTestDeploy({
        id: "deploy-building",
        state: "building",
        error_message: undefined,
      });

      mockResilientGet.mockResolvedValueOnce(
        createDeploysResponse([errorDeploy, buildFailedDeploy, readyDeploy, buildingDeploy])
      );

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result).toHaveLength(2);
      expect(result.map((e) => e.id)).toEqual(
        expect.arrayContaining([
          "netlify-deploy-deploy-error",
          "netlify-deploy-deploy-build-failed",
        ])
      );
    });

    it("should also include deploys with error_message even if state is not error/build_failed", async () => {
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, TEST_SITE_ID);
      const query = createTestQuery();

      const deployWithErrorMsg = createTestDeploy({
        id: "deploy-with-err-msg",
        state: "ready",
        error_message: "Warning: partial build failure",
      });

      mockResilientGet.mockResolvedValueOnce(createDeploysResponse([deployWithErrorMsg]));

      const result = await adapter.fetchEvidence(query, testContext);

      // This deploy has error_message set even though state is "ready"
      // The code filters: NETLIFY_ERROR_DEPLOY_STATES.has(state) || error_message !== undefined
      expect(result).toHaveLength(1);
    });

    it("should map deploy to evidence with correct source type", async () => {
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, TEST_SITE_ID);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createDeploysResponse([createTestDeploy()]));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result[0].source).toBe("netlify_deploys");
      expect(result[0].id).toBe("netlify-deploy-deploy-abc123def456");
      expect(result[0].title).toContain("Netlify Deploy:");
      expect(result[0].title).toContain("payments-app");
      expect(result[0].title).toContain("error");
    });

    it("should include deploy metadata (branch, commit, error, context)", async () => {
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, TEST_SITE_ID);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createDeploysResponse([createTestDeploy()]));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result[0].metadata).toEqual(
        expect.objectContaining({
          deployId: "deploy-abc123def456",
          projectName: "payments-app",
          state: "error",
          branch: "main",
          commitRef: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
          commitUrl: "https://github.com/kenchi-inc/payments-app/commit/a1b2c3d4",
          errorMessage: "Build script returned non-zero exit code: 1",
          deployContext: "production",
          deployUrl: "https://deploy-abc123def456--payments-app.netlify.app",
        })
      );
    });

    it("should include branch, commit, and error info in summary", async () => {
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, TEST_SITE_ID);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createDeploysResponse([createTestDeploy()]));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result[0].summary).toContain("deploy-a"); // First 8 chars of deploy id
      expect(result[0].summary).toContain("main"); // branch
      expect(result[0].summary).toContain("a1b2c3d4"); // First 8 chars of commit ref
    });

    it("should assign alert-service-match relevance for error deploy matching service", async () => {
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, TEST_SITE_ID);
      const query = createTestQuery({ serviceName: "payments-app" });

      mockResilientGet.mockResolvedValueOnce(
        createDeploysResponse([createTestDeploy({ name: "payments-app", state: "error" })])
      );

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result[0].relevance).toBe(INVESTIGATION_RELEVANCE.MONITORING_ALERT_SERVICE_MATCH);
    });

    it("should assign alert-base relevance for error deploy not matching service", async () => {
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, TEST_SITE_ID);
      const query = createTestQuery({ serviceName: "auth-service" });

      mockResilientGet.mockResolvedValueOnce(
        createDeploysResponse([createTestDeploy({ name: "payments-app", state: "error" })])
      );

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result[0].relevance).toBe(INVESTIGATION_RELEVANCE.MONITORING_ALERT_BASE);
    });

    it("should handle deploy without optional fields", async () => {
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, TEST_SITE_ID);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(
        createDeploysResponse([
          createTestDeploy({
            name: undefined,
            branch: undefined,
            commit_ref: undefined,
            commit_url: undefined,
            title: undefined,
            context: undefined,
            deploy_url: undefined,
            error_message: undefined,
            state: "build_failed",
          }),
        ])
      );

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result).toHaveLength(1);
      expect(result[0].title).toContain("unknown"); // Fallback name
      expect(result[0].metadata).toEqual(
        expect.objectContaining({
          projectName: "unknown",
          branch: null,
          commitRef: null,
          commitUrl: null,
          errorMessage: null,
          deployContext: null,
          deployUrl: null,
        })
      );
    });

    it("should use created_at as evidence timestamp", async () => {
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, TEST_SITE_ID);
      const query = createTestQuery();
      const recentTimestamp = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago

      mockResilientGet.mockResolvedValueOnce(
        createDeploysResponse([createTestDeploy({ created_at: recentTimestamp })])
      );

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result[0].timestamp).toBe(recentTimestamp);
    });

    it("should handle empty deploys array", async () => {
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, TEST_SITE_ID);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createDeploysResponse([]));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result).toEqual([]);
    });

    it("should limit results to MAX_RESULTS_PER_PROVIDER", async () => {
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, TEST_SITE_ID);
      const query = createTestQuery();

      const manyDeploys = Array.from({ length: 20 }, (_, i) =>
        createTestDeploy({ id: `deploy-${String(i)}`, state: "error" })
      );

      mockResilientGet.mockResolvedValueOnce(createDeploysResponse(manyDeploys));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result.length).toBeLessThanOrEqual(MONITORING_DEFAULTS.MAX_RESULTS_PER_PROVIDER);
    });

    it("should pass timeout and maxRetries from MONITORING_DEFAULTS", async () => {
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, TEST_SITE_ID);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createDeploysResponse([]));

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
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, TEST_SITE_ID);
      const query = createTestQuery();

      mockResilientGet.mockRejectedValueOnce(new Error("Netlify API timeout"));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result).toEqual([]);
    });

    it("should log warning when fetch fails", async () => {
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, TEST_SITE_ID);
      const query = createTestQuery();

      mockResilientGet.mockRejectedValueOnce(new Error("DNS resolution failed"));

      await adapter.fetchEvidence(query, testContext);

      expect(mockLoggerInstance.warn).toHaveBeenCalled();
    });

    it("should never throw even on unexpected errors", async () => {
      const adapter = createNetlifyMonitoringAdapter(TEST_API_TOKEN, TEST_SITE_ID);
      const query = createTestQuery();

      mockResilientGet.mockRejectedValueOnce(new TypeError("Cannot read properties of null"));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result).toEqual([]);
    });
  });
});

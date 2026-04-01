/**
 * Grafana Monitoring Adapter Tests
 *
 * Tests for the Grafana monitoring adapter: configuration check,
 * alert rules filtering (firing/pending), annotations fetching,
 * evidence mapping, relevance scoring, and error resilience.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { RequestContext } from "@kenchi/shared";

const mockResilientGet = jest.fn();
const mockCreateLogger = jest.fn(() => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock("@kenchi/shared", () => ({
  ...jest.requireActual("@kenchi/shared"),
  resilientGet: (...args: unknown[]) => mockResilientGet(...args),
  createLogger: (...args: unknown[]) => mockCreateLogger(...args),
}));

import { createGrafanaMonitoringAdapter } from "../../adapters/grafanaMonitoringAdapter.js";
import type { MonitoringQuery } from "../../types/monitoringTypes.js";
import { GRAFANA_API } from "../../constants/monitoringConstants.js";
import { INVESTIGATION_RELEVANCE } from "../../constants/investigationConstants.js";

// ==================== Test Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const TEST_API_TOKEN = "grafana-token-abc";
const TEST_BASE_URL = "https://grafana.example.com";

const createTestQuery = (overrides: Partial<MonitoringQuery> = {}): MonitoringQuery => ({
  tenantId: "test-tenant",
  serviceName: "payments-api",
  environment: "production",
  symptom: "errors",
  hoursBack: 6,
  limit: 25,
  ...overrides,
});

const createRulesResponse = (groups: ReadonlyArray<Record<string, unknown>> = []) => ({
  data: { status: "success", data: { groups } },
  status: 200,
  retryCount: 0,
  duration: 120,
});

const createAnnotationsResponse = (annotations: ReadonlyArray<Record<string, unknown>> = []) => ({
  data: annotations,
  status: 200,
  retryCount: 0,
  duration: 80,
});

const createTestRulesGroup = (rules: ReadonlyArray<Record<string, unknown>> = []) => ({
  name: "test-group",
  rules,
});

const createTestRule = (overrides: Record<string, unknown> = {}) => ({
  name: "HighErrorRate",
  state: "firing",
  labels: { service: "payments-api", severity: "critical" },
  annotations: {
    description: "Error rate exceeded threshold",
    summary: "High errors",
  },
  alerts: [
    {
      uid: "alert-uid-1",
      title: "",
      state: "firing",
      labels: { instance: "web-01" },
      annotations: { description: "Instance web-01 has high error rate" },
      activeAt: "2026-02-20T10:00:00Z",
    },
  ],
  ...overrides,
});

const createTestAnnotation = (overrides: Record<string, unknown> = {}) => ({
  id: 100,
  text: "Deployment v2.3.0 started",
  tags: ["payments-api", "deployment"],
  created: 1708351200000,
  updated: 1708351200000,
  time: 1708351200000,
  timeEnd: 1708351260000,
  ...overrides,
});

// ==================== Tests ====================

describe.skip("createGrafanaMonitoringAdapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("isConfigured", () => {
    it("should return true when both apiToken and baseUrl are provided", () => {
      const adapter = createGrafanaMonitoringAdapter(TEST_API_TOKEN, TEST_BASE_URL);

      expect(adapter.isConfigured()).toBe(true);
    });

    it("should return false when apiToken is empty", () => {
      const adapter = createGrafanaMonitoringAdapter("", TEST_BASE_URL);

      expect(adapter.isConfigured()).toBe(false);
    });

    it("should return false when baseUrl is empty", () => {
      const adapter = createGrafanaMonitoringAdapter(TEST_API_TOKEN, "");

      expect(adapter.isConfigured()).toBe(false);
    });

    it("should return false when both are empty", () => {
      const adapter = createGrafanaMonitoringAdapter("", "");

      expect(adapter.isConfigured()).toBe(false);
    });
  });

  describe("name", () => {
    it("should have name 'grafana'", () => {
      const adapter = createGrafanaMonitoringAdapter(TEST_API_TOKEN, TEST_BASE_URL);

      expect(adapter.name).toBe("grafana");
    });
  });

  describe("fetchEvidence", () => {
    it("should fetch alerts and annotations in parallel", async () => {
      const adapter = createGrafanaMonitoringAdapter(TEST_API_TOKEN, TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce(createRulesResponse([]))
        .mockResolvedValueOnce(createAnnotationsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      expect(mockResilientGet).toHaveBeenCalledTimes(2);
      expect(mockResilientGet.mock.calls[0][0]).toContain(GRAFANA_API.RULES);
      expect(mockResilientGet.mock.calls[1][0]).toContain(GRAFANA_API.ANNOTATIONS);
    });

    it("should pass Bearer token auth header", async () => {
      const adapter = createGrafanaMonitoringAdapter(TEST_API_TOKEN, TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce(createRulesResponse([]))
        .mockResolvedValueOnce(createAnnotationsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const rulesOptions = mockResilientGet.mock.calls[0][1];
      expect(rulesOptions).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${TEST_API_TOKEN}`,
          }),
        })
      );
    });

    it("should filter alert rules to only firing and pending states", async () => {
      const adapter = createGrafanaMonitoringAdapter(TEST_API_TOKEN, TEST_BASE_URL);
      const query = createTestQuery();

      const firingRule = createTestRule({
        state: "firing",
        alerts: [
          {
            uid: "alert-firing",
            title: "Firing Alert",
            state: "firing",
            labels: {},
            annotations: {},
            activeAt: "2026-02-20T10:00:00Z",
          },
        ],
      });
      const inactiveRule = createTestRule({
        state: "inactive",
        alerts: [
          {
            uid: "alert-inactive",
            title: "Inactive Alert",
            state: "inactive",
            labels: {},
            annotations: {},
            activeAt: "2026-02-20T08:00:00Z",
          },
        ],
      });
      const pendingRule = createTestRule({
        state: "pending",
        alerts: [
          {
            uid: "alert-pending",
            title: "Pending Alert",
            state: "pending",
            labels: {},
            annotations: {},
            activeAt: "2026-02-20T09:00:00Z",
          },
        ],
      });

      mockResilientGet
        .mockResolvedValueOnce(
          createRulesResponse([createTestRulesGroup([firingRule, inactiveRule, pendingRule])])
        )
        .mockResolvedValueOnce(createAnnotationsResponse([]));

      const result = await adapter.fetchEvidence(query, testContext);

      // Should only include firing and pending, not inactive
      const alertItems = result.filter((e) => e.id.startsWith("grafana-alert-"));
      expect(alertItems).toHaveLength(2);
      expect(alertItems.map((a) => a.id)).toEqual(
        expect.arrayContaining(["grafana-alert-alert-firing", "grafana-alert-alert-pending"])
      );
    });

    it("should map alert evidence with correct source type", async () => {
      const adapter = createGrafanaMonitoringAdapter(TEST_API_TOKEN, TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce(createRulesResponse([createTestRulesGroup([createTestRule()])]))
        .mockResolvedValueOnce(createAnnotationsResponse([]));

      const result = await adapter.fetchEvidence(query, testContext);

      const alertEvidence = result.find((e) => e.id.startsWith("grafana-alert-"));
      expect(alertEvidence).toBeDefined();
      expect(alertEvidence!.source).toBe("grafana_alerts");
      expect(alertEvidence!.title).toContain("Grafana Alert:");
      expect(alertEvidence!.title).toContain("firing");
    });

    it("should map annotation evidence with correct source type", async () => {
      const adapter = createGrafanaMonitoringAdapter(TEST_API_TOKEN, TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce(createRulesResponse([]))
        .mockResolvedValueOnce(createAnnotationsResponse([createTestAnnotation()]));

      const result = await adapter.fetchEvidence(query, testContext);

      const annoEvidence = result.find((e) => e.id.startsWith("grafana-annotation-"));
      expect(annoEvidence).toBeDefined();
      expect(annoEvidence!.source).toBe("grafana_alerts");
      expect(annoEvidence!.title).toContain("Grafana Annotation:");
    });

    it("should assign higher relevance for alerts matching service via labels", async () => {
      const adapter = createGrafanaMonitoringAdapter(TEST_API_TOKEN, TEST_BASE_URL);
      const query = createTestQuery({ serviceName: "payments-api" });

      mockResilientGet
        .mockResolvedValueOnce(
          createRulesResponse([
            createTestRulesGroup([
              createTestRule({
                labels: { service: "payments-api" },
                alerts: [
                  {
                    uid: "svc-match-alert",
                    title: "Service Match",
                    state: "firing",
                    labels: { service: "payments-api" },
                    annotations: {},
                    activeAt: "2026-02-20T10:00:00Z",
                  },
                ],
              }),
            ]),
          ])
        )
        .mockResolvedValueOnce(createAnnotationsResponse([]));

      const result = await adapter.fetchEvidence(query, testContext);

      const alertEvidence = result.find((e) => e.id.startsWith("grafana-alert-"));
      expect(alertEvidence!.relevance).toBe(INVESTIGATION_RELEVANCE.MONITORING_ALERT_SERVICE_MATCH);
    });

    it("should assign base alert relevance for alerts not matching service", async () => {
      const adapter = createGrafanaMonitoringAdapter(TEST_API_TOKEN, TEST_BASE_URL);
      const query = createTestQuery({ serviceName: "auth-service" });

      mockResilientGet
        .mockResolvedValueOnce(
          createRulesResponse([
            createTestRulesGroup([
              createTestRule({
                labels: { service: "payments-api" },
                alerts: [
                  {
                    uid: "no-match-alert",
                    title: "No Match",
                    state: "firing",
                    labels: {},
                    annotations: {},
                    activeAt: "2026-02-20T10:00:00Z",
                  },
                ],
              }),
            ]),
          ])
        )
        .mockResolvedValueOnce(createAnnotationsResponse([]));

      const result = await adapter.fetchEvidence(query, testContext);

      const alertEvidence = result.find((e) => e.id.startsWith("grafana-alert-"));
      expect(alertEvidence!.relevance).toBe(INVESTIGATION_RELEVANCE.MONITORING_ALERT_BASE);
    });

    it("should assign higher relevance for annotations with matching service tag", async () => {
      const adapter = createGrafanaMonitoringAdapter(TEST_API_TOKEN, TEST_BASE_URL);
      const query = createTestQuery({ serviceName: "payments-api" });

      mockResilientGet
        .mockResolvedValueOnce(createRulesResponse([]))
        .mockResolvedValueOnce(
          createAnnotationsResponse([createTestAnnotation({ tags: ["payments-api", "deploy"] })])
        );

      const result = await adapter.fetchEvidence(query, testContext);

      const annoEvidence = result.find((e) => e.id.startsWith("grafana-annotation-"));
      expect(annoEvidence!.relevance).toBe(INVESTIGATION_RELEVANCE.MONITORING_SERVICE_MATCH);
    });

    it("should assign base relevance for annotations without matching service tag", async () => {
      const adapter = createGrafanaMonitoringAdapter(TEST_API_TOKEN, TEST_BASE_URL);
      const query = createTestQuery({ serviceName: "auth-service" });

      mockResilientGet
        .mockResolvedValueOnce(createRulesResponse([]))
        .mockResolvedValueOnce(
          createAnnotationsResponse([createTestAnnotation({ tags: ["payments-api", "deploy"] })])
        );

      const result = await adapter.fetchEvidence(query, testContext);

      const annoEvidence = result.find((e) => e.id.startsWith("grafana-annotation-"));
      expect(annoEvidence!.relevance).toBe(INVESTIGATION_RELEVANCE.MONITORING_BASE);
    });

    it("should include service tag filter in annotations URL when serviceName provided", async () => {
      const adapter = createGrafanaMonitoringAdapter(TEST_API_TOKEN, TEST_BASE_URL);
      const query = createTestQuery({ serviceName: "payments-api" });

      mockResilientGet
        .mockResolvedValueOnce(createRulesResponse([]))
        .mockResolvedValueOnce(createAnnotationsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const annotationsUrl = mockResilientGet.mock.calls[1][0] as string;
      expect(annotationsUrl).toContain("tags=payments-api");
    });

    it("should omit service tag filter when serviceName is null", async () => {
      const adapter = createGrafanaMonitoringAdapter(TEST_API_TOKEN, TEST_BASE_URL);
      const query = createTestQuery({ serviceName: null });

      mockResilientGet
        .mockResolvedValueOnce(createRulesResponse([]))
        .mockResolvedValueOnce(createAnnotationsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const annotationsUrl = mockResilientGet.mock.calls[1][0] as string;
      expect(annotationsUrl).not.toContain("tags=");
    });

    it("should include limit in annotations URL", async () => {
      const adapter = createGrafanaMonitoringAdapter(TEST_API_TOKEN, TEST_BASE_URL);
      const query = createTestQuery({ limit: 15 });

      mockResilientGet
        .mockResolvedValueOnce(createRulesResponse([]))
        .mockResolvedValueOnce(createAnnotationsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const annotationsUrl = mockResilientGet.mock.calls[1][0] as string;
      expect(annotationsUrl).toContain("limit=15");
    });

    it("should handle empty rules groups", async () => {
      const adapter = createGrafanaMonitoringAdapter(TEST_API_TOKEN, TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce(createRulesResponse([]))
        .mockResolvedValueOnce(createAnnotationsResponse([]));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result).toEqual([]);
    });

    it("should handle missing data in rules response", async () => {
      const adapter = createGrafanaMonitoringAdapter(TEST_API_TOKEN, TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce({
          data: { status: "success" },
          status: 200,
          retryCount: 0,
          duration: 100,
        })
        .mockResolvedValueOnce(createAnnotationsResponse([]));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result).toEqual([]);
    });

    it("should merge rule-level and alert-level labels", async () => {
      const adapter = createGrafanaMonitoringAdapter(TEST_API_TOKEN, TEST_BASE_URL);
      const query = createTestQuery({ serviceName: "payments-api" });

      mockResilientGet
        .mockResolvedValueOnce(
          createRulesResponse([
            createTestRulesGroup([
              createTestRule({
                labels: { service: "payments-api", team: "platform" },
                alerts: [
                  {
                    uid: "merged-labels-alert",
                    title: "",
                    state: "firing",
                    labels: { instance: "web-01" },
                    annotations: {},
                    activeAt: "2026-02-20T10:00:00Z",
                  },
                ],
              }),
            ]),
          ])
        )
        .mockResolvedValueOnce(createAnnotationsResponse([]));

      const result = await adapter.fetchEvidence(query, testContext);

      const alertEvidence = result.find((e) => e.id.startsWith("grafana-alert-"));
      expect(alertEvidence!.metadata).toEqual(
        expect.objectContaining({
          labels: expect.objectContaining({
            service: "payments-api",
            team: "platform",
            instance: "web-01",
          }),
        })
      );
    });

    it("should use rule name as title when alert title is empty", async () => {
      const adapter = createGrafanaMonitoringAdapter(TEST_API_TOKEN, TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce(
          createRulesResponse([
            createTestRulesGroup([
              createTestRule({
                name: "CriticalErrorRate",
                alerts: [
                  {
                    uid: "fallback-title",
                    title: "",
                    state: "firing",
                    labels: {},
                    annotations: {},
                    activeAt: "2026-02-20T10:00:00Z",
                  },
                ],
              }),
            ]),
          ])
        )
        .mockResolvedValueOnce(createAnnotationsResponse([]));

      const result = await adapter.fetchEvidence(query, testContext);

      const alertEvidence = result.find((e) => e.id.startsWith("grafana-alert-"));
      expect(alertEvidence!.title).toContain("CriticalErrorRate");
    });
  });

  describe("error resilience", () => {
    it("should return empty array when alerts fetch fails", async () => {
      const adapter = createGrafanaMonitoringAdapter(TEST_API_TOKEN, TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockRejectedValueOnce(new Error("Alerts API timeout"))
        .mockResolvedValueOnce(createAnnotationsResponse([createTestAnnotation()]));

      const result = await adapter.fetchEvidence(query, testContext);

      // Annotations should still be returned
      const annoItems = result.filter((e) => e.id.startsWith("grafana-annotation-"));
      expect(annoItems).toHaveLength(1);
    });

    it("should return empty array when annotations fetch fails", async () => {
      const adapter = createGrafanaMonitoringAdapter(TEST_API_TOKEN, TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce(createRulesResponse([createTestRulesGroup([createTestRule()])]))
        .mockRejectedValueOnce(new Error("Annotations API timeout"));

      const result = await adapter.fetchEvidence(query, testContext);

      // Alerts should still be returned
      const alertItems = result.filter((e) => e.id.startsWith("grafana-alert-"));
      expect(alertItems).toHaveLength(1);
    });

    it("should return empty array when both fetches fail", async () => {
      const adapter = createGrafanaMonitoringAdapter(TEST_API_TOKEN, TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockRejectedValueOnce(new Error("Alerts timeout"))
        .mockRejectedValueOnce(new Error("Annotations timeout"));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result).toEqual([]);
    });
  });
});

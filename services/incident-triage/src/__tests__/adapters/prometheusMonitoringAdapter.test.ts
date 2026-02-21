/**
 * Prometheus Monitoring Adapter Tests
 *
 * Tests for the Prometheus monitoring adapter: configuration check,
 * alerts + query_range parallel fetching, PromQL query construction,
 * active alert filtering, evidence mapping, and error resilience.
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

import { createPrometheusMonitoringAdapter } from "../../adapters/prometheusMonitoringAdapter.js";
import type { MonitoringQuery } from "../../types/monitoringTypes.js";
import {
  MONITORING_DEFAULTS,
  PROMETHEUS_API,
  SYMPTOM_PROMQL_QUERIES,
} from "../../constants/monitoringConstants.js";
import { INVESTIGATION_RELEVANCE } from "../../constants/investigationConstants.js";

// ==================== Test Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const TEST_BASE_URL = "http://prometheus.internal:9090";

const createTestQuery = (overrides: Partial<MonitoringQuery> = {}): MonitoringQuery => ({
  tenantId: "test-tenant",
  serviceName: "payments-api",
  environment: "production",
  symptom: "errors",
  hoursBack: 6,
  limit: 25,
  ...overrides,
});

const createAlertsResponse = (alerts: ReadonlyArray<Record<string, unknown>> = []) => ({
  data: { status: "success", data: { alerts } },
  status: 200,
  retryCount: 0,
  duration: 100,
});

const createQueryRangeResponse = (result: ReadonlyArray<Record<string, unknown>> = []) => ({
  data: { status: "success", data: { resultType: "matrix", result } },
  status: 200,
  retryCount: 0,
  duration: 120,
});

const createTestAlert = (overrides: Record<string, unknown> = {}) => ({
  labels: { alertname: "HighErrorRate", service: "payments-api", severity: "critical" },
  annotations: { description: "Error rate is above 5%", summary: "High error rate" },
  state: "firing",
  activeAt: "2026-02-20T10:00:00Z",
  value: "0.085",
  ...overrides,
});

const createTestRangeSample = (overrides: Record<string, unknown> = {}) => ({
  metric: { __name__: "http_requests_total", service: "payments-api", code: "500" },
  values: [
    [1708351200, "42"],
    [1708351260, "45"],
    [1708351320, "47"],
  ],
  ...overrides,
});

// ==================== Tests ====================

describe("createPrometheusMonitoringAdapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("isConfigured", () => {
    it("should return true when baseUrl is provided", () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);

      expect(adapter.isConfigured()).toBe(true);
    });

    it("should return false when baseUrl is empty", () => {
      const adapter = createPrometheusMonitoringAdapter("");

      expect(adapter.isConfigured()).toBe(false);
    });
  });

  describe("name", () => {
    it("should have name 'prometheus'", () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);

      expect(adapter.name).toBe("prometheus");
    });
  });

  describe("fetchEvidence", () => {
    it("should fetch alerts and metrics in parallel", async () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce(createAlertsResponse([]))
        .mockResolvedValueOnce(createQueryRangeResponse([]));

      await adapter.fetchEvidence(query, testContext);

      expect(mockResilientGet).toHaveBeenCalledTimes(2);
      expect(mockResilientGet.mock.calls[0][0]).toContain(PROMETHEUS_API.ALERTS);
      expect(mockResilientGet.mock.calls[1][0]).toContain(PROMETHEUS_API.QUERY_RANGE);
    });

    it("should not pass authentication headers (Prometheus is typically unauthenticated)", async () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce(createAlertsResponse([]))
        .mockResolvedValueOnce(createQueryRangeResponse([]));

      await adapter.fetchEvidence(query, testContext);

      // Alerts request should not include auth headers
      const alertsOptions = mockResilientGet.mock.calls[0][1];
      expect(alertsOptions.headers).toBeUndefined();
    });

    it("should filter alerts to only firing and pending states", async () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);
      const query = createTestQuery();

      const firingAlert = createTestAlert({
        state: "firing",
        labels: { alertname: "FiringAlert" },
      });
      const pendingAlert = createTestAlert({
        state: "pending",
        labels: { alertname: "PendingAlert" },
      });
      const inactiveAlert = createTestAlert({
        state: "inactive",
        labels: { alertname: "InactiveAlert" },
      });

      mockResilientGet
        .mockResolvedValueOnce(createAlertsResponse([firingAlert, pendingAlert, inactiveAlert]))
        .mockResolvedValueOnce(createQueryRangeResponse([]));

      const result = await adapter.fetchEvidence(query, testContext);

      const alertItems = result.filter((e) => e.id.startsWith("prom-alert-"));
      expect(alertItems).toHaveLength(2);
      expect(alertItems.map((a) => a.id)).toEqual(
        expect.arrayContaining([
          expect.stringContaining("FiringAlert"),
          expect.stringContaining("PendingAlert"),
        ])
      );
    });

    it("should construct PromQL query from symptom template with service name", async () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);
      const query = createTestQuery({ symptom: "errors", serviceName: "payments-api" });

      mockResilientGet
        .mockResolvedValueOnce(createAlertsResponse([]))
        .mockResolvedValueOnce(createQueryRangeResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const metricsUrl = mockResilientGet.mock.calls[1][0] as string;
      const decodedUrl = decodeURIComponent(metricsUrl);
      // The template for "errors" should have $SERVICE replaced with payments-api
      const expectedQuery = SYMPTOM_PROMQL_QUERIES.errors.replace("$SERVICE", "payments-api");
      expect(decodedUrl).toContain(expectedQuery);
    });

    it("should use .* wildcard for service name when serviceName is null", async () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);
      const query = createTestQuery({ serviceName: null, symptom: "cpu_spike" });

      mockResilientGet
        .mockResolvedValueOnce(createAlertsResponse([]))
        .mockResolvedValueOnce(createQueryRangeResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const metricsUrl = mockResilientGet.mock.calls[1][0] as string;
      const decodedUrl = decodeURIComponent(metricsUrl);
      expect(decodedUrl).toContain('service=".*"');
    });

    it("should include start, end, and step parameters in query_range URL", async () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);
      const query = createTestQuery({ hoursBack: 2 });

      mockResilientGet
        .mockResolvedValueOnce(createAlertsResponse([]))
        .mockResolvedValueOnce(createQueryRangeResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const metricsUrl = mockResilientGet.mock.calls[1][0] as string;
      expect(metricsUrl).toContain("start=");
      expect(metricsUrl).toContain("end=");
      expect(metricsUrl).toContain("step=60");
    });

    it("should map alert to evidence with correct source type", async () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce(createAlertsResponse([createTestAlert()]))
        .mockResolvedValueOnce(createQueryRangeResponse([]));

      const result = await adapter.fetchEvidence(query, testContext);

      const alertEvidence = result.find((e) => e.id.startsWith("prom-alert-"));
      expect(alertEvidence).toBeDefined();
      expect(alertEvidence!.source).toBe("prometheus_alerts");
      expect(alertEvidence!.title).toContain("Prometheus Alert:");
      expect(alertEvidence!.title).toContain("HighErrorRate");
      expect(alertEvidence!.title).toContain("firing");
    });

    it("should map range sample to evidence with correct source type", async () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce(createAlertsResponse([]))
        .mockResolvedValueOnce(createQueryRangeResponse([createTestRangeSample()]));

      const result = await adapter.fetchEvidence(query, testContext);

      const metricEvidence = result.find((e) => e.id.startsWith("prom-metric-"));
      expect(metricEvidence).toBeDefined();
      expect(metricEvidence!.source).toBe("prometheus_alerts");
      expect(metricEvidence!.title).toContain("Prometheus Metric:");
      expect(metricEvidence!.metadata).toEqual(
        expect.objectContaining({
          dataPointCount: 3,
          lastValue: "47",
        })
      );
    });

    it("should assign higher relevance for alerts matching service", async () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);
      const query = createTestQuery({ serviceName: "payments-api" });

      mockResilientGet
        .mockResolvedValueOnce(
          createAlertsResponse([
            createTestAlert({ labels: { alertname: "HighErrors", service: "payments-api" } }),
          ])
        )
        .mockResolvedValueOnce(createQueryRangeResponse([]));

      const result = await adapter.fetchEvidence(query, testContext);

      const alertEvidence = result.find((e) => e.id.startsWith("prom-alert-"));
      expect(alertEvidence!.relevance).toBe(INVESTIGATION_RELEVANCE.MONITORING_ALERT_SERVICE_MATCH);
    });

    it("should assign base alert relevance for alerts not matching service", async () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);
      const query = createTestQuery({ serviceName: "auth-service" });

      mockResilientGet
        .mockResolvedValueOnce(
          createAlertsResponse([
            createTestAlert({ labels: { alertname: "HighErrors", service: "payments-api" } }),
          ])
        )
        .mockResolvedValueOnce(createQueryRangeResponse([]));

      const result = await adapter.fetchEvidence(query, testContext);

      const alertEvidence = result.find((e) => e.id.startsWith("prom-alert-"));
      expect(alertEvidence!.relevance).toBe(INVESTIGATION_RELEVANCE.MONITORING_ALERT_BASE);
    });

    it("should assign higher relevance for range samples matching service", async () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);
      const query = createTestQuery({ serviceName: "payments-api" });

      mockResilientGet.mockResolvedValueOnce(createAlertsResponse([])).mockResolvedValueOnce(
        createQueryRangeResponse([
          createTestRangeSample({
            metric: { __name__: "http_requests_total", service: "payments-api" },
          }),
        ])
      );

      const result = await adapter.fetchEvidence(query, testContext);

      const metricEvidence = result.find((e) => e.id.startsWith("prom-metric-"));
      expect(metricEvidence!.relevance).toBe(INVESTIGATION_RELEVANCE.MONITORING_SERVICE_MATCH);
    });

    it("should handle range sample with empty values array", async () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce(createAlertsResponse([]))
        .mockResolvedValueOnce(createQueryRangeResponse([createTestRangeSample({ values: [] })]));

      const result = await adapter.fetchEvidence(query, testContext);

      const metricEvidence = result.find((e) => e.id.startsWith("prom-metric-"));
      expect(metricEvidence).toBeDefined();
      expect(metricEvidence!.summary).toContain("N/A");
    });

    it("should handle missing data in alerts response", async () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce({
          data: { status: "success" },
          status: 200,
          retryCount: 0,
          duration: 80,
        })
        .mockResolvedValueOnce(createQueryRangeResponse([]));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result).toEqual([]);
    });

    it("should handle missing result in query_range response", async () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createAlertsResponse([])).mockResolvedValueOnce({
        data: { status: "success", data: { resultType: "matrix" } },
        status: 200,
        retryCount: 0,
        duration: 80,
      });

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result).toEqual([]);
    });

    it("should use alert description annotation in summary, falling back to alert summary annotation", async () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce(
          createAlertsResponse([
            createTestAlert({
              annotations: { summary: "Fallback summary text" },
            }),
          ])
        )
        .mockResolvedValueOnce(createQueryRangeResponse([]));

      const result = await adapter.fetchEvidence(query, testContext);

      const alertEvidence = result.find((e) => e.id.startsWith("prom-alert-"));
      expect(alertEvidence!.summary).toContain("Fallback summary text");
    });

    it("should limit results to MAX_RESULTS_PER_PROVIDER", async () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);
      const query = createTestQuery();

      const manyAlerts = Array.from({ length: 20 }, (_, i) =>
        createTestAlert({
          labels: { alertname: `Alert-${String(i)}` },
          activeAt: `2026-02-20T${String(i).padStart(2, "0")}:00:00Z`,
        })
      );

      mockResilientGet
        .mockResolvedValueOnce(createAlertsResponse(manyAlerts))
        .mockResolvedValueOnce(createQueryRangeResponse([]));

      const result = await adapter.fetchEvidence(query, testContext);

      const alertItems = result.filter((e) => e.id.startsWith("prom-alert-"));
      expect(alertItems.length).toBeLessThanOrEqual(MONITORING_DEFAULTS.MAX_RESULTS_PER_PROVIDER);
    });

    it("should pass timeout and maxRetries from MONITORING_DEFAULTS", async () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce(createAlertsResponse([]))
        .mockResolvedValueOnce(createQueryRangeResponse([]));

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
    it("should return empty array when alerts fetch fails", async () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockRejectedValueOnce(new Error("Alerts API timeout"))
        .mockResolvedValueOnce(createQueryRangeResponse([createTestRangeSample()]));

      const result = await adapter.fetchEvidence(query, testContext);

      // Metrics should still be returned
      const metricItems = result.filter((e) => e.id.startsWith("prom-metric-"));
      expect(metricItems).toHaveLength(1);
    });

    it("should return empty array when metrics fetch fails", async () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce(createAlertsResponse([createTestAlert()]))
        .mockRejectedValueOnce(new Error("Query range timeout"));

      const result = await adapter.fetchEvidence(query, testContext);

      // Alerts should still be returned
      const alertItems = result.filter((e) => e.id.startsWith("prom-alert-"));
      expect(alertItems).toHaveLength(1);
    });

    it("should return empty array when both fetches fail", async () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockRejectedValueOnce(new Error("Alerts timeout"))
        .mockRejectedValueOnce(new Error("Metrics timeout"));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result).toEqual([]);
    });

    it("should log warning when a fetch fails", async () => {
      const adapter = createPrometheusMonitoringAdapter(TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockRejectedValueOnce(new Error("Connection refused"))
        .mockResolvedValueOnce(createQueryRangeResponse([]));

      await adapter.fetchEvidence(query, testContext);

      expect(mockLoggerInstance.warn).toHaveBeenCalled();
    });
  });
});

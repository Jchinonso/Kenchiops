/**
 * Datadog Monitoring Adapter Tests
 *
 * Tests for the Datadog monitoring adapter: configuration check,
 * metrics/events parallel fetching, evidence mapping, relevance scoring,
 * error resilience, and request construction.
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

import { createDatadogMonitoringAdapter } from "../../adapters/datadogMonitoringAdapter.js";
import type { MonitoringQuery } from "../../types/monitoringTypes.js";
import { MONITORING_DEFAULTS, DATADOG_API } from "../../constants/monitoringConstants.js";
import { INVESTIGATION_RELEVANCE } from "../../constants/investigationConstants.js";

// ==================== Test Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const TEST_API_KEY = "dd-api-key-123";
const TEST_APP_KEY = "dd-app-key-456";
const TEST_BASE_URL = "https://api.datadoghq.com";

const createTestQuery = (overrides: Partial<MonitoringQuery> = {}): MonitoringQuery => ({
  tenantId: "test-tenant",
  serviceName: "payments-api",
  environment: "production",
  symptom: "errors",
  hoursBack: 6,
  limit: 25,
  ...overrides,
});

const createMetricsResponse = (series: ReadonlyArray<Record<string, unknown>> = []) => ({
  data: { status: "ok", series },
  status: 200,
  retryCount: 0,
  duration: 150,
});

const createEventsResponse = (events: ReadonlyArray<Record<string, unknown>> = []) => ({
  data: { events },
  status: 200,
  retryCount: 0,
  duration: 100,
});

const createTestMetricSeries = (overrides: Record<string, unknown> = {}) => ({
  metric: "trace.http.request.errors",
  pointlist: [[1708351200000, 42.5]],
  scope: "service:payments-api",
  expression: "sum:trace.http.request.errors{service:payments-api}.as_count()",
  ...overrides,
});

const createTestEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 12345,
  title: "High error rate on payments-api",
  text: "Error rate exceeded 5% threshold",
  date_happened: 1708351200,
  alert_type: "error",
  source_type_name: "monitor",
  tags: ["service:payments-api", "env:production"],
  ...overrides,
});

// ==================== Tests ====================

describe("createDatadogMonitoringAdapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("isConfigured", () => {
    it("should return true when both API key and app key are provided", () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);

      expect(adapter.isConfigured()).toBe(true);
    });

    it("should return false when API key is empty", () => {
      const adapter = createDatadogMonitoringAdapter("", TEST_APP_KEY, TEST_BASE_URL);

      expect(adapter.isConfigured()).toBe(false);
    });

    it("should return false when app key is empty", () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, "", TEST_BASE_URL);

      expect(adapter.isConfigured()).toBe(false);
    });

    it("should return false when both keys are empty", () => {
      const adapter = createDatadogMonitoringAdapter("", "", TEST_BASE_URL);

      expect(adapter.isConfigured()).toBe(false);
    });
  });

  describe("name", () => {
    it("should have name 'datadog'", () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);

      expect(adapter.name).toBe("datadog");
    });
  });

  describe("fetchEvidence", () => {
    it("should fetch metrics and events in parallel", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce(createMetricsResponse([createTestMetricSeries()]))
        .mockResolvedValueOnce(createEventsResponse([createTestEvent()]));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(mockResilientGet).toHaveBeenCalledTimes(2);
      // First call: metrics
      expect(mockResilientGet.mock.calls[0][0]).toContain(DATADOG_API.METRICS_QUERY);
      // Second call: events
      expect(mockResilientGet.mock.calls[1][0]).toContain(DATADOG_API.EVENTS_LIST);
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it("should construct metrics URL with encoded query and time range", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery({ symptom: "errors", serviceName: "payments-api" });

      mockResilientGet
        .mockResolvedValueOnce(createMetricsResponse([]))
        .mockResolvedValueOnce(createEventsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const metricsUrl = mockResilientGet.mock.calls[0][0] as string;
      expect(metricsUrl).toContain(`${TEST_BASE_URL}${DATADOG_API.METRICS_QUERY}`);
      expect(metricsUrl).toContain("query=");
      expect(metricsUrl).toContain("from=");
      expect(metricsUrl).toContain("to=");
    });

    it("should pass DD-API-KEY and DD-APPLICATION-KEY headers", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce(createMetricsResponse([]))
        .mockResolvedValueOnce(createEventsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      // Verify headers on the first call (metrics)
      const metricsOptions = mockResilientGet.mock.calls[0][1];
      expect(metricsOptions).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            "DD-API-KEY": TEST_API_KEY,
            "DD-APPLICATION-KEY": TEST_APP_KEY,
          }),
        })
      );

      // Verify headers on the second call (events)
      const eventsOptions = mockResilientGet.mock.calls[1][1];
      expect(eventsOptions).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            "DD-API-KEY": TEST_API_KEY,
            "DD-APPLICATION-KEY": TEST_APP_KEY,
          }),
        })
      );
    });

    it("should pass timeout and maxRetries from MONITORING_DEFAULTS", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce(createMetricsResponse([]))
        .mockResolvedValueOnce(createEventsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const options = mockResilientGet.mock.calls[0][1];
      expect(options).toEqual(
        expect.objectContaining({
          timeout: MONITORING_DEFAULTS.REQUEST_TIMEOUT_MS,
          maxRetries: MONITORING_DEFAULTS.MAX_RETRIES,
        })
      );
    });

    it("should map metric series to evidence items with correct source", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce(createMetricsResponse([createTestMetricSeries()]))
        .mockResolvedValueOnce(createEventsResponse([]));

      const result = await adapter.fetchEvidence(query, testContext);

      const metricEvidence = result.find((e) => e.source === "datadog_metrics");
      expect(metricEvidence).toBeDefined();
      expect(metricEvidence!.id).toContain("dd-metric-");
      expect(metricEvidence!.title).toContain("Datadog Metric:");
      expect(metricEvidence!.metadata).toEqual(
        expect.objectContaining({
          metric: "trace.http.request.errors",
          scope: "service:payments-api",
        })
      );
    });

    it("should map events to evidence items with correct source", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce(createMetricsResponse([]))
        .mockResolvedValueOnce(createEventsResponse([createTestEvent()]));

      const result = await adapter.fetchEvidence(query, testContext);

      const eventEvidence = result.find((e) => e.source === "datadog_events");
      expect(eventEvidence).toBeDefined();
      expect(eventEvidence!.id).toContain("dd-event-");
      expect(eventEvidence!.title).toContain("High error rate");
      expect(eventEvidence!.metadata).toEqual(
        expect.objectContaining({
          eventId: 12345,
          alertType: "error",
        })
      );
    });

    it("should assign higher relevance for service-matching metric series", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery({ serviceName: "payments-api" });

      mockResilientGet
        .mockResolvedValueOnce(
          createMetricsResponse([createTestMetricSeries({ scope: "service:payments-api" })])
        )
        .mockResolvedValueOnce(createEventsResponse([]));

      const result = await adapter.fetchEvidence(query, testContext);

      const metricEvidence = result.find((e) => e.source === "datadog_metrics");
      expect(metricEvidence!.relevance).toBe(INVESTIGATION_RELEVANCE.MONITORING_SERVICE_MATCH);
    });

    it("should assign base relevance for non-matching metric series", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery({ serviceName: "auth-service" });

      mockResilientGet
        .mockResolvedValueOnce(
          createMetricsResponse([createTestMetricSeries({ scope: "service:payments-api" })])
        )
        .mockResolvedValueOnce(createEventsResponse([]));

      const result = await adapter.fetchEvidence(query, testContext);

      const metricEvidence = result.find((e) => e.source === "datadog_metrics");
      expect(metricEvidence!.relevance).toBe(INVESTIGATION_RELEVANCE.MONITORING_BASE);
    });

    it("should assign alert-level relevance for error events matching service", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery({ serviceName: "payments-api" });

      mockResilientGet.mockResolvedValueOnce(createMetricsResponse([])).mockResolvedValueOnce(
        createEventsResponse([
          createTestEvent({
            alert_type: "error",
            tags: ["service:payments-api"],
          }),
        ])
      );

      const result = await adapter.fetchEvidence(query, testContext);

      const eventEvidence = result.find((e) => e.source === "datadog_events");
      expect(eventEvidence!.relevance).toBe(INVESTIGATION_RELEVANCE.MONITORING_ALERT_SERVICE_MATCH);
    });

    it("should assign alert-base relevance for error events not matching service", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery({ serviceName: "auth-service" });

      mockResilientGet.mockResolvedValueOnce(createMetricsResponse([])).mockResolvedValueOnce(
        createEventsResponse([
          createTestEvent({
            alert_type: "error",
            tags: ["service:payments-api"],
          }),
        ])
      );

      const result = await adapter.fetchEvidence(query, testContext);

      const eventEvidence = result.find((e) => e.source === "datadog_events");
      expect(eventEvidence!.relevance).toBe(INVESTIGATION_RELEVANCE.MONITORING_ALERT_BASE);
    });

    it("should include service tag filter in events URL when serviceName provided", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery({ serviceName: "payments-api" });

      mockResilientGet
        .mockResolvedValueOnce(createMetricsResponse([]))
        .mockResolvedValueOnce(createEventsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const eventsUrl = mockResilientGet.mock.calls[1][0] as string;
      expect(eventsUrl).toContain("tags=service:");
      expect(eventsUrl).toContain("payments-api");
    });

    it("should omit service tag filter in events URL when serviceName is null", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery({ serviceName: null });

      mockResilientGet
        .mockResolvedValueOnce(createMetricsResponse([]))
        .mockResolvedValueOnce(createEventsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const eventsUrl = mockResilientGet.mock.calls[1][0] as string;
      expect(eventsUrl).not.toContain("tags=");
    });

    it("should use wildcard for service name in metric query when serviceName is null", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery({ serviceName: null, symptom: "errors" });

      mockResilientGet
        .mockResolvedValueOnce(createMetricsResponse([]))
        .mockResolvedValueOnce(createEventsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const metricsUrl = mockResilientGet.mock.calls[0][0] as string;
      // The metric query should replace $SERVICE with *
      expect(decodeURIComponent(metricsUrl)).toContain("service:*");
    });

    it("should clamp hoursBack to 24-hour Datadog window limit", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      // Request 72 hours back but Datadog limits to 24
      const query = createTestQuery({ hoursBack: 72 });

      mockResilientGet
        .mockResolvedValueOnce(createMetricsResponse([]))
        .mockResolvedValueOnce(createEventsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const metricsUrl = mockResilientGet.mock.calls[0][0] as string;
      const urlParts = new URL(metricsUrl);
      const from = Number(urlParts.searchParams.get("from"));
      const to = Number(urlParts.searchParams.get("to"));
      const hoursRange = (to - from) / 3600;

      // Should be clamped to 24 hours max
      expect(hoursRange).toBeLessThanOrEqual(MONITORING_DEFAULTS.DATADOG_MAX_QUERY_WINDOW_HOURS);
    });

    it("should limit results to MAX_RESULTS_PER_PROVIDER", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery();

      // Create more series than the max
      const manySeries = Array.from({ length: 20 }, (_, i) =>
        createTestMetricSeries({ metric: `metric-${String(i)}` })
      );

      mockResilientGet
        .mockResolvedValueOnce(createMetricsResponse(manySeries))
        .mockResolvedValueOnce(createEventsResponse([]));

      const result = await adapter.fetchEvidence(query, testContext);

      // Metrics should be capped
      const metricItems = result.filter((e) => e.source === "datadog_metrics");
      expect(metricItems.length).toBeLessThanOrEqual(MONITORING_DEFAULTS.MAX_RESULTS_PER_PROVIDER);
    });

    it("should handle metric series with empty pointlist", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce(createMetricsResponse([createTestMetricSeries({ pointlist: [] })]))
        .mockResolvedValueOnce(createEventsResponse([]));

      const result = await adapter.fetchEvidence(query, testContext);

      const metricEvidence = result.find((e) => e.source === "datadog_metrics");
      expect(metricEvidence).toBeDefined();
      expect(metricEvidence!.summary).toContain("N/A");
    });

    it("should handle events with no tags", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery({ serviceName: "payments-api" });

      mockResilientGet
        .mockResolvedValueOnce(createMetricsResponse([]))
        .mockResolvedValueOnce(createEventsResponse([createTestEvent({ tags: undefined })]));

      const result = await adapter.fetchEvidence(query, testContext);

      const eventEvidence = result.find((e) => e.source === "datadog_events");
      expect(eventEvidence).toBeDefined();
      expect(eventEvidence!.metadata).toEqual(expect.objectContaining({ tags: [] }));
    });

    it("should handle missing series in metrics response", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce({
          data: { status: "ok" },
          status: 200,
          retryCount: 0,
          duration: 100,
        })
        .mockResolvedValueOnce(createEventsResponse([]));

      const result = await adapter.fetchEvidence(query, testContext);

      // No metrics, no events = empty
      expect(result).toEqual([]);
    });

    it("should handle missing events in events response", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createMetricsResponse([])).mockResolvedValueOnce({
        data: {},
        status: 200,
        retryCount: 0,
        duration: 100,
      });

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result).toEqual([]);
    });

    it("should convert event date_happened to ISO timestamp", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery();
      const epochSeconds = 1708351200;

      mockResilientGet
        .mockResolvedValueOnce(createMetricsResponse([]))
        .mockResolvedValueOnce(
          createEventsResponse([createTestEvent({ date_happened: epochSeconds })])
        );

      const result = await adapter.fetchEvidence(query, testContext);

      const eventEvidence = result.find((e) => e.source === "datadog_events");
      const expectedDate = new Date(epochSeconds * 1000).toISOString();
      expect(eventEvidence!.timestamp).toBe(expectedDate);
    });
  });

  describe("error resilience", () => {
    it("should return empty array when metrics fetch fails", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockRejectedValueOnce(new Error("Metrics API timeout"))
        .mockResolvedValueOnce(createEventsResponse([createTestEvent()]));

      const result = await adapter.fetchEvidence(query, testContext);

      // Events should still be returned even though metrics failed
      const eventItems = result.filter((e) => e.source === "datadog_events");
      expect(eventItems).toHaveLength(1);
    });

    it("should return empty array when events fetch fails", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockResolvedValueOnce(createMetricsResponse([createTestMetricSeries()]))
        .mockRejectedValueOnce(new Error("Events API timeout"));

      const result = await adapter.fetchEvidence(query, testContext);

      // Metrics should still be returned even though events failed
      const metricItems = result.filter((e) => e.source === "datadog_metrics");
      expect(metricItems).toHaveLength(1);
    });

    it("should return empty array when both fetches fail", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockRejectedValueOnce(new Error("Metrics timeout"))
        .mockRejectedValueOnce(new Error("Events timeout"));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result).toEqual([]);
    });

    it("should log warning when metrics fetch fails", async () => {
      const adapter = createDatadogMonitoringAdapter(TEST_API_KEY, TEST_APP_KEY, TEST_BASE_URL);
      const query = createTestQuery();

      mockResilientGet
        .mockRejectedValueOnce(new Error("API timeout"))
        .mockResolvedValueOnce(createEventsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      // Module-scoped logger uses the shared mock instance
      expect(mockLoggerInstance.warn).toHaveBeenCalled();
    });
  });
});

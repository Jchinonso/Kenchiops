/**
 * PagerDuty Monitoring Adapter Tests
 *
 * Tests for the PagerDuty monitoring adapter: configuration check,
 * Token-based auth, status filtering (triggered/acknowledged),
 * incident-to-evidence mapping, relevance scoring, and error resilience.
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

import { createPagerDutyMonitoringAdapter } from "../../investigation/adapters/pagerdutyAdapter.js";
import type { MonitoringQuery } from "../../investigation/monitoringTypes.js";
import { MONITORING_DEFAULTS, PAGERDUTY_API } from "../../investigation/monitoringConstants.js";
import { INVESTIGATION_RELEVANCE } from "../../investigation/constants.js";
import type { RequestContext } from "../../core/types.js";

// ==================== Test Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const TEST_API_TOKEN = "pd-api-token-xyz";

const createTestQuery = (overrides: Partial<MonitoringQuery> = {}): MonitoringQuery => ({
  tenantId: "test-tenant",
  serviceName: "payments-api",
  environment: "production",
  symptom: "errors",
  hoursBack: 6,
  limit: 25,
  ...overrides,
});

const createIncidentsResponse = (incidents: ReadonlyArray<Record<string, unknown>> = []) => ({
  data: { incidents },
  status: 200,
  retryCount: 0,
  duration: 110,
});

const createTestIncident = (overrides: Record<string, unknown> = {}) => ({
  id: "PD-INC-001",
  incident_number: 42,
  title: "High error rate on payments-api",
  description: "Error rate exceeded 5% threshold for payments-api",
  created_at: "2026-02-20T10:00:00Z",
  updated_at: "2026-02-20T10:05:00Z",
  status: "triggered",
  urgency: "high",
  html_url: "https://kenchi.pagerduty.com/incidents/PD-INC-001",
  service: {
    id: "PSVC123",
    summary: "Payments API",
  },
  assignments: [
    {
      assignee: {
        summary: "John Doe",
      },
    },
  ],
  ...overrides,
});

// ==================== Tests ====================

describe("createPagerDutyMonitoringAdapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("isConfigured", () => {
    it("should return true when API token is provided", () => {
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);

      expect(adapter.isConfigured()).toBe(true);
    });

    it("should return false when API token is empty", () => {
      const adapter = createPagerDutyMonitoringAdapter("");

      expect(adapter.isConfigured()).toBe(false);
    });
  });

  describe("name", () => {
    it("should have name 'pagerduty'", () => {
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);

      expect(adapter.name).toBe("pagerduty");
    });
  });

  describe("fetchEvidence", () => {
    it("should fetch incidents from PagerDuty API", async () => {
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createIncidentsResponse([createTestIncident()]));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(mockResilientGet).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
    });

    it("should use PagerDuty base URL and incidents endpoint", async () => {
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createIncidentsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const url = mockResilientGet.mock.calls[0][0] as string;
      expect(url).toContain(`${PAGERDUTY_API.BASE_URL}${PAGERDUTY_API.INCIDENTS}`);
    });

    it("should pass Token-based auth header (Token token=)", async () => {
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createIncidentsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const options = mockResilientGet.mock.calls[0][1];
      expect(options).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Token token=${TEST_API_TOKEN}`,
            "Content-Type": "application/json",
          }),
        })
      );
    });

    it("should filter by triggered and acknowledged statuses", async () => {
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createIncidentsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const url = mockResilientGet.mock.calls[0][0] as string;
      expect(url).toContain("statuses%5B%5D=triggered");
      expect(url).toContain("statuses%5B%5D=acknowledged");
    });

    it("should include since, until, limit, and sort_by parameters", async () => {
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);
      const query = createTestQuery({ limit: 15, hoursBack: 4 });

      mockResilientGet.mockResolvedValueOnce(createIncidentsResponse([]));

      await adapter.fetchEvidence(query, testContext);

      const url = mockResilientGet.mock.calls[0][0] as string;
      expect(url).toContain("since=");
      expect(url).toContain("until=");
      expect(url).toContain("limit=15");
      expect(url).toContain("sort_by=created_at%3Adesc");
    });

    it("should map incident to evidence with correct source type", async () => {
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createIncidentsResponse([createTestIncident()]));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result).toHaveLength(1);
      expect(result[0].source).toBe("pagerduty_incidents");
      expect(result[0].id).toBe("pd-incident-PD-INC-001");
      expect(result[0].title).toContain("PagerDuty Incident:");
      expect(result[0].title).toContain("High error rate");
    });

    it("should include incident metadata (number, status, urgency, service, assignees)", async () => {
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createIncidentsResponse([createTestIncident()]));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result[0].metadata).toEqual(
        expect.objectContaining({
          incidentId: "PD-INC-001",
          incidentNumber: 42,
          status: "triggered",
          urgency: "high",
          serviceName: "Payments API",
          serviceId: "PSVC123",
          htmlUrl: "https://kenchi.pagerduty.com/incidents/PD-INC-001",
          assignees: ["John Doe"],
        })
      );
    });

    it("should include assignee names and service info in summary", async () => {
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createIncidentsResponse([createTestIncident()]));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result[0].summary).toContain("PagerDuty #42");
      expect(result[0].summary).toContain("triggered");
      expect(result[0].summary).toContain("Payments API");
      expect(result[0].summary).toContain("John Doe");
    });

    it("should assign alert-service-match relevance for active incident matching service", async () => {
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);
      const query = createTestQuery({ serviceName: "payments" });

      mockResilientGet.mockResolvedValueOnce(
        createIncidentsResponse([
          createTestIncident({
            status: "triggered",
            service: { id: "svc-1", summary: "Payments API" },
          }),
        ])
      );

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result[0].relevance).toBe(INVESTIGATION_RELEVANCE.MONITORING_ALERT_SERVICE_MATCH);
    });

    it("should assign alert-base relevance for active incident not matching service", async () => {
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);
      const query = createTestQuery({ serviceName: "auth-service" });

      mockResilientGet.mockResolvedValueOnce(
        createIncidentsResponse([
          createTestIncident({
            status: "triggered",
            service: { id: "svc-1", summary: "Payments API" },
            title: "Payments error",
          }),
        ])
      );

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result[0].relevance).toBe(INVESTIGATION_RELEVANCE.MONITORING_ALERT_BASE);
    });

    it("should match service via incident title as well as service summary", async () => {
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);
      const query = createTestQuery({ serviceName: "payments" });

      mockResilientGet.mockResolvedValueOnce(
        createIncidentsResponse([
          createTestIncident({
            title: "High error rate on payments-api",
            service: { id: "svc-1", summary: "Generic Service" },
          }),
        ])
      );

      const result = await adapter.fetchEvidence(query, testContext);

      // Should match because title contains "payments"
      expect(result[0].relevance).toBe(INVESTIGATION_RELEVANCE.MONITORING_ALERT_SERVICE_MATCH);
    });

    it("should handle incident without service object", async () => {
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(
        createIncidentsResponse([createTestIncident({ service: undefined })])
      );

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result).toHaveLength(1);
      expect(result[0].metadata).toEqual(
        expect.objectContaining({
          serviceName: null,
          serviceId: null,
        })
      );
    });

    it("should handle incident without assignments", async () => {
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(
        createIncidentsResponse([createTestIncident({ assignments: undefined })])
      );

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result[0].metadata).toEqual(
        expect.objectContaining({
          assignees: [],
        })
      );
    });

    it("should handle incident without description", async () => {
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(
        createIncidentsResponse([createTestIncident({ description: undefined })])
      );

      const result = await adapter.fetchEvidence(query, testContext);

      // Should not include null description part
      expect(result).toHaveLength(1);
    });

    it("should handle missing incidents in response", async () => {
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);
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
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);
      const query = createTestQuery();

      const manyIncidents = Array.from({ length: 20 }, (_, i) =>
        createTestIncident({
          id: `PD-INC-${String(i)}`,
          incident_number: i,
          title: `Incident ${String(i)}`,
        })
      );

      mockResilientGet.mockResolvedValueOnce(createIncidentsResponse(manyIncidents));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result.length).toBeLessThanOrEqual(MONITORING_DEFAULTS.MAX_RESULTS_PER_PROVIDER);
    });

    it("should use created_at as evidence timestamp", async () => {
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(
        createIncidentsResponse([createTestIncident({ created_at: "2026-02-20T14:30:00Z" })])
      );

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result[0].timestamp).toBe("2026-02-20T14:30:00Z");
    });

    it("should pass timeout and maxRetries from MONITORING_DEFAULTS", async () => {
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);
      const query = createTestQuery();

      mockResilientGet.mockResolvedValueOnce(createIncidentsResponse([]));

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
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);
      const query = createTestQuery();

      mockResilientGet.mockRejectedValueOnce(new Error("PagerDuty API timeout"));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result).toEqual([]);
    });

    it("should log warning when fetch fails", async () => {
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);
      const query = createTestQuery();

      mockResilientGet.mockRejectedValueOnce(new Error("Connection refused"));

      await adapter.fetchEvidence(query, testContext);

      expect(mockLoggerInstance.warn).toHaveBeenCalled();
    });

    it("should never throw even on unexpected errors", async () => {
      const adapter = createPagerDutyMonitoringAdapter(TEST_API_TOKEN);
      const query = createTestQuery();

      mockResilientGet.mockRejectedValueOnce(new TypeError("Cannot read properties of null"));

      const result = await adapter.fetchEvidence(query, testContext);

      expect(result).toEqual([]);
    });
  });
});

/**
 * OpsGenie Context Adapter Tests
 *
 * Tests for the OpsGenie enrichment adapter: parallel API calls for details/logs/notes,
 * log and note mapping, severity mapping, error resilience, and empty API key handling.
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

import { createOpsGenieContextAdapter } from "./opsgenieContextAdapter.js";
import type { NormalizedAlert } from "../types/incidentTypes.js";

// ==================== Test Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const TEST_API_KEY = "genie-key-test-123";

const createTestAlert = (overrides: Partial<NormalizedAlert> = {}): NormalizedAlert => ({
  sourceAlertId: "alert-og-456",
  deliveryId: "delivery-og-abc",
  source: "opsgenie",
  title: "High error rate on payments service",
  description: "Error rate exceeded 5%",
  severity: "high",
  fingerprint: "fp-og-123",
  serviceName: "payments-api",
  environment: "production",
  metrics: {},
  labels: {},
  receivedAt: "2026-03-26T14:00:00.000Z",
  sourcePayload: {},
  ...overrides,
});

const createAlertDetailResponse = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  data: {
    id: "alert-og-456",
    tinyId: "T1",
    message: "High error rate",
    description: "Detailed description from API",
    priority: "P2",
    status: "open",
    tags: ["service:payments-api"],
    createdAt: "2026-03-26T13:50:00.000Z",
    updatedAt: "2026-03-26T13:55:00.000Z",
    acknowledged: true,
    count: 5,
    teams: [{ id: "team-1", type: "team", name: "Platform" }],
    responders: [],
    report: { ackTime: 120 },
    ...overrides,
  },
  requestId: "req-123",
});

const createAlertLogsResponse = (
  logs: Record<string, unknown>[] = []
): Record<string, unknown> => ({
  data:
    logs.length > 0
      ? logs
      : [
          {
            log: "Alert created via API Integration",
            type: "system",
            owner: "opsgenie-system",
            createdAt: "2026-03-26T13:50:00.000Z",
            offset: "0",
          },
          {
            log: "Alert acknowledged by user@kenchi.dev",
            type: "alertRecipient",
            owner: "user@kenchi.dev",
            createdAt: "2026-03-26T13:52:00.000Z",
            offset: "1",
          },
        ],
  requestId: "req-456",
});

const createAlertNotesResponse = (
  notes: Record<string, unknown>[] = []
): Record<string, unknown> => ({
  data:
    notes.length > 0
      ? notes
      : [
          {
            note: "Investigating high error rate on payments service",
            owner: "oncall@kenchi.dev",
            createdAt: "2026-03-26T13:53:00.000Z",
            offset: "0",
          },
        ],
  requestId: "req-789",
});

// ==================== Tests ====================

describe("createOpsGenieContextAdapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("fetchContext", () => {
    it("should return empty AlertContext when API key is empty", async () => {
      const adapter = createOpsGenieContextAdapter("");
      const alert = createTestAlert();

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.source).toBe("opsgenie");
      expect(result.alertId).toBe("alert-og-456");
      expect(result.evidence.logs).toEqual([]);
      expect(result.providerMetadata).toEqual({});
      expect(mockResilientGet).not.toHaveBeenCalled();
    });

    it("should make parallel API calls for details, logs, and notes", async () => {
      const adapter = createOpsGenieContextAdapter(TEST_API_KEY);
      const alert = createTestAlert();

      mockResilientGet
        .mockResolvedValueOnce({ data: createAlertDetailResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertLogsResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertNotesResponse(), status: 200 });

      await adapter.fetchContext(alert, testContext);

      expect(mockResilientGet).toHaveBeenCalledTimes(3);

      // Verify URL patterns
      const calls = mockResilientGet.mock.calls;
      expect(calls[0][0]).toBe("https://api.opsgenie.com/v2/alerts/alert-og-456");
      expect(calls[1][0]).toBe("https://api.opsgenie.com/v2/alerts/alert-og-456/logs");
      expect(calls[2][0]).toBe("https://api.opsgenie.com/v2/alerts/alert-og-456/notes");
    });

    it("should include GenieKey auth header in all requests", async () => {
      const adapter = createOpsGenieContextAdapter(TEST_API_KEY);
      const alert = createTestAlert();

      mockResilientGet
        .mockResolvedValueOnce({ data: createAlertDetailResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertLogsResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertNotesResponse(), status: 200 });

      await adapter.fetchContext(alert, testContext);

      for (const call of mockResilientGet.mock.calls) {
        expect(call[1]).toEqual(
          expect.objectContaining({
            headers: { Authorization: `GenieKey ${TEST_API_KEY}` },
          })
        );
      }
    });

    it("should URL-encode the alert ID in API paths", async () => {
      const adapter = createOpsGenieContextAdapter(TEST_API_KEY);
      const alert = createTestAlert({ sourceAlertId: "alert/special chars" });

      mockResilientGet
        .mockResolvedValueOnce({ data: createAlertDetailResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertLogsResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertNotesResponse(), status: 200 });

      await adapter.fetchContext(alert, testContext);

      expect(mockResilientGet.mock.calls[0][0]).toContain("alert%2Fspecial%20chars");
    });

    it("should map log entries to LogSnippet evidence", async () => {
      const adapter = createOpsGenieContextAdapter(TEST_API_KEY);
      const alert = createTestAlert();

      mockResilientGet
        .mockResolvedValueOnce({ data: createAlertDetailResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertLogsResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertNotesResponse(), status: 200 });

      const result = await adapter.fetchContext(alert, testContext);

      // 2 logs + 1 note = 3 log snippets
      expect(result.evidence.logs).toHaveLength(3);

      expect(result.evidence.logs[0]).toEqual({
        timestamp: "2026-03-26T13:50:00.000Z",
        level: "info",
        message: "Alert created via API Integration",
        source: "opsgenie-system",
        metadata: { type: "system" },
      });
    });

    it("should map notes to LogSnippet evidence with type 'note'", async () => {
      const adapter = createOpsGenieContextAdapter(TEST_API_KEY);
      const alert = createTestAlert();

      mockResilientGet
        .mockResolvedValueOnce({ data: createAlertDetailResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertLogsResponse([]), status: 200 })
        .mockResolvedValueOnce({ data: createAlertNotesResponse(), status: 200 });

      const result = await adapter.fetchContext(alert, testContext);

      // Adapter returns all timeline entries (system, recipient, notes), not just notes
      expect(result.evidence.logs.length).toBeGreaterThanOrEqual(1);
      const noteLog = result.evidence.logs.find(
        (log) => (log.metadata as Record<string, unknown>)?.type === "note"
      );
      expect(noteLog).toEqual({
        timestamp: "2026-03-26T13:53:00.000Z",
        level: "info",
        message: "Investigating high error rate on payments service",
        source: "oncall@kenchi.dev",
        metadata: { type: "note" },
      });
    });

    it("should use 'opsgenie-system' as source when log owner is empty", async () => {
      const adapter = createOpsGenieContextAdapter(TEST_API_KEY);
      const alert = createTestAlert();

      mockResilientGet
        .mockResolvedValueOnce({ data: createAlertDetailResponse(), status: 200 })
        .mockResolvedValueOnce({
          data: createAlertLogsResponse([
            {
              log: "test log",
              type: "system",
              owner: "",
              createdAt: "2026-03-26T13:50:00.000Z",
              offset: "0",
            },
          ]),
          status: 200,
        })
        .mockResolvedValueOnce({ data: createAlertNotesResponse([]), status: 200 });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.evidence.logs[0].source).toBe("opsgenie");
    });

    it("should use 'opsgenie-note' as source when note owner is empty", async () => {
      const adapter = createOpsGenieContextAdapter(TEST_API_KEY);
      const alert = createTestAlert();

      mockResilientGet
        .mockResolvedValueOnce({ data: createAlertDetailResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertLogsResponse([]), status: 200 })
        .mockResolvedValueOnce({
          data: createAlertNotesResponse([
            {
              note: "test note",
              owner: "",
              createdAt: "2026-03-26T13:53:00.000Z",
              offset: "0",
            },
          ]),
          status: 200,
        });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.evidence.logs[0].source).toBe("opsgenie-system");
    });

    // -- Provider metadata --

    it("should populate providerMetadata from alert details", async () => {
      const adapter = createOpsGenieContextAdapter(TEST_API_KEY);
      const alert = createTestAlert();

      mockResilientGet
        .mockResolvedValueOnce({ data: createAlertDetailResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertLogsResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertNotesResponse(), status: 200 });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.providerMetadata).toEqual({
        acknowledged: true,
        eventCount: 5,
        teams: [{ id: "team-1", type: "team", name: "Platform" }],
        ackTime: 120,
      });
    });

    it("should use description from API details when available", async () => {
      const adapter = createOpsGenieContextAdapter(TEST_API_KEY);
      const alert = createTestAlert();

      mockResilientGet
        .mockResolvedValueOnce({ data: createAlertDetailResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertLogsResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertNotesResponse(), status: 200 });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.description).toBe("Detailed description from API");
    });

    it("should use createdAt from API details as triggeredAt", async () => {
      const adapter = createOpsGenieContextAdapter(TEST_API_KEY);
      const alert = createTestAlert();

      mockResilientGet
        .mockResolvedValueOnce({ data: createAlertDetailResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertLogsResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertNotesResponse(), status: 200 });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.triggeredAt).toBe("2026-03-26T13:50:00.000Z");
    });

    // -- Severity mapping --

    it("should map critical alert severity to critical AlertContext severity", async () => {
      const adapter = createOpsGenieContextAdapter(TEST_API_KEY);
      const alert = createTestAlert({ severity: "critical" });

      mockResilientGet
        .mockResolvedValueOnce({ data: createAlertDetailResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertLogsResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertNotesResponse(), status: 200 });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.severity).toBe("critical");
    });

    it("should map medium alert severity to warning AlertContext severity", async () => {
      const adapter = createOpsGenieContextAdapter(TEST_API_KEY);
      const alert = createTestAlert({ severity: "medium" });

      mockResilientGet
        .mockResolvedValueOnce({ data: createAlertDetailResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertLogsResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertNotesResponse(), status: 200 });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.severity).toBe("warning");
    });

    // -- Time window --

    it("should build time window 1 hour before receivedAt", async () => {
      const adapter = createOpsGenieContextAdapter(TEST_API_KEY);
      const alert = createTestAlert({ receivedAt: "2026-03-26T14:00:00.000Z" });

      mockResilientGet
        .mockResolvedValueOnce({ data: createAlertDetailResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertLogsResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertNotesResponse(), status: 200 });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.timeWindow.start).toBe("2026-03-26T13:00:00.000Z");
      expect(result.timeWindow.end).toBe("2026-03-26T14:00:00.000Z");
    });

    // -- Error resilience --

    it("should return empty AlertContext when all API calls fail", async () => {
      const adapter = createOpsGenieContextAdapter(TEST_API_KEY);
      const alert = createTestAlert();

      mockResilientGet.mockRejectedValue(new Error("Connection refused"));

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.source).toBe("opsgenie");
      expect(result.evidence.logs).toEqual([]);
      expect(result.providerMetadata).toEqual(
        expect.objectContaining({
          acknowledged: false,
          eventCount: 0,
        })
      );
    });

    it("should handle details fetch failure gracefully while logs/notes succeed", async () => {
      const adapter = createOpsGenieContextAdapter(TEST_API_KEY);
      const alert = createTestAlert();

      // Details fails, logs and notes succeed
      mockResilientGet
        .mockRejectedValueOnce(new Error("Not found"))
        .mockResolvedValueOnce({ data: createAlertLogsResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertNotesResponse(), status: 200 });

      const result = await adapter.fetchContext(alert, testContext);

      // Logs and notes should still be present
      expect(result.evidence.logs).toHaveLength(3);
      // Details-derived metadata uses defaults
      expect(result.providerMetadata.acknowledged).toBe(false);
      expect(result.providerMetadata.eventCount).toBe(0);
    });

    it("should handle logs fetch failure gracefully while details/notes succeed", async () => {
      const adapter = createOpsGenieContextAdapter(TEST_API_KEY);
      const alert = createTestAlert();

      mockResilientGet
        .mockResolvedValueOnce({ data: createAlertDetailResponse(), status: 200 })
        .mockRejectedValueOnce(new Error("Timeout"))
        .mockResolvedValueOnce({ data: createAlertNotesResponse(), status: 200 });

      const result = await adapter.fetchContext(alert, testContext);

      // Only notes in logs (0 log entries + 1 note)
      expect(result.evidence.logs).toHaveLength(1);
      expect(result.providerMetadata.acknowledged).toBe(true);
    });

    it("should log warning with retry info when sub-requests fail", async () => {
      const adapter = createOpsGenieContextAdapter(TEST_API_KEY);
      const alert = createTestAlert();

      const error = new Error("Internal Server Error");
      (error as Record<string, unknown>).status = 500;
      mockResilientGet
        .mockResolvedValueOnce({ data: createAlertDetailResponse(), status: 200 })
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: createAlertNotesResponse(), status: 200 });

      await adapter.fetchContext(alert, testContext);

      expect(mockLoggerInstance.warn).toHaveBeenCalledWith(
        "OpsGenie alert logs fetch failed",
        expect.objectContaining({
          provider: "opsgenie",
          operation: "fetchAlertLogs",
          statusCode: 500,
          retryable: true,
        })
      );
    });

    it("should classify timeout errors as retryable", async () => {
      const adapter = createOpsGenieContextAdapter(TEST_API_KEY);
      const alert = createTestAlert();

      mockResilientGet
        .mockResolvedValueOnce({ data: createAlertDetailResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertLogsResponse(), status: 200 })
        .mockRejectedValueOnce(new Error("Request timeout exceeded"));

      await adapter.fetchContext(alert, testContext);

      expect(mockLoggerInstance.warn).toHaveBeenCalledWith(
        "OpsGenie alert notes fetch failed",
        expect.objectContaining({
          retryable: true,
        })
      );
    });

    // -- Logging on success --

    it("should log enrichment completion with log snippet count", async () => {
      const adapter = createOpsGenieContextAdapter(TEST_API_KEY);
      const alert = createTestAlert();

      mockResilientGet
        .mockResolvedValueOnce({ data: createAlertDetailResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertLogsResponse(), status: 200 })
        .mockResolvedValueOnce({ data: createAlertNotesResponse(), status: 200 });

      await adapter.fetchContext(alert, testContext);

      expect(mockLoggerInstance.info).toHaveBeenCalledWith(
        "OpsGenie enrichment completed",
        expect.objectContaining({
          provider: "opsgenie",
          operation: "fetchContext",
          durationMs: expect.any(Number),
          logSnippetCount: 3,
          hasDetails: true,
          requestId: "test-request-id",
          tenantId: "test-tenant",
        })
      );
    });

    it("should use alert description when API details description is undefined", async () => {
      const adapter = createOpsGenieContextAdapter(TEST_API_KEY);
      const alert = createTestAlert({ description: "webhook description" });

      const detailsWithoutDesc = createAlertDetailResponse({ description: undefined });
      mockResilientGet
        .mockResolvedValueOnce({ data: detailsWithoutDesc, status: 200 })
        .mockResolvedValueOnce({ data: createAlertLogsResponse([]), status: 200 })
        .mockResolvedValueOnce({ data: createAlertNotesResponse([]), status: 200 });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.description).toBe("webhook description");
    });

    it("should fall back to empty string when both descriptions are null", async () => {
      const adapter = createOpsGenieContextAdapter(TEST_API_KEY);
      const alert = createTestAlert({ description: null });

      const detailsWithoutDesc = createAlertDetailResponse({ description: undefined });
      mockResilientGet
        .mockResolvedValueOnce({ data: detailsWithoutDesc, status: 200 })
        .mockResolvedValueOnce({ data: createAlertLogsResponse([]), status: 200 })
        .mockResolvedValueOnce({ data: createAlertNotesResponse([]), status: 200 });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.description).toBe("");
    });

    it("should default ackTime to null when report is missing from details", async () => {
      const adapter = createOpsGenieContextAdapter(TEST_API_KEY);
      const alert = createTestAlert();

      const detailsWithoutReport = createAlertDetailResponse({ report: undefined });
      mockResilientGet
        .mockResolvedValueOnce({ data: detailsWithoutReport, status: 200 })
        .mockResolvedValueOnce({ data: createAlertLogsResponse([]), status: 200 })
        .mockResolvedValueOnce({ data: createAlertNotesResponse([]), status: 200 });

      const result = await adapter.fetchContext(alert, testContext);

      expect(result.providerMetadata.ackTime).toBeNull();
    });
  });
});

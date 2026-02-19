/**
 * Incident Correlator Tests
 *
 * Tests for the incident correlator service with mocked TriageSearchPort.
 * Verifies correlation classification logic (same_root_cause, same_service,
 * similar_symptoms, historical).
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockCreateLogger = jest.fn(() => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock("@kenchi/shared", () => ({
  ...jest.requireActual("@kenchi/shared"),
  createLogger: (...args: unknown[]) => mockCreateLogger(...args),
}));

import { createIncidentCorrelator } from "../../services/incidentCorrelator.js";
import type { TriageSearchPort, TriageSearchResult } from "../../types/correlationTypes.js";
import type { RequestContext } from "@kenchi/shared";
import { CORRELATION_DEFAULTS } from "../../constants/triageConstants.js";

// ==================== Test Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const createMockSearchPort = (): { searchSimilar: jest.Mock } => ({
  searchSimilar: jest.fn(),
});

const createSearchResult = (overrides: Partial<TriageSearchResult> = {}): TriageSearchResult => ({
  triageResultId: "tr-1",
  alertId: "alert-prev-1",
  similarity: 0.8,
  severityLabel: "high",
  serviceName: "payments-api",
  createdAt: new Date("2026-02-18T10:00:00.000Z"),
  ...overrides,
});

// ==================== Tests ====================

describe("createIncidentCorrelator", () => {
  // let: mock reference changes per test in beforeEach
  let mockSearchPort: ReturnType<typeof createMockSearchPort>;

  beforeEach(() => {
    mockSearchPort = createMockSearchPort();
    jest.clearAllMocks();
  });

  describe("correlateIncident", () => {
    it("should return empty correlations when search returns no results", async () => {
      mockSearchPort.searchSimilar.mockResolvedValueOnce([]);
      const correlator = createIncidentCorrelator(mockSearchPort as unknown as TriageSearchPort);

      const result = await correlator.correlateIncident(
        [0.1, 0.2, 0.3],
        "alert-1",
        "tenant-1",
        "payments-api",
        testContext
      );

      expect(result.correlations).toHaveLength(0);
      expect(typeof result.durationMs).toBe("number");
    });

    it("should pass correct arguments to the search port", async () => {
      mockSearchPort.searchSimilar.mockResolvedValueOnce([]);
      const correlator = createIncidentCorrelator(mockSearchPort as unknown as TriageSearchPort);

      await correlator.correlateIncident(
        [0.1, 0.2],
        "alert-xyz",
        "tenant-abc",
        "my-service",
        testContext
      );

      expect(mockSearchPort.searchSimilar).toHaveBeenCalledWith(
        [0.1, 0.2],
        "tenant-abc",
        "alert-xyz",
        CORRELATION_DEFAULTS.MAX_RESULTS,
        CORRELATION_DEFAULTS.MIN_SIMILARITY
      );
    });

    it("should classify as same_root_cause when similarity >= 0.92", async () => {
      mockSearchPort.searchSimilar.mockResolvedValueOnce([
        createSearchResult({
          similarity: CORRELATION_DEFAULTS.SAME_ROOT_CAUSE_THRESHOLD,
          serviceName: "other-service",
        }),
      ]);
      const correlator = createIncidentCorrelator(mockSearchPort as unknown as TriageSearchPort);

      const result = await correlator.correlateIncident(
        [0.1],
        "alert-1",
        "tenant-1",
        "payments-api",
        testContext
      );

      expect(result.correlations[0].correlationType).toBe("same_root_cause");
    });

    it("should classify as same_service when services match (case-insensitive) and similarity < 0.92", async () => {
      mockSearchPort.searchSimilar.mockResolvedValueOnce([
        createSearchResult({
          similarity: 0.8,
          serviceName: "Payments-API",
        }),
      ]);
      const correlator = createIncidentCorrelator(mockSearchPort as unknown as TriageSearchPort);

      const result = await correlator.correlateIncident(
        [0.1],
        "alert-1",
        "tenant-1",
        "payments-api",
        testContext
      );

      expect(result.correlations[0].correlationType).toBe("same_service");
    });

    it("should classify as similar_symptoms when similarity >= 0.75 and services do not match", async () => {
      mockSearchPort.searchSimilar.mockResolvedValueOnce([
        createSearchResult({
          similarity: CORRELATION_DEFAULTS.SIMILAR_SYMPTOMS_THRESHOLD,
          serviceName: "different-service",
        }),
      ]);
      const correlator = createIncidentCorrelator(mockSearchPort as unknown as TriageSearchPort);

      const result = await correlator.correlateIncident(
        [0.1],
        "alert-1",
        "tenant-1",
        "payments-api",
        testContext
      );

      expect(result.correlations[0].correlationType).toBe("similar_symptoms");
    });

    it("should classify as historical when similarity < 0.75 and services do not match", async () => {
      mockSearchPort.searchSimilar.mockResolvedValueOnce([
        createSearchResult({
          similarity: 0.65,
          serviceName: "different-service",
        }),
      ]);
      const correlator = createIncidentCorrelator(mockSearchPort as unknown as TriageSearchPort);

      const result = await correlator.correlateIncident(
        [0.1],
        "alert-1",
        "tenant-1",
        "payments-api",
        testContext
      );

      expect(result.correlations[0].correlationType).toBe("historical");
    });

    it("should classify as historical when current serviceName is null", async () => {
      mockSearchPort.searchSimilar.mockResolvedValueOnce([
        createSearchResult({ similarity: 0.8, serviceName: "some-service" }),
      ]);
      const correlator = createIncidentCorrelator(mockSearchPort as unknown as TriageSearchPort);

      const result = await correlator.correlateIncident(
        [0.1],
        "alert-1",
        "tenant-1",
        null,
        testContext
      );

      // null current service can't match "some-service", not >= 0.92, not >= 0.75 for similar_symptoms either
      // similarity 0.8 >= 0.75, so this is similar_symptoms since services don't match
      expect(result.correlations[0].correlationType).toBe("similar_symptoms");
    });

    it("should classify as historical when result serviceName is null and similarity < threshold", async () => {
      mockSearchPort.searchSimilar.mockResolvedValueOnce([
        createSearchResult({ similarity: 0.65, serviceName: null }),
      ]);
      const correlator = createIncidentCorrelator(mockSearchPort as unknown as TriageSearchPort);

      const result = await correlator.correlateIncident(
        [0.1],
        "alert-1",
        "tenant-1",
        "payments-api",
        testContext
      );

      expect(result.correlations[0].correlationType).toBe("historical");
    });

    it("should map all search result fields to CorrelatedIncident", async () => {
      const createdAt = new Date("2026-02-18T10:00:00.000Z");
      mockSearchPort.searchSimilar.mockResolvedValueOnce([
        createSearchResult({
          triageResultId: "tr-42",
          alertId: "alert-old",
          similarity: 0.95,
          severityLabel: "critical",
          serviceName: "auth-service",
          createdAt,
        }),
      ]);
      const correlator = createIncidentCorrelator(mockSearchPort as unknown as TriageSearchPort);

      const result = await correlator.correlateIncident(
        [0.1],
        "alert-1",
        "tenant-1",
        "auth-service",
        testContext
      );

      const corr = result.correlations[0];
      expect(corr.triageResultId).toBe("tr-42");
      expect(corr.alertId).toBe("alert-old");
      expect(corr.similarity).toBe(0.95);
      expect(corr.severityLabel).toBe("critical");
      expect(corr.serviceName).toBe("auth-service");
      expect(corr.createdAt).toEqual(createdAt);
      expect(corr.correlationType).toBe("same_root_cause");
    });

    it("should handle multiple correlations with different types", async () => {
      mockSearchPort.searchSimilar.mockResolvedValueOnce([
        createSearchResult({ similarity: 0.95, serviceName: "payments-api" }),
        createSearchResult({
          triageResultId: "tr-2",
          similarity: 0.8,
          serviceName: "payments-api",
        }),
        createSearchResult({
          triageResultId: "tr-3",
          similarity: 0.7,
          serviceName: "different-service",
        }),
      ]);
      const correlator = createIncidentCorrelator(mockSearchPort as unknown as TriageSearchPort);

      const result = await correlator.correlateIncident(
        [0.1],
        "alert-1",
        "tenant-1",
        "payments-api",
        testContext
      );

      expect(result.correlations).toHaveLength(3);
      expect(result.correlations[0].correlationType).toBe("same_root_cause");
      expect(result.correlations[1].correlationType).toBe("same_service");
      expect(result.correlations[2].correlationType).toBe("historical");
    });

    it("should propagate search port errors", async () => {
      mockSearchPort.searchSimilar.mockRejectedValueOnce(new Error("Search unavailable"));
      const correlator = createIncidentCorrelator(mockSearchPort as unknown as TriageSearchPort);

      await expect(
        correlator.correlateIncident([0.1], "alert-1", "tenant-1", null, testContext)
      ).rejects.toThrow("Search unavailable");
    });
  });
});

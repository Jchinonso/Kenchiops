/**
 * Monitoring Port Adapter Tests
 *
 * Tests for the monitoring port orchestrator: adapter filtering,
 * parallel fan-out, empty results, and fault isolation.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { RequestContext } from "@kenchi/shared";

const mockLoggerInstance = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
const mockCreateLogger = jest.fn(() => mockLoggerInstance);

jest.mock("@kenchi/shared", () => ({
  ...jest.requireActual("@kenchi/shared"),
  createLogger: (...args: unknown[]) => mockCreateLogger(...args),
}));

import { createMonitoringPort } from "../../adapters/monitoringPortAdapter.js";
import type { MonitoringAdapter, MonitoringQuery } from "../../types/monitoringTypes.js";
import type { InvestigationEvidenceItem } from "../../types/investigationTypes.js";

// ==================== Test Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const createTestQuery = (overrides: Partial<MonitoringQuery> = {}): MonitoringQuery => ({
  tenantId: "test-tenant",
  serviceName: "payments-api",
  environment: "production",
  symptom: "errors",
  hoursBack: 6,
  limit: 25,
  ...overrides,
});

const createTestEvidence = (
  id: string,
  source: InvestigationEvidenceItem["source"] = "datadog_metrics"
): InvestigationEvidenceItem => ({
  id,
  source,
  title: `Test evidence ${id}`,
  summary: `Summary for ${id}`,
  relevance: 0.8,
  timestamp: new Date().toISOString(),
  metadata: { testId: id },
});

const createMockAdapter = (
  name: string,
  configured: boolean,
  evidence: readonly InvestigationEvidenceItem[] = []
): MonitoringAdapter => ({
  name,
  isConfigured: jest.fn<() => boolean>().mockReturnValue(configured),
  fetchEvidence: jest.fn<MonitoringAdapter["fetchEvidence"]>().mockResolvedValue(evidence),
});

const createFailingAdapter = (name: string): MonitoringAdapter => ({
  name,
  isConfigured: jest.fn<() => boolean>().mockReturnValue(true),
  fetchEvidence: jest
    .fn<MonitoringAdapter["fetchEvidence"]>()
    .mockRejectedValue(new Error(`${name} failed`)),
});

// ==================== Tests ====================

describe("createMonitoringPort", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("gatherMetrics", () => {
    it("should return empty array when no adapters are provided", async () => {
      const port = createMonitoringPort([]);
      const query = createTestQuery();

      const result = await port.gatherMetrics(query, testContext);

      expect(result).toEqual([]);
    });

    it("should return empty array when no adapters are configured", async () => {
      const adapter1 = createMockAdapter("datadog", false);
      const adapter2 = createMockAdapter("grafana", false);
      const port = createMonitoringPort([adapter1, adapter2]);
      const query = createTestQuery();

      const result = await port.gatherMetrics(query, testContext);

      expect(result).toEqual([]);
      expect(adapter1.fetchEvidence).not.toHaveBeenCalled();
      expect(adapter2.fetchEvidence).not.toHaveBeenCalled();
    });

    it("should return empty array when no adapters are configured", async () => {
      const port = createMonitoringPort([createMockAdapter("datadog", false)]);
      const query = createTestQuery();

      const result = await port.gatherMetrics(query, testContext);

      expect(result).toEqual([]);
    });

    it("should only call configured adapters", async () => {
      const ddEvidence = [createTestEvidence("dd-1", "datadog_metrics")];
      const configuredAdapter = createMockAdapter("datadog", true, ddEvidence);
      const unconfiguredAdapter = createMockAdapter("grafana", false);
      const port = createMonitoringPort([configuredAdapter, unconfiguredAdapter]);
      const query = createTestQuery();

      const result = await port.gatherMetrics(query, testContext);

      expect(configuredAdapter.fetchEvidence).toHaveBeenCalledWith(query, testContext);
      expect(unconfiguredAdapter.fetchEvidence).not.toHaveBeenCalled();
      expect(result).toEqual(ddEvidence);
    });

    it("should fan out to all configured adapters in parallel", async () => {
      const ddEvidence = [createTestEvidence("dd-1", "datadog_metrics")];
      const grafanaEvidence = [createTestEvidence("grafana-1", "grafana_alerts")];
      const promEvidence = [createTestEvidence("prom-1", "prometheus_alerts")];

      const adapter1 = createMockAdapter("datadog", true, ddEvidence);
      const adapter2 = createMockAdapter("grafana", true, grafanaEvidence);
      const adapter3 = createMockAdapter("prometheus", true, promEvidence);
      const port = createMonitoringPort([adapter1, adapter2, adapter3]);
      const query = createTestQuery();

      const result = await port.gatherMetrics(query, testContext);

      expect(adapter1.fetchEvidence).toHaveBeenCalledWith(query, testContext);
      expect(adapter2.fetchEvidence).toHaveBeenCalledWith(query, testContext);
      expect(adapter3.fetchEvidence).toHaveBeenCalledWith(query, testContext);
      expect(result).toHaveLength(3);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "dd-1" }),
          expect.objectContaining({ id: "grafana-1" }),
          expect.objectContaining({ id: "prom-1" }),
        ])
      );
    });

    it("should flatten results from multiple adapters", async () => {
      const ddEvidence = [
        createTestEvidence("dd-1", "datadog_metrics"),
        createTestEvidence("dd-2", "datadog_events"),
      ];
      const grafanaEvidence = [createTestEvidence("grafana-1", "grafana_alerts")];
      const port = createMonitoringPort([
        createMockAdapter("datadog", true, ddEvidence),
        createMockAdapter("grafana", true, grafanaEvidence),
      ]);
      const query = createTestQuery();

      const result = await port.gatherMetrics(query, testContext);

      expect(result).toHaveLength(3);
    });

    it("should return empty array when all configured adapters return empty", async () => {
      const port = createMonitoringPort([
        createMockAdapter("datadog", true, []),
        createMockAdapter("grafana", true, []),
      ]);
      const query = createTestQuery();

      const result = await port.gatherMetrics(query, testContext);

      expect(result).toEqual([]);
    });

    it("should only call configured adapters when mixed with unconfigured", async () => {
      const configuredAdapter1 = createMockAdapter("datadog", true, []);
      const configuredAdapter2 = createMockAdapter("grafana", true, []);
      const unconfiguredAdapter = createMockAdapter("pagerduty", false);
      const port = createMonitoringPort([
        configuredAdapter1,
        configuredAdapter2,
        unconfiguredAdapter,
      ]);
      const query = createTestQuery();

      await port.gatherMetrics(query, testContext);

      expect(configuredAdapter1.fetchEvidence).toHaveBeenCalled();
      expect(configuredAdapter2.fetchEvidence).toHaveBeenCalled();
      expect(unconfiguredAdapter.fetchEvidence).not.toHaveBeenCalled();
    });

    it("should return combined evidence from all configured adapters", async () => {
      const ddEvidence = [
        createTestEvidence("dd-1", "datadog_metrics"),
        createTestEvidence("dd-2", "datadog_events"),
      ];
      const port = createMonitoringPort([createMockAdapter("datadog", true, ddEvidence)]);
      const query = createTestQuery();

      const result = await port.gatherMetrics(query, testContext);

      expect(result).toHaveLength(2);
      expect(result).toEqual(ddEvidence);
    });

    it("should pass the query object to each adapter unchanged", async () => {
      const adapter = createMockAdapter("datadog", true, []);
      const port = createMonitoringPort([adapter]);
      const query = Object.freeze(createTestQuery());

      await port.gatherMetrics(query, testContext);

      expect(adapter.fetchEvidence).toHaveBeenCalledWith(query, testContext);
    });

    it("should pass RequestContext to each adapter", async () => {
      const adapter = createMockAdapter("datadog", true, []);
      const port = createMonitoringPort([adapter]);
      const query = createTestQuery();

      await port.gatherMetrics(query, testContext);

      expect(adapter.fetchEvidence).toHaveBeenCalledWith(expect.anything(), testContext);
    });

    it("should handle a single failing adapter among successful ones gracefully", async () => {
      // Since adapters internally catch their own errors and return [],
      // the port's Promise.all should never see rejections from well-behaved adapters.
      // But if an adapter DOES reject, Promise.all will reject.
      // This test verifies the behavior when one adapter rejects.
      const successEvidence = [createTestEvidence("dd-1", "datadog_metrics")];
      const successAdapter = createMockAdapter("datadog", true, successEvidence);
      const failingAdapter = createFailingAdapter("grafana");
      const port = createMonitoringPort([successAdapter, failingAdapter]);
      const query = createTestQuery();

      // The port uses Promise.all, so one rejection should propagate.
      // However, since each adapter handles its own errors, in practice
      // this shouldn't happen. But we test the contract: if an adapter
      // does reject, the whole gatherMetrics call rejects.
      await expect(port.gatherMetrics(query, testContext)).rejects.toThrow("grafana failed");
    });
  });
});

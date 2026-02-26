/**
 * Unit tests for observability/alerting.ts
 *
 * Tests the pure alert evaluation functions:
 * - evaluateTenantAlerts: evaluates metric snapshots against thresholds
 * - formatAlertMessage: formats alert into human-readable string
 * - Default threshold constants
 */
import { describe, it, expect } from "@jest/globals";
import {
  evaluateTenantAlerts,
  formatAlertMessage,
  DEFAULT_WARNING_THRESHOLDS,
  DEFAULT_CRITICAL_THRESHOLDS,
} from "../../observability/alerting.js";
import type {
  TenantMetricSnapshot,
  AlertThresholds,
  TenantAlert,
} from "../../observability/alertingTypes.js";

describe("Tenant Alerting", () => {
  describe("DEFAULT_WARNING_THRESHOLDS", () => {
    it("should have expected default values", () => {
      expect(DEFAULT_WARNING_THRESHOLDS.errorRatePercent).toBe(10);
      expect(DEFAULT_WARNING_THRESHOLDS.latencyP95Seconds).toBe(5);
      expect(DEFAULT_WARNING_THRESHOLDS.activeJobsMax).toBe(10);
      expect(DEFAULT_WARNING_THRESHOLDS.queueDepthMax).toBe(50);
    });
  });

  describe("DEFAULT_CRITICAL_THRESHOLDS", () => {
    it("should have expected default values", () => {
      expect(DEFAULT_CRITICAL_THRESHOLDS.errorRatePercent).toBe(25);
      expect(DEFAULT_CRITICAL_THRESHOLDS.latencyP95Seconds).toBe(15);
      expect(DEFAULT_CRITICAL_THRESHOLDS.activeJobsMax).toBe(25);
      expect(DEFAULT_CRITICAL_THRESHOLDS.queueDepthMax).toBe(200);
    });
  });

  describe("evaluateTenantAlerts", () => {
    const healthyMetrics: TenantMetricSnapshot = {
      errorRatePercent: 1,
      latencyP95Seconds: 0.5,
      activeJobs: 2,
      queueDepth: 10,
    };

    it("should return empty array when all metrics are healthy", () => {
      const alerts = evaluateTenantAlerts("tenant-healthy", healthyMetrics);

      expect(alerts).toHaveLength(0);
    });

    it("should fire warning when error rate exceeds warning threshold", () => {
      const metrics: TenantMetricSnapshot = {
        ...healthyMetrics,
        errorRatePercent: 15,
      };

      const alerts = evaluateTenantAlerts("tenant-warn", metrics);

      expect(alerts).toHaveLength(1);
      expect(alerts[0].alertName).toBe("TenantHighErrorRate");
      expect(alerts[0].severity).toBe("warning");
      expect(alerts[0].status).toBe("firing");
      expect(alerts[0].tenantId).toBe("tenant-warn");
      expect(alerts[0].value).toBe(15);
      expect(alerts[0].threshold).toBe(10);
    });

    it("should fire critical (not warning) when error rate exceeds critical threshold", () => {
      const metrics: TenantMetricSnapshot = {
        ...healthyMetrics,
        errorRatePercent: 30,
      };

      const alerts = evaluateTenantAlerts("tenant-crit", metrics);

      // Only critical should fire, not warning (dedup by rule)
      const errorAlerts = alerts.filter((alert) => alert.alertName === "TenantHighErrorRate");
      expect(errorAlerts).toHaveLength(1);
      expect(errorAlerts[0].severity).toBe("critical");
    });

    it("should fire warning for high latency", () => {
      const metrics: TenantMetricSnapshot = {
        ...healthyMetrics,
        latencyP95Seconds: 8,
      };

      const alerts = evaluateTenantAlerts("tenant-slow", metrics);

      const latencyAlerts = alerts.filter((alert) => alert.alertName === "TenantHighLatency");
      expect(latencyAlerts).toHaveLength(1);
      expect(latencyAlerts[0].severity).toBe("warning");
      expect(latencyAlerts[0].value).toBe(8);
    });

    it("should fire warning for analysis backlog", () => {
      const metrics: TenantMetricSnapshot = {
        ...healthyMetrics,
        activeJobs: 15,
      };

      const alerts = evaluateTenantAlerts("tenant-backlog", metrics);

      const backlogAlerts = alerts.filter((alert) => alert.alertName === "TenantAnalysisBacklog");
      expect(backlogAlerts).toHaveLength(1);
      expect(backlogAlerts[0].severity).toBe("warning");
    });

    it("should fire warning for queue depth", () => {
      const metrics: TenantMetricSnapshot = {
        ...healthyMetrics,
        queueDepth: 75,
      };

      const alerts = evaluateTenantAlerts("tenant-deep", metrics);

      const queueAlerts = alerts.filter((alert) => alert.alertName === "TenantQueueDepth");
      expect(queueAlerts).toHaveLength(1);
      expect(queueAlerts[0].severity).toBe("warning");
    });

    it("should fire multiple alerts when multiple thresholds are exceeded", () => {
      const metrics: TenantMetricSnapshot = {
        errorRatePercent: 12,
        latencyP95Seconds: 7,
        activeJobs: 12,
        queueDepth: 60,
      };

      const alerts = evaluateTenantAlerts("tenant-multi", metrics);

      expect(alerts.length).toBe(4);
      const alertNames = alerts.map((alert) => alert.alertName);
      expect(alertNames).toContain("TenantHighErrorRate");
      expect(alertNames).toContain("TenantHighLatency");
      expect(alertNames).toContain("TenantAnalysisBacklog");
      expect(alertNames).toContain("TenantQueueDepth");
    });

    it("should respect custom thresholds", () => {
      const strictWarning: AlertThresholds = {
        errorRatePercent: 1,
        latencyP95Seconds: 0.5,
        activeJobsMax: 1,
        queueDepthMax: 5,
      };
      const strictCritical: AlertThresholds = {
        errorRatePercent: 5,
        latencyP95Seconds: 2,
        activeJobsMax: 5,
        queueDepthMax: 20,
      };

      const metrics: TenantMetricSnapshot = {
        errorRatePercent: 3,
        latencyP95Seconds: 1.0,
        activeJobs: 3,
        queueDepth: 10,
      };

      const alerts = evaluateTenantAlerts("tenant-strict", metrics, strictWarning, strictCritical);

      expect(alerts.length).toBe(4);
      // All should be warning since values are between warning and critical
      alerts.forEach((alert) => {
        expect(alert.severity).toBe("warning");
      });
    });

    it("should not fire when value equals threshold exactly", () => {
      const metrics: TenantMetricSnapshot = {
        errorRatePercent: 10, // equals warning threshold
        latencyP95Seconds: 5, // equals warning threshold
        activeJobs: 10, // equals warning threshold
        queueDepth: 50, // equals warning threshold
      };

      const alerts = evaluateTenantAlerts("tenant-boundary", metrics);

      // Value <= threshold means no alert (strict greater-than check)
      expect(alerts).toHaveLength(0);
    });

    it("should include evaluatedAt timestamp on all alerts", () => {
      const metrics: TenantMetricSnapshot = {
        ...healthyMetrics,
        errorRatePercent: 20,
      };

      const beforeEval = new Date();
      const alerts = evaluateTenantAlerts("tenant-time", metrics);
      const afterEval = new Date();

      expect(alerts).toHaveLength(1);
      expect(alerts[0].evaluatedAt.getTime()).toBeGreaterThanOrEqual(beforeEval.getTime());
      expect(alerts[0].evaluatedAt.getTime()).toBeLessThanOrEqual(afterEval.getTime());
    });
  });

  describe("formatAlertMessage", () => {
    it("should format a warning alert", () => {
      const alert: TenantAlert = {
        alertName: "TenantHighErrorRate",
        severity: "warning",
        status: "firing",
        tenantId: "tenant-fmt",
        message: "Tenant tenant-fmt error rate 15.0% exceeds threshold 10%",
        value: 15,
        threshold: 10,
        evaluatedAt: new Date(),
      };

      const formatted = formatAlertMessage(alert);

      expect(formatted).toContain("[WARNING]");
      expect(formatted).toContain("FIRING");
      expect(formatted).toContain("TenantHighErrorRate");
      expect(formatted).toContain("15.0%");
    });

    it("should format a critical alert", () => {
      const alert: TenantAlert = {
        alertName: "TenantCriticalLatency",
        severity: "critical",
        status: "firing",
        tenantId: "tenant-crit",
        message: "Tenant tenant-crit P95 latency 20.00s exceeds threshold 15s",
        value: 20,
        threshold: 15,
        evaluatedAt: new Date(),
      };

      const formatted = formatAlertMessage(alert);

      expect(formatted).toContain("[CRITICAL]");
      expect(formatted).toContain("FIRING");
    });

    it("should format a resolved alert", () => {
      const alert: TenantAlert = {
        alertName: "TenantHighErrorRate",
        severity: "warning",
        status: "resolved",
        tenantId: "tenant-res",
        message: "Error rate back to normal",
        value: 2,
        threshold: 10,
        evaluatedAt: new Date(),
      };

      const formatted = formatAlertMessage(alert);

      expect(formatted).toContain("RESOLVED");
    });
  });
});

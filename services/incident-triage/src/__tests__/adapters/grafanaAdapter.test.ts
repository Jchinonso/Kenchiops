/**
 * Grafana Adapter Tests
 *
 * Tests for the Grafana alert source adapter: webhook parsing,
 * fingerprint generation, payload validation, status filtering,
 * severity mapping, and label extraction.
 */

import { describe, it, expect, jest } from "@jest/globals";

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

import { createGrafanaAdapter } from "../../adapters/grafanaAdapter.js";
import { ValidationError } from "@kenchi/shared";

// ==================== Test Fixtures ====================

const createValidPayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  receiver: "ops-team",
  status: "firing",
  orgId: 1,
  alerts: [
    {
      status: "firing",
      labels: {
        alertname: "HighCPU",
        severity: "critical",
        instance: "web-01:9090",
      },
      annotations: {
        description: "CPU utilization exceeded 95%",
        summary: "High CPU on web-01",
      },
      startsAt: "2026-02-19T14:00:00.000Z",
      endsAt: "0001-01-01T00:00:00Z",
      fingerprint: "abc123def456",
      generatorURL: "http://grafana.local/alerting/rules",
      values: { cpu_percent: 95.4 },
    },
  ],
  groupLabels: { alertname: "HighCPU" },
  commonLabels: {
    alertname: "HighCPU",
    severity: "critical",
    service: "payments-api",
    env: "production",
  },
  commonAnnotations: {
    description: "CPU utilization exceeded 95%",
    summary: "High CPU on web-01",
  },
  externalURL: "http://grafana.local",
  version: "1",
  groupKey: "{}:{alertname=HighCPU}",
  title: "HighCPU alert is firing",
  message: "CPU utilization exceeded 95% on web-01",
  ...overrides,
});

const createValidHeaders = (
  overrides: Record<string, string> = {}
): Record<string, string | string[] | undefined> => ({
  "content-type": "application/json",
  ...overrides,
});

// ==================== Tests ====================

describe("createGrafanaAdapter", () => {
  const adapter = createGrafanaAdapter();

  describe("parseWebhook", () => {
    it("should parse a valid Grafana webhook into NormalizedAlert", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.sourceAlertId).toBe("abc123def456");
      expect(result.source).toBe("grafana");
      expect(result.title).toBe("HighCPU alert is firing");
      expect(result.description).toBe("CPU utilization exceeded 95%");
    });

    it("should extract severity from commonLabels.severity (critical)", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.severity).toBe("critical");
    });

    it("should map warning severity to medium", () => {
      const body = createValidPayload({
        commonLabels: {
          alertname: "SlowRequests",
          severity: "warning",
          service: "payments-api",
        },
      });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.severity).toBe("medium");
    });

    it("should default to medium severity when severity label is missing", () => {
      const body = createValidPayload({
        commonLabels: {
          alertname: "HighCPU",
          service: "payments-api",
        },
        alerts: [
          {
            status: "firing",
            labels: { alertname: "HighCPU" },
            annotations: {},
            startsAt: "2026-02-19T14:00:00.000Z",
            endsAt: "0001-01-01T00:00:00Z",
            fingerprint: "abc123def456",
          },
        ],
      });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.severity).toBe("medium");
    });

    it("should fall back to first alert labels for severity when commonLabels lacks it", () => {
      const body = createValidPayload({
        commonLabels: { alertname: "HighCPU" },
        alerts: [
          {
            status: "firing",
            labels: { alertname: "HighCPU", severity: "high" },
            annotations: {},
            startsAt: "2026-02-19T14:00:00.000Z",
            endsAt: "0001-01-01T00:00:00Z",
            fingerprint: "abc123def456",
          },
        ],
      });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.severity).toBe("high");
    });

    it("should extract serviceName from commonLabels.service", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.serviceName).toBe("payments-api");
    });

    it("should fall back to commonLabels.job for serviceName", () => {
      const body = createValidPayload({
        commonLabels: {
          alertname: "HighCPU",
          severity: "critical",
          job: "node-exporter",
          env: "production",
        },
      });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.serviceName).toBe("node-exporter");
    });

    it("should set serviceName to null when neither service nor job is present", () => {
      const body = createValidPayload({
        commonLabels: { alertname: "HighCPU", severity: "critical" },
      });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.serviceName).toBeNull();
    });

    it("should extract environment from commonLabels.env", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.environment).toBe("production");
    });

    it("should extract environment from commonLabels.environment as fallback", () => {
      const body = createValidPayload({
        commonLabels: {
          alertname: "HighCPU",
          severity: "critical",
          service: "payments-api",
          environment: "staging",
        },
      });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.environment).toBe("staging");
    });

    it("should set environment to null when neither env nor environment label exists", () => {
      const body = createValidPayload({
        commonLabels: { alertname: "HighCPU", severity: "critical" },
        alerts: [
          {
            status: "firing",
            labels: { alertname: "HighCPU" },
            annotations: {},
            startsAt: "2026-02-19T14:00:00.000Z",
            endsAt: "0001-01-01T00:00:00Z",
            fingerprint: "abc123def456",
          },
        ],
      });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.environment).toBeNull();
    });

    it("should extract labels with grafana_ prefix", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.labels).toHaveProperty("grafana_receiver", "ops-team");
      expect(result.labels).toHaveProperty("grafana_org_id", "1");
      expect(result.labels).toHaveProperty("grafana_group_key", "{}:{alertname=HighCPU}");
      expect(result.labels).toHaveProperty("alertname", "HighCPU");
    });

    it("should extract metrics from first alert values", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.metrics).toHaveProperty("cpu_percent", 95.4);
    });

    it("should return empty metrics when first alert has no values", () => {
      const body = createValidPayload({
        alerts: [
          {
            status: "firing",
            labels: { alertname: "HighCPU", severity: "critical" },
            annotations: {},
            startsAt: "2026-02-19T14:00:00.000Z",
            endsAt: "0001-01-01T00:00:00Z",
            fingerprint: "abc123def456",
          },
        ],
      });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.metrics).toEqual({});
    });

    it("should generate a non-empty fingerprint", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.fingerprint).toBeTruthy();
      expect(result.fingerprint.length).toBeGreaterThan(0);
    });

    it("should generate deterministic fingerprints for same input", () => {
      const body1 = createValidPayload();
      const body2 = createValidPayload();
      const headers = createValidHeaders();

      const result1 = adapter.parseWebhook(body1, headers);
      const result2 = adapter.parseWebhook(body2, headers);

      expect(result1.fingerprint).toBe(result2.fingerprint);
    });

    it("should set receivedAt to a valid ISO string", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.receivedAt).toBeTruthy();
      const parsed = new Date(result.receivedAt);
      expect(isNaN(parsed.getTime())).toBe(false);
    });

    it("should set description to null when no annotations or message", () => {
      const body = createValidPayload({
        commonAnnotations: {},
        message: undefined,
      });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.description).toBeNull();
    });

    it("should fall back to commonAnnotations.summary for description", () => {
      const body = createValidPayload({
        commonAnnotations: { summary: "High CPU on web-01" },
      });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.description).toBe("High CPU on web-01");
    });

    it("should fall back to message for description", () => {
      const body = createValidPayload({
        commonAnnotations: {},
        message: "Alert message from Grafana",
      });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.description).toBe("Alert message from Grafana");
    });

    it("should build title from alertname when title field is missing", () => {
      const body = createValidPayload({ title: undefined });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.title).toBe("Grafana Alert: HighCPU");
    });

    it("should build title from receiver when both title and alertname are missing", () => {
      const body = createValidPayload({
        title: undefined,
        commonLabels: { severity: "critical" },
      });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.title).toBe("Grafana Alert from ops-team");
    });
  });

  describe("parseWebhook validation", () => {
    it("should throw ValidationError when body is null", () => {
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(null, headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError when body is not an object", () => {
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook("not an object", headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError when status is missing", () => {
      const body = createValidPayload({ status: undefined });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError when alerts array is missing", () => {
      const body = createValidPayload({ alerts: undefined });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError when alerts array is empty", () => {
      const body = createValidPayload({ alerts: [] });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError when alerts[0].fingerprint is missing", () => {
      const body = createValidPayload({
        alerts: [
          {
            status: "firing",
            labels: {},
            annotations: {},
            startsAt: "2026-02-19T14:00:00.000Z",
            endsAt: "0001-01-01T00:00:00Z",
          },
        ],
      });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError when orgId is missing", () => {
      const body = createValidPayload({ orgId: undefined });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError when orgId is not a number", () => {
      const body = createValidPayload({ orgId: "not-a-number" });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });
  });

  describe("parseWebhook status filtering", () => {
    it("should throw ValidationError when status is resolved", () => {
      const body = createValidPayload({ status: "resolved" });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should parse successfully when status is firing", () => {
      const body = createValidPayload({ status: "firing" });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.source).toBe("grafana");
    });
  });

  describe("generateFingerprint", () => {
    it("should generate a hex string of 40 chars", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();
      const alert = adapter.parseWebhook(body, headers);

      const fingerprint = adapter.generateFingerprint(alert);

      expect(fingerprint).toMatch(/^[0-9a-f]+$/);
      expect(fingerprint.length).toBe(40);
    });

    it("should produce different fingerprints for different services", () => {
      const body1 = createValidPayload();
      const body2 = createValidPayload({
        commonLabels: {
          alertname: "HighCPU",
          severity: "critical",
          service: "auth-service",
          env: "production",
        },
      });
      const headers = createValidHeaders();

      const alert1 = adapter.parseWebhook(body1, headers);
      const alert2 = adapter.parseWebhook(body2, headers);

      expect(alert1.fingerprint).not.toBe(alert2.fingerprint);
    });

    it("should produce same fingerprint regardless of title", () => {
      const body1 = createValidPayload();
      const body2 = createValidPayload({ title: "Different alert title" });
      const headers = createValidHeaders();

      const alert1 = adapter.parseWebhook(body1, headers);
      const alert2 = adapter.parseWebhook(body2, headers);

      expect(alert1.fingerprint).toBe(alert2.fingerprint);
    });
  });
});

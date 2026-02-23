/**
 * Datadog Adapter Tests
 *
 * Tests for the Datadog alert source adapter: webhook parsing,
 * fingerprint generation, payload validation, status filtering,
 * tag extraction, and severity mapping.
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

import { createDatadogAdapter } from "../../adapters/datadogAdapter.js";
import { ValidationError } from "@kenchi/shared";

// ==================== Test Fixtures ====================

const createValidPayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  $ALERT_ID: "alert-12345",
  $ALERT_TITLE: "High CPU on payments-api",
  $ALERT_STATUS: "Triggered",
  $ALERT_BODY: "CPU utilization exceeded 95% threshold",
  $PRIORITY: "P1",
  $HOSTNAME: "web-01.prod",
  $TAGS: "service:payments,env:prod,team:platform",
  $LINK: "https://app.datadoghq.com/monitors/12345",
  $ALERT_METRIC: "system.cpu.user",
  $ALERT_QUERY: "avg(last_5m):avg:system.cpu.user{service:payments} > 95",
  $ALERT_SCOPE: "service:payments",
  $DATE: "2026-02-19T14:00:00.000Z",
  $ORG_NAME: "kenchi-inc",
  ...overrides,
});

const createValidHeaders = (
  overrides: Record<string, string> = {}
): Record<string, string | string[] | undefined> => ({
  "content-type": "application/json",
  ...overrides,
});

// ==================== Tests ====================

describe("createDatadogAdapter", () => {
  const adapter = createDatadogAdapter();

  describe("parseWebhook", () => {
    it("should parse a valid Datadog webhook into NormalizedAlert", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.sourceAlertId).toBe("alert-12345");
      expect(result.source).toBe("datadog");
      expect(result.title).toBe("High CPU on payments-api");
      expect(result.description).toBe("CPU utilization exceeded 95% threshold");
    });

    it("should extract severity from Datadog priority (P1 = critical)", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.severity).toBe("critical");
    });

    it("should extract serviceName from service tag", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.serviceName).toBe("payments");
    });

    it("should extract environment from env tag", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.environment).toBe("prod");
    });

    it("should set serviceName to null when no service tag is present", () => {
      const body = createValidPayload({ $TAGS: "env:prod,team:platform" });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.serviceName).toBeNull();
    });

    it("should set environment to null when no env tag is present", () => {
      const body = createValidPayload({ $TAGS: "service:payments,team:platform" });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.environment).toBeNull();
    });

    it("should set serviceName and environment to null when no tags", () => {
      const body = createValidPayload({ $TAGS: undefined });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.serviceName).toBeNull();
      expect(result.environment).toBeNull();
    });

    it("should extract labels with dd_ prefix", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.labels).toHaveProperty("dd_alert_status", "Triggered");
      expect(result.labels).toHaveProperty("dd_hostname", "web-01.prod");
      expect(result.labels).toHaveProperty("dd_org_name", "kenchi-inc");
      expect(result.labels).toHaveProperty("dd_tag_service", "payments");
      expect(result.labels).toHaveProperty("dd_tag_env", "prod");
      expect(result.labels).toHaveProperty("dd_tag_team", "platform");
    });

    it("should extract metrics from alert fields", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.metrics).toHaveProperty("metric", "system.cpu.user");
      expect(result.metrics).toHaveProperty(
        "query",
        "avg(last_5m):avg:system.cpu.user{service:payments} > 95"
      );
      expect(result.metrics).toHaveProperty("scope", "service:payments");
    });

    it("should return empty metrics when alert metric fields are missing", () => {
      const body = createValidPayload({
        $ALERT_METRIC: undefined,
        $ALERT_QUERY: undefined,
        $ALERT_SCOPE: undefined,
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

    it("should set description to null when $ALERT_BODY is missing", () => {
      const body = createValidPayload({ $ALERT_BODY: undefined });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.description).toBeNull();
    });

    it("should generate a synthetic deliveryId", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.deliveryId).toBeTruthy();
      expect(result.deliveryId).toMatch(/^[0-9a-f]+$/);
      expect(result.deliveryId.length).toBe(40);
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

    it("should throw ValidationError when $ALERT_ID is missing", () => {
      const body = createValidPayload({ $ALERT_ID: undefined });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError when $ALERT_TITLE is missing", () => {
      const body = createValidPayload({ $ALERT_TITLE: undefined });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError when $ALERT_STATUS is missing", () => {
      const body = createValidPayload({ $ALERT_STATUS: undefined });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });
  });

  describe("parseWebhook status filtering", () => {
    it("should throw ValidationError when status is Recovered", () => {
      const body = createValidPayload({ $ALERT_STATUS: "Recovered" });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError when status is No Data", () => {
      const body = createValidPayload({ $ALERT_STATUS: "No Data" });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should parse successfully when status is Triggered", () => {
      const body = createValidPayload({ $ALERT_STATUS: "Triggered" });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.source).toBe("datadog");
    });

    it("should parse successfully when status is Warn", () => {
      const body = createValidPayload({ $ALERT_STATUS: "Warn" });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.source).toBe("datadog");
    });

    it("should parse successfully when status is Re-Notified", () => {
      const body = createValidPayload({ $ALERT_STATUS: "Re-Notified" });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.source).toBe("datadog");
    });
  });

  describe("Datadog priority mapping", () => {
    const priorityCases: ReadonlyArray<{ priority: string; expected: string }> = [
      { priority: "P1", expected: "critical" },
      { priority: "P2", expected: "high" },
      { priority: "P3", expected: "medium" },
      { priority: "P4", expected: "low" },
      { priority: "P5", expected: "info" },
    ];

    for (const { priority, expected } of priorityCases) {
      it(`should map priority ${priority} to ${expected}`, () => {
        const body = createValidPayload({ $PRIORITY: priority });
        const headers = createValidHeaders();

        const result = adapter.parseWebhook(body, headers);

        expect(result.severity).toBe(expected);
      });
    }

    it("should default to medium severity when no priority is provided", () => {
      const body = createValidPayload({ $PRIORITY: undefined });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.severity).toBe("medium");
    });

    it("should default to medium severity for unknown priority", () => {
      const body = createValidPayload({ $PRIORITY: "UNKNOWN" });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.severity).toBe("medium");
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
      const body1 = createValidPayload({ $TAGS: "service:payments,env:prod" });
      const body2 = createValidPayload({ $TAGS: "service:auth,env:prod" });
      const headers = createValidHeaders();

      const alert1 = adapter.parseWebhook(body1, headers);
      const alert2 = adapter.parseWebhook(body2, headers);

      expect(alert1.fingerprint).not.toBe(alert2.fingerprint);
    });

    it("should produce same fingerprint regardless of title", () => {
      const body1 = createValidPayload();
      const body2 = createValidPayload({ $ALERT_TITLE: "Different alert title" });
      const headers = createValidHeaders();

      const alert1 = adapter.parseWebhook(body1, headers);
      const alert2 = adapter.parseWebhook(body2, headers);

      expect(alert1.fingerprint).toBe(alert2.fingerprint);
    });
  });
});

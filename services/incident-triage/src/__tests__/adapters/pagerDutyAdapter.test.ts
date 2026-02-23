/**
 * PagerDuty Adapter Tests
 *
 * Tests for the PagerDuty alert source adapter: webhook parsing,
 * fingerprint generation, payload validation, and field extraction.
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

import { createPagerDutyAdapter } from "../../adapters/pagerDutyAdapter.js";
import { ValidationError } from "@kenchi/shared";

// ==================== Test Fixtures ====================

const createValidPayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  event: {
    id: "evt-123",
    event_type: "incident.triggered",
    resource_type: "incident",
    occurred_at: "2026-02-19T14:00:00.000Z",
    data: {
      id: "INC-456",
      type: "incident",
      title: "High CPU on payments-api",
      description: "CPU utilization exceeded 95% threshold",
      urgency: "high",
      priority: { id: "P1_ID", name: "P1", summary: "P1" },
      service: {
        id: "PSVC001",
        type: "service_reference",
        summary: "payments-api",
      },
      escalation_policy: {
        id: "PEPOL1",
        type: "escalation_policy_reference",
        summary: "Engineering On-Call",
      },
      body: {
        cef_details: {
          class: "cpu_threshold",
          custom_details: {
            environment: "production",
            cpu_percent: 95.4,
          },
        },
      },
      ...overrides,
    },
  },
});

const createValidHeaders = (
  overrides: Record<string, string> = {}
): Record<string, string | string[] | undefined> => ({
  "x-webhook-id": "delivery-abc",
  ...overrides,
});

// ==================== Tests ====================

describe("createPagerDutyAdapter", () => {
  const adapter = createPagerDutyAdapter();

  describe("parseWebhook", () => {
    it("should parse a valid PagerDuty v3 webhook into NormalizedAlert", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.sourceAlertId).toBe("INC-456");
      expect(result.deliveryId).toBe("delivery-abc");
      expect(result.source).toBe("pagerduty");
      expect(result.title).toBe("High CPU on payments-api");
      expect(result.description).toBe("CPU utilization exceeded 95% threshold");
    });

    it("should extract severity from PagerDuty priority (P1 = critical)", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.severity).toBe("critical");
    });

    it("should extract severity from urgency when no priority", () => {
      const body = createValidPayload({
        priority: null,
        urgency: "high",
      });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.severity).toBe("high");
    });

    it("should default to medium severity when no priority or urgency", () => {
      const body = createValidPayload({
        priority: null,
        urgency: undefined,
      });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.severity).toBe("medium");
    });

    it("should extract service name from PagerDuty service.summary", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.serviceName).toBe("payments-api");
    });

    it("should set serviceName to null when no service data", () => {
      const body = createValidPayload({ service: undefined });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.serviceName).toBeNull();
    });

    it("should extract environment from custom_details", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.environment).toBe("production");
    });

    it("should set environment to null when no custom_details", () => {
      const body = createValidPayload({
        body: undefined,
      });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.environment).toBeNull();
    });

    it("should extract metrics from custom_details", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.metrics).toHaveProperty("environment", "production");
      expect(result.metrics).toHaveProperty("cpu_percent", 95.4);
    });

    it("should extract labels from PagerDuty incident data", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.labels).toHaveProperty("pd_service_id", "PSVC001");
      expect(result.labels).toHaveProperty("pd_service_name", "payments-api");
      expect(result.labels).toHaveProperty("pd_escalation_policy", "Engineering On-Call");
      expect(result.labels).toHaveProperty("pd_urgency", "high");
      expect(result.labels).toHaveProperty("pd_alert_class", "cpu_threshold");
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

    it("should set description to null when not present in payload", () => {
      const body = createValidPayload({ description: undefined });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.description).toBeNull();
    });

    it("should set receivedAt to a valid ISO string", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.receivedAt).toBeTruthy();
      const parsed = new Date(result.receivedAt);
      expect(isNaN(parsed.getTime())).toBe(false);
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

    it("should throw ValidationError when event is missing", () => {
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook({}, headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError when event.data is missing", () => {
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook({ event: { id: "e1" } }, headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError when event.data.id is missing", () => {
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook({ event: { data: { title: "test" } } }, headers)).toThrow(
        ValidationError
      );
    });

    it("should throw ValidationError when event.data.title is missing", () => {
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook({ event: { data: { id: "INC-1" } } }, headers)).toThrow(
        ValidationError
      );
    });

    it("should throw ValidationError when delivery ID header is missing", () => {
      const body = createValidPayload();

      expect(() => adapter.parseWebhook(body, {})).toThrow(ValidationError);
    });

    it("should throw ValidationError when delivery ID header is an array", () => {
      const body = createValidPayload();

      expect(() =>
        adapter.parseWebhook(body, { "x-webhook-id": ["a", "b"] as unknown as string })
      ).toThrow(ValidationError);
    });
  });

  describe("generateFingerprint", () => {
    it("should generate a hex string of fixed length", () => {
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
        service: { id: "PSVC002", type: "service_reference", summary: "auth-service" },
      });
      const headers = createValidHeaders();

      const alert1 = adapter.parseWebhook(body1, headers);
      const alert2 = adapter.parseWebhook(body2, headers);

      expect(alert1.fingerprint).not.toBe(alert2.fingerprint);
    });

    it("should produce same fingerprint for same service regardless of title", () => {
      const body1 = createValidPayload();
      const body2 = createValidPayload({ title: "Different alert title" });
      const headers = createValidHeaders();

      const alert1 = adapter.parseWebhook(body1, headers);
      const alert2 = adapter.parseWebhook(body2, headers);

      // Fingerprint is based on source, serviceName, pd_service_id, pd_alert_class
      // Not on title, so same service data = same fingerprint
      expect(alert1.fingerprint).toBe(alert2.fingerprint);
    });
  });

  describe("PagerDuty priority mapping", () => {
    const priorityCases: ReadonlyArray<{ name: string; expected: string }> = [
      { name: "P1", expected: "critical" },
      { name: "P2", expected: "high" },
      { name: "P3", expected: "medium" },
      { name: "P4", expected: "low" },
      { name: "P5", expected: "info" },
      { name: "SEV1", expected: "critical" },
      { name: "SEV2", expected: "high" },
    ];

    for (const { name, expected } of priorityCases) {
      it(`should map priority ${name} to ${expected}`, () => {
        const body = createValidPayload({
          priority: { id: "pri-1", name, summary: name },
        });
        const headers = createValidHeaders();

        const result = adapter.parseWebhook(body, headers);

        expect(result.severity).toBe(expected);
      });
    }
  });
});

/**
 * OpsGenie Alert Adapter Tests
 *
 * Tests for the OpsGenie alert source adapter: webhook parsing,
 * fingerprint generation, payload validation, severity mapping,
 * synthetic delivery ID generation, tag extraction, and service name resolution.
 */

import { describe, it, expect, jest } from "@jest/globals";

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

import { createOpsGenieAdapter } from "./opsgenieAlertAdapter.js";
import { ValidationError } from "@kenchi/shared";
import { computeHash } from "../helpers/fingerprint.js";

// ==================== Test Fixtures ====================

const createValidAlertData = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  alertId: "alert-og-123",
  tinyId: "T1",
  message: "High error rate on payments service",
  priority: "P1",
  source: "API Integration",
  tags: ["service:payments-api", "env:production", "team:platform"],
  entity: "payments-api-entity",
  createdAt: 1711454400000,
  description: "Error rate exceeded 5% threshold",
  team: "platform-team",
  ...overrides,
});

const createValidPayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  action: overrides.action ?? "Create",
  source: { name: "web", type: "integration" },
  alert: createValidAlertData(overrides.alert as Record<string, unknown> | undefined),
});

const createValidHeaders = (
  overrides: Record<string, string | string[] | undefined> = {}
): Record<string, string | string[] | undefined> => ({
  "content-type": "application/json",
  ...overrides,
});

// ==================== Tests ====================

describe("createOpsGenieAdapter", () => {
  const adapter = createOpsGenieAdapter();

  describe("parseWebhook", () => {
    it("should parse a valid OpsGenie webhook into NormalizedAlert", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.source).toBe("opsgenie");
      expect(result.sourceAlertId).toBe("alert-og-123");
      expect(result.title).toBe("High error rate on payments service");
      expect(result.description).toBe("Error rate exceeded 5% threshold");
      expect(result.severity).toBe("critical");
      expect(result.serviceName).toBe("payments-api");
      expect(result.environment).toBe("production");
      expect(result.fingerprint).toBeTruthy();
      expect(result.deliveryId).toBeTruthy();
      expect(result.receivedAt).toBeTruthy();
    });

    it("should generate synthetic delivery ID from alertId and createdAt", () => {
      const body = createValidPayload();
      const result = adapter.parseWebhook(body, createValidHeaders());
      const expected = computeHash(["og", "alert-og-123", "1711454400000"]);
      expect(result.deliveryId).toBe(expected);
    });

    it("should set description to null when not present", () => {
      const body = createValidPayload({ alert: { description: undefined } });
      const result = adapter.parseWebhook(body, createValidHeaders());
      expect(result.description).toBeNull();
    });

    // -- Service name extraction --

    it("should extract service name from service: tag", () => {
      const body = createValidPayload({
        alert: { tags: ["service:my-service", "env:prod"] },
      });
      const result = adapter.parseWebhook(body, createValidHeaders());
      expect(result.serviceName).toBe("my-service");
    });

    it("should fall back to entity when no service: tag exists", () => {
      const body = createValidPayload({
        alert: { tags: ["env:prod"], entity: "fallback-entity" },
      });
      const result = adapter.parseWebhook(body, createValidHeaders());
      expect(result.serviceName).toBe("fallback-entity");
    });

    it("should return null serviceName when no tags and no entity", () => {
      const body = createValidPayload({
        alert: { tags: undefined, entity: undefined },
      });
      const result = adapter.parseWebhook(body, createValidHeaders());
      expect(result.serviceName).toBeNull();
    });

    // -- Environment extraction --

    it("should extract environment from env: tag", () => {
      const body = createValidPayload({
        alert: { tags: ["env:staging"] },
      });
      const result = adapter.parseWebhook(body, createValidHeaders());
      expect(result.environment).toBe("staging");
    });

    it("should return null environment when no env: tag", () => {
      const body = createValidPayload({
        alert: { tags: ["service:api"] },
      });
      const result = adapter.parseWebhook(body, createValidHeaders());
      expect(result.environment).toBeNull();
    });

    it("should return null environment when tags are undefined", () => {
      const body = createValidPayload({ alert: { tags: undefined } });
      const result = adapter.parseWebhook(body, createValidHeaders());
      expect(result.environment).toBeNull();
    });

    // -- Severity mapping --

    it("should map P1 to critical severity", () => {
      const body = createValidPayload({ alert: { priority: "P1" } });
      const result = adapter.parseWebhook(body, createValidHeaders());
      expect(result.severity).toBe("critical");
    });

    it("should map P2 to high severity", () => {
      const body = createValidPayload({ alert: { priority: "P2" } });
      const result = adapter.parseWebhook(body, createValidHeaders());
      expect(result.severity).toBe("high");
    });

    it("should map P3 to medium severity", () => {
      const body = createValidPayload({ alert: { priority: "P3" } });
      const result = adapter.parseWebhook(body, createValidHeaders());
      expect(result.severity).toBe("medium");
    });

    it("should map P4 to low severity", () => {
      const body = createValidPayload({ alert: { priority: "P4" } });
      const result = adapter.parseWebhook(body, createValidHeaders());
      expect(result.severity).toBe("low");
    });

    it("should map P5 to info severity", () => {
      const body = createValidPayload({ alert: { priority: "P5" } });
      const result = adapter.parseWebhook(body, createValidHeaders());
      expect(result.severity).toBe("info");
    });

    it("should default to medium severity for unrecognized priority", () => {
      const body = createValidPayload({ alert: { priority: "P99" } });
      const result = adapter.parseWebhook(body, createValidHeaders());
      expect(result.severity).toBe("medium");
    });

    it("should handle case-insensitive priority mapping", () => {
      const body = createValidPayload({ alert: { priority: "p1" } });
      const result = adapter.parseWebhook(body, createValidHeaders());
      expect(result.severity).toBe("critical");
    });

    // -- Label extraction --

    it("should extract all labels from alert data", () => {
      const body = createValidPayload();
      const result = adapter.parseWebhook(body, createValidHeaders());

      expect(result.labels).toEqual(
        expect.objectContaining({
          og_alert_id: "alert-og-123",
          og_tiny_id: "T1",
          og_priority: "P1",
          og_action: "Create",
          og_source: "API Integration",
          og_team: "platform-team",
        })
      );
    });

    it("should include tag labels with og_tag_ prefix", () => {
      const body = createValidPayload({
        alert: { tags: ["service:payments-api", "env:production"] },
      });
      const result = adapter.parseWebhook(body, createValidHeaders());

      expect(result.labels).toEqual(
        expect.objectContaining({
          og_tag_service: "payments-api",
          og_tag_env: "production",
        })
      );
    });

    it("should handle tag without value as 'true'", () => {
      const body = createValidPayload({
        alert: { tags: ["critical"] },
      });
      const result = adapter.parseWebhook(body, createValidHeaders());

      expect(result.labels.og_tag_critical).toBe("true");
    });

    it("should handle tag with colon in value", () => {
      const body = createValidPayload({
        alert: { tags: ["url:https://example.com:8080"] },
      });
      const result = adapter.parseWebhook(body, createValidHeaders());

      expect(result.labels.og_tag_url).toBe("https://example.com:8080");
    });

    it("should omit optional labels when not present", () => {
      const body = createValidPayload({
        alert: { source: undefined, team: undefined, tags: undefined },
      });
      const result = adapter.parseWebhook(body, createValidHeaders());

      expect(result.labels).not.toHaveProperty("og_source");
      expect(result.labels).not.toHaveProperty("og_team");
    });

    // -- Payload truncation --

    it("should truncate source payload when it exceeds 10KB", () => {
      const body = createValidPayload();
      (body as Record<string, unknown>).largeField = "x".repeat(15_000);
      const result = adapter.parseWebhook(body, createValidHeaders());

      expect(result.sourcePayload).toHaveProperty("_truncated", true);
      expect(result.sourcePayload).toHaveProperty("_originalSize");
    });

    // -- Payload validation --

    it("should throw ValidationError when body is null", () => {
      expect(() => adapter.parseWebhook(null, createValidHeaders())).toThrow(ValidationError);
    });

    it("should throw ValidationError when body is not an object", () => {
      expect(() => adapter.parseWebhook("string", createValidHeaders())).toThrow(ValidationError);
    });

    it("should throw ValidationError when action is missing", () => {
      const body = { alert: createValidAlertData() };
      expect(() => adapter.parseWebhook(body, createValidHeaders())).toThrow(ValidationError);
    });

    it("should throw ValidationError when alert is missing", () => {
      const body = { action: "Create" };
      expect(() => adapter.parseWebhook(body, createValidHeaders())).toThrow(ValidationError);
    });

    it("should throw ValidationError when alert.alertId is missing", () => {
      const body = { action: "Create", alert: { message: "test" } };
      expect(() => adapter.parseWebhook(body, createValidHeaders())).toThrow(ValidationError);
    });

    it("should throw ValidationError when alert.message is missing", () => {
      const body = { action: "Create", alert: { alertId: "123" } };
      expect(() => adapter.parseWebhook(body, createValidHeaders())).toThrow(ValidationError);
    });

    // -- Logging --

    it("should log after successful parse", () => {
      adapter.parseWebhook(createValidPayload(), createValidHeaders());

      expect(mockLoggerInstance.info).toHaveBeenCalledWith(
        "OpsGenie webhook parsed",
        expect.objectContaining({
          provider: "opsgenie",
          operation: "parseWebhook",
          sourceAlertId: "alert-og-123",
        })
      );
    });
  });

  describe("generateFingerprint", () => {
    it("should generate a consistent fingerprint for the same alert", () => {
      const body = createValidPayload();
      const alert = adapter.parseWebhook(body, createValidHeaders());

      const fp1 = adapter.generateFingerprint(alert);
      const fp2 = adapter.generateFingerprint(alert);

      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(40);
    });

    it("should match the fingerprint embedded in parseWebhook result", () => {
      const body = createValidPayload();
      const alert = adapter.parseWebhook(body, createValidHeaders());

      expect(adapter.generateFingerprint(alert)).toBe(alert.fingerprint);
    });

    it("should generate different fingerprints for different alert IDs", () => {
      const alert1 = adapter.parseWebhook(
        createValidPayload({ alert: { alertId: "alert-1" } }),
        createValidHeaders()
      );
      const alert2 = adapter.parseWebhook(
        createValidPayload({ alert: { alertId: "alert-2" } }),
        createValidHeaders()
      );

      expect(alert1.fingerprint).not.toBe(alert2.fingerprint);
    });

    it("should use sha256 hash with source, serviceName, and alertId components", () => {
      const body = createValidPayload();
      const alert = adapter.parseWebhook(body, createValidHeaders());
      const expected = computeHash(["opsgenie", "payments-api", "alert-og-123"]);

      expect(alert.fingerprint).toBe(expected);
    });

    it("should use empty string for null serviceName in fingerprint", () => {
      const body = createValidPayload({
        alert: { tags: undefined, entity: undefined },
      });
      const alert = adapter.parseWebhook(body, createValidHeaders());
      const expected = computeHash(["opsgenie", "", "alert-og-123"]);

      expect(alert.fingerprint).toBe(expected);
    });
  });
});

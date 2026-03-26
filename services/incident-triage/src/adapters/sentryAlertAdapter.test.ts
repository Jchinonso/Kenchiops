/**
 * Sentry Alert Adapter Tests
 *
 * Tests for the Sentry alert source adapter: webhook parsing,
 * fingerprint generation, payload validation, severity mapping,
 * delivery ID extraction, label/metric extraction, and payload truncation.
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

import { createSentryAdapter } from "./sentryAlertAdapter.js";
import { ValidationError } from "@kenchi/shared";
import { computeHash } from "../helpers/fingerprint.js";

// ==================== Test Fixtures ====================

const createValidIssue = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "issue-123",
  title: "TypeError: Cannot read properties of undefined",
  culprit: "app/components/UserProfile.tsx",
  metadata: { type: "TypeError", value: "Cannot read properties of undefined" },
  level: "error",
  status: "unresolved",
  count: "42",
  userCount: 7,
  firstSeen: "2026-03-20T10:00:00.000Z",
  lastSeen: "2026-03-26T14:30:00.000Z",
  project: { id: "proj-1", name: "web-app", slug: "web-app" },
  shortId: "WEB-APP-1234",
  platform: "javascript",
  ...overrides,
});

const createValidPayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  action: "created",
  data: { issue: createValidIssue(overrides.issue as Record<string, unknown>) },
  actor: { type: "application", id: 1, name: "sentry" },
  ...(overrides.action ? { action: overrides.action } : {}),
  ...(overrides.data !== undefined ? { data: overrides.data } : {}),
  ...(overrides.installation !== undefined ? { installation: overrides.installation } : {}),
});

const createValidHeaders = (
  overrides: Record<string, string | string[] | undefined> = {}
): Record<string, string | string[] | undefined> => ({
  "sentry-hook-id": "hook-delivery-abc123",
  "content-type": "application/json",
  ...overrides,
});

// ==================== Tests ====================

describe("createSentryAdapter", () => {
  const adapter = createSentryAdapter();

  describe("parseWebhook", () => {
    it("should parse a valid Sentry webhook into NormalizedAlert", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.source).toBe("sentry");
      expect(result.sourceAlertId).toBe("issue-123");
      expect(result.deliveryId).toBe("hook-delivery-abc123");
      expect(result.title).toBe("TypeError: Cannot read properties of undefined");
      expect(result.description).toBe("app/components/UserProfile.tsx");
      expect(result.severity).toBe("high");
      expect(result.serviceName).toBe("web-app");
      expect(result.environment).toBeNull();
      expect(result.fingerprint).toBeTruthy();
      expect(result.receivedAt).toBeTruthy();
    });

    it("should set description to null when culprit is empty string", () => {
      const body = createValidPayload({ issue: { culprit: "" } });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.description).toBeNull();
    });

    // -- Severity mapping --

    it("should map 'fatal' level to critical severity", () => {
      const body = createValidPayload({ issue: { level: "fatal" } });
      const result = adapter.parseWebhook(body, createValidHeaders());
      expect(result.severity).toBe("critical");
    });

    it("should map 'error' level to high severity", () => {
      const body = createValidPayload({ issue: { level: "error" } });
      const result = adapter.parseWebhook(body, createValidHeaders());
      expect(result.severity).toBe("high");
    });

    it("should map 'warning' level to medium severity", () => {
      const body = createValidPayload({ issue: { level: "warning" } });
      const result = adapter.parseWebhook(body, createValidHeaders());
      expect(result.severity).toBe("medium");
    });

    it("should map 'info' level to low severity", () => {
      const body = createValidPayload({ issue: { level: "info" } });
      const result = adapter.parseWebhook(body, createValidHeaders());
      expect(result.severity).toBe("low");
    });

    it("should map 'debug' level to info severity", () => {
      const body = createValidPayload({ issue: { level: "debug" } });
      const result = adapter.parseWebhook(body, createValidHeaders());
      expect(result.severity).toBe("info");
    });

    it("should default to medium severity for unrecognized level", () => {
      const body = createValidPayload({ issue: { level: "custom-unknown" } });
      const result = adapter.parseWebhook(body, createValidHeaders());
      expect(result.severity).toBe("medium");
    });

    it("should handle case-insensitive level mapping", () => {
      const body = createValidPayload({ issue: { level: "FATAL" } });
      const result = adapter.parseWebhook(body, createValidHeaders());
      expect(result.severity).toBe("critical");
    });

    // -- Label extraction --

    it("should extract all labels from issue data", () => {
      const body = createValidPayload();
      const result = adapter.parseWebhook(body, createValidHeaders());

      expect(result.labels).toEqual(
        expect.objectContaining({
          sentry_project_id: "proj-1",
          sentry_project_name: "web-app",
          sentry_project_slug: "web-app",
          sentry_short_id: "WEB-APP-1234",
          sentry_level: "error",
          sentry_status: "unresolved",
          sentry_culprit: "app/components/UserProfile.tsx",
          sentry_platform: "javascript",
        })
      );
    });

    it("should omit optional labels when not present", () => {
      const body = createValidPayload({
        issue: { culprit: "", platform: undefined },
      });
      const result = adapter.parseWebhook(body, createValidHeaders());

      expect(result.labels).not.toHaveProperty("sentry_culprit");
      expect(result.labels).not.toHaveProperty("sentry_platform");
    });

    // -- Metrics extraction --

    it("should extract metrics from issue data", () => {
      const body = createValidPayload();
      const result = adapter.parseWebhook(body, createValidHeaders());

      expect(result.metrics).toEqual({
        eventCount: 42,
        userCount: 7,
        firstSeen: "2026-03-20T10:00:00.000Z",
        lastSeen: "2026-03-26T14:30:00.000Z",
      });
    });

    // -- Payload truncation --

    it("should truncate source payload when it exceeds 10KB", () => {
      const largeBody = createValidPayload();
      // Add a large field to blow past 10KB
      (largeBody as Record<string, unknown>).largeField = "x".repeat(15_000);
      const result = adapter.parseWebhook(largeBody, createValidHeaders());

      expect(result.sourcePayload).toHaveProperty("_truncated", true);
      expect(result.sourcePayload).toHaveProperty("_originalSize");
    });

    it("should preserve source payload when under 10KB", () => {
      const body = createValidPayload();
      const result = adapter.parseWebhook(body, createValidHeaders());

      expect(result.sourcePayload).not.toHaveProperty("_truncated");
    });

    // -- Delivery ID extraction --

    it("should throw ValidationError when sentry-hook-id header is missing", () => {
      const body = createValidPayload();
      const headers = createValidHeaders({ "sentry-hook-id": undefined });

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError when sentry-hook-id header is array", () => {
      const body = createValidPayload();
      const headers = createValidHeaders({ "sentry-hook-id": ["a", "b"] });

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError when sentry-hook-id header is empty string", () => {
      const body = createValidPayload();
      const headers = createValidHeaders({ "sentry-hook-id": "" });

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    // -- Payload validation --

    it("should throw ValidationError when body is null", () => {
      expect(() => adapter.parseWebhook(null, createValidHeaders())).toThrow(ValidationError);
    });

    it("should throw ValidationError when body is not an object", () => {
      expect(() => adapter.parseWebhook("string", createValidHeaders())).toThrow(ValidationError);
    });

    it("should throw ValidationError when action is missing", () => {
      const body = { data: { issue: createValidIssue() } };
      expect(() => adapter.parseWebhook(body, createValidHeaders())).toThrow(ValidationError);
    });

    it("should throw ValidationError when data is missing", () => {
      const body = { action: "created" };
      expect(() => adapter.parseWebhook(body, createValidHeaders())).toThrow(ValidationError);
    });

    it("should throw ValidationError when data.issue is missing", () => {
      const body = { action: "created", data: {} };
      expect(() => adapter.parseWebhook(body, createValidHeaders())).toThrow(ValidationError);
    });

    it("should throw ValidationError when data.issue.id is missing", () => {
      const body = { action: "created", data: { issue: { title: "t", project: {} } } };
      expect(() => adapter.parseWebhook(body, createValidHeaders())).toThrow(ValidationError);
    });

    it("should throw ValidationError when data.issue.title is missing", () => {
      const body = { action: "created", data: { issue: { id: "1", project: {} } } };
      expect(() => adapter.parseWebhook(body, createValidHeaders())).toThrow(ValidationError);
    });

    it("should throw ValidationError when data.issue.project is missing", () => {
      const body = { action: "created", data: { issue: { id: "1", title: "t" } } };
      expect(() => adapter.parseWebhook(body, createValidHeaders())).toThrow(ValidationError);
    });

    // -- Logging --

    it("should log after successful parse", () => {
      const body = createValidPayload();
      adapter.parseWebhook(body, createValidHeaders());

      expect(mockLoggerInstance.info).toHaveBeenCalledWith(
        "Sentry webhook parsed",
        expect.objectContaining({
          provider: "sentry",
          operation: "parseWebhook",
          sourceAlertId: "issue-123",
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

    it("should generate the same fingerprint as the one embedded in parseWebhook result", () => {
      const body = createValidPayload();
      const alert = adapter.parseWebhook(body, createValidHeaders());

      expect(adapter.generateFingerprint(alert)).toBe(alert.fingerprint);
    });

    it("should generate different fingerprints for different issue IDs", () => {
      const alert1 = adapter.parseWebhook(
        createValidPayload({ issue: { id: "issue-1" } }),
        createValidHeaders()
      );
      const alert2 = adapter.parseWebhook(
        createValidPayload({ issue: { id: "issue-2" } }),
        createValidHeaders()
      );

      expect(alert1.fingerprint).not.toBe(alert2.fingerprint);
    });

    it("should generate different fingerprints for different project slugs", () => {
      const alert1 = adapter.parseWebhook(
        createValidPayload({ issue: { project: { id: "1", name: "a", slug: "alpha" } } }),
        createValidHeaders()
      );
      const alert2 = adapter.parseWebhook(
        createValidPayload({ issue: { project: { id: "1", name: "a", slug: "beta" } } }),
        createValidHeaders()
      );

      expect(alert1.fingerprint).not.toBe(alert2.fingerprint);
    });

    it("should use sha256 hash with source, project_slug, and issue_id components", () => {
      const body = createValidPayload();
      const alert = adapter.parseWebhook(body, createValidHeaders());
      const expected = computeHash(["sentry", "web-app", "issue-123"]);

      expect(alert.fingerprint).toBe(expected);
    });
  });
});

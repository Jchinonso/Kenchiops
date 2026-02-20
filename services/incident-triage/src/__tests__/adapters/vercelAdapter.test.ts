/**
 * Vercel Adapter Tests
 *
 * Tests for the Vercel alert source adapter: webhook parsing,
 * fingerprint generation, payload validation, event filtering,
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

import { createVercelAdapter } from "../../adapters/vercelAdapter.js";
import { ValidationError } from "@kenchi/shared";

// ==================== Test Fixtures ====================

const createValidPayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: "deployment.error",
  id: "webhook-delivery-abc123",
  createdAt: 1708351200000,
  region: "us-east-1",
  payload: {
    team: { id: "team-123" },
    user: { id: "user-456" },
    deployment: {
      id: "dpl-abc123",
      meta: {
        githubOrg: "kenchi-inc",
        githubRepo: "kenchi-app",
        githubCommitSha: "a1b2c3d4e5f6",
        githubCommitRef: "main",
        githubPrId: "42",
      },
      url: "kenchi-app-abc123.vercel.app",
      name: "kenchi-app",
    },
    links: {
      deployment: "https://vercel.com/kenchi/kenchi-app/dpl-abc123",
      project: "https://vercel.com/kenchi/kenchi-app",
    },
    target: "production",
    project: { id: "prj-789" },
    plan: "pro",
    regions: ["iad1"],
  },
  ...overrides,
});

const createValidHeaders = (
  overrides: Record<string, string> = {}
): Record<string, string | string[] | undefined> => ({
  "content-type": "application/json",
  ...overrides,
});

// ==================== Tests ====================

describe("createVercelAdapter", () => {
  const adapter = createVercelAdapter();

  describe("parseWebhook", () => {
    it("should parse a valid Vercel webhook into NormalizedAlert", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.sourceAlertId).toBe("dpl-abc123");
      expect(result.source).toBe("vercel");
      expect(result.title).toContain("kenchi-app");
      expect(result.description).toContain("dpl-abc123");
    });

    it("should set deliveryId from webhook.id", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.deliveryId).toBe("webhook-delivery-abc123");
    });

    it("should use correct verb for deployment.error (failed)", () => {
      const body = createValidPayload({ type: "deployment.error" });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.title).toContain("failed");
    });

    it("should use correct verb for deployment.canceled (canceled)", () => {
      const body = createValidPayload({ type: "deployment.canceled" });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.title).toContain("canceled");
    });

    it("should map deployment.error to high severity", () => {
      const body = createValidPayload({ type: "deployment.error" });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.severity).toBe("high");
    });

    it("should map deployment.canceled to medium severity", () => {
      const body = createValidPayload({ type: "deployment.canceled" });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.severity).toBe("medium");
    });

    it("should extract serviceName from deployment.name", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.serviceName).toBe("kenchi-app");
    });

    it("should extract environment from target", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.environment).toBe("production");
    });

    it("should set environment to null when target is null", () => {
      const body = createValidPayload({
        payload: {
          ...((createValidPayload() as Record<string, unknown>).payload as Record<string, unknown>),
          target: null,
        },
      });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.environment).toBeNull();
    });

    it("should extract labels with vercel_ prefix", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.labels).toHaveProperty("vercel_owner", "kenchi-inc");
      expect(result.labels).toHaveProperty("vercel_repo", "kenchi-app");
      expect(result.labels).toHaveProperty("vercel_commit_sha", "a1b2c3d4e5f6");
      expect(result.labels).toHaveProperty("vercel_branch", "main");
      expect(result.labels).toHaveProperty("vercel_pr_number", "42");
      expect(result.labels).toHaveProperty("vercel_team_id", "team-123");
      expect(result.labels).toHaveProperty("vercel_project_id", "prj-789");
    });

    it("should extract metrics with deploymentUrl and region", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.metrics).toHaveProperty("deploymentUrl", "kenchi-app-abc123.vercel.app");
      expect(result.metrics).toHaveProperty("region", "us-east-1");
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

    it("should include description with deployment ID, target, and URL", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.description).toContain("dpl-abc123");
      expect(result.description).toContain("production");
      expect(result.description).toContain("kenchi-app-abc123.vercel.app");
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

    it("should throw ValidationError when type is missing", () => {
      const body = createValidPayload({ type: undefined });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError when id is missing", () => {
      const body = createValidPayload({ id: undefined });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError when payload is missing", () => {
      const body = createValidPayload({ payload: undefined });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError when payload.deployment is missing", () => {
      const body = createValidPayload({
        payload: {
          team: { id: "team-123" },
          user: { id: "user-456" },
          links: { deployment: "", project: "" },
          target: "production",
          project: { id: "prj-789" },
          plan: "pro",
          regions: [],
        },
      });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });
  });

  describe("parseWebhook event filtering", () => {
    it("should throw ValidationError for deployment.ready event", () => {
      const body = createValidPayload({ type: "deployment.ready" });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError for deployment.succeeded event", () => {
      const body = createValidPayload({ type: "deployment.succeeded" });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError for deployment.created event", () => {
      const body = createValidPayload({ type: "deployment.created" });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should parse successfully for deployment.error event", () => {
      const body = createValidPayload({ type: "deployment.error" });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.source).toBe("vercel");
    });

    it("should parse successfully for deployment.canceled event", () => {
      const body = createValidPayload({ type: "deployment.canceled" });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.source).toBe("vercel");
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

    it("should produce different fingerprints for different projects", () => {
      const body1 = createValidPayload();
      const body2 = createValidPayload({
        payload: {
          ...((createValidPayload() as Record<string, unknown>).payload as Record<string, unknown>),
          project: { id: "prj-different" },
        },
      });
      const headers = createValidHeaders();

      const alert1 = adapter.parseWebhook(body1, headers);
      const alert2 = adapter.parseWebhook(body2, headers);

      expect(alert1.fingerprint).not.toBe(alert2.fingerprint);
    });

    it("should produce same fingerprint regardless of deployment name", () => {
      const body1 = createValidPayload();
      const payload2 = createValidPayload();
      const innerPayload = (payload2 as Record<string, unknown>).payload as Record<string, unknown>;
      const deployment = innerPayload.deployment as Record<string, unknown>;
      (innerPayload as Record<string, unknown>).deployment = {
        ...deployment,
        name: "different-name",
      };
      const headers = createValidHeaders();

      const alert1 = adapter.parseWebhook(body1, headers);
      const alert2 = adapter.parseWebhook(payload2, headers);

      // Fingerprint is based on projectId and commitSha, not name
      expect(alert1.fingerprint).toBe(alert2.fingerprint);
    });
  });
});

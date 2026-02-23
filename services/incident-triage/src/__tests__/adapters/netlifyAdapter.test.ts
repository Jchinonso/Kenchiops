/**
 * Netlify Adapter Tests
 *
 * Tests for the Netlify alert source adapter: webhook parsing,
 * fingerprint generation, payload validation, state filtering,
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

import { createNetlifyAdapter } from "../../adapters/netlifyAdapter.js";
import { ValidationError } from "@kenchi/shared";

// ==================== Test Fixtures ====================

const createValidPayload = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "deploy-abc123",
  site_id: "site-789",
  build_id: "build-456",
  state: "error",
  name: "kenchi-frontend",
  url: "https://kenchi-frontend.netlify.app",
  ssl_url: "https://kenchi-frontend.netlify.app",
  admin_url: "https://app.netlify.com/sites/kenchi-frontend",
  deploy_url: "https://deploy-abc123--kenchi-frontend.netlify.app",
  commit_ref: "a1b2c3d4e5f6",
  commit_url: "https://github.com/kenchi-inc/kenchi-frontend/commit/a1b2c3d4e5f6",
  branch: "main",
  context: "production",
  review_id: null,
  title: "Deploy triggered by push",
  created_at: "2026-02-19T14:00:00.000Z",
  updated_at: "2026-02-19T14:05:00.000Z",
  published_at: null,
  framework: "next",
  error_message: "Build failed: Module not found",
  deploy_time: null,
  committer: "dev@kenchi.com",
  ...overrides,
});

const createValidHeaders = (
  overrides: Record<string, string> = {}
): Record<string, string | string[] | undefined> => ({
  "content-type": "application/json",
  ...overrides,
});

// ==================== Tests ====================

describe("createNetlifyAdapter", () => {
  const adapter = createNetlifyAdapter();

  describe("parseWebhook", () => {
    it("should parse a valid Netlify webhook into NormalizedAlert", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.sourceAlertId).toBe("deploy-abc123");
      expect(result.source).toBe("netlify");
      expect(result.title).toContain("kenchi-frontend");
      expect(result.description).toContain("deploy-abc123");
    });

    it("should map error state to high severity", () => {
      const body = createValidPayload({ state: "error" });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.severity).toBe("high");
    });

    it("should extract serviceName from payload name", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.serviceName).toBe("kenchi-frontend");
    });

    it("should extract environment from context field", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.environment).toBe("production");
    });

    it("should set environment to null when context is missing", () => {
      const body = createValidPayload({ context: undefined });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.environment).toBeNull();
    });

    it("should extract labels with netlify_ prefix", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.labels).toHaveProperty("netlify_owner", "kenchi-inc");
      expect(result.labels).toHaveProperty("netlify_repo", "kenchi-frontend");
      expect(result.labels).toHaveProperty("netlify_commit_sha", "a1b2c3d4e5f6");
      expect(result.labels).toHaveProperty("netlify_branch", "main");
      expect(result.labels).toHaveProperty("netlify_site_id", "site-789");
    });

    it("should extract pr_number from review_id when present", () => {
      const body = createValidPayload({ review_id: 42 });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.labels).toHaveProperty("netlify_pr_number", "42");
    });

    it("should not include pr_number label when review_id is null", () => {
      const body = createValidPayload({ review_id: null });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.labels).not.toHaveProperty("netlify_pr_number");
    });

    it("should include error_message in description when present", () => {
      const body = createValidPayload({ error_message: "Build failed: Module not found" });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.description).toContain("Build failed: Module not found");
    });

    it("should generate description without error_message when not present", () => {
      const body = createValidPayload({ error_message: null });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.description).toContain("failed");
      expect(result.description).not.toContain("null");
    });

    it("should extract metrics from payload", () => {
      const body = createValidPayload({
        deploy_time: 120,
        framework: "next",
        error_message: "Build failed",
      });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.metrics).toHaveProperty(
        "deployUrl",
        "https://deploy-abc123--kenchi-frontend.netlify.app"
      );
      expect(result.metrics).toHaveProperty("deployTime", 120);
      expect(result.metrics).toHaveProperty("errorMessage", "Build failed");
      expect(result.metrics).toHaveProperty("framework", "next");
    });

    it("should omit deploy_time from metrics when null", () => {
      const body = createValidPayload({ deploy_time: null });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.metrics).not.toHaveProperty("deployTime");
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

    it("should generate synthetic deliveryId as a hash", () => {
      const body = createValidPayload();
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.deliveryId).toBeTruthy();
      expect(result.deliveryId).toMatch(/^[0-9a-f]+$/);
      expect(result.deliveryId.length).toBe(40);
    });

    it("should generate different deliveryIds for same deploy with different states", () => {
      const body1 = createValidPayload({ state: "error" });
      // To test different state we need a state that is in NETLIFY_FAILURE_STATES
      // Only "error" is in the set, so we verify it produces a deterministic hash
      // based on id + state combo
      const headers = createValidHeaders();

      const result1 = adapter.parseWebhook(body1, headers);

      // The deliveryId is computeHash(["netlify", payload.id, payload.state])
      // Different id means different deliveryId
      const body2 = createValidPayload({ id: "deploy-different", state: "error" });
      const result2 = adapter.parseWebhook(body2, headers);

      expect(result1.deliveryId).not.toBe(result2.deliveryId);
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

    it("should throw ValidationError when id is missing", () => {
      const body = createValidPayload({ id: undefined });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError when site_id is missing", () => {
      const body = createValidPayload({ site_id: undefined });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError when state is missing", () => {
      const body = createValidPayload({ state: undefined });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });
  });

  describe("parseWebhook state filtering", () => {
    it("should throw ValidationError when state is ready", () => {
      const body = createValidPayload({ state: "ready" });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError when state is building", () => {
      const body = createValidPayload({ state: "building" });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should throw ValidationError when state is new", () => {
      const body = createValidPayload({ state: "new" });
      const headers = createValidHeaders();

      expect(() => adapter.parseWebhook(body, headers)).toThrow(ValidationError);
    });

    it("should parse successfully when state is error", () => {
      const body = createValidPayload({ state: "error" });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.source).toBe("netlify");
    });
  });

  describe("label extraction edge cases", () => {
    it("should handle missing commit_url gracefully", () => {
      const body = createValidPayload({ commit_url: null });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.labels).not.toHaveProperty("netlify_owner");
      expect(result.labels).not.toHaveProperty("netlify_repo");
    });

    it("should handle non-github commit_url gracefully", () => {
      const body = createValidPayload({
        commit_url: "https://gitlab.com/kenchi/app/commit/abc123",
      });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      // Regex is GitHub-specific, so owner/repo should be empty
      expect(result.labels).not.toHaveProperty("netlify_owner");
      expect(result.labels).not.toHaveProperty("netlify_repo");
    });

    it("should handle missing branch gracefully", () => {
      const body = createValidPayload({ branch: undefined });
      const headers = createValidHeaders();

      const result = adapter.parseWebhook(body, headers);

      expect(result.labels).not.toHaveProperty("netlify_branch");
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

    it("should produce different fingerprints for different sites", () => {
      const body1 = createValidPayload();
      const body2 = createValidPayload({ site_id: "site-different" });
      const headers = createValidHeaders();

      const alert1 = adapter.parseWebhook(body1, headers);
      const alert2 = adapter.parseWebhook(body2, headers);

      expect(alert1.fingerprint).not.toBe(alert2.fingerprint);
    });

    it("should produce same fingerprint regardless of deploy name", () => {
      const body1 = createValidPayload();
      const body2 = createValidPayload({ name: "different-name" });
      const headers = createValidHeaders();

      const alert1 = adapter.parseWebhook(body1, headers);
      const alert2 = adapter.parseWebhook(body2, headers);

      // Fingerprint is based on siteId and commitSha, not name
      expect(alert1.fingerprint).toBe(alert2.fingerprint);
    });
  });
});

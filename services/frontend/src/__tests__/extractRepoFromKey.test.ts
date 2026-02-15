/**
 * Unit tests for extractRepoFromKey helper.
 *
 * Tests the pure function that derives a repository display name from
 * the analysis aggregationKey or fullAnalysis JSONB fallback.
 *
 * Code paths covered:
 * - aggregationKey with "owner/repo:sha" format -> returns "owner/repo"
 * - aggregationKey without colon -> returns full key
 * - aggregationKey is null, fullAnalysis.repository present -> returns repository
 * - aggregationKey is null, fullAnalysis.repository empty string -> returns "--"
 * - aggregationKey is null, fullAnalysis undefined -> returns "--"
 * - aggregationKey is null, fullAnalysis has no repository field -> returns "--"
 * - aggregationKey is null, fullAnalysis.repository is not a string -> returns "--"
 * - aggregationKey starts with colon (colonIndex === 0) -> returns full key
 */

import { describe, it, expect } from "@jest/globals";
import { extractRepoFromKey } from "../lib/formatters";

// ==================== Tests ====================

describe("extractRepoFromKey", () => {
  describe("aggregationKey with colon-separated format", () => {
    it("should return repo from 'owner/repo:sha' format", () => {
      const result = extractRepoFromKey("acme/my-app:abc123def");

      expect(result).toBe("acme/my-app");
    });

    it("should return repo from 'owner/repo:full-sha' format with long commit hash", () => {
      const result = extractRepoFromKey(
        "kenchi-dev/backend:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
      );

      expect(result).toBe("kenchi-dev/backend");
    });

    it("should return only text before the first colon when multiple colons present", () => {
      const result = extractRepoFromKey("org/repo:sha:extra");

      expect(result).toBe("org/repo");
    });
  });

  describe("aggregationKey without colon", () => {
    it("should return the full key when no colon is present", () => {
      const result = extractRepoFromKey("acme/my-app");

      expect(result).toBe("acme/my-app");
    });

    it("should return a bare repo name without owner prefix", () => {
      const result = extractRepoFromKey("my-repo");

      expect(result).toBe("my-repo");
    });
  });

  describe("aggregationKey starts with colon (boundary: colonIndex === 0)", () => {
    it("should return the full key when colon is at position 0", () => {
      // colonIndex is 0, which is NOT > 0, so the full key is returned
      const result = extractRepoFromKey(":abc123");

      expect(result).toBe(":abc123");
    });
  });

  describe("aggregationKey is null with fullAnalysis fallback", () => {
    it("should return fullAnalysis.repository when aggregationKey is null", () => {
      const fullAnalysis = { repository: "org/fallback-repo", summary: "some analysis" };

      const result = extractRepoFromKey(null, fullAnalysis);

      expect(result).toBe("org/fallback-repo");
    });

    it("should return fullAnalysis.repository when aggregationKey is null and repo has no owner", () => {
      const fullAnalysis = { repository: "standalone-repo" };

      const result = extractRepoFromKey(null, fullAnalysis);

      expect(result).toBe("standalone-repo");
    });
  });

  describe("aggregationKey is null with empty/missing fullAnalysis.repository", () => {
    it('should return "--" when fullAnalysis.repository is an empty string', () => {
      const fullAnalysis = { repository: "" };

      const result = extractRepoFromKey(null, fullAnalysis);

      expect(result).toBe("--");
    });

    it('should return "--" when fullAnalysis is undefined', () => {
      const result = extractRepoFromKey(null, undefined);

      expect(result).toBe("--");
    });

    it('should return "--" when fullAnalysis has no repository field', () => {
      const fullAnalysis = { summary: "analysis without repo" };

      const result = extractRepoFromKey(null, fullAnalysis);

      expect(result).toBe("--");
    });

    it('should return "--" when fullAnalysis.repository is a number (not a string)', () => {
      const fullAnalysis = { repository: 42 };

      const result = extractRepoFromKey(null, fullAnalysis);

      expect(result).toBe("--");
    });

    it('should return "--" when fullAnalysis.repository is null', () => {
      const fullAnalysis = { repository: null };

      const result = extractRepoFromKey(null, fullAnalysis);

      expect(result).toBe("--");
    });

    it('should return "--" when fullAnalysis.repository is undefined', () => {
      const fullAnalysis = { repository: undefined };

      const result = extractRepoFromKey(null, fullAnalysis);

      expect(result).toBe("--");
    });

    it('should return "--" when fullAnalysis is an empty object', () => {
      const fullAnalysis = {};

      const result = extractRepoFromKey(null, fullAnalysis);

      expect(result).toBe("--");
    });
  });

  describe("aggregationKey is empty string", () => {
    it("should fall through to fullAnalysis when key is empty string (falsy)", () => {
      // Empty string is falsy in JS, so the "if (key)" check fails
      const fullAnalysis = { repository: "fallback/repo" };

      const result = extractRepoFromKey("" as unknown as string | null, fullAnalysis);

      expect(result).toBe("fallback/repo");
    });
  });

  describe("input immutability", () => {
    it("should not mutate the fullAnalysis object", () => {
      const fullAnalysis = Object.freeze({ repository: "org/repo", summary: "test" });

      const result = extractRepoFromKey(null, fullAnalysis);

      expect(result).toBe("org/repo");
      // Object.freeze would throw if mutation was attempted
    });

    it("should not mutate a frozen aggregationKey string", () => {
      const key = Object.freeze("org/repo:sha123") as string;

      const result = extractRepoFromKey(key);

      expect(result).toBe("org/repo");
    });
  });
});

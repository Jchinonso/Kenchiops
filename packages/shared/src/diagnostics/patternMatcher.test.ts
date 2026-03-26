/**
 * Tests for Pattern Matcher
 *
 * All functions under test are pure — no mocks needed.
 *
 * @module diagnostics/patternMatcher.test
 */

import { describe, it, expect } from "@jest/globals";
import type { PatternMatchResult, ErrorSignature } from "./patternMatcher.js";
import type { DiagnosticResult } from "./types.js";

import { matchKnownPattern, buildDiagnosticFromPattern } from "./patternMatcher.js";

// ==================== Test Fixtures ====================

const createPatternMatch = (overrides: Partial<PatternMatchResult> = {}): PatternMatchResult => ({
  name: "OOM",
  category: "infrastructure",
  subcategory: "resource_exhaustion",
  confidence: "high",
  recommendation: "Increase memory limits",
  matchedLine: "FATAL ERROR: heap allocation failed - JavaScript heap out of memory",
  ...overrides,
});

// ==================== Tests ====================

describe("patternMatcher", () => {
  describe("matchKnownPattern", () => {
    // ==================== Infrastructure — Resource Exhaustion ====================

    describe("OOM detection", () => {
      it("should match 'out of memory' in logs", () => {
        const result = matchKnownPattern("FATAL: out of memory while allocating buffer");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("OOM");
        expect(result!.category).toBe("infrastructure");
        expect(result!.subcategory).toBe("resource_exhaustion");
        expect(result!.confidence).toBe("high");
      });

      it("should match 'JavaScript heap' exhaustion", () => {
        const result = matchKnownPattern(
          "FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory"
        );

        expect(result).not.toBeNull();
        expect(result!.name).toBe("OOM");
      });

      it("should match 'ENOMEM' error code", () => {
        const result = matchKnownPattern("Error: ENOMEM: not enough memory");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("OOM");
      });

      it("should match 'killed signal 9' (OOM killer)", () => {
        const result = matchKnownPattern("Process killed signal 9");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("OOM");
      });
    });

    describe("DiskFull detection", () => {
      it("should match 'no space left' error", () => {
        const result = matchKnownPattern("write error: no space left on device");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("DiskFull");
        expect(result!.subcategory).toBe("resource_exhaustion");
      });

      it("should match 'ENOSPC' error code", () => {
        const result = matchKnownPattern("Error: ENOSPC: no space left on device");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("DiskFull");
      });
    });

    describe("CPUThrottle detection", () => {
      it("should match cpu throttle message", () => {
        const result = matchKnownPattern("Warning: cpu throttling detected on container");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("CPUThrottle");
        expect(result!.confidence).toBe("medium");
      });
    });

    // ==================== Infrastructure — Network ====================

    describe("ConnectionTimeout detection", () => {
      it("should match ETIMEDOUT", () => {
        const result = matchKnownPattern("connect ETIMEDOUT 10.0.0.1:5432");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("ConnectionTimeout");
        expect(result!.subcategory).toBe("network_failure");
      });

      it("should match 'connection timed out'", () => {
        const result = matchKnownPattern("connection timed out to redis:6379");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("ConnectionTimeout");
      });
    });

    describe("DNSFailure detection", () => {
      it("should match ENOTFOUND", () => {
        const result = matchKnownPattern("getaddrinfo ENOTFOUND api.example.com");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("DNSFailure");
        expect(result!.subcategory).toBe("network_failure");
      });
    });

    describe("ConnectionRefused detection", () => {
      it("should match ECONNREFUSED", () => {
        const result = matchKnownPattern("connect ECONNREFUSED 127.0.0.1:3000");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("ConnectionRefused");
        expect(result!.subcategory).toBe("service_unavailable");
      });
    });

    describe("TLSError detection", () => {
      it("should match certificate expired", () => {
        const result = matchKnownPattern("Error: certificate has expired. CERT_HAS_EXPIRED");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("TLSError");
        expect(result!.subcategory).toBe("network_failure");
      });

      it("should match self-signed certificate", () => {
        const result = matchKnownPattern(
          "UNABLE_TO_VERIFY_LEAF_SIGNATURE: self-signed cert in chain"
        );

        expect(result).not.toBeNull();
        expect(result!.name).toBe("TLSError");
      });
    });

    // ==================== Configuration ====================

    describe("MissingEnvVar detection", () => {
      it("should match missing environment variable", () => {
        const result = matchKnownPattern("Error: required env variable DATABASE_URL not set");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("MissingEnvVar");
        expect(result!.category).toBe("configuration");
        expect(result!.subcategory).toBe("missing_environment");
      });
    });

    describe("InvalidConfig detection", () => {
      it("should match malformed YAML", () => {
        const result = matchKnownPattern("Error: malformed yaml in config.yml at line 42");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("InvalidConfig");
        expect(result!.subcategory).toBe("invalid_config");
        expect(result!.confidence).toBe("medium");
      });
    });

    describe("AuthFailure detection", () => {
      it("should match 401 unauthorized", () => {
        const result = matchKnownPattern("HTTP 401 unauthorized: invalid credentials for registry");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("AuthFailure");
        expect(result!.subcategory).toBe("permission_auth");
      });

      it("should match permission denied", () => {
        const result = matchKnownPattern("Error: permission denied accessing /var/data");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("AuthFailure");
      });
    });

    // ==================== Application ====================

    describe("DependencyConflict detection", () => {
      it("should match ERESOLVE", () => {
        const result = matchKnownPattern("npm ERR! ERESOLVE unable to resolve dependency tree");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("DependencyConflict");
        expect(result!.category).toBe("application");
        expect(result!.subcategory).toBe("version_mismatch");
      });
    });

    describe("ModuleNotFound detection", () => {
      it("should match MODULE_NOT_FOUND", () => {
        const result = matchKnownPattern("Error: Cannot find module 'express' MODULE_NOT_FOUND");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("ModuleNotFound");
        expect(result!.subcategory).toBe("build_failure");
      });
    });

    describe("TypeScriptError detection", () => {
      it("should match TS error codes", () => {
        const result = matchKnownPattern(
          "src/index.ts(10,5): error TS2345: Argument of type 'string' is not assignable"
        );

        expect(result).not.toBeNull();
        expect(result!.name).toBe("TypeScriptError");
        expect(result!.subcategory).toBe("build_failure");
      });

      it("should match 'Property does not exist' pattern", () => {
        const result = matchKnownPattern("Property 'foo' does not exist on type 'Bar'");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("TypeScriptError");
      });
    });

    describe("TestAssertion detection", () => {
      it("should match AssertionError", () => {
        const result = matchKnownPattern("AssertionError: expected 'hello' to equal 'world'");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("TestAssertion");
        expect(result!.subcategory).toBe("test_failure");
      });
    });

    describe("TestTimeout detection", () => {
      it("should match jest timeout", () => {
        const result = matchKnownPattern(
          "Exceeded timeout of 5000 ms for a test. jest timeout error"
        );

        expect(result).not.toBeNull();
        expect(result!.name).toBe("TestTimeout");
        expect(result!.confidence).toBe("medium");
      });
    });

    // ==================== Deployment ====================

    describe("DockerPull detection", () => {
      it("should match manifest not found", () => {
        const result = matchKnownPattern(
          "Error response from daemon: manifest for node:99 not found"
        );

        expect(result).not.toBeNull();
        expect(result!.name).toBe("DockerPull");
        expect(result!.category).toBe("deployment");
        expect(result!.subcategory).toBe("container_error");
      });
    });

    describe("HealthCheckFailed detection", () => {
      it("should match health check fail", () => {
        const result = matchKnownPattern(
          "Readiness probe failed: HTTP probe failed with status code 503"
        );

        expect(result).not.toBeNull();
        expect(result!.name).toBe("HealthCheckFailed");
        expect(result!.subcategory).toBe("rollout_failure");
      });
    });

    describe("CrashLoopBackOff detection", () => {
      it("should match CrashLoopBackOff", () => {
        const result = matchKnownPattern("pod/my-app-7b4c: CrashLoopBackOff");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("CrashLoopBackOff");
        expect(result!.subcategory).toBe("rollout_failure");
      });

      it("should match non-zero exit code", () => {
        const result = matchKnownPattern("container exited with exit code 1");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("CrashLoopBackOff");
      });
    });

    // ==================== External ====================

    describe("RateLimit detection", () => {
      it("should match 429 status", () => {
        const result = matchKnownPattern("Error: 429 too many requests to api.github.com");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("RateLimit");
        expect(result!.category).toBe("external");
        expect(result!.subcategory).toBe("third_party_api");
      });

      it("should match API rate limit text", () => {
        const result = matchKnownPattern(
          "GitHub API rate limit exceeded. Please wait before retrying."
        );

        expect(result).not.toBeNull();
        expect(result!.name).toBe("RateLimit");
      });
    });

    describe("ExternalTimeout detection", () => {
      it("should match 504 gateway timeout", () => {
        const result = matchKnownPattern("HTTP Error: 504 gateway timeout from upstream service");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("ExternalTimeout");
        expect(result!.confidence).toBe("medium");
      });

      it("should match 502 bad gateway", () => {
        const result = matchKnownPattern("502 bad gateway received");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("ExternalTimeout");
      });
    });

    describe("TerraformState detection", () => {
      it("should match terraform state lock", () => {
        const result = matchKnownPattern("Error: Error locking state: terraform lock already held");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("TerraformState");
        expect(result!.category).toBe("deployment");
        expect(result!.subcategory).toBe("orchestration");
      });
    });

    // ==================== Priority Logic ====================

    describe("confidence priority", () => {
      it("should prefer high-confidence match over earlier medium-confidence match", () => {
        // CPUThrottle is medium, OOM is high. Both should match but OOM should win.
        const log = "Warning: cpu throttling detected\nFATAL: out of memory";
        const result = matchKnownPattern(log);

        expect(result).not.toBeNull();
        expect(result!.name).toBe("OOM");
        expect(result!.confidence).toBe("high");
      });

      it("should return medium-confidence match when no high-confidence match exists", () => {
        // CPUThrottle is medium confidence, no high-confidence patterns match
        const log = "Warning: cpu throttling detected on container xyz";
        const result = matchKnownPattern(log);

        expect(result).not.toBeNull();
        expect(result!.confidence).toBe("medium");
      });

      it("should return the first high-confidence match when multiple high patterns match", () => {
        // Both OOM and DiskFull are high confidence
        const log = "FATAL: out of memory\nError: ENOSPC no space left on device";
        const result = matchKnownPattern(log);

        // OOM is defined first in the signatures list
        expect(result).not.toBeNull();
        expect(result!.name).toBe("OOM");
      });
    });

    // ==================== Edge Cases ====================

    describe("edge cases", () => {
      it("should return null for empty string", () => {
        expect(matchKnownPattern("")).toBeNull();
      });

      it("should return null for log with no known patterns", () => {
        const result = matchKnownPattern(
          "INFO: Application started successfully on port 3000\nINFO: Health check passed"
        );

        expect(result).toBeNull();
      });

      it("should perform case-insensitive matching", () => {
        const result = matchKnownPattern("OUT OF MEMORY ERROR");

        expect(result).not.toBeNull();
        expect(result!.name).toBe("OOM");
      });

      it("should include a trimmed matchedLine from the matching context", () => {
        const result = matchKnownPattern(
          "Step 5/10: building image\nFATAL: out of memory in worker process\nCleaning up"
        );

        expect(result).not.toBeNull();
        expect(result!.matchedLine).toContain("out of memory");
        // Should be trimmed, not the whole log
        expect(result!.matchedLine.length).toBeLessThanOrEqual(200);
      });

      it("should scan the head region of very long logs", () => {
        const header = "FATAL: out of memory\n";
        const padding = "x".repeat(10000);
        const log = header + padding;

        const result = matchKnownPattern(log);

        expect(result).not.toBeNull();
        expect(result!.name).toBe("OOM");
      });

      it("should scan the tail region of very long logs", () => {
        const padding = "x".repeat(10000);
        const trailer = "\nFATAL: out of memory";
        const log = padding + trailer;

        const result = matchKnownPattern(log);

        expect(result).not.toBeNull();
        expect(result!.name).toBe("OOM");
      });

      it("should miss patterns in the middle of a very long log (outside scan regions)", () => {
        const padding = "x".repeat(10000);
        const log = padding + "\nFATAL: out of memory\n" + padding;

        const result = matchKnownPattern(log);

        // Total log is ~20000 chars. Head scans 5000, tail scans last 2000.
        // The OOM line at position ~10000 is outside both scan regions.
        expect(result).toBeNull();
      });

      it("should not mutate the input string", () => {
        const log = "FATAL: out of memory" as string;
        const frozen = Object.freeze({ value: log });

        matchKnownPattern(frozen.value);

        expect(frozen.value).toBe("FATAL: out of memory");
      });

      it("should truncate matched line to 200 characters", () => {
        const longLine = "FATAL: out of memory " + "a".repeat(300);
        const result = matchKnownPattern(longLine);

        expect(result).not.toBeNull();
        expect(result!.matchedLine.length).toBeLessThanOrEqual(200);
      });
    });
  });

  describe("buildDiagnosticFromPattern", () => {
    it("should produce a complete DiagnosticResult with status 'complete'", () => {
      const match = createPatternMatch();
      const result = buildDiagnosticFromPattern(match, "some raw log preview");

      expect(result.status).toBe("complete");
    });

    it("should map match fields to rootCause correctly", () => {
      const match = createPatternMatch({
        name: "ConnectionTimeout",
        category: "infrastructure",
        subcategory: "network_failure",
        confidence: "high",
        matchedLine: "connect ETIMEDOUT 10.0.0.1:5432",
      });

      const result = buildDiagnosticFromPattern(match, "");

      expect(result.rootCause.category).toBe("infrastructure");
      expect(result.rootCause.subcategory).toBe("network_failure");
      expect(result.rootCause.confidence).toBe("high");
      expect(result.rootCause.summary).toBe("ConnectionTimeout: connect ETIMEDOUT 10.0.0.1:5432");
      expect(result.rootCause.evidence).toEqual(["connect ETIMEDOUT 10.0.0.1:5432"]);
    });

    it("should build causalityChain with pattern name and explanation", () => {
      const match = createPatternMatch({ name: "DNSFailure" });
      const result = buildDiagnosticFromPattern(match, "");

      expect(result.causalityChain.primary.type).toBe("DNSFailure");
      expect(result.causalityChain.secondary).toEqual([]);
      expect(result.causalityChain.explanation).toBe("Matched known error pattern: DNSFailure");
    });

    it("should set severity to 'high' for high-confidence matches", () => {
      const match = createPatternMatch({ confidence: "high" });
      const result = buildDiagnosticFromPattern(match, "");

      expect(result.impact.severity).toBe("high");
    });

    it("should set severity to 'medium' for medium-confidence matches", () => {
      const match = createPatternMatch({ confidence: "medium" });
      const result = buildDiagnosticFromPattern(match, "");

      expect(result.impact.severity).toBe("medium");
    });

    it("should place recommendation as an immediate action", () => {
      const match = createPatternMatch({
        recommendation: "Check your DNS settings",
      });
      const result = buildDiagnosticFromPattern(match, "");

      expect(result.recommendations.immediate).toHaveLength(1);
      expect(result.recommendations.immediate[0].description).toBe("Check your DNS settings");
      expect(result.recommendations.immediate[0].priority).toBe("immediate");
    });

    it("should return empty arrays for preventive, investigative, and relatedContext", () => {
      const result = buildDiagnosticFromPattern(createPatternMatch(), "");

      expect(result.recommendations.preventive).toEqual([]);
      expect(result.recommendations.investigative).toEqual([]);
      expect(result.relatedContext.pastIncidents).toEqual([]);
      expect(result.relatedContext.runbooks).toEqual([]);
      expect(result.relatedContext.documentation).toEqual([]);
    });

    it("should set impact scope to match category", () => {
      const match = createPatternMatch({ category: "external" });
      const result = buildDiagnosticFromPattern(match, "");

      expect(result.impact.scope).toBe("external");
    });

    it("should set empty strings for duration and usersAffected", () => {
      const result = buildDiagnosticFromPattern(createPatternMatch(), "");

      expect(result.impact.duration).toBe("");
      expect(result.impact.usersAffected).toBe("");
    });

    it("should not mutate the input match object", () => {
      const match = Object.freeze(createPatternMatch());

      expect(() =>
        buildDiagnosticFromPattern(match as PatternMatchResult, "preview")
      ).not.toThrow();
    });
  });
});

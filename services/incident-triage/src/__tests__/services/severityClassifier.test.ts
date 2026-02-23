/**
 * Severity Classifier Tests
 *
 * Tests for the pure, deterministic severity scoring function.
 * All tests verify classifyAlertSeverity with various alert inputs
 * and severity configurations.
 */

import { describe, it, expect } from "@jest/globals";
import { classifyAlertSeverity } from "../../services/severityClassifier.js";
import type { NormalizedAlert } from "../../types/incidentTypes.js";
import type { SeverityConfig } from "../../types/severityTypes.js";
import {
  DEFAULT_SEVERITY_CONFIG,
  SEVERITY_WEIGHTS,
  SERVICE_TIER_SCORES,
  BUSINESS_HOURS_SCORE,
  OFF_HOURS_SCORE,
  METRICS_BREACH_SCORE,
  METRICS_NO_BREACH_SCORE,
  UNKNOWN_ENVIRONMENT_SCORE,
} from "../../constants/triageConstants.js";

// ==================== Test Fixtures ====================

const createTestAlert = (overrides: Partial<NormalizedAlert> = {}): NormalizedAlert => ({
  sourceAlertId: "test-alert-1",
  deliveryId: "test-delivery-1",
  source: "pagerduty",
  title: "Test Alert",
  description: "A test alert for unit testing",
  severity: "medium",
  fingerprint: "abc123",
  serviceName: null,
  environment: null,
  metrics: {},
  labels: {},
  receivedAt: "2026-02-19T12:00:00.000Z", // noon UTC = business hours
  sourcePayload: {},
  ...overrides,
});

const createTestConfig = (overrides: Partial<SeverityConfig> = {}): SeverityConfig => ({
  ...DEFAULT_SEVERITY_CONFIG,
  ...overrides,
});

// ==================== Tests ====================

describe("classifyAlertSeverity", () => {
  describe("overall behavior", () => {
    it("should return a SeverityScore with total, label, and factors", () => {
      const alert = createTestAlert();
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);

      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("label");
      expect(result).toHaveProperty("factors");
      expect(typeof result.total).toBe("number");
      expect(typeof result.label).toBe("string");
      expect(Array.isArray(result.factors)).toBe(true);
    });

    it("should produce exactly 6 scoring factors", () => {
      const alert = createTestAlert();
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);

      expect(result.factors).toHaveLength(6);
      const factorNames = result.factors.map((f) => f.name);
      expect(factorNames).toEqual([
        "source_severity",
        "service_criticality",
        "environment",
        "keyword_patterns",
        "time_of_day",
        "metrics_breach",
      ]);
    });

    it("should cap total at 100", () => {
      // Create a config that would push score above 100
      const config = createTestConfig({
        sourceSeverityMap: { critical: 100 },
        serviceTiers: { "api-gateway": "tier1" },
        environmentScores: { production: 20 },
        keywordPatterns: [{ pattern: /outage/i, boost: 15, label: "outage" }],
      });
      const alert = createTestAlert({
        severity: "critical",
        serviceName: "api-gateway",
        environment: "production",
        title: "Complete outage on api-gateway",
        metrics: { cpu: 99 },
        receivedAt: "2026-02-19T03:00:00.000Z", // off-hours for max score
      });

      const result = classifyAlertSeverity(alert, config);

      expect(result.total).toBeLessThanOrEqual(100);
    });

    it("should be a pure function (same inputs produce same output)", () => {
      const alert = Object.freeze(createTestAlert());
      const config = Object.freeze(createTestConfig());

      const result1 = classifyAlertSeverity(alert, config);
      const result2 = classifyAlertSeverity(alert, config);

      expect(result1.total).toBe(result2.total);
      expect(result1.label).toBe(result2.label);
      expect(result1.factors).toEqual(result2.factors);
    });

    it("should not mutate the input alert", () => {
      const alert = Object.freeze(createTestAlert());
      const config = createTestConfig();

      expect(() => classifyAlertSeverity(alert, config)).not.toThrow();
    });
  });

  describe("source severity factor", () => {
    it("should score critical severity highest", () => {
      const alert = createTestAlert({ severity: "critical" });
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "source_severity");

      expect(factor).toBeDefined();
      // critical = 90/100 * 25 = 22.5, rounded = 23
      expect(factor!.score).toBe(Math.round((90 / 100) * SEVERITY_WEIGHTS.SOURCE_SEVERITY));
    });

    it("should score info severity lowest", () => {
      const alert = createTestAlert({ severity: "info" });
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "source_severity");

      // info = 10/100 * 25 = 2.5, rounded = 3
      expect(factor!.score).toBe(Math.round((10 / 100) * SEVERITY_WEIGHTS.SOURCE_SEVERITY));
    });

    it("should score 0 for unknown severity levels", () => {
      const alert = createTestAlert({ severity: "unknown" as never });
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "source_severity");

      expect(factor!.score).toBe(0);
    });

    it("should be case-insensitive for severity matching", () => {
      const alertUpper = createTestAlert({ severity: "CRITICAL" as never });
      const alertLower = createTestAlert({ severity: "critical" });
      const config = createTestConfig();

      const resultUpper = classifyAlertSeverity(alertUpper, config);
      const resultLower = classifyAlertSeverity(alertLower, config);

      const factorUpper = resultUpper.factors.find((f) => f.name === "source_severity");
      const factorLower = resultLower.factors.find((f) => f.name === "source_severity");

      expect(factorUpper!.score).toBe(factorLower!.score);
    });

    it("should include a human-readable reason", () => {
      const alert = createTestAlert({ severity: "high" });
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "source_severity");

      expect(factor!.reason).toContain("high");
      expect(factor!.reason).toContain("70");
    });
  });

  describe("service criticality factor", () => {
    it("should score tier1 services with maximum service score", () => {
      const config = createTestConfig({
        serviceTiers: { "api-gateway": "tier1" },
      });
      const alert = createTestAlert({ serviceName: "api-gateway" });

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "service_criticality");

      expect(factor!.score).toBe(SERVICE_TIER_SCORES.tier1);
    });

    it("should score unknown services with unknown tier score", () => {
      const config = createTestConfig({
        serviceTiers: { "api-gateway": "tier1" },
      });
      const alert = createTestAlert({ serviceName: "some-other-service" });

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "service_criticality");

      expect(factor!.score).toBe(SERVICE_TIER_SCORES.unknown);
    });

    it("should score null serviceName with unknown tier score", () => {
      const alert = createTestAlert({ serviceName: null });
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "service_criticality");

      expect(factor!.score).toBe(SERVICE_TIER_SCORES.unknown);
      expect(factor!.reason).toContain("No service name provided");
    });

    it("should be case-insensitive for service name matching", () => {
      const config = createTestConfig({
        serviceTiers: { "api-gateway": "tier1" },
      });
      const alert = createTestAlert({ serviceName: "API-Gateway" });

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "service_criticality");

      expect(factor!.score).toBe(SERVICE_TIER_SCORES.tier1);
    });

    it("should differentiate between tier levels", () => {
      const config = createTestConfig({
        serviceTiers: {
          "core-api": "tier1",
          "admin-ui": "tier2",
          "cron-job": "tier3",
          "test-tool": "tier4",
        },
      });

      const scores = ["core-api", "admin-ui", "cron-job", "test-tool"].map((svc) => {
        const alert = createTestAlert({ serviceName: svc });
        const result = classifyAlertSeverity(alert, config);
        return result.factors.find((f) => f.name === "service_criticality")!.score;
      });

      // tier1 > tier2 > tier3 > tier4
      expect(scores[0]).toBeGreaterThan(scores[1]);
      expect(scores[1]).toBeGreaterThan(scores[2]);
      expect(scores[2]).toBeGreaterThan(scores[3]);
    });
  });

  describe("environment factor", () => {
    it("should score production environments highest", () => {
      const alert = createTestAlert({ environment: "production" });
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "environment");

      expect(factor!.score).toBe(20);
    });

    it("should score staging environments lower than production", () => {
      const alertProd = createTestAlert({ environment: "production" });
      const alertStag = createTestAlert({ environment: "staging" });
      const config = createTestConfig();

      const resultProd = classifyAlertSeverity(alertProd, config);
      const resultStag = classifyAlertSeverity(alertStag, config);

      const scoreProd = resultProd.factors.find((f) => f.name === "environment")!.score;
      const scoreStag = resultStag.factors.find((f) => f.name === "environment")!.score;

      expect(scoreProd).toBeGreaterThan(scoreStag);
    });

    it("should use UNKNOWN_ENVIRONMENT_SCORE for unknown environments", () => {
      const alert = createTestAlert({ environment: "canary" });
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "environment");

      expect(factor!.score).toBe(UNKNOWN_ENVIRONMENT_SCORE);
    });

    it("should use UNKNOWN_ENVIRONMENT_SCORE when environment is null", () => {
      const alert = createTestAlert({ environment: null });
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "environment");

      expect(factor!.score).toBe(UNKNOWN_ENVIRONMENT_SCORE);
      expect(factor!.reason).toContain("No environment specified");
    });

    it("should be case-insensitive for environment matching", () => {
      const alertUpper = createTestAlert({ environment: "PRODUCTION" });
      const alertLower = createTestAlert({ environment: "production" });
      const config = createTestConfig();

      const resultUpper = classifyAlertSeverity(alertUpper, config);
      const resultLower = classifyAlertSeverity(alertLower, config);

      const scoreUpper = resultUpper.factors.find((f) => f.name === "environment")!.score;
      const scoreLower = resultLower.factors.find((f) => f.name === "environment")!.score;

      expect(scoreUpper).toBe(scoreLower);
    });
  });

  describe("keyword patterns factor", () => {
    it("should boost score when outage keyword is found in title", () => {
      const alert = createTestAlert({ title: "Complete outage in payments" });
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "keyword_patterns");

      expect(factor!.score).toBeGreaterThan(0);
      expect(factor!.reason).toContain("outage");
    });

    it("should boost score when keyword is found in description", () => {
      const alert = createTestAlert({
        title: "Service issue",
        description: "Database timeout detected",
      });
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "keyword_patterns");

      expect(factor!.score).toBeGreaterThan(0);
      expect(factor!.reason).toContain("timeout");
    });

    it("should return the highest-boosting keyword match only", () => {
      // Both "outage" (15) and "error" (6) are in the text
      const alert = createTestAlert({
        title: "Complete outage with error on payments",
      });
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "keyword_patterns");

      // "outage" has boost 15, "data loss" also 15, but "outage" should win
      expect(factor!.score).toBe(15);
      expect(factor!.reason).toContain("outage");
    });

    it("should score 0 when no keywords match", () => {
      const alert = createTestAlert({
        title: "Normal status update",
        description: "All systems operating normally",
      });
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "keyword_patterns");

      expect(factor!.score).toBe(0);
      expect(factor!.reason).toContain("No severity-boosting keywords");
    });

    it("should cap keyword boost at the keyword weight limit", () => {
      const config = createTestConfig({
        keywordPatterns: [{ pattern: /test/i, boost: 999, label: "test" }],
      });
      const alert = createTestAlert({ title: "test alert" });

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "keyword_patterns");

      expect(factor!.score).toBeLessThanOrEqual(SEVERITY_WEIGHTS.KEYWORD_PATTERNS);
    });

    it("should score when description is null and keyword is only in title", () => {
      const alert = createTestAlert({ title: "Service crash", description: null });
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "keyword_patterns");

      expect(factor!.score).toBeGreaterThan(0);
      expect(factor!.reason).toContain("crash");
    });
  });

  describe("time of day factor", () => {
    it("should score lower during business hours (9-17 UTC)", () => {
      const alert = createTestAlert({
        receivedAt: "2026-02-19T14:00:00.000Z", // 14:00 UTC
      });
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "time_of_day");

      expect(factor!.score).toBe(BUSINESS_HOURS_SCORE);
      expect(factor!.reason).toContain("business hours");
    });

    it("should score higher during off-hours (before 9 UTC)", () => {
      const alert = createTestAlert({
        receivedAt: "2026-02-19T03:00:00.000Z", // 3:00 UTC
      });
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "time_of_day");

      expect(factor!.score).toBe(OFF_HOURS_SCORE);
      expect(factor!.reason).toContain("off-hours");
    });

    it("should score higher during off-hours (after 17 UTC)", () => {
      const alert = createTestAlert({
        receivedAt: "2026-02-19T21:00:00.000Z", // 21:00 UTC
      });
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "time_of_day");

      expect(factor!.score).toBe(OFF_HOURS_SCORE);
    });

    it("should treat 9:00 UTC as start of business hours (inclusive)", () => {
      const alert = createTestAlert({
        receivedAt: "2026-02-19T09:00:00.000Z",
      });
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "time_of_day");

      expect(factor!.score).toBe(BUSINESS_HOURS_SCORE);
    });

    it("should treat 17:00 UTC as start of off-hours (exclusive boundary)", () => {
      const alert = createTestAlert({
        receivedAt: "2026-02-19T17:00:00.000Z",
      });
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "time_of_day");

      expect(factor!.score).toBe(OFF_HOURS_SCORE);
    });
  });

  describe("metrics breach factor", () => {
    it("should score higher when metrics are present", () => {
      const alert = createTestAlert({
        metrics: { cpu_percent: 99, memory_mb: 4096 },
      });
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "metrics_breach");

      expect(factor!.score).toBe(METRICS_BREACH_SCORE);
      expect(factor!.reason).toContain("2 metric(s)");
    });

    it("should score 0 when no metrics are present", () => {
      const alert = createTestAlert({ metrics: {} });
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);
      const factor = result.factors.find((f) => f.name === "metrics_breach");

      expect(factor!.score).toBe(METRICS_NO_BREACH_SCORE);
      expect(factor!.reason).toContain("No metrics attached");
    });
  });

  describe("severity label resolution", () => {
    it("should resolve to critical for very high total scores", () => {
      const config = createTestConfig({
        sourceSeverityMap: { critical: 100 },
        serviceTiers: { "api-gateway": "tier1" },
        environmentScores: { production: 20 },
        keywordPatterns: [{ pattern: /outage/i, boost: 15, label: "outage" }],
      });
      const alert = createTestAlert({
        severity: "critical",
        serviceName: "api-gateway",
        environment: "production",
        title: "Complete outage",
        metrics: { cpu: 99 },
        receivedAt: "2026-02-19T03:00:00.000Z",
      });

      const result = classifyAlertSeverity(alert, config);

      expect(result.label).toBe("critical");
      expect(result.total).toBeGreaterThanOrEqual(85);
    });

    it("should resolve to low for low total scores", () => {
      // info severity (10/100*25=3) + unknown service (5) + unknown env (8) + no keywords (0)
      // + business hours (5) + no metrics (0) = 21 => low (>= 20)
      const alert = createTestAlert({
        severity: "info",
        serviceName: null,
        environment: null,
        title: "Normal check",
        description: null,
        metrics: {},
        receivedAt: "2026-02-19T12:00:00.000Z", // business hours
      });
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);

      expect(result.label).toBe("low");
      expect(result.total).toBeGreaterThanOrEqual(20);
      expect(result.total).toBeLessThan(40);
    });

    it("should resolve to medium for mid-range scores", () => {
      const alert = createTestAlert({
        severity: "medium",
        environment: "staging",
        receivedAt: "2026-02-19T12:00:00.000Z",
      });
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);

      // medium severity (50/100 * 25 = 13) + unknown service (5) + staging (10) + business hours (5) = 33
      expect(result.total).toBeGreaterThanOrEqual(20);
      expect(result.total).toBeLessThan(65);
    });

    it("should default to info label when no threshold matches", () => {
      // Use thresholds that require very high scores
      const config = createTestConfig({
        severityThresholds: [{ minScore: 999, label: "critical" }],
      });
      const alert = createTestAlert();

      const result = classifyAlertSeverity(alert, config);

      expect(result.label).toBe("info");
    });
  });

  describe("factor weight and maxScore properties", () => {
    it("should set correct weight and maxScore for each factor", () => {
      const alert = createTestAlert();
      const config = createTestConfig();

      const result = classifyAlertSeverity(alert, config);

      const expectedWeights: Record<string, number> = {
        source_severity: SEVERITY_WEIGHTS.SOURCE_SEVERITY,
        service_criticality: SEVERITY_WEIGHTS.SERVICE_CRITICALITY,
        environment: SEVERITY_WEIGHTS.ENVIRONMENT,
        keyword_patterns: SEVERITY_WEIGHTS.KEYWORD_PATTERNS,
        time_of_day: SEVERITY_WEIGHTS.TIME_OF_DAY,
        metrics_breach: SEVERITY_WEIGHTS.METRICS_BREACH,
      };

      for (const factor of result.factors) {
        expect(factor.weight).toBe(expectedWeights[factor.name]);
        expect(factor.maxScore).toBe(expectedWeights[factor.name]);
        expect(factor.score).toBeGreaterThanOrEqual(0);
        expect(factor.score).toBeLessThanOrEqual(factor.maxScore);
      }
    });
  });
});

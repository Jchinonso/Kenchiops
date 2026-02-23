/**
 * Policy Engine Tests
 *
 * Tests for the pure, deterministic policy evaluation function.
 * Covers condition matching, priority ordering, target deduplication,
 * and suppression behavior.
 */

import { describe, it, expect } from "@jest/globals";
import { evaluatePolicy } from "../../services/policyEngine.js";
import type { PolicyRule, TriagePolicyContext, DispatchTarget } from "../../types/policyTypes.js";

// ==================== Test Fixtures ====================

const createTestContext = (overrides: Partial<TriagePolicyContext> = {}): TriagePolicyContext => ({
  alertId: "alert-1",
  tenantId: "tenant-1",
  severityLabel: "medium",
  severityScore: 50,
  environment: "production",
  serviceName: "api-gateway",
  confidence: 0.8,
  completeness: 0.7,
  headline: "Test alert headline",
  summarySource: "ai",
  ...overrides,
});

const createSlackTarget = (channel: string): DispatchTarget => ({
  type: "slack",
  channel,
  metadata: { urgency: "low" },
});

const createPagerDutyTarget = (channel: string): DispatchTarget => ({
  type: "pagerduty",
  channel,
  metadata: { urgency: "high" },
});

const createTestRule = (overrides: Partial<PolicyRule> = {}): PolicyRule => ({
  id: "test-rule",
  name: "Test Rule",
  description: "A test rule",
  priority: 10,
  condition: {},
  targets: [createSlackTarget("#test-channel")],
  enabled: true,
  ...overrides,
});

// ==================== Tests ====================

describe("evaluatePolicy", () => {
  describe("basic evaluation", () => {
    it("should return a RoutingDecision with all required fields", () => {
      const context = createTestContext();
      const rules = [createTestRule()];

      const result = evaluatePolicy(context, rules);

      expect(result).toHaveProperty("targets");
      expect(result).toHaveProperty("matchedRules");
      expect(result).toHaveProperty("suppressed");
      expect(result).toHaveProperty("suppressionReasons");
      expect(result).toHaveProperty("evaluatedAt");
      expect(typeof result.evaluatedAt).toBe("string");
    });

    it("should be a pure function (same inputs produce consistent structure)", () => {
      const context = Object.freeze(createTestContext());
      const rules = Object.freeze([Object.freeze(createTestRule())]);

      const result1 = evaluatePolicy(context, rules);
      const result2 = evaluatePolicy(context, rules);

      expect(result1.targets).toEqual(result2.targets);
      expect(result1.matchedRules).toEqual(result2.matchedRules);
      expect(result1.suppressed).toBe(result2.suppressed);
    });

    it("should not mutate input rules array", () => {
      const context = createTestContext();
      const rules = Object.freeze([Object.freeze(createTestRule())]);

      expect(() => evaluatePolicy(context, rules)).not.toThrow();
    });
  });

  describe("severity condition matching", () => {
    it("should match when context severity is in the condition severity list", () => {
      const context = createTestContext({ severityLabel: "critical" });
      const rules = [
        createTestRule({
          condition: { severity: ["critical", "high"] },
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules).toHaveLength(1);
      expect(result.suppressed).toBe(false);
    });

    it("should not match when context severity is not in the condition severity list", () => {
      const context = createTestContext({ severityLabel: "low" });
      const rules = [
        createTestRule({
          condition: { severity: ["critical", "high"] },
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules).toHaveLength(0);
      expect(result.suppressed).toBe(true);
    });

    it("should match any severity when condition severity list is empty", () => {
      const context = createTestContext({ severityLabel: "info" });
      const rules = [
        createTestRule({
          condition: { severity: [] },
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules).toHaveLength(1);
    });

    it("should match any severity when condition severity is undefined", () => {
      const context = createTestContext({ severityLabel: "info" });
      const rules = [
        createTestRule({
          condition: {},
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules).toHaveLength(1);
    });
  });

  describe("environment condition matching", () => {
    it("should match when context environment is in the condition environment list", () => {
      const context = createTestContext({ environment: "production" });
      const rules = [
        createTestRule({
          condition: { environment: ["production", "prod"] },
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules).toHaveLength(1);
    });

    it("should not match when context environment is not in the list", () => {
      const context = createTestContext({ environment: "staging" });
      const rules = [
        createTestRule({
          condition: { environment: ["production", "prod"] },
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules).toHaveLength(0);
    });

    it("should be case-insensitive for environment matching", () => {
      const context = createTestContext({ environment: "PRODUCTION" });
      const rules = [
        createTestRule({
          condition: { environment: ["production"] },
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules).toHaveLength(1);
    });

    it("should not match when context environment is null and condition specifies environments", () => {
      const context = createTestContext({ environment: null });
      const rules = [
        createTestRule({
          condition: { environment: ["production"] },
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules).toHaveLength(0);
    });

    it("should match null environment when condition environment is empty (wildcard)", () => {
      const context = createTestContext({ environment: null });
      const rules = [
        createTestRule({
          condition: {},
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules).toHaveLength(1);
    });
  });

  describe("environment exclusion", () => {
    it("should not match when environment is in the exclusion list", () => {
      const context = createTestContext({ environment: "production" });
      const rules = [
        createTestRule({
          condition: { environmentExclude: ["production", "prod"] },
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules).toHaveLength(0);
    });

    it("should match when environment is not in the exclusion list", () => {
      const context = createTestContext({ environment: "staging" });
      const rules = [
        createTestRule({
          condition: { environmentExclude: ["production", "prod"] },
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules).toHaveLength(1);
    });

    it("should be case-insensitive for exclusion matching", () => {
      const context = createTestContext({ environment: "PRODUCTION" });
      const rules = [
        createTestRule({
          condition: { environmentExclude: ["production"] },
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules).toHaveLength(0);
    });

    it("should not exclude null environment (unknown environments pass exclusion)", () => {
      const context = createTestContext({ environment: null });
      const rules = [
        createTestRule({
          condition: { environmentExclude: ["production"] },
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules).toHaveLength(1);
    });
  });

  describe("service matching", () => {
    it("should match when service name contains the pattern", () => {
      const context = createTestContext({ serviceName: "payments-api" });
      const rules = [
        createTestRule({
          condition: { serviceMatch: ["payments"] },
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules).toHaveLength(1);
    });

    it("should not match when service name does not contain any pattern", () => {
      const context = createTestContext({ serviceName: "auth-service" });
      const rules = [
        createTestRule({
          condition: { serviceMatch: ["payments"] },
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules).toHaveLength(0);
    });

    it("should be case-insensitive for service matching", () => {
      const context = createTestContext({ serviceName: "PAYMENTS-API" });
      const rules = [
        createTestRule({
          condition: { serviceMatch: ["payments"] },
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules).toHaveLength(1);
    });

    it("should not match null serviceName against service patterns", () => {
      const context = createTestContext({ serviceName: null });
      const rules = [
        createTestRule({
          condition: { serviceMatch: ["payments"] },
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules).toHaveLength(0);
    });

    it("should match any service when serviceMatch is empty or undefined", () => {
      const context = createTestContext({ serviceName: "anything" });
      const rules = [
        createTestRule({
          condition: { serviceMatch: undefined },
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules).toHaveLength(1);
    });
  });

  describe("priority ordering", () => {
    it("should evaluate rules in priority order (lowest priority number first)", () => {
      const context = createTestContext({ severityLabel: "critical", environment: "production" });
      const rules = [
        createTestRule({
          id: "low-priority",
          name: "Low Priority",
          priority: 100,
          targets: [createSlackTarget("#general")],
        }),
        createTestRule({
          id: "high-priority",
          name: "High Priority",
          priority: 1,
          targets: [createSlackTarget("#critical")],
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules[0].ruleId).toBe("high-priority");
      expect(result.matchedRules[1].ruleId).toBe("low-priority");
    });
  });

  describe("target accumulation and deduplication", () => {
    it("should accumulate targets from all matching rules", () => {
      const context = createTestContext({ severityLabel: "critical", environment: "production" });
      const rules = [
        createTestRule({
          id: "rule-1",
          priority: 1,
          targets: [createSlackTarget("#critical")],
        }),
        createTestRule({
          id: "rule-2",
          priority: 2,
          targets: [createPagerDutyTarget("escalation")],
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.targets).toHaveLength(2);
      expect(result.targets[0].type).toBe("slack");
      expect(result.targets[1].type).toBe("pagerduty");
    });

    it("should deduplicate targets with same type and channel", () => {
      const context = createTestContext();
      const rules = [
        createTestRule({
          id: "rule-1",
          priority: 1,
          targets: [createSlackTarget("#alerts")],
        }),
        createTestRule({
          id: "rule-2",
          priority: 2,
          targets: [createSlackTarget("#alerts")],
        }),
      ];

      const result = evaluatePolicy(context, rules);

      // Both rules match, but same slack:#alerts target should be deduped
      expect(result.matchedRules).toHaveLength(2);
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0].channel).toBe("#alerts");
    });

    it("should keep targets with same type but different channels", () => {
      const context = createTestContext();
      const rules = [
        createTestRule({
          id: "rule-1",
          priority: 1,
          targets: [createSlackTarget("#critical")],
        }),
        createTestRule({
          id: "rule-2",
          priority: 2,
          targets: [createSlackTarget("#general")],
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.targets).toHaveLength(2);
    });
  });

  describe("disabled rules", () => {
    it("should skip disabled rules", () => {
      const context = createTestContext();
      const rules = [
        createTestRule({
          id: "disabled-rule",
          enabled: false,
          targets: [createSlackTarget("#disabled")],
        }),
        createTestRule({
          id: "enabled-rule",
          enabled: true,
          targets: [createSlackTarget("#enabled")],
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules).toHaveLength(1);
      expect(result.matchedRules[0].ruleId).toBe("enabled-rule");
    });

    it("should suppress when all matching rules are disabled", () => {
      const context = createTestContext();
      const rules = [
        createTestRule({
          id: "disabled-rule",
          enabled: false,
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.suppressed).toBe(true);
      expect(result.targets).toHaveLength(0);
    });
  });

  describe("suppression", () => {
    it("should set suppressed=true when no rules match", () => {
      const context = createTestContext({ severityLabel: "info" });
      const rules = [
        createTestRule({
          condition: { severity: ["critical"] },
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.suppressed).toBe(true);
      expect(result.targets).toHaveLength(0);
    });

    it("should include suppression reason when no rules match", () => {
      const context = createTestContext({ severityLabel: "info" });
      const rules = [
        createTestRule({
          condition: { severity: ["critical"] },
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.suppressionReasons).toHaveLength(1);
      expect(result.suppressionReasons[0].ruleId).toBe("NONE");
      expect(result.suppressionReasons[0].reason).toContain("No policy rules matched");
    });

    it("should set suppressed=false when at least one rule matches", () => {
      const context = createTestContext();
      const rules = [createTestRule()];

      const result = evaluatePolicy(context, rules);

      expect(result.suppressed).toBe(false);
      expect(result.suppressionReasons).toHaveLength(0);
    });

    it("should suppress when rules array is empty", () => {
      const context = createTestContext();
      const result = evaluatePolicy(context, []);

      expect(result.suppressed).toBe(true);
      expect(result.targets).toHaveLength(0);
    });
  });

  describe("match reasons", () => {
    it("should include severity in match reason when severity condition is set", () => {
      const context = createTestContext({ severityLabel: "critical" });
      const rules = [
        createTestRule({
          condition: { severity: ["critical"] },
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules[0].reason).toContain("severity=critical");
    });

    it("should include environment in match reason when environment condition is set", () => {
      const context = createTestContext({ environment: "production" });
      const rules = [
        createTestRule({
          condition: { environment: ["production"] },
        }),
      ];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules[0].reason).toContain("environment=production");
    });

    it("should show default/wildcard for rules with no specific conditions", () => {
      const context = createTestContext();
      const rules = [createTestRule({ condition: {} })];

      const result = evaluatePolicy(context, rules);

      expect(result.matchedRules[0].reason).toContain("default/wildcard");
    });
  });

  describe("combined conditions (AND logic)", () => {
    it("should require all conditions to match (severity AND environment)", () => {
      const context = createTestContext({
        severityLabel: "critical",
        environment: "production",
      });

      const rule = createTestRule({
        condition: {
          severity: ["critical"],
          environment: ["production", "prod"],
        },
      });

      const result = evaluatePolicy(context, [rule]);

      expect(result.matchedRules).toHaveLength(1);
    });

    it("should not match if severity matches but environment does not", () => {
      const context = createTestContext({
        severityLabel: "critical",
        environment: "staging",
      });

      const rule = createTestRule({
        condition: {
          severity: ["critical"],
          environment: ["production"],
        },
      });

      const result = evaluatePolicy(context, [rule]);

      expect(result.matchedRules).toHaveLength(0);
    });

    it("should not match if environment matches but severity does not", () => {
      const context = createTestContext({
        severityLabel: "low",
        environment: "production",
      });

      const rule = createTestRule({
        condition: {
          severity: ["critical"],
          environment: ["production"],
        },
      });

      const result = evaluatePolicy(context, [rule]);

      expect(result.matchedRules).toHaveLength(0);
    });
  });
});

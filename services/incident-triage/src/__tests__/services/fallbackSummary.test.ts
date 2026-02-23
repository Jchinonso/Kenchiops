/**
 * Fallback Summary Tests
 *
 * Tests for the template-based fallback summary generator.
 * All tests verify generateFallbackSummary produces valid IncidentSummaryResponse
 * objects without any LLM involvement.
 */

import { describe, it, expect } from "@jest/globals";
import { generateFallbackSummary } from "../../services/fallbackSummary.js";
import type { NormalizedAlert } from "../../types/incidentTypes.js";
import type { SeverityScore } from "../../types/severityTypes.js";
import type { RunbookMatch } from "../../types/runbookTypes.js";
import type { EvidenceCatalog } from "../../types/evidenceTypes.js";
import type { FallbackSummaryInput } from "../../types/summaryTypes.js";

// ==================== Test Fixtures ====================

const createTestAlert = (overrides: Partial<NormalizedAlert> = {}): NormalizedAlert => ({
  sourceAlertId: "alert-1",
  deliveryId: "delivery-1",
  source: "pagerduty",
  title: "High CPU on payments-api",
  description: "CPU utilization is above 95%",
  severity: "high",
  fingerprint: "fp-abc123",
  serviceName: "payments-api",
  environment: "production",
  metrics: { cpu_percent: 95.4 },
  labels: {},
  receivedAt: "2026-02-19T14:00:00.000Z",
  sourcePayload: {},
  ...overrides,
});

const createTestSeverity = (overrides: Partial<SeverityScore> = {}): SeverityScore => ({
  total: 72,
  label: "high",
  factors: [
    { name: "source_severity", weight: 25, score: 18, maxScore: 25, reason: "high maps to 70/100" },
    { name: "environment", weight: 20, score: 20, maxScore: 20, reason: "production gets 20/20" },
    { name: "keyword_patterns", weight: 15, score: 0, maxScore: 15, reason: "no keywords matched" },
  ],
  ...overrides,
});

const createTestRunbook = (overrides: Partial<RunbookMatch> = {}): RunbookMatch => ({
  docId: "rb-1",
  title: "CPU High Runbook",
  similarity: 0.87,
  content: "Steps to resolve high CPU...",
  sourceUrl: "https://docs.example.com/cpu-high",
  ...overrides,
});

const createTestEvidenceCatalog = (
  itemOverrides: Record<string, { value: unknown }> = {}
): EvidenceCatalog => {
  const baseItems: Record<
    string,
    { id: string; prefix: string; label: string; value: unknown; source: string }
  > = {
    "ALT-title": {
      id: "ALT-title",
      prefix: "ALT",
      label: "Alert Title",
      value: "High CPU",
      source: "alert",
    },
    "ALT-source": {
      id: "ALT-source",
      prefix: "ALT",
      label: "Alert Source",
      value: "pagerduty",
      source: "alert",
    },
    "ALT-severity": {
      id: "ALT-severity",
      prefix: "ALT",
      label: "Source Severity",
      value: "high",
      source: "alert",
    },
    "SEV-label": {
      id: "SEV-label",
      prefix: "SEV",
      label: "Severity Label",
      value: "high",
      source: "classifier",
    },
    "SEV-total": {
      id: "SEV-total",
      prefix: "SEV",
      label: "Severity Total",
      value: 72,
      source: "classifier",
    },
    "ALT-serviceName": {
      id: "ALT-serviceName",
      prefix: "ALT",
      label: "Service Name",
      value: "payments-api",
      source: "alert",
    },
    "ALT-environment": {
      id: "ALT-environment",
      prefix: "ALT",
      label: "Environment",
      value: "production",
      source: "alert",
    },
    "ALT-description": {
      id: "ALT-description",
      prefix: "ALT",
      label: "Description",
      value: "CPU at 95%",
      source: "alert",
    },
    "ALT-metrics": {
      id: "ALT-metrics",
      prefix: "ALT",
      label: "Metrics",
      value: { cpu: 95 },
      source: "alert",
    },
  };

  // Apply overrides
  const items = { ...baseItems };
  for (const [key, override] of Object.entries(itemOverrides)) {
    if (items[key]) {
      items[key] = { ...items[key], ...override };
    }
  }

  return {
    items: items as unknown as EvidenceCatalog["items"],
    confidence: { total: 0.8, signals: [] },
    completeness: {
      total: 0.7,
      requiredPresent: 4,
      requiredTotal: 4,
      expectedPresent: 3,
      expectedTotal: 3,
      optionalPresent: 1,
      optionalTotal: 4,
      missingFields: [],
    },
    collectedAt: "2026-02-19T14:00:00.000Z",
  };
};

const createTestInput = (overrides: Partial<FallbackSummaryInput> = {}): FallbackSummaryInput => ({
  alert: createTestAlert(),
  severity: createTestSeverity(),
  runbooks: [createTestRunbook()],
  evidenceCatalog: createTestEvidenceCatalog(),
  ...overrides,
});

// ==================== Tests ====================

describe("generateFallbackSummary", () => {
  describe("required output fields", () => {
    it("should return all required IncidentSummaryResponse fields", () => {
      const input = createTestInput();

      const result = generateFallbackSummary(input);

      expect(result).toHaveProperty("headline");
      expect(result).toHaveProperty("rootCauseSummary");
      expect(result).toHaveProperty("impactAssessment");
      expect(result).toHaveProperty("suggestedActions");
      expect(result).toHaveProperty("evidencesCited");
      expect(result).toHaveProperty("summarySource");
    });

    it("should always set summarySource to fallback", () => {
      const input = createTestInput();

      const result = generateFallbackSummary(input);

      expect(result.summarySource).toBe("fallback");
    });

    it("should produce non-empty headline", () => {
      const input = createTestInput();

      const result = generateFallbackSummary(input);

      expect(result.headline.length).toBeGreaterThan(0);
    });

    it("should produce non-empty rootCauseSummary", () => {
      const input = createTestInput();

      const result = generateFallbackSummary(input);

      expect(result.rootCauseSummary.length).toBeGreaterThan(0);
    });

    it("should produce non-empty impactAssessment", () => {
      const input = createTestInput();

      const result = generateFallbackSummary(input);

      expect(result.impactAssessment.length).toBeGreaterThan(0);
    });
  });

  describe("headline content", () => {
    it("should include severity label in headline", () => {
      const input = createTestInput();

      const result = generateFallbackSummary(input);

      expect(result.headline.toLowerCase()).toContain("high");
    });

    it("should include service name in headline when present", () => {
      const input = createTestInput();

      const result = generateFallbackSummary(input);

      expect(result.headline).toContain("payments-api");
    });

    it("should use unknown service when serviceName is null", () => {
      const input = createTestInput({
        alert: createTestAlert({ serviceName: null }),
      });

      const result = generateFallbackSummary(input);

      expect(result.headline).toContain("unknown service");
    });

    it("should include environment in headline when present", () => {
      const input = createTestInput();

      const result = generateFallbackSummary(input);

      expect(result.headline).toContain("production");
    });

    it("should use unknown environment when environment is null", () => {
      const input = createTestInput({
        alert: createTestAlert({ environment: null }),
      });

      const result = generateFallbackSummary(input);

      expect(result.headline).toContain("unknown environment");
    });

    it("should truncate headline to 200 characters or fewer", () => {
      const input = createTestInput({
        alert: createTestAlert({
          title: "A".repeat(300),
        }),
      });

      const result = generateFallbackSummary(input);

      expect(result.headline.length).toBeLessThanOrEqual(200);
    });
  });

  describe("root cause summary content", () => {
    it("should include alert description when present", () => {
      const input = createTestInput();

      const result = generateFallbackSummary(input);

      expect(result.rootCauseSummary).toContain("CPU utilization is above 95%");
    });

    it("should fall back to title when description is null", () => {
      const input = createTestInput({
        alert: createTestAlert({ description: null }),
      });

      const result = generateFallbackSummary(input);

      expect(result.rootCauseSummary).toContain("High CPU on payments-api");
    });

    it("should include contributing severity factors with score > 0", () => {
      const input = createTestInput();

      const result = generateFallbackSummary(input);

      // Only factors with score > 0 should appear
      expect(result.rootCauseSummary).toContain("source_severity");
      expect(result.rootCauseSummary).toContain("environment");
    });
  });

  describe("impact assessment content", () => {
    it("should include severity label and score", () => {
      const input = createTestInput();

      const result = generateFallbackSummary(input);

      expect(result.impactAssessment).toContain("High");
      expect(result.impactAssessment).toContain("72");
    });

    it("should include service name", () => {
      const input = createTestInput();

      const result = generateFallbackSummary(input);

      expect(result.impactAssessment).toContain("payments-api");
    });

    it("should include environment", () => {
      const input = createTestInput();

      const result = generateFallbackSummary(input);

      expect(result.impactAssessment).toContain("production");
    });
  });

  describe("suggested actions", () => {
    it("should always include an investigate action", () => {
      const input = createTestInput();

      const result = generateFallbackSummary(input);

      expect(result.suggestedActions.length).toBeGreaterThanOrEqual(1);
      const investigateAction = result.suggestedActions.find((a) =>
        a.action.toLowerCase().includes("investigate")
      );
      expect(investigateAction).toBeDefined();
    });

    it("should include runbook action when runbooks matched", () => {
      const input = createTestInput({
        runbooks: [createTestRunbook()],
      });

      const result = generateFallbackSummary(input);

      const runbookAction = result.suggestedActions.find((a) =>
        a.action.toLowerCase().includes("runbook")
      );
      expect(runbookAction).toBeDefined();
      expect(runbookAction!.action).toContain("CPU High Runbook");
    });

    it("should not include runbook action when no runbooks matched", () => {
      const input = createTestInput({ runbooks: [] });

      const result = generateFallbackSummary(input);

      const runbookAction = result.suggestedActions.find((a) =>
        a.action.toLowerCase().includes("runbook")
      );
      expect(runbookAction).toBeUndefined();
    });

    it("should include escalation action for critical severity", () => {
      const input = createTestInput({
        severity: createTestSeverity({ label: "critical", total: 90 }),
      });

      const result = generateFallbackSummary(input);

      const escalateAction = result.suggestedActions.find((a) =>
        a.action.toLowerCase().includes("escalate")
      );
      expect(escalateAction).toBeDefined();
      expect(escalateAction!.priority).toBe("immediate");
    });

    it("should not include escalation action for non-critical severity", () => {
      const input = createTestInput({
        severity: createTestSeverity({ label: "medium", total: 50 }),
      });

      const result = generateFallbackSummary(input);

      const escalateAction = result.suggestedActions.find((a) =>
        a.action.toLowerCase().includes("escalate")
      );
      expect(escalateAction).toBeUndefined();
    });

    it("should set priority to immediate for high/critical severity investigate action", () => {
      const input = createTestInput({
        severity: createTestSeverity({ label: "critical" }),
      });

      const result = generateFallbackSummary(input);

      const investigateAction = result.suggestedActions.find((a) =>
        a.action.toLowerCase().includes("investigate")
      );
      expect(investigateAction!.priority).toBe("immediate");
    });

    it("should set priority to short_term for non-high severity investigate action", () => {
      const input = createTestInput({
        severity: createTestSeverity({ label: "medium", total: 50 }),
      });

      const result = generateFallbackSummary(input);

      const investigateAction = result.suggestedActions.find((a) =>
        a.action.toLowerCase().includes("investigate")
      );
      expect(investigateAction!.priority).toBe("short_term");
    });
  });

  describe("evidence citations", () => {
    it("should cite evidence IDs that exist in the catalog", () => {
      // Use no runbooks so RB-* IDs are not generated — runbook citations
      // are tested separately in the next test case.
      const input = createTestInput({ runbooks: [] });

      const result = generateFallbackSummary(input);
      const catalogKeys = Object.keys(input.evidenceCatalog.items);

      for (const citedId of result.evidencesCited) {
        expect(catalogKeys).toContain(citedId);
      }
    });

    it("should include runbook citations when runbooks are present", () => {
      const catalog = createTestEvidenceCatalog();
      // Add runbook evidence
      (catalog.items as Record<string, unknown>)["RB-0"] = {
        id: "RB-0",
        prefix: "RB",
        label: "Runbook",
        value: "test",
        source: "runbook-matcher",
      };
      const input = createTestInput({
        runbooks: [createTestRunbook()],
        evidenceCatalog: catalog,
      });

      const result = generateFallbackSummary(input);

      expect(result.evidencesCited).toContain("RB-0");
    });

    it("should not cite evidence IDs that do not exist in the catalog", () => {
      // Use a minimal catalog
      const catalog: EvidenceCatalog = {
        items: {},
        confidence: { total: 0, signals: [] },
        completeness: {
          total: 0,
          requiredPresent: 0,
          requiredTotal: 4,
          expectedPresent: 0,
          expectedTotal: 3,
          optionalPresent: 0,
          optionalTotal: 4,
          missingFields: [],
        },
        collectedAt: "2026-02-19T14:00:00.000Z",
      };
      const input = createTestInput({
        evidenceCatalog: catalog,
        runbooks: [],
      });

      const result = generateFallbackSummary(input);

      // All citations should be empty since no items exist
      expect(result.evidencesCited).toHaveLength(0);
    });
  });

  describe("pure function behavior", () => {
    it("should not mutate inputs", () => {
      const input = Object.freeze(createTestInput());

      expect(() => generateFallbackSummary(input)).not.toThrow();
    });

    it("should produce deterministic output", () => {
      const input = createTestInput();

      const result1 = generateFallbackSummary(input);
      const result2 = generateFallbackSummary(input);

      expect(result1.headline).toBe(result2.headline);
      expect(result1.rootCauseSummary).toBe(result2.rootCauseSummary);
      expect(result1.impactAssessment).toBe(result2.impactAssessment);
      expect(result1.suggestedActions).toEqual(result2.suggestedActions);
    });
  });
});

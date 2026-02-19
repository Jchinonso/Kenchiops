/**
 * Output Validator Tests
 *
 * Tests for the AI summary validation function that checks schema compliance,
 * citation integrity, severity consistency, and length limits.
 */

import { describe, it, expect } from "@jest/globals";
import { validateSummaryOutput } from "../../services/outputValidator.js";
import type { IncidentSummaryResponse, SuggestedAction } from "../../types/summaryTypes.js";
import type { EvidenceCatalog, EvidenceItem } from "../../types/evidenceTypes.js";
import { SUMMARY_LENGTH_LIMITS, SUGGESTED_ACTIONS_LIMITS } from "../../types/summaryTypes.js";

// ==================== Test Fixtures ====================

const createValidAction = (overrides: Partial<SuggestedAction> = {}): SuggestedAction => ({
  action: "Investigate the CPU spike on payments-api",
  reasoning: "Alert shows 95% CPU usage (ALT-metrics)",
  priority: "immediate",
  ...overrides,
});

const createValidSummary = (
  overrides: Partial<IncidentSummaryResponse> = {}
): IncidentSummaryResponse => ({
  headline: "High CPU on payments-api in production",
  rootCauseSummary: "The payments-api service is experiencing CPU saturation at 95%",
  impactAssessment: "High severity affecting production payments processing",
  suggestedActions: [createValidAction()],
  evidencesCited: ["ALT-title", "ALT-metrics", "SEV-label"],
  summarySource: "ai",
  ...overrides,
});

const createEvidenceItem = (id: string, value: unknown = "test"): EvidenceItem => ({
  id,
  prefix: id.split("-")[0] as "ALT" | "SEV" | "RB" | "INC",
  label: `Evidence ${id}`,
  value,
  source: "test",
});

const createTestCatalog = (itemIds: readonly string[] = []): EvidenceCatalog => {
  const defaultIds = [
    "ALT-title",
    "ALT-source",
    "ALT-severity",
    "ALT-metrics",
    "SEV-label",
    "SEV-total",
    "ALT-serviceName",
    "ALT-environment",
  ];
  const ids = itemIds.length > 0 ? itemIds : defaultIds;
  const items: Record<string, EvidenceItem> = {};
  for (const id of ids) {
    const value = id === "SEV-label" ? "high" : `value-${id}`;
    items[id] = createEvidenceItem(id, value);
  }

  return {
    items,
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

// ==================== Tests ====================

describe("validateSummaryOutput", () => {
  describe("valid summaries", () => {
    it("should pass validation for a well-formed summary", () => {
      const summary = createValidSummary();
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("should accept multiple suggested actions up to the max", () => {
      const actions = Array.from({ length: SUGGESTED_ACTIONS_LIMITS.MAX }, (_, i) =>
        createValidAction({ action: `Action ${i + 1}` })
      );
      const summary = createValidSummary({ suggestedActions: actions });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      expect(result.valid).toBe(true);
    });
  });

  describe("required fields", () => {
    it("should fail when headline is empty", () => {
      const summary = createValidSummary({ headline: "" });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      expect(result.valid).toBe(false);
      const violation = result.violations.find((v) => v.field === "headline");
      expect(violation).toBeDefined();
      expect(violation!.rule).toBe("required_field");
    });

    it("should fail when headline is whitespace-only", () => {
      const summary = createValidSummary({ headline: "   " });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      expect(result.valid).toBe(false);
    });

    it("should fail when rootCauseSummary is empty", () => {
      const summary = createValidSummary({ rootCauseSummary: "" });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      expect(result.valid).toBe(false);
      const violation = result.violations.find(
        (v) => v.field === "rootCauseSummary" && v.rule === "required_field"
      );
      expect(violation).toBeDefined();
    });

    it("should fail when impactAssessment is empty", () => {
      const summary = createValidSummary({ impactAssessment: "" });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      expect(result.valid).toBe(false);
      const violation = result.violations.find(
        (v) => v.field === "impactAssessment" && v.rule === "required_field"
      );
      expect(violation).toBeDefined();
    });
  });

  describe("summarySource validation", () => {
    it("should fail when summarySource is not ai", () => {
      const summary = createValidSummary({ summarySource: "fallback" });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      expect(result.valid).toBe(false);
      const violation = result.violations.find((v) => v.rule === "summary_source");
      expect(violation).toBeDefined();
      expect(violation!.message).toContain('"ai"');
    });

    it("should pass when summarySource is ai", () => {
      const summary = createValidSummary({ summarySource: "ai" });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      const sourceViolation = result.violations.find((v) => v.rule === "summary_source");
      expect(sourceViolation).toBeUndefined();
    });
  });

  describe("length limits", () => {
    it("should fail when headline exceeds max length", () => {
      const summary = createValidSummary({
        headline: "X".repeat(SUMMARY_LENGTH_LIMITS.headline + 1),
      });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      expect(result.valid).toBe(false);
      const violation = result.violations.find(
        (v) => v.field === "headline" && v.rule === "length_limit"
      );
      expect(violation).toBeDefined();
    });

    it("should fail when rootCauseSummary exceeds max length", () => {
      const summary = createValidSummary({
        rootCauseSummary: "X".repeat(SUMMARY_LENGTH_LIMITS.rootCauseSummary + 1),
      });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      expect(result.valid).toBe(false);
    });

    it("should fail when impactAssessment exceeds max length", () => {
      const summary = createValidSummary({
        impactAssessment: "X".repeat(SUMMARY_LENGTH_LIMITS.impactAssessment + 1),
      });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      expect(result.valid).toBe(false);
    });

    it("should pass when all fields are exactly at the limit", () => {
      const summary = createValidSummary({
        headline: "X".repeat(SUMMARY_LENGTH_LIMITS.headline),
        rootCauseSummary: "X".repeat(SUMMARY_LENGTH_LIMITS.rootCauseSummary),
        impactAssessment: "X".repeat(SUMMARY_LENGTH_LIMITS.impactAssessment),
      });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      const lengthViolations = result.violations.filter((v) => v.rule === "length_limit");
      expect(lengthViolations).toHaveLength(0);
    });
  });

  describe("suggested actions validation", () => {
    it("should fail when no suggested actions are provided", () => {
      const summary = createValidSummary({ suggestedActions: [] });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      expect(result.valid).toBe(false);
      const violation = result.violations.find((v) => v.rule === "actions_count");
      expect(violation).toBeDefined();
    });

    it("should fail when too many suggested actions are provided", () => {
      const actions = Array.from({ length: SUGGESTED_ACTIONS_LIMITS.MAX + 1 }, (_, i) =>
        createValidAction({ action: `Action ${i + 1}` })
      );
      const summary = createValidSummary({ suggestedActions: actions });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      expect(result.valid).toBe(false);
      const violation = result.violations.find((v) => v.rule === "actions_count");
      expect(violation).toBeDefined();
    });

    it("should fail when action text is empty", () => {
      const summary = createValidSummary({
        suggestedActions: [createValidAction({ action: "" })],
      });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      expect(result.valid).toBe(false);
      const violation = result.violations.find((v) => v.rule === "action_field");
      expect(violation).toBeDefined();
    });

    it("should fail when action reasoning is empty", () => {
      const summary = createValidSummary({
        suggestedActions: [createValidAction({ reasoning: "" })],
      });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      expect(result.valid).toBe(false);
    });

    it("should fail when action priority is invalid", () => {
      const summary = createValidSummary({
        suggestedActions: [createValidAction({ priority: "urgent" as never })],
      });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      expect(result.valid).toBe(false);
      const violation = result.violations.find((v) => v.rule === "action_priority");
      expect(violation).toBeDefined();
    });

    it("should accept all valid priority values", () => {
      const priorities: Array<"immediate" | "short_term" | "long_term"> = [
        "immediate",
        "short_term",
        "long_term",
      ];

      for (const priority of priorities) {
        const summary = createValidSummary({
          suggestedActions: [createValidAction({ priority })],
        });
        const catalog = createTestCatalog();

        const result = validateSummaryOutput(summary, catalog);

        const priorityViolation = result.violations.find((v) => v.rule === "action_priority");
        expect(priorityViolation).toBeUndefined();
      }
    });

    it("should fail when action text exceeds max length", () => {
      const summary = createValidSummary({
        suggestedActions: [
          createValidAction({
            action: "X".repeat(SUMMARY_LENGTH_LIMITS.actionText + 1),
          }),
        ],
      });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      expect(result.valid).toBe(false);
    });

    it("should fail when action reasoning exceeds max length", () => {
      const summary = createValidSummary({
        suggestedActions: [
          createValidAction({
            reasoning: "X".repeat(SUMMARY_LENGTH_LIMITS.actionReasoning + 1),
          }),
        ],
      });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      expect(result.valid).toBe(false);
    });
  });

  describe("citation validation", () => {
    it("should pass when all cited IDs exist in the catalog", () => {
      const summary = createValidSummary({
        evidencesCited: ["ALT-title", "SEV-label"],
      });
      const catalog = createTestCatalog(["ALT-title", "SEV-label"]);

      const result = validateSummaryOutput(summary, catalog);

      const citationViolations = result.violations.filter((v) => v.rule === "citation_not_found");
      expect(citationViolations).toHaveLength(0);
    });

    it("should fail when a cited ID does not exist in the catalog", () => {
      const summary = createValidSummary({
        evidencesCited: ["ALT-title", "FAKE-evidence"],
      });
      const catalog = createTestCatalog(["ALT-title"]);

      const result = validateSummaryOutput(summary, catalog);

      expect(result.valid).toBe(false);
      const violation = result.violations.find((v) => v.rule === "citation_not_found");
      expect(violation).toBeDefined();
      expect(violation!.message).toContain("FAKE-evidence");
    });

    it("should pass when evidencesCited is empty", () => {
      const summary = createValidSummary({ evidencesCited: [] });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      const citationViolations = result.violations.filter((v) => v.rule === "citation_not_found");
      expect(citationViolations).toHaveLength(0);
    });
  });

  describe("severity override detection", () => {
    it("should fail when AI mentions a different severity than computed", () => {
      const summary = createValidSummary({
        headline: "Critical outage on payments-api",
      });
      // SEV-label says "high" but headline says "critical"
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      const severityViolation = result.violations.find((v) => v.rule === "severity_override");
      expect(severityViolation).toBeDefined();
      expect(severityViolation!.message).toContain("critical");
      expect(severityViolation!.message).toContain("high");
    });

    it("should pass when AI uses the correct severity label", () => {
      const summary = createValidSummary({
        headline: "High severity alert on payments-api",
      });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      const severityViolation = result.violations.find((v) => v.rule === "severity_override");
      expect(severityViolation).toBeUndefined();
    });

    it("should skip severity check when SEV-label is missing from catalog", () => {
      const summary = createValidSummary({
        headline: "Critical outage on payments-api",
        evidencesCited: ["ALT-title"],
      });
      const catalog = createTestCatalog(["ALT-title"]); // No SEV-label

      const result = validateSummaryOutput(summary, catalog);

      const severityViolation = result.violations.find((v) => v.rule === "severity_override");
      expect(severityViolation).toBeUndefined();
    });

    it("should detect severity override in rootCauseSummary", () => {
      const summary = createValidSummary({
        headline: "Alert on payments-api",
        rootCauseSummary: "This is a critical failure that needs attention",
      });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      const severityViolation = result.violations.find((v) => v.rule === "severity_override");
      expect(severityViolation).toBeDefined();
    });

    it("should detect severity override in impactAssessment", () => {
      const summary = createValidSummary({
        headline: "Alert on payments-api",
        rootCauseSummary: "Some root cause",
        impactAssessment: "This low severity issue can wait",
      });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      const severityViolation = result.violations.find((v) => v.rule === "severity_override");
      expect(severityViolation).toBeDefined();
    });
  });

  describe("multiple violations", () => {
    it("should report all violations at once", () => {
      const summary = createValidSummary({
        headline: "",
        rootCauseSummary: "",
        summarySource: "fallback",
        suggestedActions: [],
        evidencesCited: ["FAKE-id"],
      });
      const catalog = createTestCatalog();

      const result = validateSummaryOutput(summary, catalog);

      expect(result.valid).toBe(false);
      // Should have multiple violations for different rules
      expect(result.violations.length).toBeGreaterThan(3);
    });
  });
});

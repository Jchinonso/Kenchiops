/**
 * Unit tests for analysis guardrails action filtering.
 */
import { describe, it, expect } from "@jest/globals";
import type { EvidenceHighlights } from "../../openaiClient/analysisGuardrailsEvidence.js";
import type { LLMRecommendedAction } from "../../core/types.js";
import { filterActionsByEvidence } from "../../openaiClient/analysisGuardrailsActions.js";

const createHighlights = (evidenceText: string): EvidenceHighlights => ({
  evidenceText,
  testFailures: [],
  annotations: [],
  checkOutputs: [],
  workflowLogs: [],
  dependencyChanges: [],
  buildConfigChanges: [],
  dependencyNames: [],
  configFiles: [],
  secondaryFindings: [],
  sections: {
    hasTests: false,
    hasAnnotations: false,
    hasCheckOutput: false,
    hasWorkflowLogs: false,
    hasDependencyChanges: false,
    hasBuildConfigChanges: false,
  },
});

describe("analysisGuardrailsActions", () => {
  it("should require function-name actions to match evidence", () => {
    const evidenceText = "Test failed: subtract(5, 3)";
    const highlights = createHighlights(evidenceText);
    const actions: LLMRecommendedAction[] = [
      {
        actionType: "manual_investigation",
        description: "Check the multiply function for correctness.",
        priority: "high",
      },
      {
        actionType: "manual_investigation",
        description: "Check the subtract function for correctness.",
        priority: "high",
      },
    ];

    const filtered = filterActionsByEvidence(actions, evidenceText, highlights);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.description).toContain("subtract");
  });
});

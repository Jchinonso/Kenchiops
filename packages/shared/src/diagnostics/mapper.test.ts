/**
 * Tests for Diagnostics Mapper
 *
 * All functions under test are pure — no mocks needed.
 *
 * @module diagnostics/mapper.test
 */

import { describe, it, expect } from "@jest/globals";
import type { LLMAnalysisResult, FailureCategory } from "../core/types.js";
import type {
  DiagnosticResult,
  DegradedResult,
  DiagnosticRAGContext,
  ProblemCategory,
} from "./types.js";

import { mapLLMAnalysisToDiagnostic, buildDegradedFromPipelineFailure } from "./mapper.js";

// ==================== Test Fixtures ====================

const createTestAnalysis = (overrides: Partial<LLMAnalysisResult> = {}): LLMAnalysisResult => ({
  eventId: "evt-1",
  summary: "Build failed due to missing dependency",
  identifiedCause: "Package 'lodash' not found in node_modules",
  confidence: "high",
  reasoning: "The error log clearly shows MODULE_NOT_FOUND for lodash",
  category: "dependency",
  phase: "build",
  analyzedAt: "2026-03-26T10:00:00Z",
  recommendedActions: [
    {
      actionType: "fix",
      description: "Run npm install to restore missing dependencies",
      priority: "immediate",
    },
  ],
  evidenceUsed: [
    {
      type: "log",
      reference: "Error: Cannot find module 'lodash'",
    },
  ],
  uncertainties: ["Could also be a lockfile corruption issue"],
  ...overrides,
});

const createTestRAGContext = (
  overrides: Partial<DiagnosticRAGContext> = {}
): DiagnosticRAGContext => ({
  pastIncidents: [
    {
      id: "inc-1",
      title: "Missing dependency in production",
      similarity: 0.85,
      resolvedAt: "2026-03-20T12:00:00Z",
      resolution: "Rebuilt node_modules from scratch",
    },
  ],
  runbooks: [
    {
      id: "rb-1",
      title: "Dependency Resolution Guide",
      url: "https://wiki.example.com/deps",
      relevance: 0.75,
    },
  ],
  documentation: [
    {
      id: "doc-1",
      title: "npm Troubleshooting",
      url: "https://docs.example.com/npm",
      relevance: 0.6,
    },
  ],
  totalTokens: 500,
  ...overrides,
});

// ==================== Tests ====================

describe("mapper", () => {
  describe("mapLLMAnalysisToDiagnostic", () => {
    // ==================== Category Mapping ====================

    describe("category mapping", () => {
      const categoryMappings: ReadonlyArray<{
        readonly input: FailureCategory;
        readonly expectedCategory: ProblemCategory;
        readonly expectedSubcategory: string;
      }> = [
        {
          input: "infra",
          expectedCategory: "infrastructure",
          expectedSubcategory: "resource_exhaustion",
        },
        {
          input: "config",
          expectedCategory: "configuration",
          expectedSubcategory: "invalid_config",
        },
        {
          input: "dependency",
          expectedCategory: "application",
          expectedSubcategory: "version_mismatch",
        },
        { input: "build", expectedCategory: "application", expectedSubcategory: "build_failure" },
        { input: "test", expectedCategory: "application", expectedSubcategory: "test_failure" },
        { input: "runtime", expectedCategory: "application", expectedSubcategory: "code_error" },
        {
          input: "unknown",
          expectedCategory: "infrastructure",
          expectedSubcategory: "resource_exhaustion",
        },
      ];

      categoryMappings.forEach(({ input, expectedCategory, expectedSubcategory }) => {
        it(`should map '${input}' to category '${expectedCategory}' and subcategory '${expectedSubcategory}'`, () => {
          const analysis = createTestAnalysis({ category: input });
          const result = mapLLMAnalysisToDiagnostic(analysis);

          expect(result.rootCause.category).toBe(expectedCategory);
          expect(result.rootCause.subcategory).toBe(expectedSubcategory);
        });
      });

      it("should default to 'unknown' category when analysis.category is undefined", () => {
        const analysis = createTestAnalysis({ category: undefined });
        const result = mapLLMAnalysisToDiagnostic(analysis);

        // undefined falls back to "unknown" which maps to infrastructure/resource_exhaustion
        expect(result.rootCause.category).toBe("infrastructure");
        expect(result.rootCause.subcategory).toBe("resource_exhaustion");
      });
    });

    // ==================== Confidence Mapping ====================

    describe("confidence mapping", () => {
      const confidenceMappings: ReadonlyArray<{
        readonly input: string;
        readonly expectedConfidence: string;
        readonly expectedSeverity: string;
      }> = [
        { input: "very_high", expectedConfidence: "high", expectedSeverity: "critical" },
        { input: "high", expectedConfidence: "high", expectedSeverity: "high" },
        { input: "medium", expectedConfidence: "medium", expectedSeverity: "medium" },
        { input: "low", expectedConfidence: "low", expectedSeverity: "low" },
        { input: "very_low", expectedConfidence: "low", expectedSeverity: "low" },
      ];

      confidenceMappings.forEach(({ input, expectedConfidence, expectedSeverity }) => {
        it(`should map confidence '${input}' to '${expectedConfidence}' and severity '${expectedSeverity}'`, () => {
          const analysis = createTestAnalysis({
            confidence: input as LLMAnalysisResult["confidence"],
          });
          const result = mapLLMAnalysisToDiagnostic(analysis);

          expect(result.rootCause.confidence).toBe(expectedConfidence);
          expect(result.impact.severity).toBe(expectedSeverity);
        });
      });

      it("should default to 'medium' confidence when analysis.confidence is undefined", () => {
        const analysis = createTestAnalysis({ confidence: undefined });
        const result = mapLLMAnalysisToDiagnostic(analysis);

        expect(result.rootCause.confidence).toBe("medium");
        expect(result.impact.severity).toBe("medium");
      });
    });

    // ==================== Root Cause ====================

    describe("rootCause mapping", () => {
      it("should use identifiedCause for summary when available", () => {
        const analysis = createTestAnalysis({
          identifiedCause: "Specific root cause",
          summary: "General summary",
        });
        const result = mapLLMAnalysisToDiagnostic(analysis);

        expect(result.rootCause.summary).toBe("Specific root cause");
      });

      it("should fall back to summary when identifiedCause is undefined", () => {
        const analysis = createTestAnalysis({
          identifiedCause: undefined,
          summary: "General summary",
        });
        const result = mapLLMAnalysisToDiagnostic(analysis);

        expect(result.rootCause.summary).toBe("General summary");
      });

      it("should map evidenceUsed references to evidence array", () => {
        const analysis = createTestAnalysis({
          evidenceUsed: [
            { type: "log", reference: "Error line 1" },
            { type: "commit", reference: "abc123 changed deps" },
          ],
        });
        const result = mapLLMAnalysisToDiagnostic(analysis);

        expect(result.rootCause.evidence).toEqual(["Error line 1", "abc123 changed deps"]);
      });

      it("should return empty evidence when evidenceUsed is undefined", () => {
        const analysis = createTestAnalysis({ evidenceUsed: undefined });
        const result = mapLLMAnalysisToDiagnostic(analysis);

        expect(result.rootCause.evidence).toEqual([]);
      });
    });

    // ==================== Causality Chain ====================

    describe("causalityChain mapping", () => {
      it("should set primary artifact type to analysis category", () => {
        const analysis = createTestAnalysis({ category: "build" });
        const result = mapLLMAnalysisToDiagnostic(analysis);

        expect(result.causalityChain.primary.type).toBe("build");
      });

      it("should default primary type to 'unknown' when category is undefined", () => {
        const analysis = createTestAnalysis({ category: undefined });
        const result = mapLLMAnalysisToDiagnostic(analysis);

        expect(result.causalityChain.primary.type).toBe("unknown");
      });

      it("should map uncertainties to secondary artifacts", () => {
        const analysis = createTestAnalysis({
          uncertainties: ["Could be DNS", "Might be firewall"],
        });
        const result = mapLLMAnalysisToDiagnostic(analysis);

        expect(result.causalityChain.secondary).toHaveLength(2);
        expect(result.causalityChain.secondary[0]).toEqual({
          type: "unknown",
          summary: "Could be DNS",
        });
        expect(result.causalityChain.secondary[1]).toEqual({
          type: "unknown",
          summary: "Might be firewall",
        });
      });

      it("should return empty secondary when uncertainties is undefined", () => {
        const analysis = createTestAnalysis({ uncertainties: undefined });
        const result = mapLLMAnalysisToDiagnostic(analysis);

        expect(result.causalityChain.secondary).toEqual([]);
      });

      it("should use reasoning for explanation", () => {
        const analysis = createTestAnalysis({
          reasoning: "The logs show a clear chain of events",
        });
        const result = mapLLMAnalysisToDiagnostic(analysis);

        expect(result.causalityChain.explanation).toBe("The logs show a clear chain of events");
      });

      it("should default explanation to empty string when reasoning is undefined", () => {
        const analysis = createTestAnalysis({ reasoning: undefined });
        const result = mapLLMAnalysisToDiagnostic(analysis);

        expect(result.causalityChain.explanation).toBe("");
      });
    });

    // ==================== Impact ====================

    describe("impact mapping", () => {
      it("should use phase as scope", () => {
        const analysis = createTestAnalysis({ phase: "deploy" });
        const result = mapLLMAnalysisToDiagnostic(analysis);

        expect(result.impact.scope).toBe("deploy");
      });

      it("should default scope to 'unknown' when phase is undefined", () => {
        const analysis = createTestAnalysis({ phase: undefined });
        const result = mapLLMAnalysisToDiagnostic(analysis);

        expect(result.impact.scope).toBe("unknown");
      });

      it("should set duration and usersAffected to empty strings", () => {
        const result = mapLLMAnalysisToDiagnostic(createTestAnalysis());

        expect(result.impact.duration).toBe("");
        expect(result.impact.usersAffected).toBe("");
      });
    });

    // ==================== Recommendations / Action Splitting ====================

    describe("recommendations mapping", () => {
      it("should classify 'immediate' priority actions as immediate", () => {
        const analysis = createTestAnalysis({
          recommendedActions: [
            { actionType: "fix", description: "Fix now", priority: "immediate" },
          ],
        });
        const result = mapLLMAnalysisToDiagnostic(analysis);

        expect(result.recommendations.immediate).toHaveLength(1);
        expect(result.recommendations.immediate[0].description).toBe("Fix now");
      });

      it("should classify 'high' priority actions as immediate", () => {
        const analysis = createTestAnalysis({
          recommendedActions: [{ actionType: "fix", description: "Urgent fix", priority: "high" }],
        });
        const result = mapLLMAnalysisToDiagnostic(analysis);

        expect(result.recommendations.immediate).toHaveLength(1);
      });

      it("should classify investigative keyword actions as investigative", () => {
        const keywords = ["investigate", "check", "review", "monitor", "verify", "inspect"];

        keywords.forEach((keyword) => {
          const analysis = createTestAnalysis({
            recommendedActions: [
              {
                actionType: "check",
                description: `Please ${keyword} the logs`,
                priority: "medium",
              },
            ],
          });
          const result = mapLLMAnalysisToDiagnostic(analysis);

          expect(result.recommendations.investigative).toHaveLength(1);
          expect(result.recommendations.preventive).toHaveLength(0);
        });
      });

      it("should classify non-investigative medium/low actions as preventive", () => {
        const analysis = createTestAnalysis({
          recommendedActions: [
            {
              actionType: "improvement",
              description: "Add retry logic to the client",
              priority: "medium",
            },
          ],
        });
        const result = mapLLMAnalysisToDiagnostic(analysis);

        expect(result.recommendations.preventive).toHaveLength(1);
        expect(result.recommendations.immediate).toHaveLength(0);
        expect(result.recommendations.investigative).toHaveLength(0);
      });

      it("should default action priority to 'medium' when undefined", () => {
        const analysis = createTestAnalysis({
          recommendedActions: [
            {
              actionType: "improvement",
              description: "Add retry logic",
              priority: undefined,
            },
          ],
        });
        const result = mapLLMAnalysisToDiagnostic(analysis);

        // No priority => not immediate/high => classifyAction checks keywords
        // "Add retry logic" has no investigative keywords => preventive
        expect(result.recommendations.preventive).toHaveLength(1);
        expect(result.recommendations.preventive[0].priority).toBe("medium");
      });

      it("should preserve reasoning on mapped actions", () => {
        const analysis = createTestAnalysis({
          recommendedActions: [
            {
              actionType: "fix",
              description: "Rollback",
              reasoning: "Previous version was stable",
              priority: "immediate",
            },
          ],
        });
        const result = mapLLMAnalysisToDiagnostic(analysis);

        expect(result.recommendations.immediate[0].reasoning).toBe("Previous version was stable");
      });

      it("should handle empty recommendedActions", () => {
        const analysis = createTestAnalysis({ recommendedActions: [] });
        const result = mapLLMAnalysisToDiagnostic(analysis);

        expect(result.recommendations.immediate).toEqual([]);
        expect(result.recommendations.preventive).toEqual([]);
        expect(result.recommendations.investigative).toEqual([]);
      });

      it("should handle undefined recommendedActions", () => {
        const analysis = createTestAnalysis({ recommendedActions: undefined });
        const result = mapLLMAnalysisToDiagnostic(analysis);

        expect(result.recommendations.immediate).toEqual([]);
        expect(result.recommendations.preventive).toEqual([]);
        expect(result.recommendations.investigative).toEqual([]);
      });

      it("should split multiple actions across all three buckets", () => {
        const analysis = createTestAnalysis({
          recommendedActions: [
            { actionType: "fix", description: "Restart service", priority: "immediate" },
            { actionType: "improve", description: "Add circuit breaker", priority: "low" },
            { actionType: "debug", description: "Check memory usage patterns", priority: "medium" },
          ],
        });
        const result = mapLLMAnalysisToDiagnostic(analysis);

        expect(result.recommendations.immediate).toHaveLength(1);
        expect(result.recommendations.preventive).toHaveLength(1);
        expect(result.recommendations.investigative).toHaveLength(1);
      });
    });

    // ==================== RAG Context ====================

    describe("relatedContext mapping", () => {
      it("should include RAG context when provided", () => {
        const ragContext = createTestRAGContext();
        const result = mapLLMAnalysisToDiagnostic(createTestAnalysis(), ragContext);

        expect(result.relatedContext.pastIncidents).toHaveLength(1);
        expect(result.relatedContext.runbooks).toHaveLength(1);
        expect(result.relatedContext.documentation).toHaveLength(1);
      });

      it("should return empty relatedContext when ragContext is undefined", () => {
        const result = mapLLMAnalysisToDiagnostic(createTestAnalysis());

        expect(result.relatedContext.pastIncidents).toEqual([]);
        expect(result.relatedContext.runbooks).toEqual([]);
        expect(result.relatedContext.documentation).toEqual([]);
      });

      it("should handle ragContext with empty arrays", () => {
        const ragContext = createTestRAGContext({
          pastIncidents: [],
          runbooks: [],
          documentation: [],
        });
        const result = mapLLMAnalysisToDiagnostic(createTestAnalysis(), ragContext);

        expect(result.relatedContext.pastIncidents).toEqual([]);
        expect(result.relatedContext.runbooks).toEqual([]);
        expect(result.relatedContext.documentation).toEqual([]);
      });
    });

    // ==================== Output Structure ====================

    describe("output structure", () => {
      it("should always return status 'complete'", () => {
        const result = mapLLMAnalysisToDiagnostic(createTestAnalysis());

        expect(result.status).toBe("complete");
      });

      it("should not mutate the input analysis object", () => {
        const analysis = Object.freeze(createTestAnalysis());

        expect(() => mapLLMAnalysisToDiagnostic(analysis as LLMAnalysisResult)).not.toThrow();
      });

      it("should return a new object (not the input reference)", () => {
        const analysis = createTestAnalysis();
        const result = mapLLMAnalysisToDiagnostic(analysis);

        expect(result).not.toBe(analysis);
      });
    });
  });

  describe("buildDegradedFromPipelineFailure", () => {
    it("should produce a DegradedResult with status 'degraded'", () => {
      const result = buildDegradedFromPipelineFailure(
        "chunk_extraction_failure",
        "some raw log preview"
      );

      expect(result.status).toBe("degraded");
    });

    it("should set the degraded reason correctly", () => {
      const reasons: ReadonlyArray<DegradedResult["reason"]> = [
        "chunk_extraction_failure",
        "context_fetch_failed",
        "token_budget_exceeded",
      ];

      reasons.forEach((reason) => {
        const result = buildDegradedFromPipelineFailure(reason, "log");
        expect(result.reason).toBe(reason);
      });
    });

    it("should truncate rawPreview to 2000 characters", () => {
      const longLog = "x".repeat(5000);
      const result = buildDegradedFromPipelineFailure("chunk_extraction_failure", longLog);

      expect(result.partialAnalysis.rawPreview.length).toBe(2000);
    });

    it("should not truncate rawPreview when under 2000 characters", () => {
      const shortLog = "short log content";
      const result = buildDegradedFromPipelineFailure("chunk_extraction_failure", shortLog);

      expect(result.partialAnalysis.rawPreview).toBe(shortLog);
    });

    it("should handle empty rawLogPreview", () => {
      const result = buildDegradedFromPipelineFailure("chunk_extraction_failure", "");

      expect(result.partialAnalysis.rawPreview).toBe("");
    });

    it("should use provided suggestedCategory", () => {
      const result = buildDegradedFromPipelineFailure("context_fetch_failed", "log", "external");

      expect(result.partialAnalysis.suggestedCategory).toBe("external");
    });

    it("should default suggestedCategory to 'infrastructure' when not provided", () => {
      const result = buildDegradedFromPipelineFailure("context_fetch_failed", "log");

      expect(result.partialAnalysis.suggestedCategory).toBe("infrastructure");
    });

    it("should always set confidence to 'low'", () => {
      const result = buildDegradedFromPipelineFailure("token_budget_exceeded", "log");

      expect(result.confidence).toBe("low");
    });

    it("should always set a default recommendation message", () => {
      const result = buildDegradedFromPipelineFailure("token_budget_exceeded", "log");

      expect(result.recommendation).toBe(
        "Review full logs manually — automated analysis was incomplete."
      );
    });

    it("should return empty detectedPatterns array", () => {
      const result = buildDegradedFromPipelineFailure("chunk_extraction_failure", "log");

      expect(result.partialAnalysis.detectedPatterns).toEqual([]);
    });

    it("should not mutate the rawLogPreview input", () => {
      const log = "original log";
      const frozen = Object.freeze({ value: log });

      buildDegradedFromPipelineFailure("chunk_extraction_failure", frozen.value);

      expect(frozen.value).toBe("original log");
    });
  });
});

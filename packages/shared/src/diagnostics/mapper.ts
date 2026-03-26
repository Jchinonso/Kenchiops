/**
 * Diagnostics Mapper
 *
 * Maps Pipeline A output (LLMAnalysisResult) to the unified DiagnosticResult schema.
 * Also provides a mapper for degraded mode (AggregatedEvidence with degraded_mode).
 * All functions are pure — no I/O, no side effects.
 *
 * @module diagnostics/mapper
 */

import type { LLMAnalysisResult, FailureCategory } from "../core/types.js";
import type {
  ProblemCategory,
  ProblemSubcategory,
  DiagnosticResult,
  DegradedResult,
  DiagnosticRAGContext,
  Action,
} from "./types.js";

// ==================== Category Mapping ====================

/** Maps Pipeline A FailureCategory to ProblemCategory. */
const FAILURE_CATEGORY_MAP: Readonly<Record<FailureCategory, ProblemCategory>> = {
  infra: "infrastructure",
  config: "configuration",
  dependency: "application",
  build: "application",
  test: "application",
  runtime: "application",
  unknown: "infrastructure",
};

/** Maps Pipeline A FailureCategory to ProblemSubcategory. */
const FAILURE_SUBCATEGORY_MAP: Readonly<Record<FailureCategory, ProblemSubcategory>> = {
  infra: "resource_exhaustion",
  config: "invalid_config",
  dependency: "version_mismatch",
  build: "build_failure",
  test: "test_failure",
  runtime: "code_error",
  unknown: "resource_exhaustion",
};

/** Maps LLM confidence string to RootCauseAnalysis confidence level. */
const CONFIDENCE_LEVEL_MAP: Readonly<Record<string, "high" | "medium" | "low">> = {
  very_high: "high",
  high: "high",
  medium: "medium",
  low: "low",
  very_low: "low",
};

/** Maps LLM confidence to impact severity. */
const SEVERITY_MAP: Readonly<Record<string, "critical" | "high" | "medium" | "low">> = {
  very_high: "critical",
  high: "high",
  medium: "medium",
  low: "low",
  very_low: "low",
};

// ==================== Action Classification ====================

/**
 * Classifies an action as immediate, preventive, or investigative
 * based on its priority and description keywords.
 */
const classifyAction = (action: {
  readonly priority?: string;
  readonly description: string;
}): "immediate" | "preventive" | "investigative" => {
  if (action.priority === "immediate" || action.priority === "high") {
    return "immediate";
  }

  const desc = action.description.toLowerCase();
  const investigativeKeywords = ["investigate", "check", "review", "monitor", "verify", "inspect"];
  const isInvestigative = investigativeKeywords.some((keyword) => desc.includes(keyword));

  return isInvestigative ? "investigative" : "preventive";
};

/**
 * Splits LLM recommended actions into the three DiagnosticResult categories.
 */
const splitActions = (
  actions: ReadonlyArray<{
    readonly description: string;
    readonly reasoning?: string;
    readonly priority?: string;
  }>
): {
  readonly immediate: readonly Action[];
  readonly preventive: readonly Action[];
  readonly investigative: readonly Action[];
} => {
  const immediate: Action[] = [];
  const preventive: Action[] = [];
  const investigative: Action[] = [];

  actions.forEach((action) => {
    const mapped: Action = {
      description: action.description,
      reasoning: action.reasoning,
      priority: (action.priority as Action["priority"]) ?? "medium",
    };

    const bucket = classifyAction(action);
    if (bucket === "immediate") {
      immediate.push(mapped);
    } else if (bucket === "investigative") {
      investigative.push(mapped);
    } else {
      preventive.push(mapped);
    }
  });

  return { immediate, preventive, investigative };
};

// ==================== Main Mapper ====================

/**
 * Maps Pipeline A LLM output to the unified DiagnosticResult schema.
 */
export const mapLLMAnalysisToDiagnostic = (
  analysis: LLMAnalysisResult,
  ragContext?: DiagnosticRAGContext
): DiagnosticResult => {
  const category = FAILURE_CATEGORY_MAP[analysis.category ?? "unknown"];
  const subcategory = FAILURE_SUBCATEGORY_MAP[analysis.category ?? "unknown"];
  const confidence = CONFIDENCE_LEVEL_MAP[analysis.confidence ?? "medium"] ?? "medium";
  const severity = SEVERITY_MAP[analysis.confidence ?? "medium"] ?? "medium";

  const actions = analysis.recommendedActions ?? [];
  const recommendations = splitActions(actions);

  return {
    status: "complete",
    rootCause: {
      category,
      subcategory,
      summary: analysis.identifiedCause ?? analysis.summary,
      confidence,
      evidence: (analysis.evidenceUsed ?? []).map((ref) => ref.reference),
    },
    causalityChain: {
      primary: {
        type: analysis.category ?? "unknown",
        summary: analysis.identifiedCause ?? analysis.summary,
      },
      secondary: (analysis.uncertainties ?? []).map((uncertainty) => ({
        type: "unknown",
        summary: uncertainty,
      })),
      explanation: analysis.reasoning ?? "",
    },
    impact: {
      severity,
      scope: analysis.phase ?? "unknown",
      duration: "",
      usersAffected: "",
    },
    recommendations,
    relatedContext: {
      pastIncidents: ragContext?.pastIncidents ?? [],
      runbooks: ragContext?.runbooks ?? [],
      documentation: ragContext?.documentation ?? [],
    },
  };
};

/**
 * Creates a DegradedResult for Pipeline A degraded mode.
 */
export const buildDegradedFromPipelineFailure = (
  reason: DegradedResult["reason"],
  rawLogPreview: string,
  suggestedCategory?: ProblemCategory
): DegradedResult => ({
  status: "degraded",
  reason,
  partialAnalysis: {
    rawPreview: rawLogPreview.slice(0, 2000),
    detectedPatterns: [],
    suggestedCategory: suggestedCategory ?? "infrastructure",
  },
  confidence: "low",
  recommendation: "Review full logs manually — automated analysis was incomplete.",
});

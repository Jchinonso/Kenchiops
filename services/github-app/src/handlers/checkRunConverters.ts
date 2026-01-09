/**
 * Check Run Converters
 *
 * Conversion utilities for transforming data between different formats
 * used in check run processing (AI annotations, API responses, aggregation types).
 */

import type {
  CodeAnnotation,
  RecommendedAction,
  AnalyzedFailure,
  RepositoryInfo,
  PRContext,
  WorkflowContext,
  CachedAnalysis,
  LLMDetectedDependencyChange,
  LLMDetectedBuildConfigChange,
} from "@kenchi/shared";
import type { CheckRunWebhook } from "../types/githubTypes.js";
import type { EnrichedContext } from "../services/context/index.js";

// ==================== Type Definitions ====================

/**
 * AI-generated code annotation from analysis
 */
export interface AICodeAnnotation {
  readonly path: string;
  readonly line: number;
  readonly level: "failure" | "warning" | "notice";
  readonly message: string;
  readonly title?: string;
}

/**
 * Full LLM analysis result (subset of fields we use)
 */
export interface FullAnalysisResult {
  readonly codeAnnotations?: readonly AICodeAnnotation[];
  // AI-extracted structured data (Phase 4 - Language Agnostic)
  readonly detectedDependencyChanges?: readonly LLMDetectedDependencyChange[];
  readonly detectedBuildConfigChanges?: readonly LLMDetectedBuildConfigChange[];
}

/**
 * API analysis response type
 */
export interface ApiAnalysis {
  repository?: string;
  confidence?: number;
  analysis?: string;
  identified_cause?: string;
  recommended_actions?: Array<{
    description: string;
    priority: string | number;
    actionType?: string;
    reasoning?: string;
  }>;
  full_analysis?: FullAnalysisResult;
}

// ==================== Utility Functions ====================

/**
 * Format duration in milliseconds to human-readable string
 */
export const formatDuration = (ms: number | undefined): string => {
  if (!ms) {
    return "";
  }
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
};

// ==================== Conversion Functions ====================

/**
 * Convert AI annotations to aggregation CodeAnnotation format
 */
export const convertAIAnnotations = (
  aiAnnotations: readonly AICodeAnnotation[] | undefined,
  githubAnnotations: EnrichedContext["annotations"]
): CodeAnnotation[] => {
  // Prefer AI annotations when available
  if (aiAnnotations && aiAnnotations.length > 0) {
    return aiAnnotations.map((annotation) => ({
      path: annotation.path,
      line: annotation.line,
      level: annotation.level,
      message: annotation.message,
      title: annotation.title,
    }));
  }

  // Fallback to GitHub annotations
  return githubAnnotations.map((annotation) => ({
    path: annotation.path,
    line: annotation.startLine,
    level: annotation.level,
    message: annotation.message,
    title: annotation.title,
  }));
};

/**
 * Convert API recommended actions to aggregation format
 */
export const convertRecommendedActions = (
  actions: ApiAnalysis["recommended_actions"]
): RecommendedAction[] => {
  if (!actions) {
    return [];
  }

  return actions.map((action) => ({
    description: action.description,
    priority: action.priority,
    actionType: action.actionType,
    reasoning: action.reasoning,
  }));
};

/**
 * Build AnalyzedFailure from API analysis result
 */
export const buildAnalyzedFailure = (
  checkRun: CheckRunWebhook["check_run"],
  analysis: ApiAnalysis,
  context: EnrichedContext
): AnalyzedFailure => ({
  checkRunId: checkRun.id,
  checkName: checkRun.name,
  conclusion: checkRun.conclusion || "failure",
  confidence: analysis.confidence ?? 0.5,
  identifiedCause: analysis.identified_cause || "",
  analysis: analysis.analysis || "Analysis unavailable",
  annotations: convertAIAnnotations(analysis.full_analysis?.codeAnnotations, context.annotations),
  recommendedActions: convertRecommendedActions(analysis.recommended_actions),
  testFailures: context.testFailures.map((testFailure) => ({
    testName: testFailure.testName,
    file: testFailure.file,
    line: testFailure.line,
    error: testFailure.error,
  })),
  timestamp: new Date(),
  // AI-extracted structured data (Phase 4 - Language Agnostic)
  detectedDependencyChanges: analysis.full_analysis?.detectedDependencyChanges,
  detectedBuildConfigChanges: analysis.full_analysis?.detectedBuildConfigChanges,
});

/**
 * Build repository info from webhook
 */
export const buildRepositoryInfo = (repository: CheckRunWebhook["repository"]): RepositoryInfo => ({
  fullName: repository.full_name,
  owner: repository.owner.login,
  name: repository.name,
});

/**
 * Build PR context from enriched context
 */
export const buildPRContext = (context: EnrichedContext, prNumber: number): PRContext | null => {
  if (!context.prMetadata) {
    return null;
  }

  return {
    number: prNumber,
    title: context.prMetadata.title ?? "",
    author: context.prMetadata.author ?? "",
    branch: context.prMetadata.headBranch ?? "",
    baseBranch: context.prMetadata.baseBranch ?? "",
    labels: context.prMetadata.labels ?? [],
  };
};

/**
 * Build workflow context from enriched context
 */
export const buildWorkflowContext = (
  checkName: string,
  context: EnrichedContext
): WorkflowContext | null => {
  if (!context.workflowTiming) {
    return null;
  }

  return {
    name: checkName,
    duration: formatDuration(context.workflowTiming.durationMs ?? undefined),
  };
};

/**
 * Convert cached analysis to API analysis format
 */
export const cachedToApiAnalysis = (cached: CachedAnalysis): ApiAnalysis => ({
  repository: cached.repository,
  confidence: cached.confidence,
  analysis: cached.analysis,
  identified_cause: cached.identifiedCause,
  recommended_actions: cached.recommendedActions.map((action) => ({
    description: action.description,
    priority: action.priority,
    actionType: action.actionType,
    reasoning: action.reasoning,
  })),
  full_analysis: {
    codeAnnotations: cached.annotations.map((annotation) => ({
      path: annotation.path,
      line: annotation.line,
      level: annotation.level,
      message: annotation.message,
      title: annotation.title,
    })),
  },
});

/**
 * Feedback Lesson Service
 *
 * Business logic for ingesting confirmed-correct analyses into the RAG
 * knowledge base. Extracted from the feedback route handler to follow
 * the handler → service separation pattern.
 *
 * @module services/feedbackLessonService
 */

import {
  createLogger,
  getErrorMessage,
  ingestAnalysisLesson,
  checkLessonExists,
  SERVICE_NAMES,
  type AnalyzedFailure,
  type CodeAnnotation,
  type RecommendedAction,
  type AnalysisLessonContext,
  type AnalysisRecord,
  type RequestContext,
} from "@kenchi/shared";

const logger = createLogger(SERVICE_NAMES.API);

/** Synthetic check run ID for feedback-ingested lessons (no real check run). */
const SYNTHETIC_CHECK_RUN_ID = 0;

// ==================== Helpers ====================

/**
 * Parses aggregationKey format "owner/repo:commitSha" into parts.
 * Returns null if the format is invalid or commitSha is missing.
 */
const parseAggregationKey = (
  key: string | null
): { readonly repository: string; readonly commitSha: string } | null => {
  if (!key) {
    return null;
  }
  const colonIndex = key.lastIndexOf(":");
  if (colonIndex < 0) {
    return null;
  }
  const repository = key.slice(0, colonIndex);
  const commitSha = key.slice(colonIndex + 1);
  return repository && commitSha ? { repository, commitSha } : null;
};

/**
 * Safely extracts CodeAnnotation[] from fullAnalysis blob.
 */
const extractAnnotations = (
  fullAnalysis: Readonly<Record<string, unknown>>
): readonly CodeAnnotation[] => {
  if (!Array.isArray(fullAnalysis.codeAnnotations)) {
    return [];
  }
  return (fullAnalysis.codeAnnotations as ReadonlyArray<Record<string, unknown>>).map(
    (annotation) => ({
      path: typeof annotation.path === "string" ? annotation.path : "",
      line: typeof annotation.line === "number" ? annotation.line : 0,
      level: (annotation.level === "failure" ||
      annotation.level === "warning" ||
      annotation.level === "notice"
        ? annotation.level
        : "failure") as "failure" | "warning" | "notice",
      message: typeof annotation.message === "string" ? annotation.message : "",
    })
  );
};

/**
 * Safely extracts RecommendedAction[] from fullAnalysis blob or analysis record.
 */
const extractRecommendedActions = (
  fullAnalysis: Readonly<Record<string, unknown>>,
  fallbackActions: readonly string[] | null
): readonly RecommendedAction[] => {
  if (Array.isArray(fullAnalysis.recommendedActions)) {
    const rawActions = fullAnalysis.recommendedActions as ReadonlyArray<Record<string, unknown>>;
    if (rawActions.length > 0 && typeof rawActions[0] === "object" && rawActions[0] !== null) {
      return rawActions.map((action) => ({
        description: typeof action.description === "string" ? action.description : String(action),
        priority:
          typeof action.priority === "string" || typeof action.priority === "number"
            ? action.priority
            : "medium",
      }));
    }
  }
  if (fallbackActions && fallbackActions.length > 0) {
    return fallbackActions.map((desc) => ({ description: desc, priority: "medium" as const }));
  }
  return [];
};

/**
 * Builds a synthetic AnalyzedFailure from analysis record for lesson ingestion.
 */
const buildSyntheticFailure = (analysis: AnalysisRecord): AnalyzedFailure => {
  const { fullAnalysis } = analysis;
  return {
    checkRunId: SYNTHETIC_CHECK_RUN_ID,
    checkName: typeof fullAnalysis.checkName === "string" ? fullAnalysis.checkName : "CI Check",
    conclusion: "failure",
    confidence: analysis.diagnosisConfidence,
    identifiedCause: analysis.identifiedCause ?? "",
    analysis:
      typeof fullAnalysis.reasoning === "string" ? fullAnalysis.reasoning : analysis.summary,
    annotations: extractAnnotations(fullAnalysis),
    recommendedActions: extractRecommendedActions(fullAnalysis, analysis.recommendedActions),
    testFailures: [],
    timestamp: analysis.createdAt,
  };
};

// ==================== Public API ====================

/**
 * Attempts lesson ingestion for a helpful analysis.
 * Returns true if ingestion succeeded, false otherwise. Never throws.
 */
export const tryIngestLesson = async (
  analysis: AnalysisRecord,
  tenantId: string,
  userId: string,
  context: RequestContext
): Promise<boolean> => {
  try {
    const parsed = parseAggregationKey(analysis.aggregationKey);
    if (!parsed) {
      logger.warn("Cannot ingest lesson: missing or invalid aggregationKey", {
        analysisId: analysis.id,
        aggregationKey: analysis.aggregationKey,
        ...context,
      });
      return false;
    }

    // Idempotency: skip if a lesson for this commit already exists
    const sourceUrl = `https://github.com/${parsed.repository}/commit/${parsed.commitSha}`;
    const alreadyIngested = await checkLessonExists(sourceUrl, tenantId);
    if (alreadyIngested) {
      logger.info("Lesson already exists for this analysis, skipping", {
        analysisId: analysis.id,
        sourceUrl,
        ...context,
      });
      return true;
    }

    const syntheticFailure = buildSyntheticFailure(analysis);

    const lessonContext: AnalysisLessonContext = {
      repository: parsed.repository,
      commitSha: parsed.commitSha,
      failures: [syntheticFailure],
      tenantId,
      confirmedBy: userId,
    };

    const result = await ingestAnalysisLesson(lessonContext);

    logger.info("Analysis lesson ingested from feedback", {
      analysisId: analysis.id,
      repository: parsed.repository,
      lessonsCreated: result.lessonsCreated,
      success: result.success,
      ...context,
    });

    return result.success;
  } catch (error) {
    logger.warn("Lesson ingestion failed (non-blocking)", {
      analysisId: analysis.id,
      error: getErrorMessage(error),
      ...context,
    });
    return false;
  }
};

/**
 * Analysis Lesson Ingestion
 *
 * Extracts and ingests lessons from confirmed helpful CI failure analyses.
 * Creates knowledge documents that can be retrieved for similar future failures.
 *
 * @module rag/analysisLessonIngestion
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import {
  KNOWLEDGE_DOC_TYPES,
  ANALYSIS_LESSON_CONFIG,
  SHORT_COMMIT_SHA_LENGTH,
} from "../constants/index.js";
import { ingestKnowledgeDoc } from "./ingestion.js";
import type { AnalysisLessonMetadata } from "./schemas/index.js";
import type { AnalyzedFailure, AggregatedFailures } from "../aggregation/types.js";
import type {
  AnalysisLessonContext,
  IngestAnalysisLessonResult,
  FailureCategory,
} from "./types.js";

export type { AnalysisLessonContext, IngestAnalysisLessonResult } from "./types.js";

const logger = createLogger("analysis-lesson-ingestion");

// ==================== Category Detection ====================

/**
 * Pattern matchers for detecting failure categories.
 */
const CATEGORY_PATTERNS: ReadonlyArray<{
  readonly category: FailureCategory;
  readonly patterns: readonly RegExp[];
}> = [
  {
    category: "test_failure",
    patterns: [/test\s+(fail|error)/i, /assertion\s+fail/i, /expect.*to(be|equal|match)/i],
  },
  {
    category: "type_error",
    patterns: [/type\s*error/i, /typescript/i, /TS\d{4}/i, /cannot find.*type/i],
  },
  {
    category: "build_error",
    patterns: [/build\s+fail/i, /compilation\s+fail/i, /cannot\s+compile/i],
  },
  {
    category: "lint_error",
    patterns: [/eslint/i, /lint\s+error/i, /prettier/i],
  },
  {
    category: "dependency_error",
    patterns: [/cannot\s+find\s+module/i, /npm\s+install/i, /dependency.*not\s+found/i],
  },
  {
    category: "runtime_error",
    patterns: [/runtime\s+error/i, /unhandled\s+exception/i, /segmentation\s+fault/i],
  },
  {
    category: "timeout",
    patterns: [/timeout/i, /exceeded.*time/i, /timed?\s+out/i],
  },
  {
    category: "infrastructure",
    patterns: [/docker/i, /container/i, /network\s+error/i, /connection\s+refused/i],
  },
];

/**
 * Detects failure category from analysis text.
 */
const detectFailureCategory = (text: string): FailureCategory => {
  const matchedCategory = CATEGORY_PATTERNS.find(({ patterns }) =>
    patterns.some((pattern) => pattern.test(text))
  );

  return matchedCategory?.category ?? "unknown";
};

// ==================== Error Signature Generation ====================

/**
 * Generates a normalized error signature from failure details.
 * Used for deduplication and matching similar failures.
 */
const generateErrorSignature = (failure: AnalyzedFailure): string => {
  const parts: string[] = [];

  // Include check name
  if (failure.checkName) {
    parts.push(failure.checkName);
  }

  // Include first annotation path and message
  if (failure.annotations.length > 0) {
    const firstAnnotation = failure.annotations[0];
    parts.push(firstAnnotation.path);
    // Normalize message by removing line numbers and specific values
    const normalizedMessage = firstAnnotation.message
      .replace(/\d+/g, "N")
      .replace(/'[^']+'/g, "'X'")
      .substring(0, ANALYSIS_LESSON_CONFIG.MAX_SIGNATURE_COMPONENT_LENGTH);
    parts.push(normalizedMessage);
  }

  // Include identified cause if available
  if (failure.identifiedCause) {
    const normalizedCause = failure.identifiedCause
      .replace(/\d+/g, "N")
      .substring(0, ANALYSIS_LESSON_CONFIG.MAX_SIGNATURE_COMPONENT_LENGTH);
    parts.push(normalizedCause);
  }

  return parts.join("|");
};

// ==================== Content Building ====================

/**
 * Builds the title for an analysis lesson document.
 */
const buildLessonTitle = (failure: AnalyzedFailure, repository: string): string => {
  const checkName = failure.checkName ?? "CI Check";
  const maxCauseLength = ANALYSIS_LESSON_CONFIG.MAX_CAUSE_PREVIEW_LENGTH;

  // Use identified cause if available
  if (failure.identifiedCause) {
    const causePreview = failure.identifiedCause.substring(0, maxCauseLength);
    return `${checkName}: ${causePreview}${failure.identifiedCause.length > maxCauseLength ? "..." : ""}`;
  }

  // Use first annotation
  if (failure.annotations.length > 0) {
    const firstAnnotation = failure.annotations[0];
    return `${checkName}: ${firstAnnotation.path}`;
  }

  return `${checkName} failure in ${repository}`;
};

/**
 * Builds the test failures section from analyzed failure.
 */
const buildTestFailuresSection = (failure: AnalyzedFailure): string | null => {
  if (!failure.testFailures || failure.testFailures.length === 0) {
    return null;
  }
  const entries = failure.testFailures
    .slice(0, ANALYSIS_LESSON_CONFIG.MAX_TEST_FAILURES_DISPLAYED)
    .flatMap((testFailure) => {
      const fileInfo = testFailure.file
        ? [`  - File: ${testFailure.file}${testFailure.line ? `:${testFailure.line}` : ""}`]
        : [];
      return [`- **${testFailure.testName}**`, ...fileInfo];
    });
  return `\n## Failed Tests\n${entries.join("\n")}`;
};

/**
 * Builds the annotations section from analyzed failure.
 */
const buildAnnotationsSection = (failure: AnalyzedFailure): string | null => {
  if (failure.annotations.length === 0) {
    return null;
  }
  const entries = failure.annotations
    .slice(0, ANALYSIS_LESSON_CONFIG.MAX_ANNOTATIONS_DISPLAYED)
    .flatMap((annotation) => [
      `- **${annotation.path}:${annotation.line}**`,
      `  ${annotation.message.substring(0, ANALYSIS_LESSON_CONFIG.MAX_ANNOTATION_MESSAGE_LENGTH)}`,
    ]);
  return `\n## Error Locations\n${entries.join("\n")}`;
};

/**
 * Builds the recommended actions section.
 */
const buildActionsSection = (failure: AnalyzedFailure): string | null => {
  if (!failure.recommendedActions || failure.recommendedActions.length === 0) {
    return null;
  }
  const entries = failure.recommendedActions.map(
    (action) => `- **${action.actionType}**: ${action.description}`
  );
  return `\n## Recommended Actions\n${entries.join("\n")}`;
};

/**
 * Builds the context section for the lesson document.
 */
const buildLessonContextSection = (context: AnalysisLessonContext): string => {
  const lines = [
    "\n## Context",
    `- Repository: ${context.repository}`,
    `- Commit: ${context.commitSha}`,
    ...(context.prNumber ? [`- PR: #${context.prNumber}`] : []),
    "- Confirmed helpful by user feedback",
  ];
  return lines.join("\n");
};

/**
 * Builds comprehensive content for the analysis lesson document.
 */
const buildLessonContent = (failure: AnalyzedFailure, context: AnalysisLessonContext): string => {
  const sections = [
    `## Problem\nCheck "${failure.checkName}" failed on commit ${context.commitSha.substring(0, SHORT_COMMIT_SHA_LENGTH)}.`,
    failure.identifiedCause ? `\n## Root Cause\n${failure.identifiedCause}` : null,
    failure.analysis ? `\n## Analysis\n${failure.analysis}` : null,
    buildTestFailuresSection(failure),
    buildAnnotationsSection(failure),
    buildActionsSection(failure),
    buildLessonContextSection(context),
  ].filter((section): section is string => section !== null);

  return sections.join("\n");
};

/**
 * Builds metadata for the analysis lesson document.
 */
const buildLessonMetadata = (
  failure: AnalyzedFailure,
  context: AnalysisLessonContext
): AnalysisLessonMetadata => {
  const content = [
    failure.identifiedCause ?? "",
    failure.analysis ?? "",
    ...failure.annotations.map((annotation) => annotation.message),
  ].join(" ");

  return {
    // Base metadata
    hitCount: 0,
    negativeFeedbackCount: 0,
    repository: context.repository,
    // Analysis-specific metadata
    errorSignature: generateErrorSignature(failure),
    errorType: failure.annotations[0]?.message?.split(":")[0] ?? undefined,
    rootCause: failure.identifiedCause,
    failureCategory: detectFailureCategory(content),
    ciProvider: "github",
    checkName: failure.checkName,
    prNumber: context.prNumber,
    commitSha: context.commitSha,
  };
};

// ==================== Public API ====================

/**
 * Ingests a confirmed helpful analysis as an analysis lesson.
 *
 * This function should be called when a user provides positive feedback
 * on a CI failure analysis. It extracts the key learnings and stores them
 * for future retrieval when similar failures occur.
 *
 * @param context - The analysis context with failure details
 * @returns Ingestion result with statistics
 */
/**
 * Checks if a failure has sufficient content and confidence for a lesson.
 */
const isQualifiedFailure = (failure: AnalyzedFailure): boolean => {
  const hasContent =
    failure.identifiedCause ||
    failure.analysis ||
    (failure.annotations && failure.annotations.length > 0);
  const hasConfidence =
    failure.confidence === undefined ||
    failure.confidence >= ANALYSIS_LESSON_CONFIG.MIN_ANALYSIS_CONFIDENCE;
  return Boolean(hasContent) && hasConfidence;
};

/**
 * Ingests a single primary failure as a lesson document.
 */
const ingestPrimaryFailureLesson = async (
  failure: AnalyzedFailure,
  context: AnalysisLessonContext
): Promise<IngestAnalysisLessonResult> => {
  const { repository, commitSha, tenantId } = context;
  const title = buildLessonTitle(failure, repository);
  const content = buildLessonContent(failure, context);
  const metadata = buildLessonMetadata(failure, context);

  logger.info("Storing analysis lesson", {
    repository,
    commitSha: commitSha.substring(0, SHORT_COMMIT_SHA_LENGTH),
    checkName: failure.checkName,
    title,
    contentLength: content.length,
  });

  const ingestionResult = await ingestKnowledgeDoc({
    docType: KNOWLEDGE_DOC_TYPES.ANALYSIS_LESSON,
    title,
    content,
    tenantId,
    repository,
    sourceUrl: `https://github.com/${repository}/commit/${commitSha}`,
    metadata,
  });

  logger.info("Analysis lesson stored", {
    repository,
    commitSha: commitSha.substring(0, SHORT_COMMIT_SHA_LENGTH),
    chunksCreated: ingestionResult.chunksCreated,
    chunksEmbedded: ingestionResult.chunksEmbedded,
    parentId: ingestionResult.parentId,
  });

  return { success: ingestionResult.success, ingestionResult, lessonsCreated: 1 };
};

export const ingestAnalysisLesson = async (
  context: AnalysisLessonContext
): Promise<IngestAnalysisLessonResult> => {
  const { repository, commitSha, failures } = context;
  const shortSha = commitSha.substring(0, SHORT_COMMIT_SHA_LENGTH);

  logger.info("Starting analysis lesson ingestion", {
    repository,
    commitSha: shortSha,
    failureCount: failures.length,
  });

  const qualifiedFailures = failures.filter(isQualifiedFailure);

  if (qualifiedFailures.length === 0) {
    logger.info("No qualified failures for lesson extraction", {
      repository,
      commitSha: shortSha,
      totalFailures: failures.length,
    });
    return { success: true, ingestionResult: null, lessonsCreated: 0 };
  }

  try {
    return await ingestPrimaryFailureLesson(qualifiedFailures[0], context);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Lesson ingestion failed", {
      repository,
      commitSha: shortSha,
      error: errorMessage,
    });
    return { success: false, ingestionResult: null, lessonsCreated: 0, error: errorMessage };
  }
};

/**
 * Extracts analysis context from aggregated failures.
 * Used to create lesson context from queue payloads.
 */
export const extractAnalysisContext = (
  aggregation: AggregatedFailures,
  confirmedBy?: string
): AnalysisLessonContext => ({
  repository: aggregation.repository.fullName,
  commitSha: aggregation.commitSha,
  failures: aggregation.failures,
  tenantId: undefined, // Set by caller if available
  confirmedBy,
  prNumber: aggregation.prContext?.number,
  installationId: aggregation.installationId,
});

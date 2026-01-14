/**
 * Simplified CI Failure Analysis Handler
 *
 * New streamlined pipeline for CI failure analysis:
 * 1. Fetch logs from GitHub
 * 2. Preprocess (strip ANSI, redact secrets, truncate)
 * 3. Send to LLM with enhanced prompt
 * 4. Format output for GitHub/Slack
 *
 * This replaces the complex 5-phase pipeline with a simpler approach
 * that trusts the LLM to parse and understand raw log content.
 */

import {
  createLogger,
  config,
  resilientPost,
  getErrorMessage,
  preprocessLogsWithMetadata,
  formatGitHubComment,
  formatSlackMessage,
  type LLMAnalysisResult,
  type OutputContext,
  type GitHubCommentOutput,
  type SlackMessageOutput,
} from "@kenchi/shared";
import type { CheckRunWebhook } from "../types/githubTypes.js";
import { fetchWorkflowLogs } from "../services/context/workflowFetcher.js";

const logger = createLogger("github-app");

// ==================== Types ====================

/**
 * Result of simplified CI failure analysis.
 */
export interface SimplifiedAnalysisResult {
  readonly success: boolean;
  readonly analysis?: LLMAnalysisResult;
  readonly githubComment?: GitHubCommentOutput;
  readonly slackMessage?: SlackMessageOutput;
  readonly error?: string;
  readonly metadata?: SimplifiedAnalysisMetadata;
}

/**
 * Metadata about the analysis process.
 */
interface SimplifiedAnalysisMetadata {
  readonly originalLogSize: number;
  readonly processedLogSize: number;
  readonly wasTruncated: boolean;
  readonly secretsRedacted: number;
}

/**
 * API response structure from the analysis service.
 */
interface AnalysisApiResponse {
  readonly analysis?: string;
  readonly identified_cause?: string;
  readonly confidence?: number;
  readonly recommended_actions?: readonly RecommendedActionResponse[];
  readonly full_analysis?: FullAnalysisResponse;
}

/**
 * Recommended action from API response.
 */
interface RecommendedActionResponse {
  readonly actionType?: string;
  readonly description?: string;
  readonly reasoning?: string;
  readonly priority?: string;
}

/**
 * Full analysis from API response.
 */
interface FullAnalysisResponse {
  readonly summary?: string;
  readonly identifiedCause?: string;
  readonly confidence?: string;
  readonly category?: string;
  readonly phase?: string;
  readonly codeAnnotations?: readonly AnalysisAnnotation[];
  readonly nextSteps?: readonly string[];
}

/**
 * Annotation from API response.
 */
interface AnalysisAnnotation {
  readonly path?: string;
  readonly line?: number;
  readonly level?: string;
  readonly message?: string;
  readonly title?: string;
}

// ==================== Converters ====================

/**
 * Map confidence string to numeric score.
 */
const confidenceToScore = (confidence: string | undefined): number => {
  const confidenceScores: Record<string, number> = {
    high: 0.9,
    medium: 0.6,
    low: 0.3,
    unknown: 0.1,
  };
  return confidenceScores[confidence ?? "unknown"] ?? 0.1;
};

/**
 * Convert API response to LLMAnalysisResult type.
 * Uses full_analysis for detailed fields, falls back to top-level fields.
 */
const convertApiResponse = (
  apiResponse: AnalysisApiResponse,
  eventId: string
): LLMAnalysisResult => {
  const fullAnalysis = apiResponse.full_analysis;
  const identifiedCause =
    apiResponse.identified_cause ?? fullAnalysis?.identifiedCause ?? apiResponse.analysis;
  const confidenceLevel = fullAnalysis?.confidence ?? "medium";
  const numericConfidence = apiResponse.confidence ?? confidenceToScore(confidenceLevel);

  return {
    eventId,
    summary: identifiedCause ?? "Unknown failure",
    identifiedCause,
    confidence: confidenceLevel as LLMAnalysisResult["confidence"],
    confidenceScore: numericConfidence,
    category: (fullAnalysis?.category as LLMAnalysisResult["category"]) ?? "unknown",
    phase: (fullAnalysis?.phase as LLMAnalysisResult["phase"]) ?? "unknown",
    codeAnnotations: fullAnalysis?.codeAnnotations?.map((annotation) => ({
      path: annotation.path ?? "",
      line: annotation.line ?? 0,
      level: (annotation.level as "failure" | "warning" | "notice") ?? "failure",
      message: annotation.message ?? "",
      title: annotation.title,
    })),
    nextSteps: fullAnalysis?.nextSteps ?? [],
    recommendedActions: apiResponse.recommended_actions?.map((action) => ({
      actionType: action.actionType ?? "fix",
      description: action.description ?? "",
      reasoning: action.reasoning,
      priority: action.priority as "immediate" | "high" | "medium" | "low" | undefined,
    })),
    analyzedAt: new Date().toISOString(),
  };
};

// ==================== Main Handler ====================

/**
 * Process CI failure with simplified pipeline.
 *
 * @param webhook - The check run webhook payload
 * @returns Analysis result with formatted outputs
 */
export const processSimplifiedAnalysis = async (
  webhook: CheckRunWebhook
): Promise<SimplifiedAnalysisResult> => {
  const { check_run, repository, installation } = webhook;

  const context: OutputContext = {
    repository: repository.full_name,
    commitSha: check_run.head_sha,
    checkName: check_run.name,
    prNumber: check_run.pull_requests[0]?.number,
  };

  const eventId = `${repository.full_name}/${check_run.head_sha}/${check_run.name}`;

  try {
    // Step 1: Fetch raw logs
    logger.info("Simplified analysis: fetching workflow logs", {
      repository: context.repository,
      commitSha: context.commitSha.substring(0, 7),
      checkName: context.checkName,
    });

    if (!installation?.id) {
      return {
        success: false,
        error: "No installation ID available",
      };
    }

    const rawLogs = await fetchWorkflowLogs(
      installation.id,
      repository.owner.login,
      repository.name,
      check_run.head_sha
    );

    if (!rawLogs) {
      logger.warn("Simplified analysis: no workflow logs available", {
        repository: context.repository,
        commitSha: context.commitSha.substring(0, 7),
      });

      return {
        success: false,
        error: "No workflow logs available",
      };
    }

    // Step 2: Preprocess logs (strip ANSI, redact secrets, truncate)
    const preprocessed = preprocessLogsWithMetadata(rawLogs);

    logger.info("Simplified analysis: logs preprocessed", {
      repository: context.repository,
      originalSize: preprocessed.originalSize,
      processedSize: preprocessed.processedSize,
      wasTruncated: preprocessed.wasTruncated,
      secretsRedacted: preprocessed.secretsRedacted,
    });

    // Step 3: Send to LLM
    const apiUrl = `${config.API_URL}/api/analyze`;

    logger.info("Simplified analysis: sending to LLM", {
      repository: context.repository,
      apiUrl,
      logSize: preprocessed.processedSize,
    });

    const response = await resilientPost<AnalysisApiResponse>(apiUrl, {
      failure_log: preprocessed.logs,
      repository: context.repository,
    });

    const apiResponse = response.data;

    // Step 4: Convert and format outputs
    const analysis = convertApiResponse(apiResponse, eventId);
    const githubComment = formatGitHubComment(analysis, context);
    const slackMessage = formatSlackMessage(analysis, context);

    logger.info("Simplified analysis: complete", {
      repository: context.repository,
      confidence: analysis.confidence,
      category: analysis.category,
      phase: analysis.phase,
      annotationCount: analysis.codeAnnotations?.length ?? 0,
    });

    return {
      success: true,
      analysis,
      githubComment,
      slackMessage,
      metadata: {
        originalLogSize: preprocessed.originalSize,
        processedLogSize: preprocessed.processedSize,
        wasTruncated: preprocessed.wasTruncated,
        secretsRedacted: preprocessed.secretsRedacted,
      },
    };
  } catch (error) {
    logger.error("Simplified analysis: failed", {
      error: getErrorMessage(error),
      repository: context.repository,
      commitSha: context.commitSha.substring(0, 7),
    });

    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
};

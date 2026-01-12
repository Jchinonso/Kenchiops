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
  readonly root_cause?: string;
  readonly confidence?: string;
  readonly category?: string;
  readonly phase?: string;
  readonly annotations?: readonly AnalysisAnnotation[];
  readonly next_steps?: readonly string[];
  readonly secondary_findings?: readonly SecondaryFinding[];
}

/**
 * Annotation from API response.
 */
interface AnalysisAnnotation {
  readonly evidence_id?: string;
  readonly snippet?: string;
  readonly explanation?: string;
}

/**
 * Secondary finding from API response.
 */
interface SecondaryFinding {
  readonly issue?: string;
  readonly evidence_id?: string;
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
 */
const convertApiResponse = (
  apiResponse: AnalysisApiResponse,
  eventId: string
): LLMAnalysisResult => ({
  eventId,
  summary: apiResponse.root_cause ?? "Unknown failure",
  identifiedCause: apiResponse.root_cause,
  confidence: (apiResponse.confidence as LLMAnalysisResult["confidence"]) ?? "low",
  confidenceScore: confidenceToScore(apiResponse.confidence),
  category: (apiResponse.category as LLMAnalysisResult["category"]) ?? "unknown",
  phase: (apiResponse.phase as LLMAnalysisResult["phase"]) ?? "unknown",
  codeAnnotations: apiResponse.annotations?.map((annotation) => ({
    path: "",
    line: 0,
    level: "failure" as const,
    message: annotation.explanation ?? "",
    title: annotation.snippet,
  })),
  nextSteps: apiResponse.next_steps ? [...apiResponse.next_steps] : [],
  analyzedAt: new Date().toISOString(),
});

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

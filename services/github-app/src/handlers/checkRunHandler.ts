/**
 * Check Run Handler
 *
 * Handles GitHub check run webhook events (CI failures)
 * Gathers enriched context and processes failures through API and Slack
 *
 * Flow: GitHub → GitHub App (enrich context) → API (OpenAI) → Slack
 */

import { createLogger, ExternalServiceError } from "@kenchi/shared";
import type { CheckRunWebhook } from "../types/githubTypes.js";
import { GITHUB_CHECK_ACTIONS, GITHUB_CHECK_CONCLUSIONS } from "../types/githubTypes.js";
import {
  gatherEnrichedContext,
  fetchPRsByCommit,
  type EnrichedContext,
} from "../services/context/index.js";
import { buildEnrichedLogContent } from "../formatters/checkRunFormatter.js";
import {
  postPRComment,
  createCheckRunWithAnnotations,
  type CheckAnnotation,
} from "../services/githubService.js";

/**
 * Service URLs for CI failure processing
 */
const API_URL = process.env.API_URL || "http://api:3000/api/analyze";
const SLACK_URL = process.env.SLACK_URL || "http://slack-bot:3001/slack/message";

const logger = createLogger("github-app");

/**
 * Result of handling a check run webhook
 */
export interface CheckRunHandlerResult {
  readonly handled: boolean;
  readonly message: string;
  readonly eventId?: string;
}

/**
 * Context metadata for debugging and tracking
 */
interface ContextMetadata {
  readonly hasWorkflowLogs: boolean;
  readonly hasPRDiff: boolean;
  readonly hasCommitInfo: boolean;
  readonly hasPRMetadata: boolean;
  readonly annotationsCount: number;
  readonly testFailuresCount: number;
  readonly sourceFilesCount: number;
}

/**
 * Build context metadata from enriched context
 */
const buildContextMetadata = (context: EnrichedContext): ContextMetadata => ({
  hasWorkflowLogs: !!context.workflowLogs,
  hasPRDiff: !!context.prDiff,
  hasCommitInfo: !!context.commitInfo,
  hasPRMetadata: !!context.prMetadata,
  annotationsCount: context.annotations.length,
  testFailuresCount: context.testFailures.length,
  sourceFilesCount: context.sourceFiles.length,
});

/**
 * Format duration in milliseconds to human-readable string
 */
const formatDuration = (ms: number | undefined): string => {
  if (!ms) return "";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
};

/**
 * AI-generated code annotation from analysis
 */
interface AICodeAnnotation {
  readonly path: string;
  readonly line: number;
  readonly level: "failure" | "warning" | "notice";
  readonly message: string;
  readonly title?: string;
}

/**
 * Full LLM analysis result (subset of fields we use)
 */
interface FullAnalysisResult {
  readonly codeAnnotations?: readonly AICodeAnnotation[];
}

/**
 * API analysis response type
 */
interface ApiAnalysis {
  repository?: string;
  confidence?: number;
  analysis?: string;
  identified_cause?: string;
  recommended_actions?: Array<{ description: string; priority: string | number }>;
  full_analysis?: FullAnalysisResult;
}

/**
 * Priority emoji lookup table
 */
const PRIORITY_EMOJI: Record<string, string> = {
  immediate: "🔴",
  high: "🔴",
  medium: "🟡",
  low: "🟢",
};

/**
 * Get priority emoji from priority value
 */
const getPriorityEmoji = (priority: string | number): string => {
  if (typeof priority === "number") {
    return priority <= 1 ? "🔴" : priority <= 2 ? "🟡" : "🟢";
  }
  return PRIORITY_EMOJI[priority.toLowerCase()] ?? "⚪";
};

/**
 * Format GitHub annotation as markdown line
 */
const formatGitHubAnnotationLine = (annotation: EnrichedContext["annotations"][0]): string => {
  const levelIcon = annotation.level === "failure" ? "❌" : "⚠️";
  return `- ${levelIcon} \`${annotation.path}:${annotation.startLine}\` - ${annotation.message}`;
};

/**
 * Format AI-generated annotation as markdown line
 */
const formatAIAnnotationLine = (annotation: AICodeAnnotation): string => {
  const levelIcon = annotation.level === "failure" ? "❌" : annotation.level === "warning" ? "⚠️" : "ℹ️";
  const title = annotation.title ? `**${annotation.title}**: ` : "";
  return `- ${levelIcon} \`${annotation.path}:${annotation.line}\` - ${title}${annotation.message}`;
};

/**
 * Format recommended action as markdown line
 */
const formatActionLine = (action: { description: string; priority: string | number }, index: number): string => {
  const emoji = getPriorityEmoji(action.priority);
  return `${index + 1}. ${emoji} ${action.description}`;
};

/**
 * Build affected locations section using AI annotations or GitHub annotations
 */
const buildAffectedLocationsSection = (
  aiAnnotations: readonly AICodeAnnotation[] | undefined,
  githubAnnotations: EnrichedContext["annotations"]
): string[] => {
  // Prefer AI-generated annotations when available
  const hasAIAnnotations = aiAnnotations && aiAnnotations.length > 0;
  const hasGitHubAnnotations = githubAnnotations.length > 0;

  if (!hasAIAnnotations && !hasGitHubAnnotations) {
    return [];
  }

  const lines: string[] = ["### 📍 Affected Locations"];

  if (hasAIAnnotations) {
    // Use AI-generated annotations (dynamically identified by LLM)
    const displayAnnotations = aiAnnotations.slice(0, 15);
    lines.push(...displayAnnotations.map(formatAIAnnotationLine));

    if (aiAnnotations.length > 15) {
      lines.push(`- ... and ${aiAnnotations.length - 15} more locations`);
    }
  } else {
    // Fallback to GitHub annotations
    const displayAnnotations = githubAnnotations.slice(0, 10);
    lines.push(...displayAnnotations.map(formatGitHubAnnotationLine));

    if (githubAnnotations.length > 10) {
      lines.push(`- ... and ${githubAnnotations.length - 10} more locations`);
    }
  }

  lines.push("");
  return lines;
};

/**
 * Build PR comment body from analysis
 */
const buildPRCommentBody = (
  analysis: ApiAnalysis,
  checkName: string,
  context: EnrichedContext
): string => {
  const headerLines = [
    "## 🤖 KenchiOps CI Failure Analysis",
    "",
    `**Check:** \`${checkName}\``,
    `**Confidence:** ${Math.round((analysis.confidence ?? 0.5) * 100)}%`,
    "",
    "### 🔍 Root Cause",
    analysis.identified_cause || analysis.analysis || "Unable to determine root cause.",
    "",
  ];

  // Build affected locations section (prefer AI annotations, fallback to GitHub)
  const annotationLines = buildAffectedLocationsSection(
    analysis.full_analysis?.codeAnnotations,
    context.annotations
  );

  // Build recommended actions section
  const actionLines = (analysis.recommended_actions?.length ?? 0) > 0
    ? [
        "### 🛠️ Recommended Actions",
        ...analysis.recommended_actions!.slice(0, 5).map(formatActionLine),
        "",
      ]
    : [];

  const footerLines = [
    "---",
    "*Generated by KenchiOps DevOps Assistant*",
  ];

  return [...headerLines, ...annotationLines, ...actionLines, ...footerLines].join("\n");
};

/**
 * Convert AI annotation level to GitHub annotation level
 */
const mapAILevelToGitHub = (level: AICodeAnnotation["level"]): "failure" | "warning" | "notice" => {
  const levelMap: Record<AICodeAnnotation["level"], "failure" | "warning" | "notice"> = {
    failure: "failure",
    warning: "warning",
    notice: "notice",
  };
  return levelMap[level];
};

/**
 * Build check annotations from AI annotations or GitHub annotations
 */
const buildCheckAnnotations = (
  aiAnnotations: readonly AICodeAnnotation[] | undefined,
  githubAnnotations: EnrichedContext["annotations"]
): CheckAnnotation[] => {
  // Prefer AI-generated annotations when available
  if (aiAnnotations && aiAnnotations.length > 0) {
    return aiAnnotations.slice(0, 50).map((annotation) => ({
      path: annotation.path,
      start_line: annotation.line,
      end_line: annotation.line,
      annotation_level: mapAILevelToGitHub(annotation.level),
      message: annotation.message,
      title: annotation.title ?? "CI Issue",
    }));
  }

  // Fallback to GitHub annotations
  return githubAnnotations.slice(0, 50).map((annotation) => ({
    path: annotation.path,
    start_line: annotation.startLine,
    end_line: annotation.endLine,
    annotation_level: annotation.level === "failure" ? "failure" : "warning",
    message: annotation.message,
    title: annotation.title ?? "CI Issue",
  }));
};

/**
 * Post comment to a single PR with error handling
 */
const postCommentToPR = async (
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  commentBody: string,
  repositoryFullName: string
): Promise<void> => {
  try {
    await postPRComment(installationId, owner, repo, prNumber, commentBody);
    logger.info("Posted analysis comment to PR", {
      repository: repositoryFullName,
      prNumber,
    });
  } catch (error) {
    logger.error("Failed to post PR comment", {
      prNumber,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Post analysis to GitHub (PR comment and check annotations)
 */
const postAnalysisToGitHub = async (
  webhook: CheckRunWebhook,
  analysis: ApiAnalysis,
  context: EnrichedContext,
  pullRequestNumbers: number[]
): Promise<void> => {
  const { check_run, repository, installation } = webhook;

  if (!installation?.id) {
    logger.warn("No installation ID, skipping GitHub posting");
    return;
  }

  const owner = repository.owner.login;
  const repo = repository.name;

  // Post PR comments in parallel
  if (pullRequestNumbers.length > 0) {
    const commentBody = buildPRCommentBody(analysis, check_run.name, context);

    await Promise.all(
      pullRequestNumbers.map((prNumber) =>
        postCommentToPR(installation.id, owner, repo, prNumber, commentBody, repository.full_name)
      )
    );
  }

  // Create check run with annotations if there are affected locations
  // Check both AI-generated annotations and GitHub annotations
  const aiAnnotations = analysis.full_analysis?.codeAnnotations;
  const hasAnnotations = (aiAnnotations && aiAnnotations.length > 0) || context.annotations.length > 0;

  if (hasAnnotations) {
    try {
      const checkAnnotations = buildCheckAnnotations(aiAnnotations, context.annotations);
      const summary = `**Root Cause:** ${analysis.identified_cause || "Analysis in progress"}\n\n` +
        `**Confidence:** ${Math.round((analysis.confidence ?? 0.5) * 100)}%`;

      await createCheckRunWithAnnotations(
        installation.id,
        owner,
        repo,
        check_run.head_sha,
        "KenchiOps Analysis",
        summary,
        checkAnnotations
      );

      const annotationSource = aiAnnotations && aiAnnotations.length > 0 ? "AI" : "GitHub";
      logger.info("Created check run with annotations", {
        repository: repository.full_name,
        annotationCount: checkAnnotations.length,
        source: annotationSource,
      });
    } catch (error) {
      logger.error("Failed to create check annotations", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
};

/**
 * Process CI failure: gather context, analyze with OpenAI, send to Slack
 */
const processCIFailure = async (webhook: CheckRunWebhook): Promise<boolean> => {
  const { check_run, repository, installation } = webhook;

  // Step 1: Gather enriched context from GitHub
  logger.info("Gathering enriched context for CI failure", {
    repository: repository.full_name,
    checkName: check_run.name,
    headSha: check_run.head_sha.substring(0, 7),
  });

  const context = await gatherEnrichedContext(webhook);
  const enrichedLog = buildEnrichedLogContent(webhook, context);
  const contextMetadata = buildContextMetadata(context);

  // Find PRs if not in webhook
  let pullRequestNumbers = check_run.pull_requests.map((pr) => pr.number);
  if (pullRequestNumbers.length === 0 && installation?.id) {
    pullRequestNumbers = await fetchPRsByCommit(
      installation.id,
      repository.owner.login,
      repository.name,
      check_run.head_sha
    );
  }

  logger.info("Context gathered", {
    repository: repository.full_name,
    ...contextMetadata,
    pullRequestCount: pullRequestNumbers.length,
  });

  // Step 2: Call API for OpenAI analysis
  let analysis: ApiAnalysis;
  try {
    const apiResponse = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        failure_log: enrichedLog,
        repository: repository.full_name,
      }),
    });

    if (!apiResponse.ok) {
      throw new ExternalServiceError("API", `Analysis service returned ${apiResponse.status}`);
    }

    analysis = (await apiResponse.json()) as ApiAnalysis;
    const aiAnnotationCount = analysis.full_analysis?.codeAnnotations?.length ?? 0;
    logger.info("Analysis received from API", {
      repository: repository.full_name,
      confidence: analysis.confidence,
      aiAnnotationCount,
      hasAIAnnotations: aiAnnotationCount > 0,
    });
  } catch (error) {
    logger.error("Failed to get analysis from API", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }

  // Step 3: Post analysis to GitHub (PR comment and annotations)
  await postAnalysisToGitHub(webhook, analysis, context, pullRequestNumbers);

  // Step 4: Build enriched analysis for Slack
  // Use AI-generated annotations when available, otherwise use GitHub annotations
  const aiAnnotations = analysis.full_analysis?.codeAnnotations;
  const annotationsForSlack = aiAnnotations && aiAnnotations.length > 0
    ? aiAnnotations.map((ann) => ({
        path: ann.path,
        startLine: ann.line,
        endLine: ann.line,
        level: ann.level,
        message: ann.message,
        title: ann.title,
      }))
    : context.annotations;

  const enrichedAnalysis: Record<string, unknown> = {
    repository: analysis.repository ?? repository.full_name,
    confidence: analysis.confidence ?? 0.5,
    analysis: analysis.analysis ?? "Analysis unavailable",
    identified_cause: analysis.identified_cause ?? "",
    recommended_actions: analysis.recommended_actions ?? [],
    checkName: check_run.name,
    headSha: check_run.head_sha,
    annotations: annotationsForSlack,
    annotationsSource: aiAnnotations && aiAnnotations.length > 0 ? "ai" : "github",
    testFailures: context.testFailures,
    prContext: context.prMetadata && pullRequestNumbers.length > 0
      ? {
          number: pullRequestNumbers[0]!,
          title: context.prMetadata.title ?? "",
          author: context.prMetadata.author ?? "",
          branch: context.prMetadata.headBranch ?? "",
          baseBranch: context.prMetadata.baseBranch ?? "",
          labels: context.prMetadata.labels ?? [],
        }
      : null,
    workflowContext: context.workflowTiming
      ? {
          name: check_run.name,
          duration: formatDuration(context.workflowTiming.durationMs ?? undefined),
        }
      : null,
    dependencyChanges: context.dependencyChanges,
  };

  // Step 4: Send to Slack
  try {
    const slackResponse = await fetch(SLACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        analysis: enrichedAnalysis,
        repository: repository.full_name,
        installation_id: installation?.id ?? null,
      }),
    });

    if (!slackResponse.ok) {
      throw new ExternalServiceError("Slack", `Slack service returned ${slackResponse.status}`);
    }

    logger.info("CI failure notification sent to Slack", {
      repository: repository.full_name,
      checkName: check_run.name,
    });
    return true;
  } catch (error) {
    logger.error("Failed to send to Slack", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
};

/**
 * Handle check run completed with failure
 */
export const handleCheckRunFailure = async (
  webhook: CheckRunWebhook
): Promise<CheckRunHandlerResult> => {
  const { check_run, repository } = webhook;

  logger.warn("CI check failed - processing", {
    name: check_run.name,
    repository: repository.full_name,
    conclusion: check_run.conclusion,
    pullRequests: check_run.pull_requests.length,
  });

  const processed = await processCIFailure(webhook);

  if (processed) {
    return {
      handled: true,
      message: "CI failure analyzed and sent to Slack",
      eventId: `check_${check_run.id}`,
    };
  }

  return {
    handled: false,
    message: "Failed to process CI failure",
  };
};

/**
 * Conclusions that represent actual CI failures
 */
const FAILURE_CONCLUSIONS: ReadonlySet<string> = new Set([
  GITHUB_CHECK_CONCLUSIONS.FAILURE,
  GITHUB_CHECK_CONCLUSIONS.TIMED_OUT,
]);

/**
 * Check if the check run should be processed
 */
const shouldProcessCheckRun = (webhook: CheckRunWebhook): boolean => {
  const { action, check_run } = webhook;

  // Only process completed check runs with failure conclusions
  return (
    action === GITHUB_CHECK_ACTIONS.COMPLETED &&
    FAILURE_CONCLUSIONS.has(check_run.conclusion || "")
  );
};

/**
 * Handle check run webhook
 */
export const handleCheckRun = async (webhook: CheckRunWebhook): Promise<CheckRunHandlerResult> => {
  if (!shouldProcessCheckRun(webhook)) {
    logger.info("Check run event skipped", {
      action: webhook.action,
      conclusion: webhook.check_run.conclusion,
      repository: webhook.repository.full_name,
    });

    return {
      handled: false,
      message: "Check run event skipped (not a failure)",
    };
  }

  return handleCheckRunFailure(webhook);
};

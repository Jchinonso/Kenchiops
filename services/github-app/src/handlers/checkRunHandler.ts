/**
 * Check Run Handler
 *
 * Handles GitHub check run webhook events (CI failures)
 * Gathers enriched context and processes failures through API and Slack
 *
 * Flow: GitHub → GitHub App (enrich context) → API (OpenAI) → Slack
 */

import { createLogger } from "@kenchi/shared";
import type { CheckRunWebhook } from "../types/githubTypes.js";
import { GITHUB_CHECK_ACTIONS, GITHUB_CHECK_CONCLUSIONS } from "../types/githubTypes.js";
import {
  gatherEnrichedContext,
  fetchPRsByCommit,
  type EnrichedContext,
} from "../services/context/index.js";
import { buildEnrichedLogContent } from "../formatters/checkRunFormatter.js";

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
 * API analysis response type
 */
interface ApiAnalysis {
  repository?: string;
  confidence?: number;
  analysis?: string;
  identified_cause?: string;
  recommended_actions?: Array<{ description: string; priority: string | number }>;
}

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
      throw new Error(`API returned ${apiResponse.status}`);
    }

    analysis = (await apiResponse.json()) as ApiAnalysis;
    logger.info("Analysis received from API", {
      repository: repository.full_name,
      confidence: analysis.confidence,
    });
  } catch (error) {
    logger.error("Failed to get analysis from API", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }

  // Step 3: Build enriched analysis for Slack
  const enrichedAnalysis = {
    repository: analysis.repository ?? repository.full_name,
    confidence: analysis.confidence ?? 0.5,
    analysis: analysis.analysis ?? "Analysis unavailable",
    identified_cause: analysis.identified_cause ?? "",
    recommended_actions: analysis.recommended_actions ?? [],
    checkName: check_run.name,
    headSha: check_run.head_sha,
    annotations: context.annotations,
    testFailures: context.testFailures,
    prContext: context.prMetadata
      ? {
          number: check_run.pull_requests[0]?.number || 0,
          title: context.prMetadata.title || "",
          author: context.prMetadata.author || "",
          branch: context.prMetadata.headBranch || "",
          baseBranch: context.prMetadata.baseBranch || "",
          labels: context.prMetadata.labels || [],
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
      throw new Error(`Slack returned ${slackResponse.status}`);
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

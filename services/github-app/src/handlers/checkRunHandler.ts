/**
 * Check Run Handler
 *
 * Handles GitHub check run webhook events (CI failures)
 * Gathers enriched context (logs, diff, source files) and forwards to n8n
 *
 * Flow: GitHub → GitHub App (enrich context) → n8n → API (OpenAI) → Slack + GitHub
 */

import { createLogger } from "@kenchi/shared";
import type { CheckRunWebhook } from "../types/githubTypes.js";
import { GITHUB_CHECK_ACTIONS, GITHUB_CHECK_CONCLUSIONS } from "../types/githubTypes.js";
import { gatherEnrichedContext, fetchPRsByCommit, type EnrichedContext } from "../services/context/index.js";
import { buildEnrichedLogContent } from "../formatters/checkRunFormatter.js";

/**
 * Context metadata for debugging and tracking
 */
interface ContextMetadata {
  readonly hasWorkflowLogs: boolean;
  readonly hasPRDiff: boolean;
  readonly hasCommitInfo: boolean;
  readonly hasPRMetadata: boolean;
  readonly hasRepositoryMetadata: boolean;
  readonly hasWorkflowTiming: boolean;
  readonly sourceFilesCount: number;
  readonly annotationsCount: number;
  readonly dependencyChangesCount: number;
  readonly buildConfigChangesCount: number;
  readonly testFailuresCount: number;
  readonly prLabels: readonly string[];
  readonly reviewStatus: string | null;
  readonly isPrivateRepo: boolean | null;
  readonly workflowDurationMs: number | null;
}

/**
 * Build context metadata from enriched context.
 * Extracts boolean flags and counts for debugging and tracking.
 */
const buildContextMetadata = (context: EnrichedContext): ContextMetadata => ({
  hasWorkflowLogs: !!context.workflowLogs,
  hasPRDiff: !!context.prDiff,
  hasCommitInfo: !!context.commitInfo,
  hasPRMetadata: !!context.prMetadata,
  hasRepositoryMetadata: !!context.repositoryMetadata,
  hasWorkflowTiming: !!context.workflowTiming,
  sourceFilesCount: context.sourceFiles.length,
  annotationsCount: context.annotations.length,
  dependencyChangesCount: context.dependencyChanges.length,
  buildConfigChangesCount: context.buildConfigChanges.length,
  testFailuresCount: context.testFailures.length,
  prLabels: context.prMetadata?.labels || [],
  reviewStatus: context.prMetadata?.reviewStatus || null,
  isPrivateRepo: context.repositoryMetadata?.isPrivate || null,
  workflowDurationMs: context.workflowTiming?.durationMs || null,
});

/**
 * n8n webhook URL for CI failure events
 * Uses Docker service name when running in Docker, localhost otherwise
 */
const N8N_WEBHOOK_URL =
  process.env.N8N_WEBHOOK_URL || "http://n8n:5678/webhook/ci-failure";

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
 * Forward CI failure to n8n for orchestration and Slack notification
 * Gathers enriched context before forwarding for better AI analysis
 */
const forwardToN8n = async (webhook: CheckRunWebhook): Promise<boolean> => {
  const { check_run, repository, installation } = webhook;

  // Gather enriched context (logs, diff, source files)
  logger.info("Gathering enriched context for CI failure", {
    repository: repository.full_name,
    checkName: check_run.name,
    headSha: check_run.head_sha,
  });

  const context = await gatherEnrichedContext(webhook);

  // Build enriched log content
  const enrichedLog = buildEnrichedLogContent(webhook, context);

  const contextMetadata = buildContextMetadata(context);

  // Get PR numbers from webhook or find them from commit SHA
  let pullRequestNumbers = check_run.pull_requests.map((pr) => pr.number);

  // If no PRs in webhook, try to find them from the commit SHA
  if (pullRequestNumbers.length === 0 && installation?.id) {
    logger.info("No PRs in webhook, searching by commit SHA", {
      commitSha: check_run.head_sha.substring(0, 7),
    });

    pullRequestNumbers = await fetchPRsByCommit(
      installation.id,
      repository.owner.login,
      repository.name,
      check_run.head_sha
    );

    if (pullRequestNumbers.length > 0) {
      logger.info("Found PRs for commit", {
        commitSha: check_run.head_sha.substring(0, 7),
        prNumbers: pullRequestNumbers,
      });
    }
  }

  // Log context gathering results for debugging
  logger.info("Context gathered for CI failure", {
    repository: repository.full_name,
    hasWorkflowLogs: contextMetadata.hasWorkflowLogs,
    hasPRDiff: contextMetadata.hasPRDiff,
    hasCommitInfo: contextMetadata.hasCommitInfo,
    annotationsCount: contextMetadata.annotationsCount,
    testFailuresCount: contextMetadata.testFailuresCount,
    sourceFilesCount: contextMetadata.sourceFilesCount,
    logContentLength: context.workflowLogs?.length || 0,
    pullRequestCount: pullRequestNumbers.length,
  });

  const payload = {
    log: enrichedLog,
    repository: repository.full_name,
    checkName: check_run.name,
    conclusion: check_run.conclusion,
    headSha: check_run.head_sha,
    pullRequests: pullRequestNumbers,
    contextMetadata,
    // Include actual annotations and test failures for GitHub posting
    annotations: context.annotations,
    testFailures: context.testFailures,
    // Include PR metadata if available
    prMetadata: context.prMetadata,
    // Include workflow timing
    workflowTiming: context.workflowTiming,
    // Include dependency changes
    dependencyChanges: context.dependencyChanges,
  };

  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      logger.info("Forwarded CI failure to n8n with enriched context", {
        repository: repository.full_name,
        checkName: check_run.name,
        contextMetadata: payload.contextMetadata,
      });
      return true;
    } else {
      logger.warn("n8n webhook returned non-OK status", {
        status: response.status,
        statusText: response.statusText,
      });
      return false;
    }
  } catch (error) {
    logger.warn("Failed to forward to n8n (workflow may not be active)", {
      error: error instanceof Error ? error.message : "Unknown error",
      n8nUrl: N8N_WEBHOOK_URL,
    });
    return false;
  }
};

/**
 * Handle check run completed with failure
 * Forwards to n8n which handles analysis and Slack notification
 */
export const handleCheckRunFailure = async (
  webhook: CheckRunWebhook
): Promise<CheckRunHandlerResult> => {
  const { check_run, repository } = webhook;

  logger.warn("CI check failed - forwarding to n8n", {
    name: check_run.name,
    repository: repository.full_name,
    conclusion: check_run.conclusion,
    pullRequests: check_run.pull_requests.length,
  });

  // Forward to n8n for analysis and Slack notification
  const forwarded = await forwardToN8n(webhook);

  if (forwarded) {
    return {
      handled: true,
      message: "CI failure forwarded to n8n for analysis and Slack notification",
      eventId: `check_${check_run.id}`,
    };
  }

  return {
    handled: false,
    message: "Failed to forward CI failure to n8n",
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

  // Only process completed check runs
  if (action !== GITHUB_CHECK_ACTIONS.COMPLETED) {
    return false;
  }

  // Only process actual failures (failure, timed_out)
  // Skip: success, neutral, cancelled, skipped, action_required
  if (!FAILURE_CONCLUSIONS.has(check_run.conclusion || "")) {
    return false;
  }

  return true;
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

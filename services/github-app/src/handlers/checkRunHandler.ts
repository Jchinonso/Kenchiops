/**
 * Check Run Handler
 *
 * Handles GitHub check run webhook events (CI failures)
 * Forwards events to n8n for orchestration, analysis, and Slack notifications
 *
 * Flow: GitHub → GitHub App → n8n → API (OpenAI) → Slack
 */

import { createLogger } from "@kenchi/shared";
import type { CheckRunWebhook } from "../types/githubTypes.js";
import { GITHUB_CHECK_ACTIONS, GITHUB_CHECK_CONCLUSIONS } from "../types/githubTypes.js";

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
 * n8n will call the API service for OpenAI analysis and post to Slack
 */
const forwardToN8n = async (webhook: CheckRunWebhook): Promise<boolean> => {
  const { check_run, repository } = webhook;

  // Build the log content from check run output
  const logContent = [
    check_run.output.title || "",
    check_run.output.summary || "",
    check_run.output.text || "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const payload = {
    log: logContent || `CI check "${check_run.name}" failed`,
    repository: repository.full_name,
    checkName: check_run.name,
    conclusion: check_run.conclusion,
    headSha: check_run.head_sha,
    pullRequests: check_run.pull_requests.map((pr) => pr.number),
  };

  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      logger.info("Forwarded CI failure to n8n for analysis and Slack notification", {
        repository: repository.full_name,
        checkName: check_run.name,
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
 * Check if the check run should be processed
 */
const shouldProcessCheckRun = (webhook: CheckRunWebhook): boolean => {
  const { action, check_run } = webhook;

  // Only process completed check runs
  if (action !== GITHUB_CHECK_ACTIONS.COMPLETED) {
    return false;
  }

  // Only process failures (not success, cancelled, etc.)
  if (check_run.conclusion === GITHUB_CHECK_CONCLUSIONS.SUCCESS) {
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

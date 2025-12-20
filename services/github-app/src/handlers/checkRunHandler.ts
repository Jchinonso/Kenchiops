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
import { gatherEnrichedContext, type EnrichedContext } from "../services/contextService.js";

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
 * Build enriched log content with all available context
 */
const buildEnrichedLogContent = (
  webhook: CheckRunWebhook,
  context: EnrichedContext
): string => {
  const { check_run } = webhook;
  const sections: string[] = [];

  // Section 1: Check run output
  const checkOutput = [
    check_run.output.title || "",
    check_run.output.summary || "",
    check_run.output.text || "",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (checkOutput) {
    sections.push(`## CI Check Output\n${checkOutput}`);
  }

  // Section 2: Workflow logs (if available)
  if (context.workflowLogs) {
    sections.push(`## Workflow Logs\n${context.workflowLogs}`);
  }

  // Section 3: Commit info
  if (context.commitInfo) {
    sections.push(
      `## Commit Info\n` +
        `SHA: ${context.commitInfo.sha}\n` +
        `Author: ${context.commitInfo.author}\n` +
        `Message: ${context.commitInfo.message}\n` +
        `Changed files:\n${context.commitInfo.changedFiles.map((f) => `  - ${f}`).join("\n")}`
    );
  }

  // Section 4: PR diff (if available)
  if (context.prDiff) {
    sections.push(`## PR Diff\n\`\`\`diff\n${context.prDiff}\n\`\`\``);
  }

  // Section 5: Source files (if available)
  if (context.sourceFiles.length > 0) {
    const filesSection = context.sourceFiles
      .map((file) => {
        const lineInfo =
          file.startLine && file.endLine
            ? ` (lines ${file.startLine}-${file.endLine})`
            : "";
        return `### ${file.path}${lineInfo}\n\`\`\`\n${file.content}\n\`\`\``;
      })
      .join("\n\n");
    sections.push(`## Relevant Source Files\n${filesSection}`);
  }

  return sections.join("\n\n---\n\n") || `CI check "${check_run.name}" failed`;
};

/**
 * Forward CI failure to n8n for orchestration and Slack notification
 * Gathers enriched context before forwarding for better AI analysis
 */
const forwardToN8n = async (webhook: CheckRunWebhook): Promise<boolean> => {
  const { check_run, repository } = webhook;

  // Gather enriched context (logs, diff, source files)
  logger.info("Gathering enriched context for CI failure", {
    repository: repository.full_name,
    checkName: check_run.name,
    headSha: check_run.head_sha,
  });

  const context = await gatherEnrichedContext(webhook);

  // Build enriched log content
  const enrichedLog = buildEnrichedLogContent(webhook, context);

  const payload = {
    log: enrichedLog,
    repository: repository.full_name,
    checkName: check_run.name,
    conclusion: check_run.conclusion,
    headSha: check_run.head_sha,
    pullRequests: check_run.pull_requests.map((pr) => pr.number),
    // Include context metadata for debugging
    contextMetadata: {
      hasWorkflowLogs: !!context.workflowLogs,
      hasPRDiff: !!context.prDiff,
      hasCommitInfo: !!context.commitInfo,
      sourceFilesCount: context.sourceFiles.length,
    },
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

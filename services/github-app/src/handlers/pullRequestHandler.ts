/**
 * Pull Request Handler
 *
 * Handles GitHub pull request webhook events
 */

import {
  createLogger,
  handlePRMergeEvent,
  ingestLinkedCommitKnowledge,
  getErrorMessage,
  findByGitHubInstallation,
  getOrFetchPullRequestDiff,
  getOrFetchPullRequestCommits,
} from "@kenchi/shared";
import { GITHUB_PR_ACTIONS, type PullRequestWebhook } from "../types/githubTypes.js";
import { getOctokit } from "../services/githubService.js";

const logger = createLogger("github-app");

// ==================== Helper Functions ====================

/**
 * Fetches the diff content for a PR with caching.
 */
const fetchPRDiff = async (
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string | null> => {
  try {
    return await getOrFetchPullRequestDiff(owner, repo, prNumber, async () => {
      const octokit = await getOctokit(installationId);
      const response = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
        mediaType: { format: "diff" },
      });
      // Response.data will be the diff string when using diff format
      return response.data as unknown as string;
    });
  } catch (error) {
    logger.warn("Failed to fetch PR diff", {
      owner,
      repo,
      prNumber,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Fetches commit messages for a PR with caching.
 */
const fetchPRCommits = async (
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<readonly string[]> => {
  try {
    return await getOrFetchPullRequestCommits(owner, repo, prNumber, async () => {
      const octokit = await getOctokit(installationId);
      const response = await octokit.rest.pulls.listCommits({
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      });
      return response.data.map((commit) => commit.commit.message);
    });
  } catch (error) {
    logger.warn("Failed to fetch PR commits", {
      owner,
      repo,
      prNumber,
      error: getErrorMessage(error),
    });
    return [];
  }
};

/**
 * Result of handling a PR webhook
 */
export interface PRHandlerResult {
  readonly handled: boolean;
  readonly message: string;
  readonly eventId?: string;
}

/**
 * Handle pull request opened event
 *
 * NOTE: PR opened comments are DISABLED.
 * We only post comments for CI failures (handled by checkRunHandler).
 * This prevents spam when PRs are opened and lets users focus on actual CI issues.
 */
export const handlePullRequestOpened = async (
  webhook: PullRequestWebhook
): Promise<PRHandlerResult> => {
  const { pull_request, repository } = webhook;

  // Just log the PR opened event - don't post a comment
  // CI failure analysis is handled separately by checkRunHandler
  logger.info("PR opened (no comment posted - waiting for CI results)", {
    title: pull_request.title,
    repository: repository.full_name,
    number: pull_request.number,
    author: pull_request.user.login,
  });

  return {
    handled: true,
    message: "PR opened event logged (comment will be posted if CI fails)",
  };
};

/**
 * Handle pull request merged event
 *
 * Ingests the PR diff into RAG for future reference.
 * This enables learning from merged code changes.
 */
export const handlePullRequestMerged = async (
  webhook: PullRequestWebhook
): Promise<PRHandlerResult> => {
  const { pull_request, repository, installation } = webhook;

  logger.info("Processing merged PR for RAG ingestion", {
    title: pull_request.title,
    repository: repository.full_name,
    number: pull_request.number,
    mergeCommitSha: pull_request.merge_commit_sha,
  });

  try {
    // Get tenant for this installation
    const installationId = installation?.id;
    if (!installationId) {
      logger.warn("No installation ID for merged PR, skipping RAG ingestion", {
        repository: repository.full_name,
        prNumber: pull_request.number,
      });
      return {
        handled: true,
        message: "Merged PR logged (no installation ID for RAG)",
      };
    }

    const tenant = await findByGitHubInstallation(installationId);
    if (!tenant) {
      logger.warn("No tenant for installation, skipping RAG ingestion", {
        installationId,
        repository: repository.full_name,
      });
      return {
        handled: true,
        message: "Merged PR logged (no tenant for RAG)",
      };
    }

    // Fetch the PR diff
    const diffContent = await fetchPRDiff(
      installationId,
      repository.owner.login,
      repository.name,
      pull_request.number
    );

    if (!diffContent) {
      logger.warn("Could not fetch diff for merged PR", {
        repository: repository.full_name,
        prNumber: pull_request.number,
      });
      return {
        handled: true,
        message: "Merged PR logged (could not fetch diff)",
      };
    }

    // Extract file paths from diff (simplified - just look for +++ lines)
    const filePaths = diffContent
      .split("\n")
      .filter((line) => line.startsWith("+++ b/"))
      .map((line) => line.slice(6));

    // Ingest into RAG
    const result = await handlePRMergeEvent({
      repository: repository.full_name,
      prNumber: pull_request.number,
      commitSha: pull_request.merge_commit_sha ?? pull_request.head.sha,
      diffContent,
      filePaths,
      tenantId: tenant.id,
    });

    logger.info("Merged PR ingested into RAG", {
      repository: repository.full_name,
      prNumber: pull_request.number,
      chunksCreated: result.chunksCreated,
      success: result.success,
    });

    // Fetch actual commit messages for linked knowledge
    const commitMessages = await fetchPRCommits(
      installationId,
      repository.owner.login,
      repository.name,
      pull_request.number
    );

    // Check for linked commit knowledge (failure context + commit + diff)
    // This creates high-value knowledge when a PR fixes a CI failure
    const linkedResult = await ingestLinkedCommitKnowledge({
      repository: repository.full_name,
      prNumber: pull_request.number,
      prTitle: pull_request.title,
      commitSha: pull_request.merge_commit_sha ?? pull_request.head.sha,
      commitMessages: commitMessages.length > 0 ? commitMessages : [pull_request.title],
      diffSummary: diffContent.substring(0, 2000), // Truncate for summary
      changedFiles: filePaths,
      tenantId: tenant.id,
      author: pull_request.user.login,
    });

    if (!linkedResult.skipped) {
      logger.info("Linked commit knowledge created", {
        repository: repository.full_name,
        prNumber: pull_request.number,
        linkedFailures: linkedResult.linkedFailures,
        chunksCreated: linkedResult.chunksCreated,
      });
    }

    const linkedMessage = linkedResult.skipped
      ? ""
      : `, ${linkedResult.linkedFailures} failure(s) linked`;

    return {
      handled: true,
      message: `Merged PR ingested: ${result.chunksCreated} chunks created${linkedMessage}`,
    };
  } catch (error) {
    logger.error("Failed to process merged PR for RAG", {
      repository: repository.full_name,
      prNumber: pull_request.number,
      error: getErrorMessage(error),
    });

    // Don't fail the webhook - just log and continue
    return {
      handled: true,
      message: "Merged PR logged (RAG ingestion failed)",
    };
  }
};

/**
 * Handle pull request webhook
 */
export const handlePullRequest = async (webhook: PullRequestWebhook): Promise<PRHandlerResult> => {
  const { action, pull_request } = webhook;

  // Handle opened PRs
  if (action === GITHUB_PR_ACTIONS.OPENED) {
    return handlePullRequestOpened(webhook);
  }

  // Handle closed PRs (check if merged)
  if (action === GITHUB_PR_ACTIONS.CLOSED && pull_request.merged) {
    return handlePullRequestMerged(webhook);
  }

  logger.info("PR event not handled", {
    action,
    repository: webhook.repository.full_name,
    prNumber: webhook.pull_request.number,
  });

  return {
    handled: false,
    message: `Event action '${action}' not handled`,
  };
};

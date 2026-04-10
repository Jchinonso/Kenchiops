/**
 * Pull Request Handler
 *
 * Handles GitHub pull request webhook events
 */

import {
  createLogger,
  ingestLinkedCommitKnowledge,
  getPRFailures,
  getErrorMessage,
  findTenantByGitHubInstallation,
  getOrFetchPullRequestDiff,
  getOrFetchPullRequestCommits,
} from "@kenchi/shared";
import { GITHUB_PR_ACTIONS, type PullRequestWebhook } from "../types/githubTypes.js";
import { getOctokit } from "../services/githubService.js";
import type { PRHandlerResult } from "./pullRequestHandlerTypes.js";

export type { PRHandlerResult };

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
 * Ingests knowledge ONLY when the merged PR resolves a previously-recorded
 * CI failure (failure → fix pairing via `ingestLinkedCommitKnowledge`).
 *
 * We intentionally do NOT ingest every merged PR's diff as generic "knowledge" —
 * arbitrary diffs are noise without a causal link to a problem. The knowledge
 * base is curated via the UI for everything else.
 */
export const handlePullRequestMerged = async (
  webhook: PullRequestWebhook
): Promise<PRHandlerResult> => {
  const { pull_request, repository, installation } = webhook;

  logger.info("Processing merged PR for failure→fix knowledge linking", {
    title: pull_request.title,
    repository: repository.full_name,
    number: pull_request.number,
    mergeCommitSha: pull_request.merge_commit_sha,
  });

  try {
    // Get tenant for this installation
    const installationId = installation?.id;
    if (!installationId) {
      logger.warn("No installation ID for merged PR, skipping knowledge linking", {
        repository: repository.full_name,
        prNumber: pull_request.number,
      });
      return {
        handled: true,
        message: "Merged PR logged (no installation ID)",
      };
    }

    const tenant = await findTenantByGitHubInstallation(installationId);
    if (!tenant) {
      logger.warn("No tenant for installation, skipping knowledge linking", {
        installationId,
        repository: repository.full_name,
      });
      return {
        handled: true,
        message: "Merged PR logged (no tenant)",
      };
    }

    // Short-circuit on the cheap check FIRST: does this PR have any tracked CI
    // failures in Redis? If not, there's nothing to link, and we must NOT fetch
    // the diff/commits from GitHub — that would be wasted API quota on every
    // merged PR (the common case).
    const failureContext = await getPRFailures(repository.full_name, pull_request.number);
    if (!failureContext || failureContext.failures.length === 0) {
      logger.info("Merged PR has no tracked CI failures — nothing to link", {
        repository: repository.full_name,
        prNumber: pull_request.number,
      });
      return {
        handled: true,
        message: "Merged PR logged (no linked failures — nothing ingested)",
      };
    }

    // There ARE linked failures. Only NOW do we pay for the GitHub API calls
    // to fetch the diff + commit messages needed to build the failure→fix pair.
    const [diffContent, commitMessages] = await Promise.all([
      fetchPRDiff(installationId, repository.owner.login, repository.name, pull_request.number),
      fetchPRCommits(installationId, repository.owner.login, repository.name, pull_request.number),
    ]);

    if (!diffContent) {
      logger.warn("Could not fetch diff for merged PR with linked failures", {
        repository: repository.full_name,
        prNumber: pull_request.number,
        linkedFailureCount: failureContext.failures.length,
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

    // `ingestLinkedCommitKnowledge` re-reads the failure context internally (it
    // is the authoritative source of truth and also handles clearing the key on
    // success). Our getPRFailures call above is a cheap pre-check — the real
    // ingestion still goes through the canonical path here.
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

    if (linkedResult.skipped) {
      // Rare race: failures were tracked at pre-check time but cleared by
      // another process before ingestion. Log and move on.
      logger.info("Linked failures disappeared between pre-check and ingestion", {
        repository: repository.full_name,
        prNumber: pull_request.number,
      });
      return {
        handled: true,
        message: "Merged PR logged (linked failures cleared mid-flight)",
      };
    }

    logger.info("Linked commit knowledge created", {
      repository: repository.full_name,
      prNumber: pull_request.number,
      linkedFailures: linkedResult.linkedFailures,
      chunksCreated: linkedResult.chunksCreated,
    });

    return {
      handled: true,
      message: `Merged PR linked to ${linkedResult.linkedFailures} failure(s), ${linkedResult.chunksCreated} chunks created`,
    };
  } catch (error) {
    logger.error("Failed to process merged PR for knowledge linking", {
      repository: repository.full_name,
      prNumber: pull_request.number,
      error: getErrorMessage(error),
    });

    // Don't fail the webhook - just log and continue
    return {
      handled: true,
      message: "Merged PR logged (knowledge linking failed)",
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

/**
 * GitHub Comment Functions
 *
 * Comment management and PR interaction functions.
 */

import {
  createLogger,
  ExternalServiceError,
  getErrorMessage,
  wrapError,
  KENCHI_BRANDING,
  GITHUB_PAGINATION,
} from "@kenchi/shared";
import { getOctokit } from "./githubService.js";

const logger = createLogger("github-app");

// ==================== Constants ====================

/** Marker to identify KenchiOps comments (from centralized branding) */
const KENCHIOPS_COMMENT_MARKER = KENCHI_BRANDING.COMMENT_MARKER;

// ==================== Comment Management ====================

/**
 * Delete existing KenchiOps comments on a PR.
 * This keeps the PR clean by removing outdated analysis comments.
 *
 * @returns Number of comments deleted (0 on error - cleanup is best-effort)
 */
export const deleteKenchiOpsComments = async (
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<number> => {
  try {
    const octokit = await getOctokit(installationId);

    logger.info("Checking for old KenchiOps comments to delete", {
      owner,
      repo,
      prNumber,
      marker: KENCHIOPS_COMMENT_MARKER,
    });

    // List all comments on the PR (paginate to handle PRs with >100 comments)
    const comments = await octokit.paginate(octokit.rest.issues.listComments, {
      owner,
      repo,
      issue_number: prNumber,
      per_page: GITHUB_PAGINATION.DEFAULT_PER_PAGE,
    });

    logger.info("Found PR comments", {
      owner,
      repo,
      prNumber,
      totalComments: comments.length,
    });

    // Find KenchiOps comments (look for our marker in the body)
    const kenchiOpsComments = comments.filter((comment) =>
      comment.body?.includes(KENCHIOPS_COMMENT_MARKER)
    );

    // Delete each KenchiOps comment
    await Promise.all(
      kenchiOpsComments.map((comment) =>
        octokit.rest.issues.deleteComment({
          owner,
          repo,
          comment_id: comment.id,
        })
      )
    );

    if (kenchiOpsComments.length > 0) {
      logger.info("Deleted old KenchiOps comments", {
        owner,
        repo,
        prNumber,
        deletedCount: kenchiOpsComments.length,
      });
    }

    return kenchiOpsComments.length;
  } catch (error) {
    logger.warn("Failed to delete old KenchiOps comments (best-effort cleanup)", {
      owner,
      repo,
      prNumber,
      error: getErrorMessage(error),
    });
    return 0;
  }
};

/**
 * Post a comment on a pull request.
 * Optionally deletes existing KenchiOps comments first.
 */
export const postPRComment = async (
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  deleteOldComments = false
): Promise<void> => {
  try {
    const octokit = await getOctokit(installationId);

    // Delete old KenchiOps comments if requested
    if (deleteOldComments) {
      await deleteKenchiOpsComments(installationId, owner, repo, prNumber);
    }

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });

    logger.info("Posted PR comment", {
      owner,
      repo,
      prNumber,
      bodyPreview: body.slice(0, 2000),
    });
  } catch (error) {
    logger.error("Failed to post PR comment", {
      owner,
      repo,
      prNumber,
      error: getErrorMessage(error),
    });

    throw new ExternalServiceError("GitHub", wrapError("Failed to post comment", error), {
      operation: "postPRComment",
      metadata: { owner, repo, prNumber },
    });
  }
};

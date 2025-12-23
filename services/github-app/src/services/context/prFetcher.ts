/**
 * Pull request fetcher utilities.
 *
 * Fetches PR diff, metadata, dependency changes, and build config changes.
 */

import {
  createLogger,
  GITHUB_CONTEXT_LIMITS,
  BUILD_CONFIG_FILES,
  EXCLUDED_PACKAGE_JSON_FIELDS,
  DEPENDENCY_DIFF_PATTERNS,
  LOG_PARSING_LIMITS,
  getErrorMessage,
} from "@kenchi/shared";
import { getOctokit } from "../githubService.js";
import { truncateWithContext } from "./logParser.js";
import type { PRMetadata, DependencyChange, BuildConfigChange } from "./types.js";

const logger = createLogger("github-app");

/**
 * Find PRs associated with a commit SHA.
 *
 * Uses GitHub API to find open pull requests that contain the specified commit.
 *
 * @param installationId - GitHub App installation ID
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param commitSha - The commit SHA to search for
 * @returns Array of PR numbers associated with the commit
 */
export const fetchPRsByCommit = async (
  installationId: number,
  owner: string,
  repo: string,
  commitSha: string
): Promise<number[]> => {
  try {
    const octokit = await getOctokit(installationId);

    // GitHub API: List pull requests associated with a commit
    const { data: prs } = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
      owner,
      repo,
      commit_sha: commitSha,
    });

    // Filter to only open PRs
    const openPRs = prs.filter((pr) => pr.state === "open");

    logger.info("Found PRs for commit", {
      commitSha: commitSha.substring(0, 7),
      totalPRs: prs.length,
      openPRs: openPRs.length,
    });

    return openPRs.map((pr) => pr.number);
  } catch (error) {
    logger.warn("Failed to find PRs for commit", {
      commitSha: commitSha.substring(0, 7),
      error: getErrorMessage(error),
    });
    return [];
  }
};

/**
 * Fetch PR diff.
 *
 * @param installationId - GitHub App installation ID
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @returns PR diff (truncated) or null if unavailable
 */
export const fetchPRDiff = async (
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string | null> => {
  try {
    const octokit = await getOctokit(installationId);

    const { data: diff } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
      mediaType: {
        format: "diff",
      },
    });

    // The diff comes as a string when using mediaType diff format
    const diffContent = typeof diff === "string" ? diff : String(diff);

    logger.info("Fetched PR diff", {
      prNumber,
      diffSize: diffContent.length,
    });

    return truncateWithContext(diffContent, GITHUB_CONTEXT_LIMITS.MAX_DIFF_SIZE);
  } catch (error) {
    logger.warn("Failed to fetch PR diff", {
      prNumber,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Fetch PR metadata including reviews and labels.
 *
 * @param installationId - GitHub App installation ID
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @returns PR metadata or null if unavailable
 */
export const fetchPRMetadata = async (
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PRMetadata | null> => {
  try {
    const octokit = await getOctokit(installationId);

    // Fetch PR details, reviews, and comments in parallel
    const [prResponse, reviewsResponse, commentsResponse] = await Promise.all([
      octokit.rest.pulls.get({ owner, repo, pull_number: prNumber }),
      octokit.rest.pulls.listReviews({ owner, repo, pull_number: prNumber, per_page: 20 }),
      octokit.rest.issues.listComments({ owner, repo, issue_number: prNumber, per_page: 10 }),
    ]);

    const pr = prResponse.data;
    const reviews = reviewsResponse.data;
    const comments = commentsResponse.data;

    // Determine review status
    const hasApproval = reviews.some((r) => r.state === "APPROVED");
    const hasChangesRequested = reviews.some((r) => r.state === "CHANGES_REQUESTED");
    const reviewStatus: PRMetadata["reviewStatus"] = hasChangesRequested
      ? "changes_requested"
      : hasApproval
        ? "approved"
        : reviews.length > 0
          ? "pending"
          : "review_required";

    // Extract unique reviewers
    const reviewers = [...new Set(reviews.map((r) => r.user?.login).filter(Boolean))] as string[];

    // Extract recent comments (for context)
    const recentComments = comments.slice(-5).map((c) => ({
      author: c.user?.login || "unknown",
      body: c.body?.slice(0, 500) || "",
      createdAt: c.created_at,
    }));

    logger.info("Fetched PR metadata", {
      prNumber,
      reviewStatus,
      reviewerCount: reviewers.length,
      labelCount: pr.labels.length,
    });

    return {
      number: pr.number,
      title: pr.title,
      description: pr.body,
      author: pr.user?.login || "unknown",
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      labels: pr.labels.map((l) => (typeof l === "string" ? l : l.name || "")).filter(Boolean),
      isDraft: pr.draft || false,
      reviewStatus,
      reviewers,
      comments: recentComments,
    };
  } catch (error) {
    logger.warn("Failed to fetch PR metadata", {
      prNumber,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Parse dependency changes from PR files.
 *
 * Analyzes package.json changes to detect added, removed, or updated dependencies.
 *
 * @param installationId - GitHub App installation ID
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @returns Array of dependency changes
 */
export const fetchDependencyChanges = async (
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<DependencyChange[]> => {
  try {
    const octokit = await getOctokit(installationId);

    // Get list of files changed in the PR
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });

    // Find package.json changes
    const packageJsonFile = files.find((f) => f.filename === "package.json");
    if (!packageJsonFile || !packageJsonFile.patch) {
      return [];
    }

    const patch = packageJsonFile.patch;

    // Use Map for O(1) lookups when merging added/removed into updates
    const addedDeps = new Map<string, string>();
    const removedDeps = new Map<string, string>();

    // Parse added dependencies (lines starting with +)
    const addedRegex = new RegExp(DEPENDENCY_DIFF_PATTERNS.ADDED.source, "gm");
    let match;
    while ((match = addedRegex.exec(patch)) !== null) {
      const [, name, version] = match;
      if (!name.startsWith("//") && !EXCLUDED_PACKAGE_JSON_FIELDS.has(name)) {
        addedDeps.set(name, version);
      }
    }

    // Parse removed dependencies (lines starting with -)
    const removedRegex = new RegExp(DEPENDENCY_DIFF_PATTERNS.REMOVED.source, "gm");
    while ((match = removedRegex.exec(patch)) !== null) {
      const [, name, version] = match;
      if (!name.startsWith("//") && !EXCLUDED_PACKAGE_JSON_FIELDS.has(name)) {
        removedDeps.set(name, version);
      }
    }

    // Build changes list: merge added + removed into updates
    // Find dependencies that are both added and removed (= updates)
    const updatedDeps = [...addedDeps.entries()]
      .filter(([name]) => removedDeps.has(name))
      .map(([name, newVersion]) => ({
        name,
        type: "updated" as const,
        oldVersion: removedDeps.get(name)!,
        newVersion,
      }));

    // Get names of updated deps to exclude from added/removed
    const updatedNames = new Set(updatedDeps.map((d) => d.name));

    // Remaining added deps (not updated)
    const addedOnly = [...addedDeps.entries()]
      .filter(([name]) => !updatedNames.has(name))
      .map(([name, newVersion]) => ({ name, type: "added" as const, newVersion }));

    // Remaining removed deps (not updated)
    const removedOnly = [...removedDeps.entries()]
      .filter(([name]) => !updatedNames.has(name))
      .map(([name, oldVersion]) => ({ name, type: "removed" as const, oldVersion }));

    const changes: DependencyChange[] = [...updatedDeps, ...addedOnly, ...removedOnly];

    logger.info("Parsed dependency changes", {
      prNumber,
      count: changes.length,
    });

    return changes;
  } catch (error) {
    logger.warn("Failed to fetch dependency changes", {
      prNumber,
      error: getErrorMessage(error),
    });
    return [];
  }
};

/**
 * Fetch build config changes from PR.
 *
 * Detects changes to build configuration files like tsconfig.json,
 * webpack.config.js, etc.
 *
 * @param installationId - GitHub App installation ID
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @returns Array of build config changes
 */
export const fetchBuildConfigChanges = async (
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<BuildConfigChange[]> => {
  try {
    const octokit = await getOctokit(installationId);

    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });

    const buildConfigSet = new Set<string>(BUILD_CONFIG_FILES);

    const changes: BuildConfigChange[] = files
      .filter((file) => {
        const filename = file.filename.split("/").pop() || file.filename;
        return buildConfigSet.has(filename) && file.patch;
      })
      .map((file) => ({
        file: file.filename,
        diff: truncateWithContext(file.patch!, LOG_PARSING_LIMITS.MAX_BUILD_CONFIG_DIFF_SIZE),
      }));

    logger.info("Fetched build config changes", {
      prNumber,
      count: changes.length,
    });

    return changes;
  } catch (error) {
    logger.warn("Failed to fetch build config changes", {
      prNumber,
      error: getErrorMessage(error),
    });
    return [];
  }
};

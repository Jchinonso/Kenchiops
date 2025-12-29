/**
 * Commit and file fetcher utilities.
 *
 * Fetches commit information, source files, and repository metadata.
 */

import { createLogger, GITHUB_CONTEXT_LIMITS, CONTEXT_FETCH_CONFIG } from "@kenchi/shared";
import { getOctokit } from "../githubService.js";
import { truncateWithContext } from "./logParser.js";
import type { CommitInfo, SourceFile, RepositoryMetadata } from "./types.js";

const logger = createLogger("github-app");

/**
 * Fetch a source file from the repository.
 *
 * If a line number is provided, extracts context around that line
 * with line numbers and a marker for the target line.
 *
 * @param installationId - GitHub App installation ID
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param path - File path within the repository
 * @param ref - Git ref (branch, tag, or commit SHA)
 * @param lineNumber - Optional line number to extract context around
 * @returns Source file with content or null if unavailable
 */
export const fetchSourceFile = async (
  installationId: number,
  owner: string,
  repo: string,
  path: string,
  ref: string,
  lineNumber?: number
): Promise<SourceFile | null> => {
  try {
    const octokit = await getOctokit(installationId);

    const { data: fileData } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    // Only handle files, not directories
    if (Array.isArray(fileData) || fileData.type !== "file") {
      return null;
    }

    // Decode base64 content
    const content = Buffer.from(fileData.content, "base64").toString("utf-8");

    // If we have a line number, extract context around it
    if (lineNumber) {
      const lines = content.split("\n");
      const startLine = Math.max(1, lineNumber - CONTEXT_FETCH_CONFIG.CONTEXT_LINES);
      const endLine = Math.min(lines.length, lineNumber + CONTEXT_FETCH_CONFIG.CONTEXT_LINES);
      const relevantLines = lines.slice(startLine - 1, endLine);

      // Add line numbers for context with marker for target line
      const numberedContent = relevantLines
        .map((line, i) => {
          const num = startLine + i;
          const marker = num === lineNumber ? ">>> " : "    ";
          return `${marker}${num}: ${line}`;
        })
        .join("\n");

      return {
        path,
        content: numberedContent,
        startLine,
        endLine,
      };
    }

    // Return full file if no line number, but truncated
    return {
      path,
      content: truncateWithContext(content, GITHUB_CONTEXT_LIMITS.MAX_FILE_SIZE),
    };
  } catch (error) {
    logger.warn("Failed to fetch source file", {
      path,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
};

/**
 * Fetch commit information.
 *
 * @param installationId - GitHub App installation ID
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param sha - Commit SHA
 * @returns Commit information or null if unavailable
 */
export const fetchCommitInfo = async (
  installationId: number,
  owner: string,
  repo: string,
  sha: string
): Promise<CommitInfo | null> => {
  try {
    const octokit = await getOctokit(installationId);

    const { data: commit } = await octokit.rest.repos.getCommit({
      owner,
      repo,
      ref: sha,
    });

    return {
      sha: commit.sha,
      message: commit.commit.message,
      author: commit.commit.author?.name || commit.author?.login || "unknown",
      committer: commit.commit.committer?.name || commit.committer?.login || "unknown",
      timestamp: commit.commit.author?.date || new Date().toISOString(),
      changedFiles: commit.files?.map((f) => f.filename) || [],
    };
  } catch (error) {
    logger.warn("Failed to fetch commit info", {
      sha,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
};

/**
 * Fetch repository metadata.
 *
 * @param installationId - GitHub App installation ID
 * @param owner - Repository owner
 * @param repo - Repository name
 * @returns Repository metadata or null if unavailable
 */
export const fetchRepositoryMetadata = async (
  installationId: number,
  owner: string,
  repo: string
): Promise<RepositoryMetadata | null> => {
  try {
    const octokit = await getOctokit(installationId);

    const { data: repository } = await octokit.rest.repos.get({
      owner,
      repo,
    });

    return {
      id: repository.id,
      name: repository.name,
      fullName: repository.full_name,
      owner: repository.owner.login,
      defaultBranch: repository.default_branch,
      isPrivate: repository.private,
      language: repository.language,
    };
  } catch (error) {
    logger.warn("Failed to fetch repository metadata", {
      owner,
      repo,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
};

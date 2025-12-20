/**
 * Context Service
 *
 * Gathers additional context from GitHub for CI failure analysis.
 * Fetches workflow logs, PR diffs, and relevant source files.
 */

import { createLogger } from "@kenchi/shared";
import { getOctokit } from "./githubService.js";
import type { CheckRunWebhook } from "../types/githubTypes.js";

const logger = createLogger("github-app");

/**
 * Maximum size limits for context data
 */
const CONTEXT_LIMITS = {
  MAX_LOG_SIZE: 50000, // 50KB of logs
  MAX_DIFF_SIZE: 30000, // 30KB of diff
  MAX_FILE_SIZE: 10000, // 10KB per file
  MAX_FILES: 5, // Maximum number of source files to fetch
} as const;

/**
 * Enriched context for AI analysis
 */
export interface EnrichedContext {
  readonly workflowLogs: string | null;
  readonly prDiff: string | null;
  readonly sourceFiles: ReadonlyArray<{
    readonly path: string;
    readonly content: string;
    readonly startLine?: number;
    readonly endLine?: number;
  }>;
  readonly commitInfo: {
    readonly sha: string;
    readonly message: string;
    readonly author: string;
    readonly changedFiles: readonly string[];
  } | null;
}

/**
 * Extract file paths and line numbers from error logs
 * Matches patterns like:
 * - src/utils.ts:42
 * - /path/to/file.js:123:45
 * - at Object.<anonymous> (src/index.ts:10:5)
 * - Error: src/components/App.tsx(15,20)
 */
const extractFileReferences = (
  logs: string
): Array<{ path: string; line?: number }> => {
  const references: Array<{ path: string; line?: number }> = [];
  const seen = new Set<string>();

  // Pattern 1: file.ts:line or file.ts:line:column
  const pattern1 = /(?:^|[\s(])([a-zA-Z0-9_\-./]+\.[a-zA-Z]+):(\d+)(?::\d+)?/gm;

  // Pattern 2: file.ts(line,column)
  const pattern2 = /([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)\((\d+),\d+\)/gm;

  // Pattern 3: at ... (file.ts:line:column)
  const pattern3 = /at\s+.*?\(([a-zA-Z0-9_\-./]+\.[a-zA-Z]+):(\d+):\d+\)/gm;

  const patterns = [pattern1, pattern2, pattern3];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(logs)) !== null) {
      const path = match[1];
      const line = parseInt(match[2], 10);

      // Filter out node_modules, test fixtures, and non-source files
      if (
        !path.includes("node_modules") &&
        !path.includes(".test.") &&
        !path.includes(".spec.") &&
        !path.startsWith("internal/") &&
        !seen.has(path)
      ) {
        seen.add(path);
        references.push({ path, line });
      }
    }
  }

  return references.slice(0, CONTEXT_LIMITS.MAX_FILES);
};

/**
 * Truncate content to a maximum size, preserving context around errors
 */
const truncateWithContext = (content: string, maxSize: number): string => {
  if (content.length <= maxSize) {
    return content;
  }

  // Try to find error-related sections to preserve
  const errorIndicators = ["error", "Error", "ERROR", "failed", "Failed", "FAILED"];
  let bestStart = 0;

  for (const indicator of errorIndicators) {
    const index = content.indexOf(indicator);
    if (index !== -1) {
      // Center the truncation around the error
      bestStart = Math.max(0, index - maxSize / 2);
      break;
    }
  }

  const truncated = content.slice(bestStart, bestStart + maxSize);
  const prefix = bestStart > 0 ? "... [truncated] ...\n" : "";
  const suffix = bestStart + maxSize < content.length ? "\n... [truncated] ..." : "";

  return prefix + truncated + suffix;
};

/**
 * Fetch workflow run logs for a check run
 */
export const fetchWorkflowLogs = async (
  installationId: number,
  owner: string,
  repo: string,
  headSha: string
): Promise<string | null> => {
  try {
    const octokit = await getOctokit(installationId);

    // Find workflow runs for this commit
    const { data: workflowRuns } = await octokit.rest.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      head_sha: headSha,
      per_page: 5,
    });

    if (workflowRuns.workflow_runs.length === 0) {
      logger.info("No workflow runs found for commit", { headSha });
      return null;
    }

    // Get the first (most recent) failed workflow run
    const failedRun = workflowRuns.workflow_runs.find(
      (run) => run.conclusion === "failure"
    ) || workflowRuns.workflow_runs[0];

    // Get jobs for this workflow run
    const { data: jobs } = await octokit.rest.actions.listJobsForWorkflowRun({
      owner,
      repo,
      run_id: failedRun.id,
    });

    // Find failed jobs
    const failedJobs = jobs.jobs.filter((job) => job.conclusion === "failure");
    if (failedJobs.length === 0) {
      logger.info("No failed jobs found in workflow run", { runId: failedRun.id });
      return null;
    }

    // Fetch logs for the first failed job
    const failedJob = failedJobs[0];

    try {
      const { data: logs } = await octokit.rest.actions.downloadJobLogsForWorkflowRun({
        owner,
        repo,
        job_id: failedJob.id,
      });

      const logContent = typeof logs === "string" ? logs : String(logs);
      logger.info("Fetched workflow logs", {
        jobId: failedJob.id,
        logSize: logContent.length,
      });

      return truncateWithContext(logContent, CONTEXT_LIMITS.MAX_LOG_SIZE);
    } catch (logError) {
      // Logs might not be available yet or expired
      logger.warn("Could not fetch job logs", {
        jobId: failedJob.id,
        error: logError instanceof Error ? logError.message : "Unknown error",
      });
      return null;
    }
  } catch (error) {
    logger.warn("Failed to fetch workflow logs", {
      headSha,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
};

/**
 * Fetch PR diff
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

    return truncateWithContext(diffContent, CONTEXT_LIMITS.MAX_DIFF_SIZE);
  } catch (error) {
    logger.warn("Failed to fetch PR diff", {
      prNumber,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
};

/**
 * Fetch a source file from the repository
 */
export const fetchSourceFile = async (
  installationId: number,
  owner: string,
  repo: string,
  path: string,
  ref: string,
  lineNumber?: number
): Promise<{ path: string; content: string; startLine?: number; endLine?: number } | null> => {
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
      const startLine = Math.max(1, lineNumber - 10);
      const endLine = Math.min(lines.length, lineNumber + 10);
      const relevantLines = lines.slice(startLine - 1, endLine);

      // Add line numbers for context
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
      content: truncateWithContext(content, CONTEXT_LIMITS.MAX_FILE_SIZE),
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
 * Fetch commit information
 */
export const fetchCommitInfo = async (
  installationId: number,
  owner: string,
  repo: string,
  sha: string
): Promise<EnrichedContext["commitInfo"]> => {
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
 * Gather all enriched context for a check run
 */
export const gatherEnrichedContext = async (
  webhook: CheckRunWebhook
): Promise<EnrichedContext> => {
  const { check_run, repository, installation } = webhook;
  const installationId = installation?.id;

  if (!installationId) {
    logger.warn("No installation ID in webhook, cannot fetch additional context");
    return {
      workflowLogs: null,
      prDiff: null,
      sourceFiles: [],
      commitInfo: null,
    };
  }

  const owner = repository.owner.login;
  const repo = repository.name;
  const headSha = check_run.head_sha;

  logger.info("Gathering enriched context", {
    repository: repository.full_name,
    headSha,
    prCount: check_run.pull_requests.length,
  });

  // Fetch all context in parallel
  const [workflowLogs, commitInfo, prDiff] = await Promise.all([
    fetchWorkflowLogs(installationId, owner, repo, headSha),
    fetchCommitInfo(installationId, owner, repo, headSha),
    check_run.pull_requests.length > 0
      ? fetchPRDiff(installationId, owner, repo, check_run.pull_requests[0].number)
      : Promise.resolve(null),
  ]);

  // Extract file references from logs and check output
  const allLogs = [
    workflowLogs || "",
    check_run.output.title || "",
    check_run.output.summary || "",
    check_run.output.text || "",
  ].join("\n");

  const fileReferences = extractFileReferences(allLogs);

  // Fetch source files in parallel
  const sourceFilePromises = fileReferences.map((ref) =>
    fetchSourceFile(installationId, owner, repo, ref.path, headSha, ref.line)
  );

  const sourceFilesResults = await Promise.all(sourceFilePromises);
  const sourceFiles = sourceFilesResults.filter(
    (f): f is NonNullable<typeof f> => f !== null
  );

  logger.info("Enriched context gathered", {
    hasLogs: !!workflowLogs,
    hasDiff: !!prDiff,
    hasCommitInfo: !!commitInfo,
    sourceFilesCount: sourceFiles.length,
  });

  return {
    workflowLogs,
    prDiff,
    sourceFiles,
    commitInfo,
  };
};

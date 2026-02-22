/**
 * GitLab Projects Adapter
 *
 * Fetches projects from the GitLab API using a user's OAuth access token.
 * Supports both GitLab.com and self-hosted instances.
 * Vendor response types are mapped to Kenchi domain types before
 * crossing the port boundary.
 *
 * @module adapters/gitlabProjectsAdapter
 */

import {
  createLogger,
  ExternalServiceError,
  redactSecrets,
  type RequestContext,
} from "@kenchi/shared";
import type { GitLabProjectsPort, GitLabProject } from "../ports/gitlabProjectsPort.js";

// ==================== Constants ====================

const GITLAB_TIMEOUT_MS = 10_000;
const GITLAB_DEFAULT_BASE_URL = "https://gitlab.com";

const logger = createLogger("gitlab-projects-adapter");

// ==================== Vendor Response Types ====================

/** Raw project entry from GitLab's /api/v4/projects endpoint. */
interface GitLabApiProject {
  readonly id: number;
  readonly name: string;
  readonly path_with_namespace: string;
  readonly web_url: string;
  readonly default_branch: string | null;
  readonly visibility: string;
  readonly last_activity_at: string;
}

// ==================== Internal Helpers ====================

/**
 * Classifies whether a fetch error is retryable based on status code.
 * Network errors (no status) are treated as retryable.
 */
const isRetryableStatus = (status: number | undefined): boolean =>
  status === undefined || status >= 500 || status === 429;

/** Maps a raw GitLab API project to the Kenchi domain type. */
const mapApiProject = (project: GitLabApiProject): GitLabProject => ({
  id: project.id,
  name: project.name,
  fullPath: project.path_with_namespace,
  webUrl: project.web_url,
  defaultBranch: project.default_branch,
  visibility: project.visibility,
  lastActivity: project.last_activity_at,
});

/** Resolves the base URL for GitLab API calls. */
const resolveBaseUrl = (baseUrl: string | null): string => baseUrl ?? GITLAB_DEFAULT_BASE_URL;

// ==================== Port Implementation ====================

const getProjects = async (
  accessToken: string,
  baseUrl: string | null,
  context: RequestContext
): Promise<readonly GitLabProject[]> => {
  const resolvedBaseUrl = resolveBaseUrl(baseUrl);
  const url = `${resolvedBaseUrl}/api/v4/projects?membership=true&min_access_level=30&per_page=100&order_by=last_activity_at&sort=desc`;
  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(GITLAB_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      throw new ExternalServiceError(
        "gitlab",
        `GitLab projects fetch failed with status ${String(response.status)}`,
        {
          metadata: {
            operation: "getProjects",
            statusCode: response.status,
            durationMs,
          },
          retryable: isRetryableStatus(response.status),
        }
      );
    }

    const data = (await response.json()) as readonly GitLabApiProject[];

    logger.info("GitLab projects fetched", {
      provider: "gitlab",
      operation: "getProjects",
      durationMs,
      statusCode: response.status,
      projectCount: data.length,
      ...context,
    });

    return data.map(mapApiProject);
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;

    logger.error("GitLab projects fetch failed", {
      provider: "gitlab",
      operation: "getProjects",
      durationMs,
      error: redactSecrets(error instanceof Error ? error.message : String(error)),
      ...context,
    });

    throw new ExternalServiceError("gitlab", "Failed to fetch projects from GitLab", {
      metadata: { operation: "getProjects", durationMs },
      retryable: true,
    });
  }
};

// ==================== Export ====================

/** Creates a GitLab projects adapter implementing the GitLabProjectsPort. */
export const createGitLabProjectsAdapter = (): GitLabProjectsPort => ({
  getProjects,
});

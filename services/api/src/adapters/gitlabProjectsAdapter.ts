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
  getErrorMessage,
  ExternalServiceError,
  resilientGet,
  resilientPost,
  resilientDelete,
  type RequestContext,
} from "@kenchi/shared";
import type {
  GitLabProjectsPort,
  GitLabProject,
  GitLabWebhookResult,
} from "../ports/gitlabProjectsPort.js";

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

/** Raw webhook entry from GitLab's /api/v4/projects/:id/hooks endpoint. */
interface GitLabApiWebhook {
  readonly id: number;
  readonly project_id: number;
  readonly url: string;
}

// ==================== Internal Helpers ====================

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
    const response = await resilientGet<readonly GitLabApiProject[]>(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: GITLAB_TIMEOUT_MS,
    });

    logger.info("GitLab projects fetched", {
      provider: "gitlab",
      operation: "getProjects",
      durationMs: response.duration,
      statusCode: response.status,
      projectCount: response.data.length,
      ...context,
    });

    return response.data.map(mapApiProject);
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;
    logger.error("GitLab projects fetch failed", {
      provider: "gitlab",
      operation: "getProjects",
      durationMs,
      error: getErrorMessage(error),
      ...context,
    });

    throw new ExternalServiceError(
      "gitlab",
      `Failed to fetch projects: ${getErrorMessage(error)}`,
      { retryable: true }
    );
  }
};

const createProjectWebhook = async (
  accessToken: string,
  baseUrl: string | null,
  projectId: number,
  webhookUrl: string,
  webhookSecret: string,
  context: RequestContext
): Promise<GitLabWebhookResult> => {
  const resolvedBaseUrl = resolveBaseUrl(baseUrl);
  const url = `${resolvedBaseUrl}/api/v4/projects/${String(projectId)}/hooks`;
  const startTime = Date.now();

  try {
    const response = await resilientPost<GitLabApiWebhook>(
      url,
      {
        url: webhookUrl,
        token: webhookSecret,
        job_events: true,
        pipeline_events: true,
        push_events: false,
        enable_ssl_verification: true,
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: GITLAB_TIMEOUT_MS,
      }
    );

    logger.info("GitLab webhook created", {
      provider: "gitlab",
      operation: "createProjectWebhook",
      durationMs: response.duration,
      statusCode: response.status,
      projectId,
      webhookId: response.data.id,
      ...context,
    });

    return {
      id: response.data.id,
      projectId: response.data.project_id,
      url: response.data.url,
    };
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;
    logger.error("GitLab webhook creation failed", {
      provider: "gitlab",
      operation: "createProjectWebhook",
      durationMs,
      projectId,
      error: getErrorMessage(error),
      ...context,
    });

    throw new ExternalServiceError(
      "gitlab",
      `Failed to create webhook: ${getErrorMessage(error)}`,
      { retryable: true }
    );
  }
};

const deleteProjectWebhook = async (
  accessToken: string,
  baseUrl: string | null,
  projectId: number,
  webhookId: number,
  context: RequestContext
): Promise<void> => {
  const resolvedBaseUrl = resolveBaseUrl(baseUrl);
  const url = `${resolvedBaseUrl}/api/v4/projects/${String(projectId)}/hooks/${String(webhookId)}`;
  const startTime = Date.now();

  try {
    const response = await resilientDelete<unknown>(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: GITLAB_TIMEOUT_MS,
    });

    logger.info("GitLab webhook deleted", {
      provider: "gitlab",
      operation: "deleteProjectWebhook",
      durationMs: response.duration,
      statusCode: response.status,
      projectId,
      webhookId,
      ...context,
    });
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;
    logger.error("GitLab webhook deletion failed", {
      provider: "gitlab",
      operation: "deleteProjectWebhook",
      durationMs,
      projectId,
      webhookId,
      error: getErrorMessage(error),
      ...context,
    });

    throw new ExternalServiceError(
      "gitlab",
      `Failed to delete webhook: ${getErrorMessage(error)}`,
      { retryable: true }
    );
  }
};

// ==================== Export ====================

/** Creates a GitLab projects adapter implementing the GitLabProjectsPort. */
export const createGitLabProjectsAdapter = (): GitLabProjectsPort => ({
  getProjects,
  createProjectWebhook,
  deleteProjectWebhook,
});

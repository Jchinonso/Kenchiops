/**
 * GitHub App Client
 *
 * Client for communicating with the GitHub App service.
 * Used by other services to fetch GitHub data via the GitHub App API.
 *
 * @module integrations/githubAppClient
 */

import { config } from "../core/config.js";
import { createLogger } from "../core/logger.js";
import { ExternalServiceError, getErrorMessage } from "../core/errors.js";
import { resilientGet } from "../http/resilientClient.js";
import { truncateText } from "../formatting/index.js";
import type { RequestContext, GitHubRepository } from "../core/types.js";
import type { RepositoriesResponse } from "./types.js";

const logger = createLogger("github-app-client");

/** Maximum length for error text before truncation. */
const MAX_ERROR_TEXT_LENGTH = 500;

/**
 * Transform API response to GitHubRepository format.
 */
const transformRepository = (
  repo: RepositoriesResponse["repositories"][number]
): GitHubRepository => ({
  id: repo.id,
  fullName: repo.fullName,
  name: repo.name,
  owner: repo.fullName.split("/")[0],
  private: repo.private,
  defaultBranch: repo.defaultBranch,
});

/**
 * Fetch all repositories accessible to a GitHub App installation.
 *
 * @param installationId - The GitHub App installation ID
 * @param context - Request context for tracing
 * @returns Array of repositories accessible to the installation
 * @throws ExternalServiceError if the fetch fails
 */
export const fetchInstallationRepositories = async (
  installationId: number,
  context?: RequestContext
): Promise<readonly GitHubRepository[]> => {
  const url = `${config.GITHUB_APP_URL}/api/github/installations/${installationId}/repositories`;
  const startTime = Date.now();

  try {
    const response = await resilientGet<RepositoriesResponse>(url, {
      headers: { "Content-Type": "application/json" },
      internalAuth: true,
    });
    const durationMs = Date.now() - startTime;

    const repositories = response.data.repositories.map(transformRepository);

    logger.info("GitHub App repositories fetched", {
      provider: "github-app",
      operation: "fetchInstallationRepositories",
      durationMs,
      statusCode: response.status,
      installationId,
      repositoryCount: repositories.length,
      ...context,
    });

    return repositories;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = truncateText(getErrorMessage(error), MAX_ERROR_TEXT_LENGTH);

    logger.error("GitHub App repositories fetch failed", {
      provider: "github-app",
      operation: "fetchInstallationRepositories",
      durationMs,
      installationId,
      error: errorMessage,
      ...context,
    });

    if (error instanceof ExternalServiceError) {
      throw error;
    }

    throw new ExternalServiceError("github-app", errorMessage, {
      operation: "fetchInstallationRepositories",
      metadata: { installationId, durationMs },
    });
  }
};

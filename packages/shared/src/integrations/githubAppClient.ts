/**
 * GitHub App Client
 *
 * Client for communicating with the GitHub App service.
 * Used by other services to fetch GitHub data via the GitHub App API.
 */

import { config } from "../core/config.js";
import { createLogger } from "../core/logger.js";
import { ExternalServiceError, getErrorMessage } from "../core/errors.js";
import type { GitHubRepository } from "../core/types.js";

const logger = createLogger("github-app-client");

/**
 * API response for installation repositories
 */
interface RepositoriesResponse {
  readonly installationId: number;
  readonly repositories: ReadonlyArray<{
    readonly id: number;
    readonly name: string;
    readonly fullName: string;
    readonly private: boolean;
    readonly defaultBranch: string;
  }>;
  readonly total: number;
}

/**
 * Transform API response to GitHubRepository format
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
 * Fetch all repositories accessible to a GitHub App installation
 *
 * @param installationId - The GitHub App installation ID
 * @returns Array of repositories accessible to the installation
 * @throws ExternalServiceError if the request fails
 */
export const fetchInstallationRepositories = async (
  installationId: number
): Promise<GitHubRepository[]> => {
  const url = `${config.GITHUB_APP_URL}/api/installations/${installationId}/repositories`;

  logger.info("Fetching installation repositories", {
    installationId,
    url,
  });

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ExternalServiceError("GitHubApp", `HTTP ${response.status}: ${errorText}`, {
        operation: "fetchInstallationRepositories",
        metadata: { installationId },
      });
    }

    const data = (await response.json()) as RepositoriesResponse;

    const repositories = data.repositories.map(transformRepository);

    logger.info("Fetched installation repositories successfully", {
      installationId,
      repositoryCount: repositories.length,
    });

    return repositories;
  } catch (error) {
    logger.error("Failed to fetch installation repositories", {
      installationId,
      error: getErrorMessage(error),
    });

    throw new ExternalServiceError("GitHubApp", getErrorMessage(error), {
      operation: "fetchInstallationRepositories",
      metadata: { installationId },
    });
  }
};

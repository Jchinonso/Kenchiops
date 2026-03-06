/**
 * GitHub Installation Adapter
 *
 * Authenticates as a GitHub App installation to fetch repository data.
 * Replicates the authentication pattern from the github-app service.
 *
 * @module adapters/githubInstallationAdapter
 */

import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import {
  config,
  createLogger,
  ExternalServiceError,
  getErrorMessage,
  GITHUB_PAGINATION,
  cacheGetOrSet,
  CACHE_TTL,
  githubCacheKeys,
  type RequestContext,
} from "@kenchi/shared";
import type {
  GitHubInstallationPort,
  InstallationRepository,
} from "../ports/githubInstallationPort.js";

const logger = createLogger("github-installation-adapter");

// ==================== Helpers ====================

/** Parse private key -- handle escaped newlines and surrounding quotes. */
const parsePrivateKey = (key: string): string =>
  key.replace(/^["']|["']$/g, "").replace(/\\n/g, "\n");

// ==================== Adapter Factory ====================

/**
 * Creates a GitHub installation adapter that authenticates as a GitHub App
 * and fetches repository data for installations.
 */
export const createGitHubInstallationAdapter = (): GitHubInstallationPort => {
  const octokitCache = new Map<number, Octokit>();

  const getOctokit = (installationId: number): Octokit => {
    const cached = octokitCache.get(installationId);
    if (cached) {
      return cached;
    }

    const octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: config.GITHUB_APP_ID,
        privateKey: parsePrivateKey(config.GITHUB_APP_PRIVATE_KEY),
        installationId,
      },
      request: {
        timeout: 30_000, // 30s — prevents hung connections from blocking workers
      },
    });

    octokitCache.set(installationId, octokit);
    return octokit;
  };

  return {
    getRepositories: async (
      installationId: number,
      context: RequestContext
    ): Promise<readonly InstallationRepository[]> => {
      // Distinct cache key from the github-app service: this adapter caches
      // InstallationRepository (isPrivate), while github-app caches RepositoryInfo (private).
      const cacheKey = githubCacheKeys.installationReposApi(installationId);

      return cacheGetOrSet(
        cacheKey,
        async () => {
          const startTime = Date.now();

          try {
            const octokit = getOctokit(installationId);
            const allRepos: InstallationRepository[] = [];
            // let: page counter for paginated API traversal
            let page = 1; // let: incremented in pagination loop

            while (page <= GITHUB_PAGINATION.MAX_REPO_PAGES) {
              const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({
                per_page: GITHUB_PAGINATION.DEFAULT_PER_PAGE,
                page,
              });

              const mapped = data.repositories.map((repo) => ({
                id: repo.id,
                name: repo.name,
                fullName: repo.full_name,
                isPrivate: repo.private,
                defaultBranch: repo.default_branch ?? "main",
              }));

              allRepos.push(...mapped);

              if (
                mapped.length < GITHUB_PAGINATION.DEFAULT_PER_PAGE ||
                allRepos.length >= data.total_count
              ) {
                break;
              }
              page += 1;
            }

            const durationMs = Date.now() - startTime;

            logger.info("GitHub API call completed", {
              provider: "github",
              operation: "listInstallationRepos",
              durationMs,
              statusCode: 200,
              repoCount: allRepos.length,
              pages: page,
              ...context,
            });

            return Object.freeze(allRepos);
          } catch (error) {
            const durationMs = Date.now() - startTime;

            logger.error("GitHub API call failed", {
              provider: "github",
              operation: "listInstallationRepos",
              durationMs,
              installationId,
              error: getErrorMessage(error),
              ...context,
            });

            throw new ExternalServiceError("github", "Failed to list installation repositories", {
              retryable: true,
              metadata: { installationId, operation: "listInstallationRepos" },
            });
          }
        },
        { ttlSeconds: CACHE_TTL.MEDIUM }
      );
    },
  };
};

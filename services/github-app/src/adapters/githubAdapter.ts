/**
 * GitHub Adapter
 *
 * Core GitHub API interaction layer with Octokit client management.
 * Uses caching for Octokit instances per installation.
 *
 * This module contains vendor SDK usage (@octokit/rest, @octokit/auth-app)
 * and lives in the adapters directory per the architectural boundary rules.
 *
 * @module adapters/githubAdapter
 */

import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import {
  createLogger,
  ExternalServiceError,
  getErrorMessage,
  wrapError,
  withCircuitBreaker,
  buildTenantCircuitKey,
  GITHUB_PAGINATION,
} from "@kenchi/shared";
import { appConfig } from "../config/appConfig.js";
import type {
  RepositoryInfo,
  CheckAnnotation,
  CreateCheckRunOptions,
} from "../services/githubServiceTypes.js";

export type { RepositoryInfo, CheckAnnotation, CreateCheckRunOptions };

const logger = createLogger("github-app");

// ==================== Octokit Client Management ====================

/** Cached Octokit instances per installation */
const octokitCache = new Map<number, Octokit>();

/**
 * Get or create an authenticated Octokit instance for an installation.
 */
export const getOctokit = async (installationId: number): Promise<Octokit> => {
  // Check cache first
  const cached = octokitCache.get(installationId);
  if (cached) {
    return cached;
  }

  logger.info("Creating new Octokit instance", { installationId });

  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: appConfig.github.appId,
      privateKey: appConfig.github.privateKey,
      installationId,
    },
  });

  // Cache the instance
  octokitCache.set(installationId, octokit);

  return octokit;
};

// ==================== Helper Functions ====================

/**
 * Split array into batches of specified size.
 */
const batchArray = <T>(array: T[], batchSize: number): T[][] => {
  const batchCount = Math.ceil(array.length / batchSize);
  return Array.from({ length: batchCount }, (_, batchIndex) =>
    array.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize)
  );
};

/**
 * Recursively fetch all repositories using pagination.
 */
const fetchRepositoriesPage = async (
  octokit: Awaited<ReturnType<typeof getOctokit>>,
  page: number,
  perPage: number,
  accumulated: readonly RepositoryInfo[]
): Promise<readonly RepositoryInfo[]> => {
  const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({
    per_page: perPage,
    page,
  });

  const repos = data.repositories.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    private: repo.private,
    defaultBranch: repo.default_branch ?? "main",
  }));

  const allRepos = [...accumulated, ...repos];

  // Base case: no more pages to fetch
  if (repos.length < perPage || allRepos.length >= data.total_count) {
    return allRepos;
  }

  // Recursive case: fetch next page
  return fetchRepositoriesPage(octokit, page + 1, perPage, allRepos);
};

// ==================== Repository Functions ====================

/**
 * Fetch all repositories accessible to a GitHub App installation.
 */
export const getInstallationRepositories = async (
  installationId: number
): Promise<RepositoryInfo[]> => {
  const circuitKey = buildTenantCircuitKey("github", String(installationId));

  try {
    const repositories = await withCircuitBreaker(circuitKey, async () => {
      const octokit = await getOctokit(installationId);

      // Use recursive pagination with default page size
      return fetchRepositoriesPage(octokit, 1, GITHUB_PAGINATION.DEFAULT_PER_PAGE, []);
    });

    logger.info("Fetched installation repositories", {
      installationId,
      repositoryCount: repositories.length,
    });

    return [...repositories];
  } catch (error) {
    logger.error("Failed to fetch installation repositories", {
      installationId,
      error: getErrorMessage(error),
    });

    throw new ExternalServiceError("GitHub", wrapError("Failed to fetch repositories", error), {
      operation: "fetchRepositories",
      metadata: { installationId },
    });
  }
};

// ==================== Check Run Functions ====================

/**
 * Create a check run with annotations.
 * This posts line-level feedback directly on the PR files.
 */
export const createCheckRunWithAnnotations = async (
  options: CreateCheckRunOptions
): Promise<void> => {
  const { installationId, owner, repo, headSha, name, summary, annotations } = options;

  const circuitKey = buildTenantCircuitKey("github", String(installationId));

  try {
    await withCircuitBreaker(circuitKey, async () => {
      const octokit = await getOctokit(installationId);

      // Split annotations into batches (GitHub limits to 50 per API call)
      const annotationBatches = batchArray(
        [...annotations],
        GITHUB_PAGINATION.MAX_ANNOTATIONS_PER_CALL
      );

      // Create the check run with first batch
      const { data: checkRun } = await octokit.rest.checks.create({
        owner,
        repo,
        name,
        head_sha: headSha,
        status: "completed",
        conclusion: annotations.some((annotation) => annotation.annotation_level === "failure")
          ? "failure"
          : "neutral",
        output: {
          title: "KenchiOps CI Analysis",
          summary,
          annotations: annotationBatches[0] || [],
        },
      });

      // Update with remaining batches (if any)
      const remainingBatches = annotationBatches.slice(1);
      await Promise.all(
        remainingBatches.map((batch) =>
          octokit.rest.checks.update({
            owner,
            repo,
            check_run_id: checkRun.id,
            output: {
              title: "KenchiOps CI Analysis",
              summary,
              annotations: batch,
            },
          })
        )
      );

      logger.info("Created check run with annotations", {
        owner,
        repo,
        headSha,
        checkRunId: checkRun.id,
        annotationCount: annotations.length,
      });
    });
  } catch (error) {
    logger.error("Failed to create check run with annotations", {
      owner,
      repo,
      headSha,
      error: getErrorMessage(error),
    });

    throw new ExternalServiceError("GitHub", wrapError("Failed to create check run", error), {
      operation: "createCheckRun",
      metadata: { owner, repo, headSha },
    });
  }
};

/**
 * Health Check Routes
 *
 * Provides comprehensive health and status endpoints for the GitHub App service.
 * Includes liveness, readiness, and detailed component health checks.
 */

import { Router, type Request, type Response } from "express";
import {
  HTTP_STATUS,
  config,
  GITHUB_PAGINATION,
  HEALTH_STATUS,
  performHealthCheck,
  livenessCheck,
  readinessCheck,
  asyncHandler,
  getErrorMessage,
  getMetrics,
  getMetricsContentType,
} from "@kenchi/shared";
import { appConfig } from "../config/appConfig.js";

const router = Router();

/** Health check config for this service */
const healthConfig = {
  serviceName: appConfig.serviceName,
  version: appConfig.version,
  environment: config.NODE_ENV || "development",
  includeDatabase: true,
  includeRedis: true,
  includeCircuitBreakers: true,
} as const;

/**
 * Comprehensive health check endpoint
 * GET /health
 * Returns detailed component health status
 */
router.get(
  "/health",
  asyncHandler(async (_req: Request, res: Response) => {
    const health = await performHealthCheck(healthConfig);
    const statusCode =
      health.status === HEALTH_STATUS.UNHEALTHY ? HTTP_STATUS.SERVICE_UNAVAILABLE : HTTP_STATUS.OK;

    res.status(statusCode).json(health);
  })
);

/**
 * Liveness probe endpoint
 * GET /live
 * Simple check that the process is running (for Kubernetes liveness probes)
 */
router.get("/live", (_req: Request, res: Response) => {
  res.status(HTTP_STATUS.OK).json(livenessCheck());
});

/**
 * Readiness probe endpoint
 * GET /ready
 * Checks if service can accept traffic (for Kubernetes readiness probes)
 */
router.get(
  "/ready",
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await readinessCheck({
      serviceName: healthConfig.serviceName,
      version: healthConfig.version,
      environment: healthConfig.environment,
      includeDatabase: true,
      includeRedis: true,
    });

    const statusCode = result.ready ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
    res.status(statusCode).json(result);
  })
);

/**
 * GitHub App configuration status
 * GET /health/github
 */
router.get("/health/github", (_req: Request, res: Response) => {
  const { privateKey } = appConfig.github;
  const hasValidKey =
    privateKey.startsWith("-----BEGIN RSA PRIVATE KEY-----") &&
    privateKey.endsWith("-----END RSA PRIVATE KEY-----");

  // SECURITY: Only expose boolean configuration status.
  // Never leak key material, length, or previews — even partial PEM data
  // reveals key format and confirms presence to attackers.
  res.status(HTTP_STATUS.OK).json({
    appId: appConfig.github.appId,
    installationId: appConfig.github.installationId || "not configured",
    webhookSecretConfigured: !!appConfig.github.webhookSecret,
    privateKeyConfigured: !!privateKey,
    privateKeyValid: hasValidKey,
  });
});

/**
 * List repositories accessible to the GitHub App installation
 * GET /health/github/repos
 */
router.get("/health/github/repos", async (_req: Request, res: Response) => {
  const { installationId } = appConfig.github;
  if (!installationId) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "No installation ID configured" });
    return;
  }

  try {
    const { getOctokit } = await import("../services/githubService.js");
    const octokit = await getOctokit(installationId);
    const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({
      per_page: GITHUB_PAGINATION.DEFAULT_PER_PAGE,
    });

    res.status(HTTP_STATUS.OK).json({
      totalCount: data.total_count,
      repositories: data.repositories.map((repo) => ({
        fullName: repo.full_name,
        private: repo.private,
        openIssuesCount: repo.open_issues_count,
      })),
    });
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: getErrorMessage(error),
    });
  }
});

/**
 * Prometheus metrics endpoint
 * GET /metrics
 * Returns Prometheus-format metrics for scraping
 */
router.get("/metrics", async (_req: Request, res: Response) => {
  const metrics = await getMetrics();
  res.set("Content-Type", getMetricsContentType());
  res.end(metrics);
});

export { router as healthRoutes };

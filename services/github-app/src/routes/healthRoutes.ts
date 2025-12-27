/**
 * Health Check Routes
 *
 * Provides health and status endpoints for the GitHub App service
 */

import { Router, type Request, type Response } from "express";
import { HTTP_STATUS, config, GITHUB_PAGINATION } from "@kenchi/shared";
import type { HealthResponse } from "../types/githubTypes.js";
import { appConfig } from "../config/appConfig.js";

const router = Router();

/**
 * Health check endpoint with detailed status
 * GET /health
 */
router.get("/health", (_req: Request, res: Response) => {
  const response: HealthResponse = {
    status: "ok",
    service: appConfig.serviceName,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV || "development",
  };

  res.status(HTTP_STATUS.OK).json(response);
});

/**
 * GitHub App configuration status
 * GET /health/github
 */
router.get("/health/github", (_req: Request, res: Response) => {
  const privateKey = appConfig.github.privateKey;
  const hasValidKey =
    privateKey.startsWith("-----BEGIN RSA PRIVATE KEY-----") &&
    privateKey.endsWith("-----END RSA PRIVATE KEY-----");

  res.status(HTTP_STATUS.OK).json({
    appId: appConfig.github.appId,
    installationId: appConfig.github.installationId || "not configured",
    webhookSecretConfigured: !!appConfig.github.webhookSecret,
    privateKeyConfigured: !!privateKey,
    privateKeyValid: hasValidKey,
    privateKeyLength: privateKey.length,
    privateKeyPreview: privateKey.substring(0, 40) + "...",
  });
});

/**
 * List repositories accessible to the GitHub App installation
 * GET /health/github/repos
 */
router.get("/health/github/repos", async (_req: Request, res: Response) => {
  const installationId = appConfig.github.installationId;
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
      error: error instanceof Error ? error.message : "Failed to list repositories",
    });
  }
});

export { router as healthRoutes };

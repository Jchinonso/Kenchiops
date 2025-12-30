/**
 * Health Check Routes
 *
 * Provides comprehensive health and status endpoints for the API service.
 * Includes liveness, readiness, and detailed component health checks.
 */

import { Router, type Request, type Response } from "express";
import {
  HTTP_STATUS,
  config,
  HEALTH_STATUS,
  API_ROUTES,
  performHealthCheck,
  livenessCheck,
  readinessCheck,
  asyncHandler,
} from "@kenchi/shared";
import { appConfig } from "../config/appConfig.js";

const router = Router();

/** Health check config for this service - API service doesn't use database directly */
const healthConfig = {
  serviceName: appConfig.serviceName,
  version: appConfig.version,
  environment: config.NODE_ENV || "development",
  includeDatabase: false,
  includeRedis: true,
  includeCircuitBreakers: true,
} as const;

/**
 * Comprehensive health check endpoint
 * GET /health
 * Returns detailed component health status
 */
router.get(
  API_ROUTES.HEALTH,
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
      includeDatabase: false,
      includeRedis: true,
    });

    const statusCode = result.ready ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
    res.status(statusCode).json(result);
  })
);

export { router as healthRoutes };

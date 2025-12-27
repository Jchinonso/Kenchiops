/**
 * Health Check Routes
 *
 * Provides health and status endpoints for the API service
 */

import { Router, Request, Response } from "express";
import { HTTP_STATUS, config, HEALTH_STATUS, API_ROUTES } from "@kenchi/shared";
import type { HealthResponse } from "../types/apiTypes.js";
import { appConfig } from "../config/appConfig.js";

const router = Router();

/**
 * Health check endpoint with detailed status
 * GET /health
 */
router.get(API_ROUTES.HEALTH, (_req: Request, res: Response) => {
  const response: HealthResponse = {
    status: HEALTH_STATUS.OK,
    service: appConfig.serviceName,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV || "development",
  };

  res.status(HTTP_STATUS.OK).json(response);
});

export { router as healthRoutes };

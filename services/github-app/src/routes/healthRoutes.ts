/**
 * Health Check Routes
 *
 * Provides health and status endpoints for the GitHub App service
 */

import { Router, type Request, type Response } from "express";
import { HTTP_STATUS, config } from "@kenchi/shared";
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

export { router as healthRoutes };

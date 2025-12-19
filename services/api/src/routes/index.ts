/**
 * Route Registration
 *
 * Centralizes all route registration for the API service
 */

import type { Express } from "express";
import { healthRoutes } from "./healthRoutes.js";
import { webhookRoutes } from "./webhookRoutes.js";
import { eventRoutes } from "./eventRoutes.js";
import { analysisRoutes } from "./analysisRoutes.js";

/**
 * Register all routes on the Express app
 */
export const registerRoutes = (app: Express): void => {
  // Health check (no prefix)
  app.use(healthRoutes);

  // Webhook routes
  app.use(webhookRoutes);

  // Event routes
  app.use(eventRoutes);

  // Analysis routes
  app.use(analysisRoutes);
};

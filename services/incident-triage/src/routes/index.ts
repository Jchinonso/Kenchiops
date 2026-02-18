/**
 * Route Registration
 *
 * Centralizes all route registration for the incident triage service.
 */

import type { Express } from "express";
import { healthRoutes } from "./healthRoutes.js";
import { webhookRoutes } from "./webhookRoutes.js";

/**
 * Register all routes on the Express app
 */
export const registerRoutes = (app: Express): void => {
  // Health check (no prefix)
  app.use(healthRoutes);

  // Webhook routes (alert ingestion)
  app.use(webhookRoutes);
};

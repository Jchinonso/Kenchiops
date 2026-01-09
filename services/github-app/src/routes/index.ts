/**
 * Route Registration
 *
 * Centralizes all route registration for the GitHub App service
 */

import type { Express } from "express";
import { healthRoutes } from "./healthRoutes.js";
import { webhookRoutes } from "./webhookRoutes.js";
import { apiRoutes } from "./apiRoutes.js";
import { setupRoutes } from "./setupRoutes.js";
import { feedbackRoutes } from "./feedbackRoutes.js";

/**
 * Register all routes on the Express app
 */
export const registerRoutes = (app: Express): void => {
  // Health check (no prefix)
  app.use(healthRoutes);

  // Webhook routes
  app.use(webhookRoutes);

  // API routes (for GitHub App)
  app.use(apiRoutes);

  // Setup routes (GitHub App post-installation redirect)
  app.use(setupRoutes);

  // Feedback routes (signed URL feedback from PR comments)
  app.use(feedbackRoutes);
};

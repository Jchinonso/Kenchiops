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
import { vercelWebhookRoutes } from "./vercelWebhookRoutes.js";

/** Base path for GitHub API routes */
const GITHUB_API_BASE = "/api/github";

/** Base path for Vercel API routes */
const VERCEL_API_BASE = "/api/vercel";

/**
 * Register all routes on the Express app
 */
export const registerRoutes = (app: Express): void => {
  // Health check (no prefix)
  app.use(healthRoutes);

  // GitHub API routes (webhook, comment, annotations, installations, actions)
  app.use(GITHUB_API_BASE, webhookRoutes);
  app.use(GITHUB_API_BASE, apiRoutes);

  // Vercel API routes (deployment webhooks)
  app.use(VERCEL_API_BASE, vercelWebhookRoutes);

  // Setup routes (GitHub App post-installation redirect)
  app.use(setupRoutes);

  // Feedback routes (signed URL feedback from PR comments)
  app.use(feedbackRoutes);
};

/**
 * Route Registration
 *
 * Centralizes all route registration for the API service
 */

import type { Express } from "express";
import { healthRoutes } from "./healthRoutes.js";
import { authRoutes } from "./authRoutes.js";
import { webhookRoutes } from "./webhookRoutes.js";
import { eventRoutes } from "./eventRoutes.js";
import { analysisRoutes } from "./analysisRoutes.js";
import { ragRoutes } from "./rag/index.js";
import { fineTuningRoutes } from "./fineTuningRoutes.js";
import { riskRulesRoutes } from "./riskRulesRoutes.js";
import { dashboardRoutes } from "./dashboardRoutes.js";
import { sseRoutes } from "./sseRoutes.js";
import { integrationRoutes } from "./integrationRoutes.js";
import { subscriptionRoutes } from "./subscriptionRoutes.js";
import { organizationRoutes } from "./organizationRoutes.js";

/**
 * Register all routes on the Express app
 */
export const registerRoutes = (app: Express): void => {
  // Health check (no prefix)
  app.use(healthRoutes);

  // Auth routes (public — login, callback, refresh, logout)
  app.use(authRoutes);

  // Webhook routes
  app.use(webhookRoutes);

  // Event routes
  app.use(eventRoutes);

  // Analysis routes
  app.use(analysisRoutes);

  // RAG document ingestion routes
  app.use(ragRoutes);

  // Fine-tuning routes
  app.use(fineTuningRoutes);

  // Risk rules routes (custom risk rules management)
  app.use(riskRulesRoutes);

  // Dashboard routes (CI/CD dashboard)
  app.use(dashboardRoutes);

  // SSE routes (real-time dashboard events)
  app.use(sseRoutes);

  // Integration OAuth routes (Vercel, Netlify connections)
  app.use(integrationRoutes);

  // Subscription routes (plan management)
  app.use(subscriptionRoutes);

  // Organization routes (multi-org membership)
  app.use(organizationRoutes);
};

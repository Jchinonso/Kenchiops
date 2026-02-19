/**
 * Route Registration
 *
 * Centralizes all route registration for the incident triage service.
 * Webhook routes receive dependencies from the composition root.
 */

import type { Express } from "express";
import type { TriageContainer } from "../types/containerTypes.js";
import { healthRoutes } from "./healthRoutes.js";
import { createWebhookRoutes } from "./webhookRoutes.js";
import { incidentRoutes } from "./incidentRoutes.js";
import { triageRoutes } from "./triageRoutes.js";

/**
 * Register all routes on the Express app.
 *
 * @param app - Express application
 * @param container - Composition root providing dependencies for routes
 */
export const registerRoutes = (app: Express, container: TriageContainer): void => {
  // Health check (no prefix)
  app.use(healthRoutes);

  // Webhook routes (alert ingestion) — dependencies from container
  app.use(
    createWebhookRoutes({
      queue: container.queue,
      pagerDutyAdapter: container.pagerDutyAdapter,
    })
  );

  // Incident query and management routes
  app.use(incidentRoutes);

  // Triage result and metrics routes
  app.use(triageRoutes);
};

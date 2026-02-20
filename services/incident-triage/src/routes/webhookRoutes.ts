/**
 * Webhook Routes
 *
 * Handles incoming webhook events from monitoring sources.
 * Each route verifies the signature via middleware, then delegates
 * to the shared processWebhookAlert pipeline for idempotency,
 * persistence, and queue enqueueing.
 *
 * Routes are registered with an optional :tenantId path parameter.
 * The tenant-scoped URL is preferred (/webhooks/pagerduty/:tenantId)
 * but the legacy URL (/webhooks/pagerduty) is kept for backwards
 * compatibility (falls back to x-tenant-id header).
 *
 * Dependencies (queue, adapters) are injected from the composition root.
 */

import { Router, type RequestHandler, type Request, type Response } from "express";
import { asyncHandler, GRAFANA_SIGNATURE, invariant, type QueueManager } from "@kenchi/shared";
import type { AlertSourcePort } from "../ports/alertSourcePort.js";
import type { AlertSource } from "../types/incidentTypes.js";
import { verifyPagerDutyWebhook } from "../middleware/verifyPagerDuty.js";
import { verifyVercelWebhook } from "../middleware/verifyVercel.js";
import { verifyNetlifyWebhook } from "../middleware/verifyNetlify.js";
import { createWebhookVerificationMiddleware } from "../middleware/webhookVerification.js";
import { appConfig } from "../config/appConfig.js";
import { processWebhookAlert } from "./processWebhookAlert.js";

/** Shared-secret header used by Datadog and Prometheus */
const SHARED_SECRET_HEADER = "x-kenchi-webhook-secret";

// ==================== Verification Middleware ====================

const verifyDatadogWebhook = createWebhookVerificationMiddleware({
  strategy: "shared-secret",
  provider: "datadog",
  secretHeader: SHARED_SECRET_HEADER,
  secret: appConfig.datadogWebhookSecret,
});

const verifyGrafanaWebhook = createWebhookVerificationMiddleware({
  strategy: "hmac",
  provider: "grafana",
  signatureHeader: GRAFANA_SIGNATURE.HEADER,
  timestampHeader: GRAFANA_SIGNATURE.TIMESTAMP_HEADER,
  algorithm: GRAFANA_SIGNATURE.ALGORITHM,
  secret: appConfig.grafanaWebhookSecret,
});

const verifyPrometheusWebhook = createWebhookVerificationMiddleware({
  strategy: "shared-secret",
  provider: "prometheus",
  secretHeader: SHARED_SECRET_HEADER,
  secret: appConfig.prometheusWebhookSecret,
});

// ==================== Types ====================

/**
 * Dependencies required by webhook routes, provided by the composition root.
 */
interface WebhookRouteDeps {
  readonly queue: QueueManager;
  readonly alertAdapters: Readonly<Partial<Record<AlertSource, AlertSourcePort>>>;
}

/**
 * Configuration for a single webhook route entry.
 */
interface WebhookRouteConfig {
  readonly path: string;
  readonly source: AlertSource;
  readonly middleware: RequestHandler;
}

// ==================== Route Helpers ====================

/**
 * Resolves an adapter from the map or throws an invariant error.
 */
const getAdapter = (
  adapters: Readonly<Partial<Record<AlertSource, AlertSourcePort>>>,
  source: AlertSource
): AlertSourcePort => {
  const adapter = adapters[source];
  invariant(adapter, `No adapter registered for alert source: ${source}`);
  return adapter;
};

// ==================== Route Config ====================

/**
 * Provider configurations for webhook routes.
 * Each entry defines the URL path segment, alert source, and verification middleware.
 */
const WEBHOOK_ROUTE_CONFIGS: readonly WebhookRouteConfig[] = [
  { path: "pagerduty", source: "pagerduty", middleware: verifyPagerDutyWebhook },
  { path: "vercel", source: "vercel", middleware: verifyVercelWebhook },
  { path: "netlify", source: "netlify", middleware: verifyNetlifyWebhook },
  { path: "datadog", source: "datadog", middleware: verifyDatadogWebhook },
  { path: "grafana", source: "grafana", middleware: verifyGrafanaWebhook },
  { path: "prometheus", source: "prometheus", middleware: verifyPrometheusWebhook },
];

// ==================== Route Factory ====================

/**
 * Creates webhook routes with injected dependencies.
 *
 * Registers two routes per provider:
 * - `/webhooks/:provider/:tenantId` — tenant-scoped (preferred)
 * - `/webhooks/:provider` — legacy (uses x-tenant-id header)
 *
 * @param deps - Queue and adapters from the composition root
 * @returns Express Router with webhook routes registered
 */
export const createWebhookRoutes = (deps: WebhookRouteDeps): Router => {
  const router = Router();
  const { queue, alertAdapters } = deps;

  WEBHOOK_ROUTE_CONFIGS.forEach(({ path, source, middleware }) => {
    const handler = asyncHandler(async (req: Request, res: Response) => {
      await processWebhookAlert(req, res, {
        queue,
        adapter: getAdapter(alertAdapters, source),
        provider: source,
      });
    });

    // Tenant-scoped route (preferred — tenantId in URL)
    router.post(`/webhooks/${path}/:tenantId`, middleware, handler);
    // Legacy route (backwards compat — tenantId via x-tenant-id header)
    router.post(`/webhooks/${path}`, middleware, handler);
  });

  return router;
};

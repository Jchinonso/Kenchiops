/**
 * Webhook Routes
 *
 * Handles incoming webhook events from monitoring sources.
 * Each route verifies the signature via middleware, then delegates
 * to the shared processWebhookAlert pipeline for idempotency,
 * persistence, and queue enqueueing.
 *
 * Dependencies (queue, adapters) are injected from the composition root.
 */

import { Router, type Request, type Response } from "express";
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

// ==================== Route Factory ====================

/**
 * Creates webhook routes with injected dependencies.
 *
 * @param deps - Queue and adapters from the composition root
 * @returns Express Router with webhook routes registered
 */
export const createWebhookRoutes = (deps: WebhookRouteDeps): Router => {
  const router = Router();
  const { queue, alertAdapters } = deps;

  // POST /webhooks/pagerduty
  router.post(
    "/webhooks/pagerduty",
    verifyPagerDutyWebhook,
    asyncHandler(async (req: Request, res: Response) => {
      await processWebhookAlert(req, res, {
        queue,
        adapter: getAdapter(alertAdapters, "pagerduty"),
        provider: "pagerduty",
      });
    })
  );

  // POST /webhooks/vercel
  router.post(
    "/webhooks/vercel",
    verifyVercelWebhook,
    asyncHandler(async (req: Request, res: Response) => {
      await processWebhookAlert(req, res, {
        queue,
        adapter: getAdapter(alertAdapters, "vercel"),
        provider: "vercel",
      });
    })
  );

  // POST /webhooks/netlify
  router.post(
    "/webhooks/netlify",
    verifyNetlifyWebhook,
    asyncHandler(async (req: Request, res: Response) => {
      await processWebhookAlert(req, res, {
        queue,
        adapter: getAdapter(alertAdapters, "netlify"),
        provider: "netlify",
      });
    })
  );

  // POST /webhooks/datadog
  router.post(
    "/webhooks/datadog",
    verifyDatadogWebhook,
    asyncHandler(async (req: Request, res: Response) => {
      await processWebhookAlert(req, res, {
        queue,
        adapter: getAdapter(alertAdapters, "datadog"),
        provider: "datadog",
      });
    })
  );

  // POST /webhooks/grafana
  router.post(
    "/webhooks/grafana",
    verifyGrafanaWebhook,
    asyncHandler(async (req: Request, res: Response) => {
      await processWebhookAlert(req, res, {
        queue,
        adapter: getAdapter(alertAdapters, "grafana"),
        provider: "grafana",
      });
    })
  );

  // POST /webhooks/prometheus
  router.post(
    "/webhooks/prometheus",
    verifyPrometheusWebhook,
    asyncHandler(async (req: Request, res: Response) => {
      await processWebhookAlert(req, res, {
        queue,
        adapter: getAdapter(alertAdapters, "prometheus"),
        provider: "prometheus",
      });
    })
  );

  return router;
};

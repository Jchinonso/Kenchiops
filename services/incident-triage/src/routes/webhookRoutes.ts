/**
 * Webhook Routes
 *
 * Handles incoming webhook events from monitoring sources.
 * Each route verifies the signature, checks idempotency, normalizes the alert,
 * persists it, and enqueues it for triage processing.
 */

import { Router, type Request, type Response } from "express";
import {
  HTTP_STATUS,
  asyncHandler,
  createLogger,
  findAlertByDeliveryId,
  createIncidentAlert,
  createQueue,
  QUEUE_NAMES,
  QUEUE_RETRY_CONFIG,
  QUEUE_VISIBILITY_TIMEOUT,
} from "@kenchi/shared";
import { verifyPagerDutyWebhook } from "../middleware/verifyPagerDuty.js";
import { createPagerDutyAdapter } from "../adapters/pagerDutyAdapter.js";

const router = Router();
const logger = createLogger("webhook-routes");
const pagerDutyAdapter = createPagerDutyAdapter();

/** Queue event type for triage jobs */
const TRIAGE_JOB_TYPE = "incident-triage";

const incidentTriageQueue = createQueue({
  name: QUEUE_NAMES.INCIDENT_TRIAGE,
  maxRetries: QUEUE_RETRY_CONFIG.INCIDENT_TRIAGE,
  visibilityTimeout: QUEUE_VISIBILITY_TIMEOUT.INCIDENT_TRIAGE,
});

/**
 * POST /webhooks/pagerduty
 *
 * Receives PagerDuty v3 webhook events.
 * 1. Verify signature (middleware)
 * 2. Check idempotency via delivery_id
 * 3. Parse payload via adapter
 * 4. Persist alert
 * 5. Enqueue for triage
 */
router.post(
  "/webhooks/pagerduty",
  verifyPagerDutyWebhook,
  asyncHandler(async (req: Request, res: Response) => {
    // Extract delivery ID from headers
    const deliveryId = req.headers["x-webhook-id"];

    if (!deliveryId || typeof deliveryId !== "string") {
      logger.warn("Missing PagerDuty delivery ID", {
        provider: "pagerduty",
        operation: "receiveWebhook",
      });
      res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "Missing delivery ID header" });
      return;
    }

    // Idempotency check: skip if already processed
    const existingAlert = await findAlertByDeliveryId(deliveryId);
    if (existingAlert) {
      logger.info("Duplicate PagerDuty webhook, skipping", {
        provider: "pagerduty",
        operation: "receiveWebhook",
        deliveryId,
        alertId: existingAlert.id,
      });
      res.status(HTTP_STATUS.OK).json({
        status: "duplicate",
        alertId: existingAlert.id,
      });
      return;
    }

    // Parse the webhook payload into a normalized alert
    const normalizedAlert = pagerDutyAdapter.parseWebhook(req.body, req.headers);

    // Persist the alert
    const alertRecord = await createIncidentAlert({
      tenantId: req.context.tenantId !== "system" ? req.context.tenantId : null,
      source: normalizedAlert.source,
      sourceAlertId: normalizedAlert.sourceAlertId,
      deliveryId: normalizedAlert.deliveryId,
      fingerprint: normalizedAlert.fingerprint,
      title: normalizedAlert.title,
      description: normalizedAlert.description,
      severity: normalizedAlert.severity,
      status: "received",
      serviceName: normalizedAlert.serviceName,
      environment: normalizedAlert.environment,
      metrics: normalizedAlert.metrics,
      labels: normalizedAlert.labels,
      sourcePayload: normalizedAlert.sourcePayload,
      receivedAt: normalizedAlert.receivedAt,
    });

    // Enqueue for triage processing
    await incidentTriageQueue.enqueue(TRIAGE_JOB_TYPE, {
      alertId: alertRecord.id,
      source: alertRecord.source,
      severity: alertRecord.severity,
    });

    logger.info("PagerDuty alert received and enqueued", {
      provider: "pagerduty",
      operation: "receiveWebhook",
      alertId: alertRecord.id,
      deliveryId,
      severity: alertRecord.severity,
    });

    res.status(HTTP_STATUS.OK).json({
      status: "accepted",
      alertId: alertRecord.id,
    });
  })
);

export { router as webhookRoutes };

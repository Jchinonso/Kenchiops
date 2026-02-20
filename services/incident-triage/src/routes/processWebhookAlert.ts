/**
 * Shared Webhook Alert Processing Pipeline
 *
 * Extracts the common webhook processing flow used by all provider routes:
 * 1. Parse payload via adapter (adapter also extracts deliveryId)
 * 2. Idempotency check via deliveryId (findAlertByDeliveryId)
 * 3. Persist alert (createIncidentAlert)
 * 4. Enqueue for triage
 *
 * Each route calls this with its provider-specific adapter after
 * signature verification has already been completed by middleware.
 */

import type { Request, Response } from "express";
import {
  HTTP_STATUS,
  createLogger,
  findAlertByDeliveryId,
  createIncidentAlert,
  type QueueManager,
} from "@kenchi/shared";
import type { AlertSourcePort } from "../ports/alertSourcePort.js";

/** Queue event type for triage jobs */
const TRIAGE_JOB_TYPE = "incident-triage";

const logger = createLogger("webhook-alert-pipeline");

// ==================== Types ====================

interface ProcessWebhookAlertDeps {
  readonly queue: QueueManager;
  readonly adapter: AlertSourcePort;
  readonly provider: string;
}

// ==================== Pipeline ====================

/**
 * Processes an incoming webhook alert through the standard pipeline.
 *
 * Assumes signature verification has already been completed by middleware.
 * Handles idempotency, persistence, and queue enqueueing.
 */
export const processWebhookAlert = async (
  req: Request,
  res: Response,
  deps: ProcessWebhookAlertDeps
): Promise<void> => {
  const { queue, adapter, provider } = deps;

  // Parse the webhook payload into a normalized alert (adapter extracts deliveryId)
  const normalizedAlert = adapter.parseWebhook(req.body, req.headers);
  const { deliveryId } = normalizedAlert;

  // Idempotency check: skip if already processed
  const existingAlert = await findAlertByDeliveryId(deliveryId);
  if (existingAlert) {
    logger.info("Duplicate webhook, skipping", {
      provider,
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

  // Persist the alert
  const rawTenantId = req.context?.tenantId;
  const tenantId = rawTenantId === "system" ? null : rawTenantId;
  const alertRecord = await createIncidentAlert({
    tenantId,
    source: normalizedAlert.source,
    sourceAlertId: normalizedAlert.sourceAlertId,
    deliveryId,
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
  await queue.enqueue(TRIAGE_JOB_TYPE, {
    alertId: alertRecord.id,
    source: alertRecord.source,
    severity: alertRecord.severity,
  });

  logger.info("Alert received and enqueued", {
    provider,
    operation: "receiveWebhook",
    alertId: alertRecord.id,
    deliveryId,
    severity: alertRecord.severity,
  });

  res.status(HTTP_STATUS.OK).json({
    status: "accepted",
    alertId: alertRecord.id,
  });
};

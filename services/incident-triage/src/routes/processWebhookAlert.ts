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
  findById as findTenantById,
  publish,
  PUBSUB_CHANNELS,
  DASHBOARD_EVENT_TYPES,
  type QueueManager,
} from "@kenchi/shared";
import type { AlertSourcePort } from "../ports/alertSourcePort.js";

/** Queue event type for triage jobs */
const TRIAGE_JOB_TYPE = "incident-triage";

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
  const logger = createLogger("webhook-alert-pipeline");

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
      ...req.context,
    });
    res.status(HTTP_STATUS.OK).json({
      status: "duplicate",
      alertId: existingAlert.id,
    });
    return;
  }

  // Resolve tenant: URL param takes priority over x-tenant-id header
  const urlTenantId = (req.params as Readonly<Record<string, string>>).tenantId?.trim() || null;
  const headerTenantId = req.context?.tenantId;

  // Validate URL-based tenant ID to prevent data pollution from invalid IDs
  if (urlTenantId) {
    const tenant = await findTenantById(urlTenantId);
    if (!tenant) {
      logger.warn("Webhook received with invalid tenant ID in URL", {
        provider,
        operation: "receiveWebhook",
        ...req.context,
        tenantId: urlTenantId,
      });
      res.status(HTTP_STATUS.NOT_FOUND).json({ error: "Invalid tenant ID" });
      return;
    }
  }

  // Persist the alert
  const tenantId = urlTenantId ?? (headerTenantId === "system" ? null : headerTenantId);
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
    tenantId: alertRecord.tenantId,
    source: alertRecord.source,
    severity: alertRecord.severity,
  });

  // Publish dashboard SSE notification (fire-and-forget)
  void (async () => {
    try {
      await publish(PUBSUB_CHANNELS.DASHBOARD, DASHBOARD_EVENT_TYPES.NEW_INCIDENT, {
        tenantId,
        source: alertRecord.source,
        title: alertRecord.title,
        severity: alertRecord.severity,
        serviceName: alertRecord.serviceName,
      });
    } catch (publishError) {
      logger.warn("Failed to publish new_incident dashboard event", {
        alertId: alertRecord.id,
        error: publishError instanceof Error ? publishError.message : "Unknown error",
      });
    }
  })();

  logger.info("Alert received and enqueued", {
    provider,
    operation: "receiveWebhook",
    alertId: alertRecord.id,
    deliveryId,
    severity: alertRecord.severity,
    ...req.context,
  });

  res.status(HTTP_STATUS.OK).json({
    status: "accepted",
    alertId: alertRecord.id,
  });
};

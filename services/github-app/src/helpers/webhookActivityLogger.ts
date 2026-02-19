/**
 * Webhook Activity Logger
 *
 * Shared helper for logging webhook processing activity to the database.
 * Used by both GitHub and Vercel webhook routes.
 *
 * @module helpers/webhookActivityLogger
 */

import { createLogger, getErrorMessage, createWebhookActivity } from "@kenchi/shared";

const logger = createLogger("github-app");

/**
 * Parameters for logging webhook activity.
 */
interface LogWebhookActivityParams {
  readonly deliveryId: string;
  readonly eventType: string;
  readonly source: string;
  readonly status: string;
  readonly startTime: number;
  readonly tenantId?: string | null;
  readonly errorMessage?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>> | null;
}

/**
 * Safely log webhook activity — failures must never break webhook processing.
 */
export const logWebhookActivity = async (params: LogWebhookActivityParams): Promise<void> => {
  try {
    await createWebhookActivity({
      deliveryId: params.deliveryId,
      eventType: params.eventType,
      source: params.source,
      status: params.status,
      tenantId: params.tenantId ?? null,
      processingTimeMs: Date.now() - params.startTime,
      errorMessage: params.errorMessage ?? null,
      metadata: params.metadata,
    });
  } catch (error) {
    logger.warn("Failed to log webhook activity", {
      deliveryId: params.deliveryId,
      eventType: params.eventType,
      source: params.source,
      error: getErrorMessage(error),
    });
  }
};

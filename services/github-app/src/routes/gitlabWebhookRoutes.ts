/**
 * GitLab Webhook Routes
 *
 * Handles incoming webhooks from GitLab CI.
 * GitLab sends job events (object_kind: "build") when CI jobs complete.
 * Failed jobs are normalized and fed into the aggregation pipeline
 * (same flow as GitHub check_run failures).
 *
 * @module routes/gitlabWebhookRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  createLogger,
  HTTP_STATUS,
  getErrorMessage,
  findActiveByProvider,
  findWebhookActivityByDeliveryId,
  addPendingCheckToRedis,
  createEvent,
  publish,
  PUBSUB_CHANNELS,
  DASHBOARD_EVENT_TYPES,
  EVENT_TYPES,
  EVENT_SOURCES,
  EVENT_SEVERITY,
  CI_PROVIDERS,
  GITLAB_TOKEN_HEADER,
  type AggregationKey,
  type PendingCheckRun,
  type PendingCheckContext,
} from "@kenchi/shared";
import { gitlabWebhookAdapter } from "../adapters/gitlabWebhookAdapter.js";
import { logWebhookActivity } from "../helpers/webhookActivityLogger.js";

const router = Router();
const logger = createLogger("gitlab-webhook");

// ==================== Helpers ====================

/**
 * Generate a deterministic delivery ID for GitLab webhooks.
 * GitLab does not send a delivery ID header, so we derive one
 * from the build_id to enable replay protection.
 */
const buildDeliveryId = (payload: unknown): string => {
  const buildId = (payload as { build_id?: number })?.build_id;
  return buildId ? `gitlab-${buildId}` : `gitlab-${Date.now()}`;
};

/**
 * Persist a CI failure event and publish a dashboard notification.
 * Both operations are best-effort and must not block the webhook response.
 */
const persistEventAndNotify = async (
  event: {
    readonly buildId: string;
    readonly buildName: string;
    readonly conclusion: string;
    readonly commitSha: string;
    readonly repository: {
      readonly fullName: string;
      readonly owner: string;
      readonly name: string;
    };
    readonly metadata?: Readonly<Record<string, unknown>>;
  },
  tenantId: string
): Promise<void> => {
  try {
    await createEvent({
      type: EVENT_TYPES.CICD_FAILURE,
      source: EVENT_SOURCES.GITLAB,
      severity: EVENT_SEVERITY.HIGH,
      timestamp: new Date().toISOString(),
      payload: {
        repository: event.repository.fullName,
        checkName: event.buildName,
        conclusion: event.conclusion,
        headSha: event.commitSha,
        buildId: event.buildId,
        provider: CI_PROVIDERS.GITLAB_CI,
      },
      metadata: {
        owner: event.repository.owner,
        repo: event.repository.name,
        pipelineId: event.metadata?.pipelineId,
      },
      tenantId,
    });

    await publish(PUBSUB_CHANNELS.DASHBOARD, DASHBOARD_EVENT_TYPES.NEW_FAILURE, {
      tenantId,
      repository: event.repository.fullName,
      checkName: event.buildName,
      commitSha: event.commitSha,
      provider: CI_PROVIDERS.GITLAB_CI,
    });
  } catch (error) {
    logger.warn("Failed to persist GitLab event or publish notification", {
      error: getErrorMessage(error),
      repository: event.repository.fullName,
      buildName: event.buildName,
    });
  }
};

// ==================== Route Handler ====================

/**
 * POST /webhooks/gitlab
 *
 * Receives GitLab CI job webhooks. Verifies the X-Gitlab-Token header
 * against stored provider connection secrets, then normalizes and
 * feeds failed jobs into the aggregation pipeline.
 */
router.post(
  "/webhooks/gitlab",
  asyncHandler(async (req: Request, res: Response) => {
    const startTime = Date.now();
    const gitlabToken = req.headers[GITLAB_TOKEN_HEADER] as string | undefined;

    // 1. Verify webhook token FIRST (before any processing)
    if (!gitlabToken) {
      logger.warn("Missing X-Gitlab-Token header", {
        provider: "gitlab",
        operation: "verifyWebhook",
      });
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Missing webhook token" });
      return;
    }

    // Find the matching provider connection by comparing tokens
    const connections = await findActiveByProvider("gitlab_ci");
    const matchedConnection = connections.find(
      (conn) =>
        conn.webhookSecret !== null &&
        gitlabWebhookAdapter.verifySignature(Buffer.alloc(0), gitlabToken, conn.webhookSecret)
    );

    if (!matchedConnection) {
      logger.warn("No matching GitLab webhook secret", {
        provider: "gitlab",
        operation: "verifyWebhook",
      });
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Invalid webhook token" });
      return;
    }

    const { tenantId } = matchedConnection;
    const deliveryId = buildDeliveryId(req.body);

    // 2. Replay protection
    try {
      const existing = await findWebhookActivityByDeliveryId(deliveryId);
      if (existing) {
        logger.info("Duplicate GitLab webhook, skipping", {
          provider: "gitlab",
          operation: "receiveWebhook",
          deliveryId,
        });
        res
          .status(HTTP_STATUS.OK)
          .json({ status: "duplicate", message: "Webhook already processed" });
        return;
      }
    } catch (error) {
      // Replay check is best-effort -- proceed with processing if it fails
      logger.warn("Replay protection check failed, proceeding", {
        deliveryId,
        error: getErrorMessage(error),
      });
    }

    // 3. Check if this is a failure event
    if (!gitlabWebhookAdapter.isFailureEvent(req.body)) {
      logger.info("GitLab webhook skipped (not a failure)", {
        provider: "gitlab",
        operation: "receiveWebhook",
        objectKind: (req.body as { object_kind?: string })?.object_kind,
        buildStatus: (req.body as { build_status?: string })?.build_status,
      });
      void logWebhookActivity({
        deliveryId,
        eventType: "build",
        source: "gitlab",
        status: "ignored",
        startTime,
        tenantId,
      });
      res.status(HTTP_STATUS.OK).json({ status: "skipped", message: "Not a failure event" });
      return;
    }

    // 4. Normalize the event
    const { context } = req;
    const event = gitlabWebhookAdapter.normalizeEvent(req.body, context);
    if (!event) {
      void logWebhookActivity({
        deliveryId,
        eventType: "build",
        source: "gitlab",
        status: "ignored",
        startTime,
        tenantId,
      });
      res.status(HTTP_STATUS.OK).json({ status: "skipped", message: "Could not normalize event" });
      return;
    }

    // 5. Add to aggregation pipeline (same flow as GitHub)
    try {
      const aggregationKey: AggregationKey = {
        repositoryFullName: event.repository.fullName,
        commitSha: event.commitSha,
        provider: CI_PROVIDERS.GITLAB_CI,
      };

      const pendingCheck: PendingCheckRun = {
        checkRunId: parseInt(event.buildId, 10) || 0,
        checkName: event.buildName,
        conclusion: event.conclusion,
        timestamp: event.timestamp,
      };

      const pendingContext: PendingCheckContext = {
        repositoryInfo: event.repository,
        installationId: 0,
        pullRequestNumbers: event.pullRequestNumbers,
        provider: CI_PROVIDERS.GITLAB_CI,
      };

      await addPendingCheckToRedis(aggregationKey, pendingCheck, pendingContext);

      // Persist event and notify dashboard (fire-and-forget)
      void persistEventAndNotify(event, tenantId);

      void logWebhookActivity({
        deliveryId,
        eventType: "build",
        source: "gitlab",
        status: "processed",
        startTime,
        tenantId,
      });

      logger.info("GitLab CI failure added to aggregation", {
        provider: "gitlab",
        operation: "processWebhook",
        buildId: event.buildId,
        buildName: event.buildName,
        repository: event.repository.fullName,
        commitSha: event.commitSha.substring(0, 7),
        ...context,
      });

      res.status(HTTP_STATUS.OK).json({ status: "processed", buildId: event.buildId });
    } catch (error) {
      void logWebhookActivity({
        deliveryId,
        eventType: "build",
        source: "gitlab",
        status: "failed",
        startTime,
        tenantId,
        errorMessage: getErrorMessage(error),
      });
      throw error;
    }
  })
);

export { router as gitlabWebhookRoutes };

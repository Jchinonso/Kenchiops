/**
 * Deploy Webhook Routes
 *
 * Receives deployment webhooks and log drain batches from platforms
 * (Vercel, Railway, Render, Netlify). Each route verifies the signature
 * via middleware, checks idempotency, then delegates to the deploy
 * analysis service.
 *
 * Dependencies (service, adapters) are injected from the composition root.
 *
 * @module routes/deployWebhookRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  createLogger,
  isWebhookDuplicate,
  markWebhookProcessed,
  rateLimitByCategory,
  type DeployLogSourcePort,
  type DeployPlatform,
} from "@kenchi/shared";
import type { DeployAnalysisService } from "../services/deployAnalysisService.js";
import { createDeployWebhookVerifier } from "../middleware/verifyDeployWebhook.js";

const logger = createLogger("deploy-webhook-routes");

// ==================== Types ====================

/** Dependencies injected from the composition root. */
interface DeployWebhookRouteDeps {
  readonly deployAnalysisService: DeployAnalysisService;
  readonly adapters: Readonly<Partial<Record<DeployPlatform, DeployLogSourcePort>>>;
}

/** Config for a single deploy webhook route. */
interface DeployRouteConfig {
  readonly path: string;
  readonly platform: DeployPlatform;
}

// ==================== Route Config ====================

/**
 * Deploy platforms with webhook support.
 * Each entry creates two routes: tenant-scoped and legacy.
 */
const DEPLOY_ROUTE_CONFIGS: readonly DeployRouteConfig[] = [
  { path: "vercel", platform: "vercel" },
  { path: "railway", platform: "railway" },
  { path: "render", platform: "render" },
  { path: "netlify", platform: "netlify" },
];

// ==================== Helpers ====================

/**
 * Extracts a stable delivery ID for idempotency.
 * Falls back to generating one from timestamp + platform.
 */
const extractDeliveryId = (req: Request, platform: DeployPlatform): string => {
  const headerValue =
    req.headers["x-webhook-id"] ?? req.headers["x-vercel-delivery"] ?? req.headers["x-request-id"];

  return typeof headerValue === "string" && headerValue.length > 0
    ? `${platform}:${headerValue}`
    : `${platform}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
};

/**
 * Resolves tenantId from URL param or header.
 */
const resolveTenantId = (req: Request): string => {
  const fromParam = req.params.tenantId;
  if (typeof fromParam === "string" && fromParam.length > 0) {
    return fromParam;
  }

  const fromHeader = req.headers["x-tenant-id"];
  return typeof fromHeader === "string" && fromHeader.length > 0
    ? fromHeader
    : req.context.tenantId;
};

// ==================== Route Factory ====================

/**
 * Creates deploy webhook routes with injected dependencies.
 *
 * For each platform, registers:
 * - `POST /webhooks/deploy/:platform/:tenantId` — tenant-scoped (preferred)
 * - `POST /webhooks/deploy/:platform` — legacy (tenantId via header)
 * - `POST /webhooks/deploy/:platform/log-drain/:tenantId` — log drain endpoint
 */
export const createDeployWebhookRoutes = (deps: DeployWebhookRouteDeps): Router => {
  const router = Router();
  const { deployAnalysisService, adapters } = deps;

  DEPLOY_ROUTE_CONFIGS.forEach(({ path, platform }) => {
    const adapter = adapters[platform];
    if (!adapter) {
      return; // Skip platforms without registered adapters
    }

    const verifyMiddleware = createDeployWebhookVerifier(platform, adapter);

    // Deploy event webhook handler
    const webhookHandler = asyncHandler(async (req: Request, res: Response) => {
      const logContext = { ...req.context };
      const deliveryId = extractDeliveryId(req, platform);
      const tenantId = resolveTenantId(req);

      // Idempotency check (Redis fast-path)
      const isDuplicate = await isWebhookDuplicate(platform, deliveryId);
      if (isDuplicate) {
        logger.info("Duplicate deploy webhook — skipping", {
          provider: platform,
          operation: "receiveDeployWebhook",
          deliveryId,
          ...logContext,
        });
        res.status(200).json({ status: "duplicate" });
        return;
      }

      // Enrich context with resolved tenantId
      const enrichedContext = { ...req.context, tenantId };

      // Dispatch to analysis service
      const result = await deployAnalysisService.processDeployWebhook(
        platform,
        req.body,
        enrichedContext
      );

      // Mark as processed
      await markWebhookProcessed(platform, deliveryId);

      logger.info("Deploy webhook processed", {
        provider: platform,
        operation: "receiveDeployWebhook",
        deliveryId,
        action: result.action,
        ...logContext,
      });

      res.status(200).json({ status: result.action });
    });

    // Log drain batch handler
    const logDrainHandler = asyncHandler(async (req: Request, res: Response) => {
      const logContext = { ...req.context };
      const tenantId = resolveTenantId(req);

      // Log drains don't need idempotency — buffer handles dedup
      const result = await deployAnalysisService.processLogDrainBatch(
        platform,
        req.body,
        {
          entityId: "", // Resolved from payload by adapter
          tenantId,
          platform,
          metadata: {
            repository: "",
            branch: "",
            commit: "",
            startedAt: new Date(),
            completedAt: null,
            status: "deploying",
            projectId: "",
            projectName: "",
          },
        },
        req.context
      );

      logger.info("Log drain batch processed", {
        provider: platform,
        operation: "receiveLogDrain",
        entityId: result.entityId,
        linesAccepted: result.linesAccepted,
        flushed: result.flushed,
        ...logContext,
      });

      res.status(200).json({
        status: "accepted",
        linesAccepted: result.linesAccepted,
        flushed: result.flushed,
      });
    });

    // Register routes
    router.post(
      `/webhooks/deploy/${path}/:tenantId`,
      rateLimitByCategory("standard"),
      verifyMiddleware,
      webhookHandler
    );
    router.post(
      `/webhooks/deploy/${path}`,
      rateLimitByCategory("standard"),
      verifyMiddleware,
      webhookHandler
    );
    router.post(
      `/webhooks/deploy/${path}/log-drain/:tenantId`,
      rateLimitByCategory("standard"),
      verifyMiddleware,
      logDrainHandler
    );
  });

  return router;
};

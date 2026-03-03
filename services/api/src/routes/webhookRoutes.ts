/**
 * Webhook Routes
 *
 * SECURITY (VULN-501): This generic webhook endpoint has been disabled.
 * It previously accepted ANY payload from ANY sender with zero authentication,
 * no signature verification, and no replay protection. Specific webhook
 * endpoints (GitHub, GitLab, Stripe, Slack) each have their own dedicated
 * routes with proper signature verification.
 *
 * @module routes/webhookRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  createLogger,
  HTTP_STATUS,
  SERVICE_NAMES,
  API_ROUTES,
  rateLimitByCategory,
} from "@kenchi/shared";

const router = Router();
const logger = createLogger(SERVICE_NAMES.API);

// ==================== Route Handlers ====================

/**
 * Generic webhook endpoint -- disabled (VULN-501).
 * Returns 501 Not Implemented. Source-specific webhook endpoints
 * (GitHub, GitLab, Stripe, Slack) have their own routes with
 * proper signature verification.
 */
const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  const { source } = req.params as { readonly source: string };

  logger.warn("Rejected unimplemented generic webhook", {
    source,
  });

  res.status(HTTP_STATUS.NOT_FOUND).json({
    error: {
      code: "NOT_SUPPORTED",
      message: "Generic webhook ingestion is not supported. Use source-specific webhook endpoints.",
    },
  });
};

// ==================== Route Definitions ====================

/** POST /webhook/:source - Disabled generic webhook endpoint (VULN-501) */
router.post(API_ROUTES.WEBHOOK, rateLimitByCategory("standard"), asyncHandler(handleWebhook));

export { router as webhookRoutes };

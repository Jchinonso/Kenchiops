/**
 * Billing Routes
 *
 * API endpoints for Stripe billing operations: checkout, portal, webhooks, status.
 *
 * @module routes/billingRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  createLogger,
  requireTenantId,
  requirePermission,
  ValidationError,
  HTTP_STATUS,
  rateLimitByCategory,
  createStripeAdapter,
  createBillingService,
  processStripeWebhook,
  config,
  findById as findTenantById,
  type BillingInterval,
  type BillingStatus,
} from "@kenchi/shared";

const router = Router();
const logger = createLogger("billing-routes");

// ==================== Service Setup ====================

const stripeAdapter = createStripeAdapter();
const billingService = createBillingService(stripeAdapter);

// ==================== DTO Mappers ====================

const mapBillingStatusToResponse = (status: BillingStatus): Record<string, unknown> => ({
  hasStripeCustomer: status.hasStripeCustomer,
  planId: status.planId,
  status: status.status,
  currentPeriodEnd: status.currentPeriodEnd?.toISOString() ?? null,
});

// ==================== Route Handlers ====================

/**
 * POST /api/v1/billing/checkout
 * Create a Stripe Checkout session for plan upgrade.
 */
const handleCreateCheckout = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;
  const userId = req.user?.userId;

  if (!userId) {
    throw new ValidationError("User identity required", {
      operation: "handleCreateCheckout",
    });
  }

  // Personal tenants are locked to the free plan — no billing
  const tenant = await findTenantById(tenantId);
  if (tenant?.tenantType === "personal") {
    throw new ValidationError("Personal accounts do not support paid plans", {
      operation: "handleCreateCheckout",
      metadata: { tenantId },
    });
  }

  const { planId, interval } = req.body as {
    readonly planId?: string;
    readonly interval?: string;
  };

  if (!planId || typeof planId !== "string") {
    throw new ValidationError("planId is required", {
      operation: "handleCreateCheckout",
      metadata: { field: "planId" },
    });
  }

  const billingInterval: BillingInterval = interval === "year" ? "year" : "month";

  const result = await billingService.createCheckout(
    {
      tenantId,
      planId: planId as "free" | "pro" | "team" | "enterprise",
      interval: billingInterval,
      userId,
      // SECURITY: Use server-configured FRONTEND_URL, never attacker-controlled Origin header.
      // Origin header is trivially spoofable and would allow redirect-through-Stripe attacks.
      successUrl: `${config.FRONTEND_URL}/settings/billing?success=true`,
      cancelUrl: `${config.FRONTEND_URL}/settings/billing?canceled=true`,
    },
    context
  );

  logger.info("Checkout session created", { ...context, sessionId: result.sessionId });

  res.status(HTTP_STATUS.OK).json({
    data: {
      sessionId: result.sessionId,
      url: result.url,
    },
  });
};

/**
 * POST /api/v1/billing/portal
 * Create a Stripe Billing Portal session.
 */
const handleCreatePortal = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;

  // Personal tenants are locked to the free plan — no billing portal
  const tenant = await findTenantById(tenantId);
  if (tenant?.tenantType === "personal") {
    throw new ValidationError("Personal accounts do not support billing management", {
      operation: "handleCreatePortal",
      metadata: { tenantId },
    });
  }

  const result = await billingService.createPortal(
    {
      tenantId,
      // SECURITY: Use server-configured FRONTEND_URL, not attacker-controlled Origin header
      returnUrl: `${config.FRONTEND_URL}/settings/billing`,
    },
    context
  );

  logger.info("Portal session created", { ...context });

  res.status(HTTP_STATUS.OK).json({
    data: { url: result.url },
  });
};

/**
 * GET /api/v1/billing/status
 * Get current billing status for the tenant.
 */
const handleGetBillingStatus = async (req: Request, res: Response): Promise<void> => {
  const tenantId = requireTenantId(req);
  const { context } = req;

  const status = await billingService.getStatus(tenantId, context);

  res.status(HTTP_STATUS.OK).json({
    data: mapBillingStatusToResponse(status),
  });
};

/**
 * POST /api/v1/billing/webhooks/stripe
 * Receive and process Stripe webhook events.
 * This endpoint does NOT use standard auth — it verifies Stripe signatures instead.
 */
const handleStripeWebhook = async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers["stripe-signature"] as string | undefined;

  if (!signature) {
    logger.warn("Stripe webhook received without signature", {
      provider: "stripe",
      operation: "handleStripeWebhook",
    });
    res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Missing stripe-signature header" });
    return;
  }

  // Use raw body for signature verification
  const { rawBody } = req as Request & { readonly rawBody?: Buffer };
  const payload = rawBody ?? JSON.stringify(req.body);

  // SECURITY: Verify signature FIRST in its own try/catch.
  // If verification fails, return 401 immediately — never fall through to processing.
  // This avoids fragile string matching on error messages.
  // let: event is assigned in the verification block and used in the processing block
  let event; // let: set once by constructWebhookEvent, read by processStripeWebhook
  try {
    event = stripeAdapter.constructWebhookEvent(payload, signature);
  } catch (verifyError) {
    logger.warn("Stripe webhook signature verification failed", {
      provider: "stripe",
      operation: "handleStripeWebhook",
    });
    res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Invalid signature" });
    return;
  }

  // Signature verified — process the event
  try {
    const result = await processStripeWebhook(event, req.context);

    logger.info("Stripe webhook processed", {
      provider: "stripe",
      operation: "handleStripeWebhook",
      eventId: event.id,
      eventType: event.type,
      processed: result.processed,
      action: result.action,
    });

    res.status(HTTP_STATUS.OK).json({ received: true, ...result });
  } catch (error) {
    // Processing errors still return 200 to prevent Stripe retries on app errors
    logger.error("Stripe webhook processing error", {
      provider: "stripe",
      operation: "handleStripeWebhook",
      eventId: event.id,
      eventType: event.type,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    res.status(HTTP_STATUS.OK).json({ received: true, error: "Processing failed" });
  }
};

// ==================== Route Definitions ====================

// Authenticated billing endpoints (require billing permission)
router.post(
  "/api/v1/billing/checkout",
  rateLimitByCategory("expensive"),
  requirePermission("billing"),
  asyncHandler(handleCreateCheckout)
);

router.post(
  "/api/v1/billing/portal",
  rateLimitByCategory("standard"),
  requirePermission("billing"),
  asyncHandler(handleCreatePortal)
);

router.get(
  "/api/v1/billing/status",
  rateLimitByCategory("readonly"),
  requirePermission("billing"),
  asyncHandler(handleGetBillingStatus)
);

// Stripe webhook endpoint (no auth — uses Stripe signature verification)
router.post(
  "/api/v1/billing/webhooks/stripe",
  rateLimitByCategory("standard"),
  asyncHandler(handleStripeWebhook)
);

export { router as billingRoutes };

/**
 * Category-Based and Plan-Based Rate Limiting Middleware
 *
 * Provides two Express middleware factories:
 * 1. rateLimitByCategory(category) - per-endpoint category limits (expensive/standard/readonly)
 * 2. rateLimitByPlan() - per-tenant plan-based limits (free/pro/team/enterprise)
 *
 * Both use tenant ID as the rate limit key for per-tenant isolation.
 * Uses Redis-backed FailoverRateLimitStore for distributed rate limiting
 * with automatic in-memory fallback when Redis is unavailable.
 * Fails open (allows through) if an unexpected error occurs during rate check.
 *
 * @module http/rateLimitByCategory
 */

import type { Request, Response, NextFunction } from "express";
import { RateLimitError } from "../core/errors.js";
import { createLogger } from "../core/logger.js";
import {
  RATE_LIMIT_CATEGORIES,
  PLAN_RATE_LIMITS,
  CATEGORY_RATE_LIMIT_PREFIX,
  PLAN_RATE_LIMIT_PREFIX,
  WEBHOOK_SOURCE_RATE_LIMIT_PREFIX,
  WEBHOOK_SOURCE_RATE_LIMIT,
} from "../constants/rateLimitCategory.js";
import { createFailoverStore } from "../rateLimit/failoverStore.js";
import type { RateLimitCategory, RateLimitPlanId } from "./rateLimitByCategoryTypes.js";

const logger = createLogger("rate-limit-category");

// ==================== Failover Stores (Redis + in-memory fallback) ====================

/** Store for per-category rate limiting (max based on highest category limit) */
const categoryStore = createFailoverStore(
  CATEGORY_RATE_LIMIT_PREFIX,
  RATE_LIMIT_CATEGORIES.readonly.maxPerMinute
);

/** Store for per-plan rate limiting (max based on highest plan limit) */
const planStore = createFailoverStore(
  PLAN_RATE_LIMIT_PREFIX,
  PLAN_RATE_LIMITS.enterprise.maxPerMinute
);

/** Store for per-webhook-source rate limiting */
const webhookStore = createFailoverStore(
  WEBHOOK_SOURCE_RATE_LIMIT_PREFIX,
  WEBHOOK_SOURCE_RATE_LIMIT.maxPerMinute
);

// ==================== Key Extraction ====================

/**
 * Extracts the tenant ID for per-tenant rate limiting.
 * Checks req.user.tenantId (JWT auth) and req.context.tenantId.
 * Returns null for unauthenticated traffic (bypasses tenant rate limits).
 */
const extractTenantId = (req: Request): string | null =>
  req.user?.tenantId ?? req.context?.tenantId ?? null;

// ==================== Async Rate Limit Helpers ====================

/**
 * Performs the category rate limit check and calls next() appropriately.
 * Extracted as an async helper so the Express middleware can invoke it
 * without Promise chain patterns.
 */
const applyCategoryLimit = async (
  req: Request,
  res: Response,
  next: NextFunction,
  category: RateLimitCategory,
  maxPerMinute: number,
  windowMs: number
): Promise<void> => {
  const tenantId = extractTenantId(req);
  if (!tenantId) {
    next();
    return;
  }

  const key = `${category}:${tenantId}`;

  try {
    const info = await categoryStore.increment(key, windowMs);

    res.setHeader("X-RateLimit-Limit", maxPerMinute);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, maxPerMinute - info.current));
    res.setHeader("X-RateLimit-Reset", Math.ceil(info.resetTime / 1000));

    if (info.current > maxPerMinute) {
      const retryAfterMs = Math.max(0, info.resetTime - Date.now());
      logger.warn("Tenant exceeded category quota", {
        category,
        tenantId,
      });
      next(
        new RateLimitError(
          `Rate limit exceeded for ${category} endpoints. Please try again later.`,
          retryAfterMs
        )
      );
      return;
    }

    next();
  } catch (error: unknown) {
    if (error instanceof RateLimitError) {
      next(error);
      return;
    }
    // Fail open on unexpected errors — do not block traffic
    logger.warn("Category quota middleware error, failing open", {
      category,
    });
    next();
  }
};

/**
 * Performs the plan rate limit check and calls next() appropriately.
 */
const applyPlanLimit = async (
  req: Request,
  res: Response,
  next: NextFunction,
  windowMs: number
): Promise<void> => {
  const tenantId = extractTenantId(req);
  if (!tenantId) {
    next();
    return;
  }

  const rawPlanId = (req as Request & { readonly planId?: string }).planId;
  const planId: RateLimitPlanId =
    rawPlanId !== undefined && rawPlanId in PLAN_RATE_LIMITS
      ? (rawPlanId as RateLimitPlanId)
      : "free";
  const planConfig = PLAN_RATE_LIMITS[planId];
  const { maxPerMinute } = planConfig;

  const key = tenantId;

  try {
    const info = await planStore.increment(key, windowMs);

    res.setHeader("X-RateLimit-Plan-Limit", maxPerMinute);
    res.setHeader("X-RateLimit-Plan-Remaining", Math.max(0, maxPerMinute - info.current));

    if (info.current > maxPerMinute) {
      const retryAfterMs = Math.max(0, info.resetTime - Date.now());
      logger.warn("Tenant exceeded plan quota", {
        planId,
        tenantId,
      });
      next(
        new RateLimitError(
          "Plan rate limit exceeded. Upgrade your plan for higher limits.",
          retryAfterMs
        )
      );
      return;
    }

    next();
  } catch (error: unknown) {
    if (error instanceof RateLimitError) {
      next(error);
      return;
    }
    // Fail open on unexpected errors
    logger.warn("Plan quota middleware error, failing open", {
      tenantId,
    });
    next();
  }
};

// ==================== Middleware Factories ====================

/**
 * Creates Express middleware that rate-limits by endpoint category.
 *
 * Categories:
 * - expensive (10/min): LLM operations, analysis creation, fine-tuning, RAG
 * - standard (500/min): normal CRUD operations
 * - readonly (1000/min): GET/list endpoints
 *
 * Rate limit key is per-tenant. Unauthenticated traffic is not limited
 * by this middleware (they should be caught by the global IP-based limiter).
 *
 * @example
 * router.post("/api/analyze", rateLimitByCategory("expensive"), asyncHandler(handleAnalyze));
 * router.get("/api/jobs/:id", rateLimitByCategory("readonly"), asyncHandler(handleGetJob));
 */
export const rateLimitByCategory = (
  category: RateLimitCategory
): ((req: Request, res: Response, next: NextFunction) => void) => {
  const { maxPerMinute, windowMs } = RATE_LIMIT_CATEGORIES[category];

  return (req: Request, res: Response, next: NextFunction): void => {
    void applyCategoryLimit(req, res, next, category, maxPerMinute, windowMs);
  };
};

/**
 * Creates Express middleware that rate-limits by the tenant's subscription plan.
 *
 * Plan limits (per minute):
 * - free: 200
 * - pro: 300
 * - team: 500
 * - enterprise: 2000
 *
 * Looks up the tenant's plan from req.planId (if enriched by earlier middleware)
 * or defaults to "free". Unauthenticated traffic bypasses this middleware.
 *
 * @example
 * app.use("/api", rateLimitByPlan());
 */
export const rateLimitByPlan = (): ((req: Request, res: Response, next: NextFunction) => void) => {
  const windowMs = 60_000;

  return (req: Request, res: Response, next: NextFunction): void => {
    void applyPlanLimit(req, res, next, windowMs);
  };
};

/**
 * Checks whether a webhook source (identified by installationId or orgId) has
 * exceeded the per-source rate limit. This is a non-Express utility function
 * that can be called directly from webhook handlers.
 *
 * @param sourceId - Unique identifier for the webhook source (e.g., GitHub installation ID)
 * @param source - The webhook provider (e.g., "github", "slack")
 * @returns Object with `allowed` flag and `remaining` count
 */
export const checkWebhookSourceRateLimit = async (
  sourceId: string,
  source: string
): Promise<{ readonly allowed: boolean; readonly remaining: number }> => {
  const { maxPerMinute, windowMs } = WEBHOOK_SOURCE_RATE_LIMIT;
  const key = `${source}:${sourceId}`;

  try {
    const info = await webhookStore.increment(key, windowMs);
    return { allowed: info.current <= maxPerMinute, remaining: info.remaining };
  } catch (error: unknown) {
    // Fail open on unexpected errors — do not block webhook traffic
    logger.warn("Webhook source rate limit check failed, failing open", {
      source,
      sourceId,
    });
    return { allowed: true, remaining: maxPerMinute };
  }
};

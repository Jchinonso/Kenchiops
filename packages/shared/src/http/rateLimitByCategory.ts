/**
 * Category-Based and Plan-Based Rate Limiting Middleware
 *
 * Provides two Express middleware factories:
 * 1. rateLimitByCategory(category) - per-endpoint category limits (expensive/standard/readonly)
 * 2. rateLimitByPlan() - per-tenant plan-based limits (free/pro/team/enterprise)
 *
 * Both use tenant ID as the rate limit key for per-tenant isolation.
 * Falls back to in-memory counters to avoid Redis coupling complexity.
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
import type { RateLimitCategory, RateLimitPlanId } from "./rateLimitByCategoryTypes.js";

const logger = createLogger("rate-limit-category");

// ==================== In-Memory Sliding Window Counter ====================

interface WindowEntry {
  readonly resetTime: number;
  count: number;
}

/**
 * Simple in-memory sliding window store.
 * Uses deterministic cleanup on access to bound memory.
 */
const createWindowStore = (): {
  readonly check: (
    key: string,
    windowMs: number,
    max: number
  ) => {
    readonly allowed: boolean;
    readonly remaining: number;
    readonly resetMs: number;
  };
} => {
  const store = new Map<string, WindowEntry>();
  // let: counter for deterministic cleanup every N checks
  let accessCount = 0; // let: incremented each check for periodic cleanup

  const cleanup = (now: number): void => {
    const keysToDelete: readonly string[] = [...store.keys()].filter((entryKey) => {
      const entry = store.get(entryKey);
      return entry !== undefined && entry.resetTime < now;
    });
    keysToDelete.forEach((entryKey) => store.delete(entryKey));
  };

  return {
    check: (key: string, windowMs: number, max: number) => {
      const now = Date.now();
      accessCount = (accessCount + 1) % 10_000;

      // Cleanup every 100 accesses or if store is large
      if (accessCount % 100 === 0 || store.size > 50_000) {
        cleanup(now);
      }

      const existing = store.get(key);
      const hasValidWindow = existing !== undefined && now <= existing.resetTime;

      if (hasValidWindow && existing !== undefined) {
        existing.count++;
        const allowed = existing.count <= max;
        const remaining = Math.max(0, max - existing.count);
        return { allowed, remaining, resetMs: existing.resetTime };
      }

      // New window
      const resetTime = Math.min(now + windowMs, Number.MAX_SAFE_INTEGER);
      store.set(key, { resetTime, count: 1 });
      return { allowed: true, remaining: max - 1, resetMs: resetTime };
    },
  };
};

const categoryStore = createWindowStore();
const planStore = createWindowStore();
const webhookSourceStore = createWindowStore();

// ==================== Key Extraction ====================

/**
 * Extracts the tenant ID for per-tenant rate limiting.
 * Checks req.user.tenantId (JWT auth) then req.context.tenantId.
 * Returns null for unauthenticated traffic (bypasses tenant rate limits).
 */
const extractTenantId = (req: Request): string | null =>
  req.user?.tenantId ?? req.context?.tenantId ?? null;

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
    try {
      const tenantId = extractTenantId(req);
      if (!tenantId) {
        return next();
      }

      const key = `${CATEGORY_RATE_LIMIT_PREFIX}${category}:${tenantId}`;
      const result = categoryStore.check(key, windowMs, maxPerMinute);

      res.setHeader("X-RateLimit-Limit", maxPerMinute);
      res.setHeader("X-RateLimit-Remaining", result.remaining);
      res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetMs / 1000));

      if (!result.allowed) {
        const retryAfterMs = Math.max(0, result.resetMs - Date.now());
        logger.warn("Tenant exceeded category quota", {
          category,
          tenantId,
        });
        throw new RateLimitError(
          `Rate limit exceeded for ${category} endpoints. Please try again later.`,
          retryAfterMs
        );
      }

      next();
    } catch (error) {
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
};

/**
 * Creates Express middleware that rate-limits by the tenant's subscription plan.
 *
 * Plan limits (per minute):
 * - free: 60
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
    try {
      const tenantId = extractTenantId(req);
      if (!tenantId) {
        return next();
      }

      // Determine plan - use attached plan info or default to free
      const planId: RateLimitPlanId =
        (req as Request & { readonly planId?: RateLimitPlanId }).planId ?? "free";
      const planConfig = PLAN_RATE_LIMITS[planId] ?? PLAN_RATE_LIMITS.free;
      const { maxPerMinute } = planConfig;

      const key = `${PLAN_RATE_LIMIT_PREFIX}${tenantId}`;
      const result = planStore.check(key, windowMs, maxPerMinute);

      res.setHeader("X-RateLimit-Plan-Limit", maxPerMinute);
      res.setHeader("X-RateLimit-Plan-Remaining", result.remaining);

      if (!result.allowed) {
        const retryAfterMs = Math.max(0, result.resetMs - Date.now());
        logger.warn("Tenant exceeded plan quota", {
          planId,
          tenantId,
        });
        throw new RateLimitError(
          "Plan rate limit exceeded. Upgrade your plan for higher limits.",
          retryAfterMs
        );
      }

      next();
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw error;
      }
      // Fail open on unexpected errors
      logger.warn("Plan quota middleware error, failing open", {
        tenantId: extractTenantId(req),
      });
      next();
    }
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
export const checkWebhookSourceRateLimit = (
  sourceId: string,
  source: string
): { readonly allowed: boolean; readonly remaining: number } => {
  const { maxPerMinute, windowMs } = WEBHOOK_SOURCE_RATE_LIMIT;
  const key = `${WEBHOOK_SOURCE_RATE_LIMIT_PREFIX}${source}:${sourceId}`;
  const result = webhookSourceStore.check(key, windowMs, maxPerMinute);
  return { allowed: result.allowed, remaining: result.remaining };
};

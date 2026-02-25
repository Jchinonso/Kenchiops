/**
 * Rate Limit Category Constants
 *
 * Defines endpoint rate limit categories (expensive, standard, readonly)
 * and plan-based tiered rate limits.
 *
 * @module constants/rateLimitCategory
 */

/**
 * Per-minute rate limits by endpoint category.
 *
 * - expensive: LLM calls, analysis creation, fine-tuning, RAG operations
 * - standard: normal CRUD operations (create, update, delete)
 * - readonly: GET/list endpoints
 */
export const RATE_LIMIT_CATEGORIES = {
  expensive: { maxPerMinute: 10, windowMs: 60_000 },
  standard: { maxPerMinute: 500, windowMs: 60_000 },
  readonly: { maxPerMinute: 1000, windowMs: 60_000 },
} as const;

/**
 * Per-minute rate limits by subscription plan tier.
 * Applied as an overall tenant-level budget across all endpoints.
 */
export const PLAN_RATE_LIMITS = {
  free: { maxPerMinute: 60 },
  pro: { maxPerMinute: 300 },
  team: { maxPerMinute: 500 },
  enterprise: { maxPerMinute: 2000 },
} as const;

/**
 * Rate limit key prefix for category-based middleware.
 * Separates these keys from the global IP-based rate limiter.
 */
export const CATEGORY_RATE_LIMIT_PREFIX = "rl:cat:" as const;

/**
 * Rate limit key prefix for plan-based middleware.
 */
export const PLAN_RATE_LIMIT_PREFIX = "rl:plan:" as const;

/**
 * Rate limit key prefix for per-source webhook limiting.
 */
export const WEBHOOK_SOURCE_RATE_LIMIT_PREFIX = "rl:wh:" as const;

/**
 * Per-source webhook rate limit configuration.
 * Prevents a single noisy installation/org from exhausting the tenant's webhook quota.
 */
export const WEBHOOK_SOURCE_RATE_LIMIT = {
  /** Maximum webhook events per source per minute */
  maxPerMinute: 60,
  /** Window duration in milliseconds */
  windowMs: 60_000,
} as const;

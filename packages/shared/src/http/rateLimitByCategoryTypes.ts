/**
 * Types for category-based and plan-based rate limiting middleware.
 *
 * @module http/rateLimitByCategoryTypes
 */

import type { RATE_LIMIT_CATEGORIES, PLAN_RATE_LIMITS } from "../constants/rateLimitCategory.js";

/**
 * Valid endpoint rate limit categories.
 */
export type RateLimitCategory = keyof typeof RATE_LIMIT_CATEGORIES;

/**
 * Valid subscription plan IDs for rate limiting.
 */
export type RateLimitPlanId = keyof typeof PLAN_RATE_LIMITS;

/**
 * Per-User Chat Rate Limiting Middleware
 *
 * Express middleware that enforces per-user rate limits on chat messages
 * using three sliding windows (minute, hour, day).
 *
 * Uses Redis-backed FailoverRateLimitStore for distributed rate limiting
 * with automatic in-memory fallback when Redis is unavailable.
 * Fails open (allows through) if an unexpected error occurs during rate check.
 *
 * @module chat/chatRateLimit
 */

import type { Request, Response, NextFunction } from "express";
import { RateLimitError } from "../core/errors.js";
import { createLogger } from "../core/logger.js";
import { CHAT_DEFAULTS } from "../constants/api.js";
import { createFailoverStore } from "../rateLimit/failoverStore.js";

const logger = createLogger("chat-user-rate-limit");

// ==================== Constants ====================

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// ==================== Failover Stores ====================

// Use distinct prefixes per window to prevent key collisions
const minuteStore = createFailoverStore(
  `${CHAT_DEFAULTS.CHAT_USER_RATE_LIMIT_PREFIX}min:`,
  CHAT_DEFAULTS.MAX_MESSAGES_PER_MINUTE
);

const hourStore = createFailoverStore(
  `${CHAT_DEFAULTS.CHAT_USER_RATE_LIMIT_PREFIX}hr:`,
  CHAT_DEFAULTS.MAX_MESSAGES_PER_HOUR
);

const dayStore = createFailoverStore(
  `${CHAT_DEFAULTS.CHAT_USER_RATE_LIMIT_PREFIX}day:`,
  CHAT_DEFAULTS.MAX_MESSAGES_PER_DAY
);

// ==================== Rate Limit Check ====================

/**
 * Checks a single rate limit window and returns remaining count.
 * Returns null if the limit is exceeded.
 */
const checkWindow = async (
  store: ReturnType<typeof createFailoverStore>,
  key: string,
  windowMs: number,
  maxPerWindow: number
): Promise<{
  readonly exceeded: boolean;
  readonly remaining: number;
  readonly resetTime: number;
}> => {
  const info = await store.increment(key, windowMs);
  const remaining = Math.max(0, maxPerWindow - info.current);
  return {
    exceeded: info.current > maxPerWindow,
    remaining,
    resetTime: info.resetTime,
  };
};

/**
 * Performs per-user chat rate limit checks across all windows.
 *
 * NOTE: increment() atomically increments and checks the counter.
 * If the minute check passes but the hour check fails, the minute counter
 * has already been incremented. This minor inflation is acceptable for
 * the simplicity of a single atomic operation per window.
 */
const applyChatUserRateLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) {
    // Unauthenticated — shouldn't reach here but defensive
    next();
    return;
  }

  try {
    // Check minute window first (most likely to be exceeded)
    const minuteResult = await checkWindow(
      minuteStore,
      userId,
      MINUTE_MS,
      CHAT_DEFAULTS.MAX_MESSAGES_PER_MINUTE
    );

    if (minuteResult.exceeded) {
      const retryAfterMs = Math.max(0, minuteResult.resetTime - Date.now());
      res.setHeader("X-RateLimit-Limit", CHAT_DEFAULTS.MAX_MESSAGES_PER_MINUTE);
      res.setHeader("X-RateLimit-Remaining", 0);
      res.setHeader("X-RateLimit-Reset", Math.ceil(minuteResult.resetTime / 1000));
      res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1000));
      next(
        new RateLimitError(
          "You are sending messages too quickly. Please wait a moment before trying again.",
          retryAfterMs
        )
      );
      return;
    }

    // Check hour window
    const hourResult = await checkWindow(
      hourStore,
      userId,
      HOUR_MS,
      CHAT_DEFAULTS.MAX_MESSAGES_PER_HOUR
    );

    if (hourResult.exceeded) {
      const retryAfterMs = Math.max(0, hourResult.resetTime - Date.now());
      res.setHeader("X-RateLimit-Limit", CHAT_DEFAULTS.MAX_MESSAGES_PER_HOUR);
      res.setHeader("X-RateLimit-Remaining", 0);
      res.setHeader("X-RateLimit-Reset", Math.ceil(hourResult.resetTime / 1000));
      res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1000));
      next(
        new RateLimitError(
          "You have reached the hourly message limit. Please try again later.",
          retryAfterMs
        )
      );
      return;
    }

    // Check day window
    const dayResult = await checkWindow(
      dayStore,
      userId,
      DAY_MS,
      CHAT_DEFAULTS.MAX_MESSAGES_PER_DAY
    );

    if (dayResult.exceeded) {
      const retryAfterMs = Math.max(0, dayResult.resetTime - Date.now());
      res.setHeader("X-RateLimit-Limit", CHAT_DEFAULTS.MAX_MESSAGES_PER_DAY);
      res.setHeader("X-RateLimit-Remaining", 0);
      res.setHeader("X-RateLimit-Reset", Math.ceil(dayResult.resetTime / 1000));
      res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1000));
      next(
        new RateLimitError(
          "You have reached the daily message limit. Please try again tomorrow.",
          retryAfterMs
        )
      );
      return;
    }

    // Set headers based on the tightest remaining window
    const tightest =
      minuteResult.remaining <= hourResult.remaining &&
      minuteResult.remaining <= dayResult.remaining
        ? minuteResult
        : hourResult.remaining <= dayResult.remaining
          ? hourResult
          : dayResult;

    res.setHeader("X-Chat-RateLimit-Remaining", tightest.remaining);

    next();
  } catch (error: unknown) {
    if (error instanceof RateLimitError) {
      next(error);
      return;
    }
    // Fail open on unexpected errors — do not block chat traffic
    logger.warn("Chat user rate limit check failed, failing open", {
      userId,
      ...req.context,
    });
    next();
  }
};

// ==================== Middleware Factory ====================

/**
 * Creates Express middleware that enforces per-user chat rate limits.
 *
 * Windows:
 * - 6 messages per minute
 * - 60 messages per hour
 * - 300 messages per day
 *
 * @example
 * router.post("/api/v1/chat/completions", chatUserRateLimit(), handler);
 */
export const chatUserRateLimit =
  (): ((req: Request, res: Response, next: NextFunction) => void) =>
  (req: Request, res: Response, next: NextFunction): void => {
    void applyChatUserRateLimit(req, res, next);
  };

/**
 * Composable Rate Limiting Middleware
 *
 * Combines all security layers into a single middleware stack:
 * 1. Geographic restriction
 * 2. API key validation
 * 3. Bot detection
 * 4. Per-endpoint limits (with weight support)
 * 5. Burst detection
 * 6. Rate limiting (Redis-backed)
 *
 * RATE MULTIPLIER SEMANTICS:
 * All multipliers are < 1 for penalties, applied by MULTIPLICATION:
 *   effectiveLimit = baseMax * geoMultiplier * botMultiplier * burstMultiplier
 *
 * ENDPOINT WEIGHT SEMANTICS:
 * Weight > 1 means heavier operation, applied by DIVISION:
 *   effectiveLimit = limit / weight
 * Example: POST /analyze with weight=5 allows 1/5 the requests of a weight=1 endpoint
 *
 * BLOCKING vs THROTTLING:
 * - Blocked requests (geo, bot, burst) → throw appropriate error immediately (403/429)
 * - Throttled requests → reduced effectiveMax enforced by rate limiter
 *
 * @module rateLimit/middleware
 */

import type { Request, Response, NextFunction } from "express";
import { createLogger } from "../core/logger.js";
import { RateLimitError, AuthorizationError } from "../core/errors.js";
import { RATE_LIMIT_CONSTANTS, RATE_LIMIT_MESSAGES } from "../constants/index.js";
import { createRedisRateLimiter } from "./index.js";
import { createBurstDetector } from "./burstDetection.js";
import { createBotDetector } from "./botDetection.js";
import { createGeoBlocklist, createGeoAllowlist } from "./geoRestriction.js";
import { createApiKeyValidator } from "./apiKey.js";
import { createEndpointLimiter } from "./endpointLimits.js";
import { secureKeyGenerator, getClientIP } from "./security.js";
import type {
  RateLimitMiddlewareConfig,
  SecurityContext,
  SecurityComponents,
  RateLimitMiddlewareResult,
} from "./types.js";

const logger = createLogger("rate-limit-middleware");

// Re-export types for consumers
export type { RateLimitMiddlewareConfig, SecurityContext };

/** Creates default security context */
const createDefaultContext = (baseMax: number): SecurityContext => ({
  geoAllowed: true,
  geoMultiplier: 1,
  countryCode: null,
  geoReasonCode: null,
  isBot: false,
  botType: null,
  botMultiplier: 1,
  botBlocked: false,
  isBurst: false,
  burstMultiplier: 1,
  burstBlocked: false,
  apiKeyId: null,
  apiKeyValid: true,
  apiKeyLimit: null,
  endpointLimit: null,
  endpointId: null,
  endpointWeight: 1,
  effectiveMax: baseMax,
});

/**
 * Calculates effective rate limit based on all security signals.
 *
 * MULTIPLIER SEMANTICS:
 * - All multipliers (geo, bot, burst) are < 1 for penalties
 * - Applied via MULTIPLICATION: effective = base * multiplier
 *
 * ENDPOINT WEIGHT SEMANTICS:
 * - Weight > 1 means heavier/more expensive operation (e.g., LLM calls)
 * - Applied via DIVISION: effective = limit / weight
 * - Example: weight=5 means each request "costs" 5 units of quota
 */
const calculateEffectiveLimit = (
  baseMax: number,
  context: SecurityContext,
  invalidKeyPenalty: number
): number => {
  // Start with API key limit or base
  const startMax = context.apiKeyValid && context.apiKeyLimit ? context.apiKeyLimit.max : baseMax;

  // Apply endpoint limit (take minimum)
  const withEndpoint = context.endpointLimit
    ? Math.min(startMax, context.endpointLimit.max)
    : startMax;

  // Apply endpoint weight (heavier operations = lower effective limit)
  // weight=1 is neutral, weight>1 reduces quota (e.g., weight=5 means 1/5 the requests)
  const withWeight =
    context.endpointWeight > 1 ? Math.floor(withEndpoint / context.endpointWeight) : withEndpoint;

  // Apply all rate multipliers (< 1 reduces limit)
  const withMultipliers = Math.floor(
    withWeight * context.geoMultiplier * context.botMultiplier * context.burstMultiplier
  );

  // Apply invalid API key penalty (key present but invalid)
  const withPenalty = context.apiKeyValid
    ? withMultipliers
    : Math.floor(withMultipliers * invalidKeyPenalty);

  return Math.max(1, withPenalty);
};

/** Initializes all security components from config */
const initializeComponents = (config: RateLimitMiddlewareConfig): SecurityComponents => ({
  geoRestriction: config.geoRestriction
    ? config.geoRestriction.mode === "allowlist"
      ? createGeoAllowlist(config.geoRestriction.countries, config.geoRestriction)
      : createGeoBlocklist(config.geoRestriction.countries, config.geoRestriction)
    : null,
  botDetector: config.botDetection ? createBotDetector(config.botDetection) : null,
  burstDetector: config.burstDetection ? createBurstDetector(config.burstDetection) : null,
  apiKeyValidator: config.apiKey ? createApiKeyValidator(config.apiKey) : null,
  endpointLimiter: config.endpointLimits ? createEndpointLimiter(config.endpointLimits) : null,
});

/** Runs all security checks and populates context */
const runSecurityChecks = (
  req: Request,
  components: SecurityComponents,
  baseMax: number,
  invalidKeyPenalty: number
): SecurityContext => {
  const context = createDefaultContext(baseMax);

  // 1. Geographic restriction
  if (components.geoRestriction) {
    const result = components.geoRestriction.check(req);
    context.geoAllowed = result.isAllowed;
    context.geoMultiplier = result.rateMultiplier;
    context.countryCode = result.countryCode;
    context.geoReasonCode = result.reasonCode;
  }

  // 2. API key validation
  if (components.apiKeyValidator) {
    const result = components.apiKeyValidator.validate(req);
    switch (result.status) {
      case "valid":
        context.apiKeyId = result.keyId;
        context.apiKeyValid = true;
        context.apiKeyLimit = result.limit;
        break;
      case "invalid":
        // Key provided but malformed/rejected - apply penalty
        context.apiKeyId = null;
        context.apiKeyValid = false;
        context.apiKeyLimit = null;
        break;
      case "missing":
        // No key provided - anonymous access, no penalty
        // Keep defaults: apiKeyValid=true, apiKeyId=null
        break;
    }
  }

  // 3. Bot detection
  if (components.botDetector) {
    const result = components.botDetector.check(req);
    context.isBot = result.isBot;
    context.botType = result.botType;
    context.botMultiplier = result.rateMultiplier;
    context.botBlocked = result.shouldBlock;
  }

  // 4. Per-endpoint limits
  if (components.endpointLimiter) {
    const result = components.endpointLimiter.resolve(req);
    context.endpointLimit = result.limit;
    context.endpointId = result.endpoint;
    context.endpointWeight = result.weight ?? 1;
  }

  // 5. Burst detection (use IP-based key to avoid fingerprint collapsing)
  if (components.burstDetector) {
    const burstKey = getClientIP(req) ?? secureKeyGenerator(req);
    const result = components.burstDetector.check(burstKey);
    context.isBurst = result.isBurst;
    context.burstMultiplier = result.rateMultiplier;
    context.burstBlocked = result.shouldBlock;
  }

  context.effectiveMax = calculateEffectiveLimit(baseMax, context, invalidKeyPenalty);
  return context;
};

/** Checks for early rejections and throws appropriate errors */
const checkEarlyRejections = (context: SecurityContext, path: string): void => {
  if (!context.geoAllowed) {
    logger.info("Geo restriction triggered", {
      countryCode: context.countryCode,
      reasonCode: context.geoReasonCode,
      path,
    });
    throw new AuthorizationError("Access denied from your region");
  }

  if (context.botBlocked) {
    logger.info("Bot detection triggered", { botType: context.botType, path });
    throw new AuthorizationError("Automated access not allowed");
  }

  if (context.burstBlocked) {
    logger.info("Burst detection triggered", { path, burstMultiplier: context.burstMultiplier });
    throw new RateLimitError("Too many actions in short period", 1000);
  }
};

/** Key prefix for per-tenant rate limiting */
const TENANT_RL_PREFIX = "tenant-rl:" as const;

/**
 * Creates a tenant rate limiter when tenantRateLimit config is provided.
 * Returns null if not configured or not enabled.
 */
const createTenantLimiter = (
  config: RateLimitMiddlewareConfig
): ReturnType<typeof createRedisRateLimiter> | null => {
  const tenantConfig = config.tenantRateLimit;
  if (!tenantConfig?.enabled) {
    return null;
  }

  return createRedisRateLimiter({
    windowMs: tenantConfig.windowMs ?? config.rateLimit.windowMs,
    max: tenantConfig.max ?? config.rateLimit.max,
    message: "Tenant rate limit exceeded",
    keyPrefix: TENANT_RL_PREFIX,
    keyGenerator: (req: Request) => {
      const tenantId = req.user?.tenantId;
      return tenantId ?? "anonymous";
    },
    distributedFallback: config.distributedFallback,
  });
};

/**
 * Runs the per-tenant rate limiter if the request is from an authenticated tenant.
 * Wraps the limiter middleware call in a Promise for clean async flow.
 */
const runTenantRateLimit = (
  tenantLimiter: ReturnType<typeof createRedisRateLimiter>,
  req: Request,
  res: Response
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    tenantLimiter.middleware()(req, res, (error?: unknown) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

/**
 * Creates a comprehensive rate limiting middleware with all security layers.
 */
export const createRateLimitMiddleware = (
  config: RateLimitMiddlewareConfig
): RateLimitMiddlewareResult => {
  const invalidKeyPenalty = config.invalidKeyPenalty ?? 0.25;
  const components = initializeComponents(config);

  const rateLimiter = createRedisRateLimiter({
    ...config.rateLimit,
    keyGenerator: secureKeyGenerator,
    distributedFallback: config.distributedFallback,
    maxResolver: (req: Request) => {
      const ctx = (req as Request & { rateLimitContext?: SecurityContext }).rateLimitContext;
      return ctx?.effectiveMax ?? config.rateLimit.max;
    },
  });

  const tenantLimiter = createTenantLimiter(config);

  const middleware =
    () =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (config.skip?.(req)) {
        return next();
      }

      try {
        const context = runSecurityChecks(req, components, config.rateLimit.max, invalidKeyPenalty);
        (req as Request & { rateLimitContext?: SecurityContext }).rateLimitContext = context;

        if (config.debug) {
          logger.debug("Security context evaluated", {
            path: req.path,
            method: req.method,
            effectiveMax: context.effectiveMax,
            geoAllowed: context.geoAllowed,
            isBot: context.isBot,
            isBurst: context.isBurst,
          });
        }

        checkEarlyRejections(context, req.path);
        res.setHeader("X-RateLimit-Effective-Limit", context.effectiveMax);

        // Per-tenant rate limit check (before the main IP-based limiter)
        if (tenantLimiter && req.user?.tenantId) {
          await runTenantRateLimit(tenantLimiter, req, res);
        }

        await rateLimiter.middleware()(req, res, next);
      } catch (error) {
        if (error instanceof RateLimitError || error instanceof AuthorizationError) {
          throw error;
        }
        // Unexpected error - log as warning (fail-open but visible)
        logger.warn("Rate limit middleware error (failing open)", {
          errorType: error instanceof Error ? error.constructor.name : "unknown",
          errorMessage: error instanceof Error ? error.message : String(error),
          path: req.path,
          clientIp: getClientIP(req),
        });
        next();
      }
    };

  return {
    middleware,
    reset: rateLimiter.reset,
    components,
  };
};

/**
 * Creates a simple rate limit middleware with sensible production defaults.
 */
export const createProductionRateLimitMiddleware = (
  overrides?: Partial<RateLimitMiddlewareConfig>
): RateLimitMiddlewareResult =>
  createRateLimitMiddleware({
    rateLimit: {
      windowMs: RATE_LIMIT_CONSTANTS.DEFAULT_WINDOW_MS,
      max: RATE_LIMIT_CONSTANTS.DEFAULT_MAX_REQUESTS,
      message: RATE_LIMIT_MESSAGES.TOO_MANY_REQUESTS,
      keyPrefix: "rl:",
    },
    distributedFallback: "fail",
    botDetection: { blockMalicious: false, botRateMultiplier: 0.5 },
    burstDetection: { maxBurst: 10, rateMultiplier: 0.5, blockOnBurst: false },
    invalidKeyPenalty: 0.25,
    ...overrides,
  });

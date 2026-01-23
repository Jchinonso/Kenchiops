/**
 * Per-Endpoint Rate Limits
 *
 * Applies different rate limits based on endpoint path and method.
 *
 * Features:
 * - Exact or prefix path matching for strings
 * - RegExp pattern matching (with path length cap for ReDoS protection)
 * - Method-specific limits
 * - Priority-based rule ordering (higher priority = checked first)
 * - Stable endpoint IDs for consistent rate limit keys
 * - Default fallback limits
 *
 * RULE ORDERING:
 * Rules are sorted by priority (descending) in constructor.
 * Within same priority, array order is preserved (first match wins).
 * Custom rules typically have higher priority than common defaults.
 *
 * @module rateLimit/endpointLimits
 */

import type { Request } from "express";
import { createLogger } from "../core/logger.js";
import {
  ENDPOINT_LIMIT_DEFAULTS,
  type EndpointLimitConfig,
  type EndpointLimitsConfig,
  type EndpointLimitResult,
  type EndpointMatchMode,
} from "./types.js";

const logger = createLogger("endpoint-limits");

/**
 * Checks if a path matches a string pattern.
 */
const matchesStringPattern = (path: string, pattern: string, mode: EndpointMatchMode): boolean => {
  if (mode === "exact") {
    return path === pattern;
  }
  // prefix mode: exact match OR starts with pattern followed by /
  return path === pattern || path.startsWith(`${pattern}/`);
};

/**
 * Checks if a path matches a pattern (string or RegExp).
 * Path is capped at MAX_PATH_LENGTH before regex testing (ReDoS protection).
 */
const matchesPattern = (
  path: string,
  pattern: string | RegExp,
  mode: EndpointMatchMode
): boolean => {
  if (typeof pattern === "string") {
    return matchesStringPattern(path, pattern, mode);
  }

  // Cap path length before regex testing (ReDoS protection)
  const cappedPath = path.slice(0, ENDPOINT_LIMIT_DEFAULTS.MAX_PATH_LENGTH);
  return pattern.test(cappedPath);
};

/**
 * Checks if method is allowed for an endpoint config.
 */
const matchesMethod = (method: string, allowedMethods: string[] | undefined): boolean => {
  if (!allowedMethods || allowedMethods.length === 0) {
    return true;
  }
  return allowedMethods.includes(method);
};

/**
 * Sorts endpoint configs by priority (descending).
 * Stable sort preserves array order for same-priority rules.
 */
const sortByPriority = (endpoints: EndpointLimitConfig[]): EndpointLimitConfig[] =>
  [...endpoints].sort((first, second) => {
    const priorityFirst = first.priority ?? ENDPOINT_LIMIT_DEFAULTS.DEFAULT_PRIORITY;
    const prioritySecond = second.priority ?? ENDPOINT_LIMIT_DEFAULTS.DEFAULT_PRIORITY;
    return prioritySecond - priorityFirst; // descending
  });

/**
 * Per-endpoint rate limit resolver.
 *
 * Resolves rate limits based on request path and method.
 * Rules are checked in priority order (higher priority first).
 */
export class EndpointLimiter {
  private readonly endpoints: EndpointLimitConfig[];
  private readonly defaultLimit: { max: number; windowMs: number };

  constructor(config: EndpointLimitsConfig) {
    // Sort endpoints by priority once at construction
    this.endpoints = sortByPriority(config.endpoints);
    this.defaultLimit = config.defaultLimit;

    // Validate endpoint IDs are unique
    const ids = new Set<string>();
    for (const endpoint of this.endpoints) {
      if (ids.has(endpoint.id)) {
        logger.warn("Duplicate endpoint ID detected", { id: endpoint.id });
      }
      ids.add(endpoint.id);
    }
  }

  /**
   * Resolves rate limit for a request.
   */
  resolve(req: Request): EndpointLimitResult {
    const { path } = req;
    const method = req.method.toUpperCase();

    for (const endpoint of this.endpoints) {
      const matchMode = endpoint.match ?? "prefix";

      if (
        matchesPattern(path, endpoint.pattern, matchMode) &&
        matchesMethod(method, endpoint.methods)
      ) {
        logger.debug("Endpoint limit matched", {
          path,
          method,
          id: endpoint.id,
          max: endpoint.max,
          windowMs: endpoint.windowMs,
        });

        return {
          matched: true,
          endpoint: endpoint.id,
          limit: { max: endpoint.max, windowMs: endpoint.windowMs },
          message: endpoint.message ?? null,
          allowAnonymous: endpoint.allowAnonymous ?? false,
          weight: endpoint.weight ?? 1,
        };
      }
    }

    return {
      matched: false,
      endpoint: null,
      limit: this.defaultLimit,
      message: null,
      allowAnonymous: false,
      weight: 1,
    };
  }

  /**
   * Gets limit for a specific path/method.
   */
  getLimitForPath(path: string, method: string = "GET"): { max: number; windowMs: number } {
    const mockReq = { path, method } as Request;
    return this.resolve(mockReq).limit;
  }

  /**
   * Generates a rate limit key that includes the endpoint ID.
   * Uses stable endpoint ID (not pattern string) for clean keys.
   */
  generateKey(req: Request, baseKey: string): string {
    const result = this.resolve(req);
    if (result.matched && result.endpoint) {
      return `endpoint:${result.endpoint}|${baseKey}`;
    }
    return baseKey;
  }
}

/**
 * Creates an endpoint limiter.
 */
export const createEndpointLimiter = (config: EndpointLimitsConfig): EndpointLimiter =>
  new EndpointLimiter(config);

/**
 * Common endpoint configurations.
 *
 * Priority levels:
 * - 100: Critical security (login, password reset)
 * - 50: Auth-related
 * - 10: Infrastructure (health, webhooks)
 * - 0: Default
 */
export const COMMON_ENDPOINT_LIMITS: EndpointLimitConfig[] = [
  // Login - strictest limit, highest priority
  {
    id: "login",
    pattern: "/login",
    match: "exact",
    methods: ["POST"],
    max: 5,
    windowMs: 60000, // 5 per minute
    message: "Too many login attempts. Please try again later.",
    priority: 100,
  },
  // Password reset - very strict
  {
    id: "password-reset",
    pattern: /\/password\/reset/,
    methods: ["POST"],
    max: 3,
    windowMs: 300000, // 3 per 5 minutes
    message: "Too many password reset attempts. Please try again later.",
    priority: 100,
  },
  // Auth endpoints - stricter limits
  {
    id: "auth",
    pattern: /^\/api\/v\d+\/auth\//,
    max: 10,
    windowMs: 60000, // 10 per minute
    message: "Too many authentication requests.",
    priority: 50,
  },
  // Health check - high limit, no auth required
  {
    id: "health",
    pattern: "/health",
    match: "exact",
    max: 1000,
    windowMs: 1000,
    allowAnonymous: true,
    weight: 0, // Free endpoint
    priority: 10,
  },
  // Webhooks - high limit, no auth required
  {
    id: "webhooks",
    pattern: /^\/webhooks?\//,
    methods: ["POST"],
    max: 1000,
    windowMs: 60000,
    allowAnonymous: true,
    priority: 10,
  },
];

/**
 * Creates an endpoint limiter with common defaults.
 *
 * Custom endpoints are prepended and given higher base priority,
 * so they override common rules by default.
 */
export const createEndpointLimiterWithDefaults = (
  customEndpoints: EndpointLimitConfig[] = [],
  defaultLimit: { max: number; windowMs: number } = { max: 100, windowMs: 60000 }
): EndpointLimiter => {
  // Boost custom endpoint priorities if not explicitly set
  const boostedCustom = customEndpoints.map((endpoint) => ({
    ...endpoint,
    priority: endpoint.priority ?? 200, // Custom defaults to high priority
  }));

  return createEndpointLimiter({
    endpoints: [...boostedCustom, ...COMMON_ENDPOINT_LIMITS],
    defaultLimit,
  });
};

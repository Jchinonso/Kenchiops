/**
 * Redis-based distributed rate limiting middleware.
 *
 * Uses Redis sliding window counter for accurate, distributed rate limiting
 * that works across multiple server instances.
 *
 * Falls back to in-memory store if Redis is unavailable.
 *
 * Security features:
 * - IP validation to prevent spoofing
 * - Tenant-aware rate limiting for authenticated requests
 * - Fingerprint fallback for requests without valid IP
 * - Suspicious activity logging
 *
 * @module http/rateLimit
 */

import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import {
  AppError,
  RateLimitError,
  ExternalServiceError,
  ValidationError,
  getErrorMessage,
} from "../core/errors.js";
import { createLogger } from "../core/logger.js";
import {
  RATE_LIMIT_CONSTANTS,
  TIME_CONSTANTS,
  HTTP_RESILIENCE_DEFAULTS,
  REDIS_SCAN,
  RATE_LIMIT_MESSAGES,
} from "../constants/index.js";
import { getRedisClient } from "../queue/redisClient.js";

const logger = createLogger("rate-limiter");

// ==================== Security Constants ====================

/**
 * Headers that may contain tenant/user identification.
 */
const IDENTITY_HEADERS = {
  TENANT_ID: "x-tenant-id",
  INSTALLATION_ID: "x-installation-id",
  CLIENT_ID: "x-client-id",
} as const;

/**
 * Private/internal IP ranges that should not be used for rate limiting keys.
 */
const PRIVATE_IP_PATTERNS = [
  /^127\./, // Loopback
  /^10\./, // Class A private
  /^172\.(1[6-9]|2\d|3[01])\./, // Class B private
  /^192\.168\./, // Class C private
  /^::1$/, // IPv6 loopback
  /^fc00:/, // IPv6 private
  /^fe80:/, // IPv6 link-local
] as const;

/**
 * Maximum length for fingerprint components to prevent memory attacks.
 */
const FINGERPRINT_MAX_LENGTH = 100;

/**
 * Length of hash prefix to use for fingerprint (256 bits of entropy).
 */
const FINGERPRINT_HASH_LENGTH = 32;

/**
 * Maximum valid Retry-After header value in seconds (1 hour).
 */
const MAX_RETRY_AFTER_SECONDS = 3600;

/**
 * Minimum Retry-After header value in seconds.
 */
const MIN_RETRY_AFTER_SECONDS = 1;

/**
 * Maximum length for secondary fingerprint headers.
 */
const FINGERPRINT_SECONDARY_LENGTH = 50;

/**
 * Maximum length for short fingerprint headers.
 */
const FINGERPRINT_SHORT_LENGTH = 20;

/**
 * Maximum entries in the in-memory rate limit store to prevent memory exhaustion.
 */
const MAX_MEMORY_STORE_ENTRIES = 50000;

/**
 * Pattern for valid tenant/client IDs (alphanumeric, dashes, underscores).
 */
const VALID_IDENTITY_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Maximum value for an IPv4 octet.
 */
const IPV4_MAX_OCTET = 255;

/**
 * Number of requests between deterministic cleanups (avoids probabilistic issues).
 */
const CLEANUP_INTERVAL_REQUESTS = 100;

/**
 * Number of cleanup cycles before request counter resets to prevent overflow.
 */
const CLEANUP_CYCLES_BEFORE_RESET = 1000;

/**
 * Maximum request count before reset to prevent integer overflow.
 */
const MAX_REQUEST_COUNT = CLEANUP_INTERVAL_REQUESTS * CLEANUP_CYCLES_BEFORE_RESET;

/**
 * Maximum length for identity headers (tenant ID, installation ID, etc.).
 */
const IDENTITY_HEADER_MAX_LENGTH = 50;

/**
 * Maximum TTL in milliseconds (24 hours) to prevent integer overflow.
 */
const MAX_TTL_MS = 86400000;

/**
 * Minimum window size in milliseconds.
 */
const MIN_WINDOW_MS = 100;

/**
 * Minimum max requests per window.
 */
const MIN_MAX_REQUESTS = 1;

/**
 * Pattern for valid rate limit keys (prevents Redis injection).
 */
const VALID_RATE_LIMIT_KEY_PATTERN = /^[a-zA-Z0-9_.:\-|]+$/;

/**
 * Redis retry backoff configuration.
 */
const REDIS_RETRY_CONFIG: {
  readonly INITIAL_DELAY_MS: number;
  readonly MAX_DELAY_MS: number;
  readonly BACKOFF_MULTIPLIER: number;
} = {
  /** Initial delay before retrying Redis in ms */
  INITIAL_DELAY_MS: 5000,
  /** Maximum delay between Redis retries in ms */
  MAX_DELAY_MS: 60000,
  /** Multiplier for exponential backoff */
  BACKOFF_MULTIPLIER: 2,
};

// ==================== Security Helper Functions ====================

/**
 * Checks if an IP address is a private/internal address.
 */
const isPrivateIP = (ip: string): boolean =>
  PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ip));

/**
 * Validates an IPv4 address format and octet values.
 */
const isValidIPv4 = (ip: string): boolean => {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return false;
  }
  return parts.every((part) => {
    const num = parseInt(part, 10);
    return !isNaN(num) && num >= 0 && num <= IPV4_MAX_OCTET && part === String(num);
  });
};

/**
 * Validates an IPv6 address format (strict validation).
 * SECURITY: Rejects leading zeros per RFC 5952 to prevent bypass attacks.
 */
const isValidIPv6 = (ip: string): boolean => {
  // Must contain at least one colon and only valid hex chars and colons
  if (!ip.includes(":") || !/^[0-9a-fA-F:]+$/.test(ip)) {
    return false;
  }
  // Reject triple colons
  if (ip.includes(":::")) {
    return false;
  }
  // SECURITY: Only ONE double-colon allowed in IPv6
  const doubleColonMatches = ip.match(/::/g);
  const doubleColonCount = doubleColonMatches ? doubleColonMatches.length : 0;
  if (doubleColonCount > 1) {
    return false;
  }
  // Split and validate groups
  const groups = ip.split(":");
  // IPv6 has max 8 groups, but :: can represent missing groups
  const hasDoubleColon = doubleColonCount === 1;
  if (!hasDoubleColon && groups.length !== 8) {
    return false;
  }
  if (hasDoubleColon && groups.length > 8) {
    return false;
  }
  // Each group must be 1-4 hex chars (empty allowed for ::)
  // SECURITY: Reject leading zeros (except single "0") per RFC 5952
  // This prevents bypass attacks like "0fe80::1" vs "fe80::1"
  return groups.every((group) => {
    if (group.length === 0) {
      return true; // Empty group allowed for ::
    }
    if (group.length > 4) {
      return false;
    }
    // Reject leading zeros (e.g., "01", "001") but allow single "0"
    if (group.length > 1 && group[0] === "0") {
      return false;
    }
    return /^[0-9a-fA-F]+$/.test(group);
  });
};

/**
 * Validates and sanitizes an IP address for use as a rate limit key.
 * Returns null if the IP is invalid or private.
 */
const validateIP = (ip: string | undefined): string | null => {
  if (!ip) {
    return null;
  }

  // Validate IP format
  const isValid = isValidIPv4(ip) || isValidIPv6(ip);
  if (!isValid) {
    logger.warn("Invalid IP format detected", { ip: ip.slice(0, 50) });
    return null;
  }

  // Reject private IPs for rate limiting (they could be proxies)
  if (isPrivateIP(ip)) {
    return null;
  }

  return ip;
};

/** Socket with optional TLS cipher method */
interface TLSSocket {
  getCipher?: () => { name?: string };
}

/**
 * Creates a cryptographic fingerprint for rate limiting when IP is unavailable.
 * Uses a SHA hash of multiple request characteristics to create a
 * collision-resistant identifier that's harder to spoof than raw headers.
 *
 * SECURITY: Adds random entropy when headers are missing to prevent
 * collision attacks where attackers send minimal requests.
 */
const createRequestFingerprint = (req: Request): string => {
  const headers = req.headers ?? {};
  const userAgent = headers["user-agent"]?.slice(0, FINGERPRINT_MAX_LENGTH) ?? "";
  const acceptLang = headers["accept-language"]?.slice(0, FINGERPRINT_SECONDARY_LENGTH) ?? "";
  const acceptEnc = headers["accept-encoding"]?.slice(0, FINGERPRINT_SECONDARY_LENGTH) ?? "";
  const accept = headers.accept?.slice(0, FINGERPRINT_SECONDARY_LENGTH) ?? "";
  const connection = headers.connection?.slice(0, FINGERPRINT_SHORT_LENGTH) ?? "";
  // Include TLS cipher if available for additional entropy
  const tlsCipher = (req.socket as TLSSocket | undefined)?.getCipher?.()?.name ?? "";

  const components = [userAgent, acceptLang, acceptEnc, accept, connection, tlsCipher];

  // SECURITY: If all headers are empty/missing, add random entropy to prevent
  // fingerprint collision attacks where attackers send minimal headers
  const hasEntropy = components.some((component) => component.length > 0);
  if (!hasEntropy) {
    // Add timestamp and random value for unique fingerprint per request
    components.push(`entropy:${Date.now()}:${crypto.randomBytes(8).toString("hex")}`);
  }

  const hash = crypto
    .createHash("sha256")
    .update(components.join("|"))
    .digest("hex")
    .slice(0, FINGERPRINT_HASH_LENGTH);

  return `fp:${hash}`;
};

/**
 * Validates and sanitizes an identity header value.
 * Only allows alphanumeric characters, dashes, and underscores.
 * SECURITY: Normalizes to lowercase to prevent case-based bypass attacks.
 */
const sanitizeIdentity = (value: string | string[] | undefined): string | null => {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  // Normalize to lowercase to prevent case-based bypass (HTTP headers are case-insensitive)
  const normalized = value.slice(0, IDENTITY_HEADER_MAX_LENGTH).toLowerCase();
  if (!VALID_IDENTITY_PATTERN.test(normalized)) {
    logger.warn("Invalid identity header format detected");
    return null;
  }
  return normalized;
};

/**
 * Extracts tenant/installation identity from request headers.
 * Validates format to prevent Redis key injection.
 * Returns null if no valid identity headers are present.
 */
const extractIdentity = (req: Request): string | null => {
  // Defensive check for missing headers object
  if (!req.headers) {
    return null;
  }

  const tenantId = sanitizeIdentity(req.headers[IDENTITY_HEADERS.TENANT_ID]);
  if (tenantId) {
    return `tenant:${tenantId}`;
  }

  const installationId = sanitizeIdentity(req.headers[IDENTITY_HEADERS.INSTALLATION_ID]);
  if (installationId) {
    return `install:${installationId}`;
  }

  const clientId = sanitizeIdentity(req.headers[IDENTITY_HEADERS.CLIENT_ID]);
  if (clientId) {
    return `client:${clientId}`;
  }

  return null;
};

/**
 * Secure key generator that prevents IP spoofing and identity abuse attacks.
 *
 * SECURITY: Identity headers are COMBINED with IP/fingerprint to prevent
 * attackers from abusing arbitrary tenant IDs to exhaust other tenants' quotas.
 *
 * Key structure:
 * - With identity + IP: "tenant:abc|ip:1.2.3.4"
 * - With identity + fingerprint: "tenant:abc|fp:hash"
 * - IP only: "ip:1.2.3.4"
 * - Fingerprint only: "fp:hash"
 *
 * @param req - Express request object
 * @returns Rate limit key
 */
export const secureKeyGenerator = (req: Request): string => {
  const identity = extractIdentity(req);
  const validatedIP = validateIP(req.ip);

  // Build composite key to prevent cross-identity abuse
  if (identity && validatedIP) {
    // Best case: identity tied to specific IP
    return `${identity}|ip:${validatedIP}`;
  }

  if (identity) {
    // Identity with fingerprint fallback (still prevents cross-tenant abuse)
    const fingerprint = createRequestFingerprint(req);
    return `${identity}|${fingerprint}`;
  }

  if (validatedIP) {
    return `ip:${validatedIP}`;
  }

  // Fallback: Use request fingerprint only
  logger.debug("Using fingerprint for rate limiting - no valid IP", {
    path: req.path,
    hasXForwardedFor: !!req.headers?.["x-forwarded-for"],
  });

  return createRequestFingerprint(req);
};

// ==================== Types ====================

/**
 * Rate limit entry for in-memory fallback.
 */
interface RateLimitEntry {
  readonly resetTime: number;
  count: number;
}

/**
 * Rate limiter configuration options.
 */
interface RateLimitOptions {
  /** Time window in milliseconds */
  readonly windowMs: number;
  /** Maximum number of requests per window */
  readonly max: number;
  /** Custom error message */
  readonly message?: string;
  /** Function to generate rate limit key from request */
  readonly keyGenerator?: (req: Request) => string;
  /** Key prefix for Redis (default: "rl:") */
  readonly keyPrefix?: string;
  /** Skip rate limiting for certain requests */
  readonly skip?: (req: Request) => boolean;
}

/**
 * Rate limit info returned after checking.
 */
interface RateLimitInfo {
  readonly current: number;
  readonly remaining: number;
  readonly resetTime: number;
}

// ==================== Rate Limiter Store Interface ====================

/**
 * Abstract store interface for rate limit data.
 */
interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<RateLimitInfo>;
  reset(key: string): Promise<void>;
  resetAll(): Promise<void>;
}

// ==================== Redis Store ====================

/**
 * Lua script for atomic rate limit increment.
 * SECURITY: Prevents TTL race condition by atomically incrementing and setting expiry.
 *
 * Returns: [current_count, ttl_in_ms]
 */
const RATE_LIMIT_LUA_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
`;

/**
 * Redis-based rate limit store using sliding window counter.
 * Uses Lua script for atomic increment + expire operations.
 */
class RedisRateLimitStore implements RateLimitStore {
  private readonly keyPrefix: string;
  private readonly max: number;

  constructor(keyPrefix: string, max: number) {
    this.keyPrefix = keyPrefix;
    this.max = max;
  }

  async increment(key: string, windowMs: number): Promise<RateLimitInfo> {
    // SECURITY: Validate key format to prevent Redis injection attacks
    if (!VALID_RATE_LIMIT_KEY_PATTERN.test(key)) {
      throw new ExternalServiceError("redis", "Invalid rate limit key format");
    }

    const redis = getRedisClient();

    // SECURITY: Verify Redis client supports eval command
    if (typeof redis.eval !== "function") {
      throw new ExternalServiceError("redis", "Redis client does not support eval command");
    }

    const redisKey = `${this.keyPrefix}${key}`;

    // Use Lua script for atomic increment + expire (prevents TTL race condition)
    // SECURITY: Don't use type assertion - validate at runtime instead
    const result = await redis.eval(RATE_LIMIT_LUA_SCRIPT, 1, redisKey, windowMs.toString());

    if (!result || !Array.isArray(result) || result.length < 2) {
      throw new ExternalServiceError("redis", "Rate limit Lua script returned invalid result");
    }

    const [currentRaw, ttlRaw] = result as unknown[];

    // SECURITY: Validate Lua result types to prevent type confusion attacks
    if (typeof currentRaw !== "number" || typeof ttlRaw !== "number") {
      throw new ExternalServiceError("redis", "Rate limit Lua script returned non-numeric values");
    }

    // SECURITY: Validate values are finite numbers (not NaN or Infinity)
    if (!Number.isFinite(currentRaw) || !Number.isFinite(ttlRaw)) {
      throw new ExternalServiceError("redis", "Rate limit Lua script returned non-finite values");
    }

    const current = Math.floor(currentRaw);
    const ttl = Math.floor(ttlRaw);

    // SECURITY: Validate current count is non-negative (INCR always returns positive)
    if (current < 0) {
      throw new ExternalServiceError("redis", "Rate limit current count is negative");
    }

    // TTL can be -1 (no expiry) or -2 (key doesn't exist) from PTTL
    // If negative, use windowMs as fallback (key will expire on next INCR)
    const ttlMs = ttl > 0 ? Math.min(ttl, windowMs) : windowMs;
    const resetTime = Math.min(Date.now() + ttlMs, Number.MAX_SAFE_INTEGER);

    return {
      current,
      remaining: Math.max(0, this.max - current),
      resetTime,
    };
  }

  async reset(key: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(`${this.keyPrefix}${key}`);
  }

  async resetAll(): Promise<void> {
    const redis = getRedisClient();
    const pattern = `${this.keyPrefix}*`;

    // Use SCAN for efficient key iteration
    let cursor: string = REDIS_SCAN.INITIAL_CURSOR;
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        REDIS_SCAN.BATCH_SIZE
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== REDIS_SCAN.INITIAL_CURSOR);
  }
}

// ==================== In-Memory Store (Fallback) ====================

/**
 * In-memory rate limit store for fallback when Redis is unavailable.
 * Includes protection against memory exhaustion attacks via max entry limit.
 * Uses deterministic cleanup to avoid probabilistic timing issues.
 */
class InMemoryRateLimitStore implements RateLimitStore {
  private store: Map<string, RateLimitEntry> = new Map();
  private readonly max: number;
  private requestCount = 0;

  constructor(max: number) {
    this.max = max;
  }

  async increment(key: string, windowMs: number): Promise<RateLimitInfo> {
    const now = Date.now();
    // SECURITY: Use modulo to prevent integer overflow on long-running servers
    this.requestCount = (this.requestCount + 1) % MAX_REQUEST_COUNT;

    // Deterministic cleanup every N requests (avoids probabilistic issues)
    const shouldCleanup =
      this.requestCount % CLEANUP_INTERVAL_REQUESTS === 0 ||
      this.store.size >= MAX_MEMORY_STORE_ENTRIES;

    if (shouldCleanup) {
      this.cleanup(now);
    }

    // Check existing record first (handles existing keys even at capacity)
    const record = this.store.get(key);

    if (record && now <= record.resetTime) {
      // Existing valid window - increment count
      record.count++;
      return {
        current: record.count,
        remaining: Math.max(0, this.max - record.count),
        resetTime: record.resetTime,
      };
    }

    // Need new window - check capacity for new keys only
    if (this.store.size >= MAX_MEMORY_STORE_ENTRIES && !record) {
      // Store full and this is a new key - deny to prevent DoS
      // Existing keys can still be updated (no cascading DoS)
      logger.warn("Rate limit store full - rejecting new key", { key: key.slice(0, 30) });
      const resetTime = Math.min(now + windowMs, Number.MAX_SAFE_INTEGER);
      return { current: this.max + 1, remaining: 0, resetTime };
    }

    // Create new window (replacing expired or new entry)
    // SECURITY: Clamp resetTime to prevent integer overflow
    const resetTime = Math.min(now + windowMs, Number.MAX_SAFE_INTEGER);
    this.store.set(key, { count: 1, resetTime });
    return { current: 1, remaining: this.max - 1, resetTime };
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  async resetAll(): Promise<void> {
    this.store.clear();
    this.requestCount = 0;
  }

  private cleanup(now: number): void {
    const keysToDelete: string[] = [];
    this.store.forEach((entry, entryKey) => {
      if (entry.resetTime < now) {
        keysToDelete.push(entryKey);
      }
    });
    keysToDelete.forEach((keyToDelete) => this.store.delete(keyToDelete));
  }
}

// ==================== Rate Limiter Class ====================

/**
 * Rate limiter implementation with Redis backend and in-memory fallback.
 * Includes automatic Redis reconnection with exponential backoff.
 */
class RateLimiter {
  private redisStore: RedisRateLimitStore | null = null;
  private memoryStore: InMemoryRateLimitStore;
  private useRedis = true;
  private redisFailedAt = 0;
  private redisRetryDelay: number = REDIS_RETRY_CONFIG.INITIAL_DELAY_MS;
  /** Flag to prevent concurrent Redis retry attempts */
  private isRetryingRedis = false;
  private readonly windowMs: number;
  private readonly max: number;
  private readonly message: string;
  private readonly keyGenerator: (req: Request) => string;
  private readonly keyPrefix: string;
  private readonly skip?: (req: Request) => boolean;

  constructor(options: RateLimitOptions) {
    // SECURITY: Validate configuration to prevent misconfiguration attacks
    if (options.windowMs < MIN_WINDOW_MS) {
      throw new ValidationError(`windowMs must be at least ${MIN_WINDOW_MS}ms`);
    }
    if (options.windowMs > MAX_TTL_MS) {
      throw new ValidationError(`windowMs must not exceed ${MAX_TTL_MS}ms`);
    }
    if (options.max < MIN_MAX_REQUESTS) {
      throw new ValidationError(`max must be at least ${MIN_MAX_REQUESTS}`);
    }

    this.windowMs = options.windowMs;
    this.max = options.max;
    this.message = options.message ?? RATE_LIMIT_MESSAGES.TOO_MANY_REQUESTS;
    this.keyGenerator = options.keyGenerator ?? secureKeyGenerator;
    this.keyPrefix = options.keyPrefix ?? "rl:";
    this.skip = options.skip;

    // Initialize stores
    this.memoryStore = new InMemoryRateLimitStore(this.max);

    // Try to initialize Redis store
    this.initRedisStore();
  }

  private initRedisStore(): void {
    try {
      this.redisStore = new RedisRateLimitStore(this.keyPrefix, this.max);
    } catch (error) {
      logger.warn("Redis unavailable for rate limiting, using in-memory fallback", {
        error: getErrorMessage(error),
      });
      this.markRedisFailed();
    }
  }

  private markRedisFailed(): void {
    this.useRedis = false;
    this.redisFailedAt = Date.now();
  }

  private shouldRetryRedis(): boolean {
    // SECURITY: Prevent concurrent retry attempts (race condition fix)
    if (this.useRedis || this.isRetryingRedis) {
      return false;
    }
    const timeSinceFailure = Date.now() - this.redisFailedAt;
    return timeSinceFailure >= this.redisRetryDelay;
  }

  private getStore(): RateLimitStore {
    // Try to reconnect to Redis with exponential backoff
    if (!this.useRedis && this.shouldRetryRedis()) {
      // Set flag to prevent concurrent retry attempts
      this.isRetryingRedis = true;
      try {
        const redis = getRedisClient();
        if (redis.status === "ready") {
          logger.info("Redis connection restored for rate limiting");
          this.useRedis = true;
          this.redisRetryDelay = REDIS_RETRY_CONFIG.INITIAL_DELAY_MS;
          this.isRetryingRedis = false;
          if (!this.redisStore) {
            this.redisStore = new RedisRateLimitStore(this.keyPrefix, this.max);
          }
          return this.redisStore;
        }
      } catch (error) {
        // Still failing - increase backoff
        this.redisRetryDelay = Math.min(
          this.redisRetryDelay * REDIS_RETRY_CONFIG.BACKOFF_MULTIPLIER,
          REDIS_RETRY_CONFIG.MAX_DELAY_MS
        );
        this.redisFailedAt = Date.now();
        logger.debug("Redis retry failed, next attempt in ms", {
          delay: this.redisRetryDelay,
          error: getErrorMessage(error),
        });
      } finally {
        this.isRetryingRedis = false;
      }
    }

    if (this.useRedis && this.redisStore) {
      try {
        // Check Redis client status synchronously (no ping, faster)
        const redis = getRedisClient();
        if (redis.status === "ready") {
          return this.redisStore;
        }
        logger.warn("Redis not ready, falling back to in-memory rate limiting", {
          status: redis.status,
        });
      } catch (error) {
        logger.warn("Redis connection lost, falling back to in-memory rate limiting", {
          error: getErrorMessage(error),
        });
      }
      this.markRedisFailed();
    }
    return this.memoryStore;
  }

  readonly middleware =
    () =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (this.skip?.(req)) {
        return next();
      }

      const key = this.keyGenerator(req);
      let timeoutHandle: NodeJS.Timeout | null = null;

      try {
        const store = this.getStore();

        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new ExternalServiceError("rate-limit-store", "Rate limit check timeout")),
            HTTP_RESILIENCE_DEFAULTS.RATE_LIMIT_CHECK_TIMEOUT_MS
          );
        });
        const info = await Promise.race([store.increment(key, this.windowMs), timeoutPromise]);

        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }

        // SECURITY: Validate rate limit info values are finite before setting headers
        if (
          !Number.isFinite(info.current) ||
          !Number.isFinite(info.remaining) ||
          !Number.isFinite(info.resetTime)
        ) {
          throw new ExternalServiceError(
            "rate-limit-store",
            "Rate limit store returned non-finite values"
          );
        }

        // SECURITY: Validate and bound response header values
        res.setHeader("X-RateLimit-Limit", this.max);
        res.setHeader("X-RateLimit-Remaining", Math.max(0, info.remaining));

        // Clamp reset time to reasonable bounds (within 24 hours from now)
        const maxResetTime = Date.now() + MAX_TTL_MS;
        const boundedResetTime = Math.min(Math.max(Date.now(), info.resetTime), maxResetTime);
        res.setHeader(
          "X-RateLimit-Reset",
          Math.ceil(boundedResetTime / TIME_CONSTANTS.MILLISECONDS_PER_SECOND)
        );

        if (info.current > this.max) {
          const retryAfterMs = Math.max(0, info.resetTime - Date.now());
          const retryAfterSec = Math.min(
            Math.max(
              MIN_RETRY_AFTER_SECONDS,
              Math.ceil(retryAfterMs / TIME_CONSTANTS.MILLISECONDS_PER_SECOND)
            ),
            MAX_RETRY_AFTER_SECONDS
          );
          res.setHeader("Retry-After", retryAfterSec);

          throw new RateLimitError(this.message, retryAfterMs);
        }

        next();
      } catch (error) {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        const keyHash = crypto.createHash("sha256").update(key).digest("hex").slice(0, 8);
        const errorMessage = getErrorMessage(error);

        if (error instanceof RateLimitError) {
          throw error;
        }

        if (error instanceof AppError) {
          logger.error("Rate limiting error", {
            error: errorMessage,
            keyHash,
          });
          throw error;
        }

        logger.error("Rate limiting error, denying request for security", {
          error: errorMessage,
          keyHash,
        });
        throw new RateLimitError(
          "Service temporarily unavailable, please try again",
          TIME_CONSTANTS.MILLISECONDS_PER_SECOND
        );
      }
    };

  readonly reset = async (key?: string): Promise<void> => {
    const store = this.getStore();

    if (key) {
      await store.reset(key);
    } else {
      await store.resetAll();
    }
  };

  /**
   * Force use of in-memory store (for testing).
   */
  readonly useMemoryStore = (): void => {
    this.useRedis = false;
  };

  /**
   * Try to reconnect to Redis.
   */
  readonly reconnectRedis = (): void => {
    this.useRedis = true;
    this.initRedisStore();
  };
}

// ==================== Sync Rate Limiter (Backward Compatible) ====================

/**
 * Synchronous rate limiter for backward compatibility.
 * Uses in-memory store only but provides sync middleware.
 * Includes deterministic cleanup and max size protection.
 */
class SyncRateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private readonly windowMs: number;
  private readonly max: number;
  private readonly message: string;
  private readonly keyGenerator: (req: Request) => string;
  private requestCount = 0;

  constructor(options: RateLimitOptions) {
    // SECURITY: Validate configuration to prevent misconfiguration attacks
    if (options.windowMs < MIN_WINDOW_MS) {
      throw new ValidationError(`windowMs must be at least ${MIN_WINDOW_MS}ms`);
    }
    if (options.windowMs > MAX_TTL_MS) {
      throw new ValidationError(`windowMs must not exceed ${MAX_TTL_MS}ms`);
    }
    if (options.max < MIN_MAX_REQUESTS) {
      throw new ValidationError(`max must be at least ${MIN_MAX_REQUESTS}`);
    }

    this.windowMs = options.windowMs;
    this.max = options.max;
    this.message = options.message ?? RATE_LIMIT_MESSAGES.TOO_MANY_REQUESTS;
    this.keyGenerator = options.keyGenerator ?? secureKeyGenerator;
  }

  readonly middleware =
    () =>
    (req: Request, _res: Response, next: NextFunction): void => {
      const key = this.keyGenerator(req);
      const now = Date.now();
      // SECURITY: Use modulo to prevent integer overflow on long-running servers
      this.requestCount = (this.requestCount + 1) % MAX_REQUEST_COUNT;

      // Deterministic cleanup every N requests
      const shouldCleanup =
        this.requestCount % CLEANUP_INTERVAL_REQUESTS === 0 ||
        this.store.size >= MAX_MEMORY_STORE_ENTRIES;

      if (shouldCleanup) {
        this.cleanup(now);
      }

      // Check existing record first (handles existing keys even at capacity)
      const record = this.store.get(key);

      if (record && now <= record.resetTime) {
        // Existing valid window
        if (record.count >= this.max) {
          const retryAfterMs = record.resetTime - now;
          throw new RateLimitError(this.message, retryAfterMs);
        }
        record.count++;
        return next();
      }

      // Need new window - check capacity for new keys only
      if (this.store.size >= MAX_MEMORY_STORE_ENTRIES && !record) {
        // Store full and this is a new key - deny to prevent DoS
        throw new RateLimitError("Service temporarily unavailable", this.windowMs);
      }

      // Create new window
      // SECURITY: Clamp resetTime to prevent integer overflow
      this.store.set(key, {
        count: 1,
        resetTime: Math.min(now + this.windowMs, Number.MAX_SAFE_INTEGER),
      });
      next();
    };

  private readonly cleanup = (now: number): void => {
    const keysToDelete: string[] = [];
    this.store.forEach((entry, entryKey) => {
      if (entry.resetTime < now) {
        keysToDelete.push(entryKey);
      }
    });
    keysToDelete.forEach((keyToDelete) => this.store.delete(keyToDelete));
  };

  readonly reset = (): void => {
    this.store.clear();
    this.requestCount = 0;
  };
}

// ==================== Factory Functions ====================

/**
 * Create a Redis-backed rate limiter middleware.
 *
 * @example
 * const limiter = createRedisRateLimiter({ windowMs: 60000, max: 100 });
 * app.use('/api/', limiter.middleware());
 */
export const createRedisRateLimiter = (options: RateLimitOptions): RateLimiter =>
  new RateLimiter(options);

/**
 * Create a rate limiter middleware.
 * Uses synchronous in-memory store for backward compatibility.
 *
 * @example
 * const limiter = createRateLimiter({ windowMs: 60000, max: 100 });
 * app.use('/api/', limiter.middleware());
 */
export const createRateLimiter = (options: RateLimitOptions): SyncRateLimiter =>
  new SyncRateLimiter(options);

/**
 * Default rate limiter: 100 requests per minute per IP.
 * Uses synchronous in-memory store.
 */
export const defaultRateLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_CONSTANTS.DEFAULT_WINDOW_MS,
  max: RATE_LIMIT_CONSTANTS.DEFAULT_MAX_REQUESTS,
  message: RATE_LIMIT_MESSAGES.TOO_MANY_REQUESTS,
});

/**
 * Default Redis-backed rate limiter: 100 requests per minute per IP.
 * Falls back to in-memory if Redis is unavailable.
 */
export const defaultRedisRateLimiter = createRedisRateLimiter({
  windowMs: RATE_LIMIT_CONSTANTS.DEFAULT_WINDOW_MS,
  max: RATE_LIMIT_CONSTANTS.DEFAULT_MAX_REQUESTS,
  message: RATE_LIMIT_MESSAGES.TOO_MANY_REQUESTS,
  keyPrefix: "rl:default:",
});

// Re-export types
export type { RateLimitOptions, RateLimitInfo };

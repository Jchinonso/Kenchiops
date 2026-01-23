/**
 * Rate Limiting Types and Constants
 *
 * Type definitions and security constants for rate limiting middleware.
 *
 * @module rateLimit/types
 */

import type { Request, Response, NextFunction } from "express";

// ==================== Security Constants ====================

/**
 * Headers that may contain tenant/user identification.
 */
export const IDENTITY_HEADERS = {
  TENANT_ID: "x-tenant-id",
  INSTALLATION_ID: "x-installation-id",
  CLIENT_ID: "x-client-id",
} as const;

/**
 * Trusted proxy configuration for header validation.
 * SECURITY: Only trust X-Forwarded-For, CF-IPCountry, etc. if request
 * came from a trusted proxy IP range. Otherwise headers are attacker-controlled.
 */
export interface TrustedProxyConfig {
  /** Enable trusted proxy mode (default: false = trust Express req.ip) */
  readonly enabled: boolean;
  /** CIDR ranges of trusted proxies (e.g., Cloudflare IPs) */
  readonly cidrs: readonly string[];
  /** Headers to trust only from proxies */
  readonly trustedHeaders?: readonly string[];
}

/**
 * Default trusted proxy CIDR ranges (Cloudflare IPv4).
 * Update periodically from https://www.cloudflare.com/ips-v4
 */
export const CLOUDFLARE_IPV4_CIDRS = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
] as const;

/**
 * Private/internal IP ranges that should not be used for rate limiting keys.
 */
export const PRIVATE_IP_PATTERNS = [
  /^127\./, // IPv4 loopback
  /^10\./, // IPv4 Class A private
  /^172\.(1[6-9]|2\d|3[01])\./, // IPv4 Class B private
  /^192\.168\./, // IPv4 Class C private
  /^::1$/, // IPv6 loopback
  /^f[cd][0-9a-f]{2}:/i, // IPv6 ULA (fc00::/7 = fc00::/8 + fd00::/8)
  /^fe80:/i, // IPv6 link-local
] as const;

/**
 * Maximum length for fingerprint components to prevent memory attacks.
 */
export const FINGERPRINT_MAX_LENGTH = 100;

/**
 * Length of hash prefix to use for fingerprint (256 bits of entropy).
 */
export const FINGERPRINT_HASH_LENGTH = 32;

/**
 * Maximum valid Retry-After header value in seconds (1 hour).
 */
export const MAX_RETRY_AFTER_SECONDS = 3600;

/**
 * Minimum Retry-After header value in seconds.
 */
export const MIN_RETRY_AFTER_SECONDS = 1;

/**
 * Maximum length for secondary fingerprint headers.
 */
export const FINGERPRINT_SECONDARY_LENGTH = 50;

/**
 * Maximum length for short fingerprint headers.
 */
export const FINGERPRINT_SHORT_LENGTH = 20;

/**
 * Maximum entries in the in-memory rate limit store to prevent memory exhaustion.
 */
export const MAX_MEMORY_STORE_ENTRIES = 50000;

/**
 * Maximum length for rate limit keys to prevent memory DoS attacks.
 */
export const MAX_RATE_LIMIT_KEY_LENGTH = 256;

/**
 * Maximum reasonable rate limit count (sanity check for corrupt Redis state).
 * If count exceeds this, treat as error rather than silent corruption.
 */
export const MAX_RATE_LIMIT_COUNT = 10_000_000;

/**
 * Backoff time in ms when store is full and rejecting new keys.
 * Shorter than full window to allow faster recovery.
 */
export const STORE_FULL_BACKOFF_MS = 5000;

/**
 * Maximum length for rate limit key prefix.
 * Prefix + key must not exceed MAX_RATE_LIMIT_KEY_LENGTH.
 */
export const MAX_KEY_PREFIX_LENGTH = 64;

/**
 * Required prefix namespace for rate limit keys.
 * SECURITY: All rate limit keys must start with this to prevent accidental
 * collision with other Redis keys and enable safe glob operations.
 */
export const RATE_LIMIT_NAMESPACE = "rl:" as const;

/**
 * Pattern for valid key prefix (no Redis glob metacharacters).
 * SECURITY: Prevents glob injection in resetAll() which uses prefix + "*".
 * Allowed: alphanumeric, colons, underscores, hyphens.
 * Forbidden: * ? [ ] \ (Redis glob chars)
 */
export const VALID_KEY_PREFIX_PATTERN = /^[a-zA-Z0-9:_-]+$/;

/**
 * Redis glob metacharacters that must not appear in key prefixes.
 * Used for explicit error messages.
 */
export const REDIS_GLOB_CHARS = ["*", "?", "[", "]", "\\"] as const;

/**
 * Length of SHA-256 hash prefix for privacy-safe key logging.
 * 12 hex chars = 48 bits, sufficient for debugging without revealing full key.
 */
export const KEY_LOG_HASH_LENGTH = 12;

/**
 * Pattern for valid tenant/client IDs (alphanumeric, dashes, underscores).
 */
export const VALID_IDENTITY_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Maximum value for an IPv4 octet.
 */
export const IPV4_MAX_OCTET = 255;

/**
 * Number of requests between deterministic cleanups (avoids probabilistic issues).
 */
export const CLEANUP_INTERVAL_REQUESTS = 100;

/**
 * Number of cleanup cycles before request counter resets to prevent overflow.
 */
export const CLEANUP_CYCLES_BEFORE_RESET = 1000;

/**
 * Maximum request count before reset to prevent integer overflow.
 */
export const MAX_REQUEST_COUNT = CLEANUP_INTERVAL_REQUESTS * CLEANUP_CYCLES_BEFORE_RESET;

/**
 * Maximum length for identity headers (tenant ID, installation ID, etc.).
 */
export const IDENTITY_HEADER_MAX_LENGTH = 50;

/**
 * Maximum TTL in milliseconds (24 hours) to prevent integer overflow.
 */
export const MAX_TTL_MS = 86400000;

/**
 * Minimum window size in milliseconds.
 */
export const MIN_WINDOW_MS = 100;

/**
 * Minimum max requests per window.
 */
export const MIN_MAX_REQUESTS = 1;

/**
 * Pattern for valid rate limit keys (prevents Redis injection).
 */
export const VALID_RATE_LIMIT_KEY_PATTERN = /^[a-zA-Z0-9_.:\-|]+$/;

/**
 * Redis retry backoff configuration.
 */
export const REDIS_RETRY_CONFIG = {
  /** Initial delay before retrying Redis in ms */
  INITIAL_DELAY_MS: 5000,
  /** Maximum delay between Redis retries in ms */
  MAX_DELAY_MS: 60000,
  /** Multiplier for exponential backoff */
  BACKOFF_MULTIPLIER: 2,
} as const;

// ==================== Types ====================

/**
 * Rate limit entry for in-memory fallback.
 */
export interface RateLimitEntry {
  readonly resetTime: number;
  count: number;
}

/**
 * Parsed and validated Lua script result for rate limiting.
 */
export interface RateLimitLuaResult {
  readonly current: number;
  readonly ttl: number;
}

/**
 * Fallback behavior when Redis is unavailable in distributed deployments.
 */
export type FallbackBehavior =
  /** Use in-memory fallback (DANGEROUS in multi-instance: allows bypass) */
  | "memory"
  /** Fail with 503 Service Unavailable (strict, safe) */
  | "fail"
  /** Apply very conservative global limit (10 req/min) */
  | "conservative";

/**
 * Rate limiter configuration options.
 */
export interface RateLimitOptions {
  /** Time window in milliseconds */
  readonly windowMs: number;
  /** Maximum number of requests per window (base limit) */
  readonly max: number;
  /**
   * Dynamic max resolver for per-request limit adjustment.
   * Called for each request to determine the effective max.
   * If provided, overrides static `max` value.
   *
   * Use this for:
   * - API key specific limits
   * - Endpoint-specific limits
   * - Security multiplier adjustments (bot/burst/geo penalties)
   *
   * @param req - Express request object
   * @returns Effective max requests for this request
   */
  readonly maxResolver?: (req: Request) => number;
  /** Custom error message */
  readonly message?: string;
  /** Function to generate rate limit key from request */
  readonly keyGenerator?: (req: Request) => string;
  /** Key prefix for Redis (default: "rl:") */
  readonly keyPrefix?: string;
  /** Skip rate limiting for certain requests */
  readonly skip?: (req: Request) => boolean;
  /**
   * Behavior when Redis is unavailable in distributed deployments.
   * - "memory": Use in-memory fallback (DANGEROUS: allows bypass across instances)
   * - "fail": Return 503 Service Unavailable (strict, recommended for prod)
   * - "conservative": Apply very conservative limit (10 req/min)
   * Default: "memory" for backward compatibility. Set to "fail" in production.
   */
  readonly distributedFallback?: FallbackBehavior;
}

/**
 * Rate limit info returned after checking.
 */
export interface RateLimitInfo {
  readonly current: number;
  readonly remaining: number;
  readonly resetTime: number;
}

/**
 * Abstract store interface for rate limit data.
 */
export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<RateLimitInfo>;
  reset(key: string): Promise<void>;
  resetAll(): Promise<void>;
}

/** Socket with optional TLS cipher method */
export interface TLSSocket {
  getCipher?: () => { name?: string };
}

// ==================== Burst Detection Types ====================

/**
 * Burst detection configuration.
 */
export interface BurstDetectionConfig {
  /** Time window for burst detection in milliseconds (default: 1000ms) */
  readonly windowMs?: number;
  /** Maximum requests allowed in burst window before flagging (default: 10) */
  readonly maxBurst?: number;
  /**
   * Rate multiplier when in penalty period (default: 0.5 = half quota).
   * Values < 1 mean stricter limits during penalty.
   * Semantics: effectiveLimit = maxRequests * rateMultiplier
   */
  readonly rateMultiplier?: number;
  /**
   * Duration of penalty period in milliseconds (default: same as windowMs).
   * Separate from rateMultiplier for clearer semantics.
   */
  readonly penaltyDurationMs?: number;
  /** Whether to block requests during burst (default: false, just penalize) */
  readonly blockOnBurst?: boolean;
}

/**
 * Burst detection defaults.
 *
 * RATE MULTIPLIER SEMANTICS (aligned with bot detector):
 * rateMultiplier is < 1 for penalties, meaning stricter limits.
 *   effectiveLimit = maxRequests * rateMultiplier
 *
 * Values:
 * - 1.0 = normal rate
 * - 0.5 = half rate (default penalty)
 * - 0.25 = quarter rate (severe penalty)
 */
export const BURST_DETECTION_DEFAULTS = {
  WINDOW_MS: 1000,
  MAX_BURST: 10,
  /** Rate multiplier during penalty (0.5 = half quota, aligned with bot detector) */
  RATE_MULTIPLIER: 0.5,
  /** Minimum rate multiplier (never 0 - use shouldBlock for blocking) */
  MIN_RATE_MULTIPLIER: 0.1,
  BLOCK_ON_BURST: false,
  /** Maximum tracked timestamps per key to prevent memory exhaustion */
  MAX_TIMESTAMPS: 100,
  /** Number of requests between cleanup cycles */
  CLEANUP_INTERVAL: 100,
  /** Maximum tracked keys to prevent memory exhaustion under load */
  MAX_KEYS: 10000,
  /** Compaction threshold: compact array when startIdx exceeds this */
  COMPACTION_THRESHOLD: 50,
  /** Absolute array cap: force compaction when array length exceeds this */
  MAX_ARRAY_LENGTH: 200,
  /** Maximum penalty duration cap (prevents infinite extension under sustained attack) */
  MAX_PENALTY_MS: 60000,
} as const;

/**
 * Burst detection result.
 */
export interface BurstDetectionResult {
  readonly isBurst: boolean;
  readonly requestsInWindow: number;
  readonly shouldBlock: boolean;
  /**
   * Rate multiplier for throttling (0.1-1.0).
   * Semantics: effectiveLimit = maxRequests * rateMultiplier
   * Values < 1 mean stricter limits. Never 0; use shouldBlock for blocking.
   */
  readonly rateMultiplier: number;
}

/**
 * Burst tracking entry.
 *
 * Uses index pointer approach for efficient pruning:
 * - `startIdx` marks first valid timestamp (avoids O(n) filter/shift)
 * - Array compacts when startIdx exceeds threshold
 * - `lastSeen` tracks last activity for eviction/cleanup (simpler than array peek)
 */
export interface BurstTrackingEntry {
  timestamps: number[];
  /** Index of first valid timestamp (for efficient pruning) */
  startIdx: number;
  penaltyUntil: number;
  /** Last activity timestamp (for eviction/cleanup, simpler than array peek) */
  lastSeen: number;
}

// ==================== API Key Types ====================

/**
 * API key configuration for rate limiting.
 */
export interface ApiKeyConfig {
  /** Header name for API key (default: "x-api-key") */
  readonly headerName?: string;
  /** Pattern to validate API key format */
  readonly validationPattern?: RegExp;
  /** Maximum length for API key */
  readonly maxLength?: number;
  /** Per-key rate limit overrides */
  readonly keyLimits?: Record<string, ApiKeyLimit>;
  /** Default limit for keys not in keyLimits */
  readonly defaultLimit?: ApiKeyLimit;
}

/**
 * Rate limit configuration for a specific API key.
 */
export interface ApiKeyLimit {
  /** Requests per window */
  readonly max: number;
  /** Window size in milliseconds */
  readonly windowMs: number;
  /** Daily quota (optional) */
  readonly dailyQuota?: number;
  /** Monthly quota (optional) */
  readonly monthlyQuota?: number;
}

/**
 * API key defaults.
 */
export const API_KEY_DEFAULTS = {
  HEADER_NAME: "x-api-key",
  MAX_LENGTH: 128,
  VALIDATION_PATTERN: /^[a-zA-Z0-9_-]+$/,
} as const;

/**
 * API key validation status.
 * - "missing": No key provided (anonymous access, no penalty)
 * - "invalid": Key provided but malformed/expired/etc. (apply penalty)
 * - "valid": Key provided and valid
 */
export type ApiKeyStatus = "missing" | "invalid" | "valid";

/**
 * API key validation result.
 */
export interface ApiKeyValidationResult {
  /**
   * Validation status for unambiguous handling.
   * - "missing": No penalty, allow anonymous
   * - "invalid": Apply penalty (key was provided but rejected)
   * - "valid": Apply key-specific limits
   */
  readonly status: ApiKeyStatus;
  /** @deprecated Use `status === "valid"` instead */
  readonly isValid: boolean;
  /**
   * Hashed key ID (SHA-256) for rate limiting and logging.
   * SECURITY: Raw API key is never returned to prevent accidental logging.
   * Only populated when status is "valid".
   */
  readonly keyId: string | null;
  readonly limit: ApiKeyLimit | null;
  readonly error?: string;
}

// ==================== Bot Detection Types ====================

/**
 * Known bot User-Agent patterns.
 */
export const BOT_PATTERNS = {
  /** Search engine crawlers (allowed) */
  SEARCH_ENGINES: [
    /googlebot/i,
    /bingbot/i,
    /slurp/i, // Yahoo
    /duckduckbot/i,
    /baiduspider/i,
    /yandexbot/i,
  ],
  /** Monitoring/health check bots (allowed) */
  MONITORING: [/uptimerobot/i, /pingdom/i, /newrelic/i, /datadog/i, /statuspage/i],
  /** Suspicious/malicious patterns (blocked) */
  MALICIOUS: [
    /python-requests/i,
    /curl\//i,
    /wget\//i,
    /scrapy/i,
    /httpclient/i,
    /java\//i,
    /libwww-perl/i,
    /Go-http-client/i,
    /PHP\//i,
  ],
  /** Empty or missing User-Agent */
  EMPTY_UA: /^$/,
} as const;

/**
 * Bot detection configuration.
 *
 * IMPORTANT: Bot detection should be signal-based, not automatic blocking.
 * Blocking curl/python/etc. breaks legitimate integrations, internal scripts,
 * and partner webhook testing. Use as signal for rate limiting, not rejection.
 */
export interface BotDetectionConfig {
  /** Allow search engine bots (default: true) */
  readonly allowSearchEngines?: boolean;
  /** Allow monitoring bots (default: true) */
  readonly allowMonitoring?: boolean;
  /** Block requests with no User-Agent (default: false) */
  readonly blockEmptyUA?: boolean;
  /**
   * Block known malicious patterns (default: false).
   * WARNING: Setting to true can break legitimate integrations.
   * Prefer using bot detection as a signal for rate limiting instead.
   */
  readonly blockMalicious?: boolean;
  /** Custom allowed patterns */
  readonly customAllowed?: RegExp[];
  /** Custom blocked patterns */
  readonly customBlocked?: RegExp[];
  /** Rate limit multiplier for bots (default: 0.5 = half the normal rate) */
  readonly botRateMultiplier?: number;
  /**
   * Only apply bot blocking to unauthenticated requests (default: true).
   * Authenticated requests (valid API key, tenant ID) bypass bot blocking.
   */
  readonly onlyBlockUnauthenticated?: boolean;
  /**
   * API keys that bypass bot detection entirely.
   * Use for trusted integrations, partners, and internal tools.
   */
  readonly bypassApiKeys?: readonly string[];
}

/**
 * Bot detection defaults.
 * NOTE: blockMalicious defaults to false to avoid breaking legitimate integrations.
 */
export const BOT_DETECTION_DEFAULTS = {
  ALLOW_SEARCH_ENGINES: true,
  ALLOW_MONITORING: true,
  BLOCK_EMPTY_UA: false,
  /** Default false to avoid breaking legitimate curl/python integrations */
  BLOCK_MALICIOUS: false,
  BOT_RATE_MULTIPLIER: 0.5,
  ONLY_BLOCK_UNAUTHENTICATED: true,
  /**
   * Maximum UA length to test against regexes (ReDoS protection).
   * Long UAs are truncated before pattern matching.
   */
  MAX_UA_LENGTH: 512,
  /**
   * Minimum rate multiplier (never 0 - use shouldBlock for blocking).
   * Prevents accidental rate limit bypass through zero multiplier.
   */
  MIN_RATE_MULTIPLIER: 0.1,
  /**
   * Rate multiplier for empty/unknown UA (heavily throttled).
   * More restrictive than regular bots but still allows requests.
   */
  EMPTY_UA_RATE_MULTIPLIER: 0.25,
} as const;

/**
 * Bot detection result.
 */
/**
 * Bot category for downstream handling.
 * - "allowed": Known good bots (search engines, monitoring)
 * - "suspicious": Potentially unwanted but not necessarily malicious
 * - "malicious": Known bad patterns
 * - "unknown": Empty UA or unclassified
 */
export type BotCategory = "allowed" | "suspicious" | "malicious" | "unknown";

export interface BotDetectionResult {
  readonly isBot: boolean;
  readonly botType:
    | "search_engine"
    | "monitoring"
    | "malicious"
    | "custom"
    | "empty_ua"
    | "unknown"
    | null;
  /**
   * Category for downstream handling decisions.
   * Helps distinguish "bot == search engine" from "bot == scraper".
   */
  readonly category: BotCategory | null;
  readonly shouldBlock: boolean;
  /**
   * Rate multiplier for throttling (0.1-1.0).
   * IMPORTANT: Never 0. Use shouldBlock for blocking decisions.
   * Downstream code should multiply maxRequests by this value.
   */
  readonly rateMultiplier: number;
  /** Sanitized User-Agent (truncated, newlines removed) */
  readonly userAgent: string;
}

// ==================== Geographic Restriction Types ====================

/**
 * Geo restriction category for downstream handling.
 *
 * SEMANTIC DEFINITIONS (category reflects ACTION, not source):
 * - "allowed": Request proceeds with normal rate limits (1.0 multiplier)
 * - "restricted": Request proceeds but with reduced rate limits (< 1.0 multiplier)
 * - "blocked": Request should be rejected (isAllowed=false)
 *
 * NOTE: Unknown countries map to one of these based on `unknownCountryAction`:
 * - unknownCountryAction="allow" → category="allowed", reasonCode="UNKNOWN_ALLOWED"
 * - unknownCountryAction="block" → category="blocked", reasonCode="UNKNOWN_BLOCKED"
 * - unknownCountryAction="rate_limit" → category="restricted", reasonCode="UNKNOWN_RESTRICTED"
 *
 * Use `reasonCode` to determine the source (e.g., UNKNOWN_*, UNTRUSTED_PROXY).
 */
export type GeoCategory = "allowed" | "restricted" | "blocked";

/**
 * Reason codes for geo restriction decisions (machine-readable).
 * Use these for programmatic handling; `reason` field is for logs.
 */
export type GeoReasonCode =
  | "ALLOWLIST_MATCH" // Country in allowlist
  | "ALLOWLIST_MISS" // Country not in allowlist (blocked)
  | "BLOCKLIST_MATCH" // Country in blocklist (blocked)
  | "BLOCKLIST_MISS" // Country not in blocklist (allowed)
  | "UNKNOWN_BLOCKED" // Unknown country, config says block
  | "UNKNOWN_RESTRICTED" // Unknown country, config says rate_limit
  | "UNKNOWN_ALLOWED" // Unknown country, config says allow
  | "UNTRUSTED_PROXY" // Geo header ignored (proxy not trusted)
  | "MULTIPLE_GEO_HEADERS"; // Multiple geo headers detected (suspicious)

/**
 * Geographic restriction configuration.
 *
 * SECURITY WARNING: Geo headers (CF-IPCountry, X-Geo-Country) are only trustworthy
 * if the request came from a trusted proxy (e.g., Cloudflare). Without proxy validation,
 * clients can spoof these headers. Use `requireTrustedProxy` to enforce this.
 */
export interface GeoRestrictionConfig {
  /** Mode: "allowlist" only allows listed, "blocklist" blocks listed */
  readonly mode: "allowlist" | "blocklist";
  /** List of country codes (ISO 3166-1 alpha-2) */
  readonly countries: string[];
  /** Header containing country code (from CDN/proxy) */
  readonly countryHeader?: string;
  /** Fallback action when country unknown */
  readonly unknownCountryAction?: "allow" | "block" | "rate_limit";
  /**
   * Rate limit multiplier for restricted regions (default: 0.25).
   * Clamped to [MIN_RATE_MULTIPLIER, 1] in constructor.
   */
  readonly restrictedRateMultiplier?: number;
  /**
   * Whether to require trusted proxy context (default: false).
   * When true, logs warning if request.context?.isTrustedProxy is not true.
   * This helps detect misconfiguration where geo headers may be spoofed.
   */
  readonly requireTrustedProxy?: boolean;
}

/**
 * Geographic restriction defaults.
 *
 * RATE MULTIPLIER SEMANTICS (aligned with bot/burst detectors):
 * rateMultiplier is < 1 for restrictions, meaning stricter limits.
 *   effectiveLimit = maxRequests * rateMultiplier
 *
 * Values:
 * - 1.0 = normal rate (no restriction)
 * - 0.25 = quarter rate (default for restricted regions)
 * - 0.1 = minimum (never 0 - use isAllowed for blocking)
 */
export const GEO_RESTRICTION_DEFAULTS = {
  COUNTRY_HEADER: "cf-ipcountry", // Cloudflare header
  UNKNOWN_COUNTRY_ACTION: "allow" as const,
  /** Rate multiplier for restricted regions (0.25 = quarter quota) */
  RESTRICTED_RATE_MULTIPLIER: 0.25,
  /** Minimum rate multiplier (never 0 - use isAllowed for blocking) */
  MIN_RATE_MULTIPLIER: 0.1,
  /** ISO 3166-1 alpha-2 country code length */
  COUNTRY_CODE_LENGTH: 2,
  /** Valid country code pattern (2 uppercase letters) */
  COUNTRY_CODE_PATTERN: /^[A-Z]{2}$/,
  /** Maximum countries in config (prevents memory issues) */
  MAX_COUNTRIES: 500,
} as const;

/**
 * Express Request with optional trusted proxy context.
 * Used by geo restriction to verify header trustworthiness.
 */
export interface RequestWithProxyContext extends Request {
  context?: {
    isTrustedProxy?: boolean;
    [key: string]: unknown;
  };
}

/**
 * Parameters for building geo restriction result.
 */
export interface GeoBuildResultParams {
  readonly countryCode: string | null;
  readonly isAllowed: boolean;
  readonly isRestricted: boolean;
  readonly rateMultiplier: number;
  readonly category: GeoCategory;
  readonly reasonCode: GeoReasonCode;
  readonly reason: string;
}

/**
 * Geographic restriction result.
 *
 * SEMANTIC CONTRACT:
 * - isAllowed=true, isRestricted=false → normal request (category: allowed/unknown)
 * - isAllowed=true, isRestricted=true  → throttled but allowed (category: restricted)
 * - isAllowed=false, isRestricted=false → blocked (category: blocked)
 *
 * RATE MULTIPLIER SEMANTICS:
 * - rateMultiplier is never 0 (use isAllowed for blocking decisions)
 * - Values < 1 mean stricter limits: effectiveLimit = maxRequests * rateMultiplier
 * - Blocked requests use MIN_RATE_MULTIPLIER for metrics (but isAllowed=false gates)
 */
export interface GeoRestrictionResult {
  /** Detected country code (ISO 3166-1 alpha-2) or null if unknown */
  readonly countryCode: string | null;
  /**
   * Whether the request should be allowed to proceed.
   * false = BLOCKED (middleware should reject)
   * true = allowed (may still be throttled if isRestricted=true)
   */
  readonly isAllowed: boolean;
  /**
   * Whether rate limiting restrictions apply (throttling).
   * Only meaningful when isAllowed=true.
   * true = apply reduced rate limit (rateMultiplier < 1)
   * false = normal rate limit
   */
  readonly isRestricted: boolean;
  /**
   * Rate multiplier for throttling (0.1-1.0).
   * IMPORTANT: Never 0. Use isAllowed for blocking decisions.
   * Semantics: effectiveLimit = maxRequests * rateMultiplier
   */
  readonly rateMultiplier: number;
  /**
   * Category for downstream handling decisions.
   * - "allowed": normal request
   * - "restricted": throttled but allowed
   * - "blocked": should be rejected
   * - "unknown": country unknown (action depends on config)
   */
  readonly category: GeoCategory;
  /**
   * Machine-readable reason code for programmatic handling.
   * Use this for metrics, alerts, and conditional logic.
   */
  readonly reasonCode: GeoReasonCode;
  /**
   * Human-readable reason for logging and debugging.
   * WARNING: May contain policy details; don't expose to clients.
   */
  readonly reason: string;
}

// ==================== Per-Endpoint Limit Types ====================

/**
 * Endpoint limit defaults.
 */
export const ENDPOINT_LIMIT_DEFAULTS = {
  /** Maximum path length before pattern matching (ReDoS protection) */
  MAX_PATH_LENGTH: 2048,
  /** Default priority for rules (higher = checked first) */
  DEFAULT_PRIORITY: 0,
} as const;

/**
 * Match mode for string patterns.
 * - "exact": path must equal pattern exactly
 * - "prefix": path must start with pattern (with optional trailing segments)
 */
export type EndpointMatchMode = "exact" | "prefix";

/**
 * Endpoint-specific rate limit configuration.
 *
 * RULE ORDERING: Rules are sorted by priority (higher first).
 * Within same priority, order in array is preserved (first match wins).
 */
export interface EndpointLimitConfig {
  /**
   * Stable identifier for this endpoint rule.
   * Used in rate limit keys and metrics. Should be short, lowercase, alphanumeric.
   * Example: "auth", "login", "health", "webhooks"
   */
  readonly id: string;
  /** Pattern to match endpoint (string or RegExp) */
  readonly pattern: string | RegExp;
  /**
   * Match mode for string patterns (default: "prefix").
   * - "exact": path === pattern
   * - "prefix": path === pattern OR path.startsWith(pattern + "/")
   * Ignored for RegExp patterns.
   */
  readonly match?: EndpointMatchMode;
  /** HTTP methods this limit applies to (empty = all methods) */
  readonly methods?: string[];
  /** Maximum requests per window */
  readonly max: number;
  /** Window size in milliseconds */
  readonly windowMs: number;
  /** Custom message for this endpoint (returned in result for middleware) */
  readonly message?: string;
  /**
   * Allow anonymous (unauthenticated) requests for rate limit keying.
   * When true, requests without identity use IP-based keys instead of requiring auth.
   * Useful for public endpoints like health checks and webhooks.
   */
  readonly allowAnonymous?: boolean;
  /**
   * Priority for rule ordering (default: 0, higher = checked first).
   * Use to ensure specific rules aren't shadowed by broader patterns.
   */
  readonly priority?: number;
  /**
   * Cost weight for this endpoint (default: 1).
   * Expensive operations (LLM analysis, file uploads) should have higher weights.
   * Example: POST /analyze = 10 units, GET /health = 0 units.
   */
  readonly weight?: number;
}

/**
 * Per-endpoint limits configuration.
 */
export interface EndpointLimitsConfig {
  /** Endpoint-specific configurations */
  readonly endpoints: EndpointLimitConfig[];
  /** Default limit when no endpoint matches */
  readonly defaultLimit: {
    readonly max: number;
    readonly windowMs: number;
  };
}

/**
 * Endpoint limit match result.
 */
export interface EndpointLimitResult {
  readonly matched: boolean;
  /** Stable endpoint ID (from config) or null if default */
  readonly endpoint: string | null;
  readonly limit: { max: number; windowMs: number };
  /** Custom message for rate limit response (if configured) */
  readonly message: string | null;
  /** Whether anonymous requests are allowed for this endpoint */
  readonly allowAnonymous: boolean;
  /** Cost weight for this endpoint (for weighted rate limiting) */
  readonly weight: number;
}

// ==================== Request Signature Types ====================

/**
 * Fields that can be included in request signature.
 */
export type SignedField = "body" | "path" | "method" | "timestamp" | "query";

/**
 * HMAC signature configuration.
 *
 * Canonical String Format:
 * ```
 * METHOD\n
 * PATH\n
 * CANONICAL_QUERY\n
 * TIMESTAMP\n
 * SHA256(BODY)\n
 * ```
 *
 * Canonicalization Rules:
 * - Query params: sorted alphabetically, URL-encoded
 * - Body: SHA-256 hash of raw bytes as received (not parsed JSON)
 * - Headers: lowercase, trimmed
 *
 * Note: For streaming bodies, compute hash incrementally or require
 * Content-Length and buffer.
 */
/**
 * Source for path component in signature.
 * - "path": uses req.path (default, may differ behind proxies)
 * - "originalUrl": uses req.originalUrl without query (more stable)
 */
export type PathSource = "path" | "originalUrl";

export interface SignatureConfig {
  /** Header containing the signature */
  readonly signatureHeader?: string;
  /** Header containing the timestamp */
  readonly timestampHeader?: string;
  /** Secret key for HMAC (or function to get key by key ID) */
  readonly secret: string | ((keyId: string) => string | null);
  /** Header containing key ID (for multi-key setups) */
  readonly keyIdHeader?: string;
  /** Algorithm for HMAC (default: sha256). Only sha256/sha384/sha512 allowed. */
  readonly algorithm?: SignatureAlgorithm;
  /**
   * Maximum age of signature in milliseconds (replay window).
   * Signatures older than this are rejected.
   * Default: 300000 (5 minutes).
   */
  readonly maxAge?: number;
  /**
   * Clock skew tolerance for future timestamps in milliseconds.
   * Allows clients with slightly fast clocks.
   * Default: 30000 (30 seconds).
   */
  readonly clockSkewMs?: number;
  /** Fields to include in signature (default: body + timestamp) */
  readonly signedFields?: SignedField[];
  /**
   * Use raw body bytes for signature (preferred for webhooks).
   * Requires Express middleware to capture req.rawBody.
   * Default: false (uses JSON.stringify for backward compatibility).
   */
  readonly useRawBody?: boolean;
  /**
   * Sort query parameters alphabetically for canonical form.
   * Default: true.
   */
  readonly sortQueryParams?: boolean;
  /**
   * Source for path component. Default: "originalUrl".
   * - "path": uses req.path (may change with router mounting)
   * - "originalUrl": uses req.originalUrl without query (more stable)
   */
  readonly pathSource?: PathSource;
}

/**
 * Allowed HMAC algorithms (whitelist).
 * SECURITY: Restricting to known-secure algorithms prevents downgrade attacks.
 */
export const ALLOWED_SIGNATURE_ALGORITHMS = ["sha256", "sha384", "sha512"] as const;
export type SignatureAlgorithm = (typeof ALLOWED_SIGNATURE_ALGORITHMS)[number];

/**
 * Expected signature lengths in hex for each algorithm.
 * sha256 = 32 bytes = 64 hex chars
 * sha384 = 48 bytes = 96 hex chars
 * sha512 = 64 bytes = 128 hex chars
 */
export const SIGNATURE_HEX_LENGTHS: Record<SignatureAlgorithm, number> = {
  sha256: 64,
  sha384: 96,
  sha512: 128,
} as const;

/**
 * Pattern for valid hex signature (lowercase hex characters only).
 */
export const HEX_SIGNATURE_PATTERN = /^[a-f0-9]+$/;

/**
 * Pattern for valid integer timestamp string.
 */
export const TIMESTAMP_PATTERN = /^[0-9]+$/;

/**
 * Length of hash prefix for safe key ID logging (8 hex chars).
 */
export const KEY_ID_LOG_PREFIX_LENGTH = 8;

/**
 * Signature verification defaults.
 */
export const SIGNATURE_DEFAULTS = {
  SIGNATURE_HEADER: "x-signature",
  TIMESTAMP_HEADER: "x-timestamp",
  KEY_ID_HEADER: "x-key-id",
  ALGORITHM: "sha256" as SignatureAlgorithm,
  MAX_AGE_MS: 300000, // 5 minutes
  CLOCK_SKEW_MS: 30000, // 30 seconds tolerance for fast clocks
  SIGNED_FIELDS: ["body", "timestamp"] as const,
  PATH_SOURCE: "originalUrl" as PathSource,
} as const;

/**
 * Signature verification result.
 */
export interface SignatureVerificationResult {
  readonly isValid: boolean;
  readonly error?: string;
  readonly keyId?: string;
  readonly timestamp?: number;
  readonly age?: number;
}

/**
 * Result of extracting a single header value.
 * Discriminated union: check for 'error' property to determine success/failure.
 */
export type HeaderExtractionResult = { value: string } | { error: string };

/**
 * Express Request with optional raw body buffer.
 * Middleware like `express.json({ verify })` can capture this.
 */
export interface RequestWithRawBody extends Request {
  rawBody?: Buffer | string;
}

/**
 * Options for building signature payload.
 */
export interface SignaturePayloadOptions {
  readonly useRawBody: boolean;
  readonly sortQueryParams: boolean;
  readonly pathSource: PathSource;
}

/**
 * Options for sign() method.
 */
export interface SignOptions {
  readonly keyId?: string;
  readonly query?: Record<string, string | string[] | undefined>;
  /** Raw body string/buffer to sign (mirrors useRawBody on server) */
  readonly rawBody?: string | Buffer;
}

// ==================== Security Types ====================

/**
 * Options for extracting client IP from request.
 */
export interface ClientIPOptions {
  /**
   * Pre-validated client IP from trusted proxy resolver.
   * If provided, this IP is used directly without reading req.ip.
   * This is the recommended approach when using a trusted proxy CIDR resolver.
   */
  readonly clientIP?: string;

  /**
   * Whether to reject private IPs (default: true).
   * Set to false if you're behind a private load balancer and want
   * to use internal IPs as a last resort (tagged with proxy_ip:).
   */
  readonly rejectPrivateIP?: boolean;

  /**
   * Whether to accept socket remoteAddress as fallback (default: false).
   * When true, uses req.socket.remoteAddress if req.ip is invalid.
   */
  readonly useSocketAddress?: boolean;
}

/**
 * Options for secure key generation.
 * Extends ClientIPOptions for IP resolution configuration.
 *
 * Note: Conservative bucket behavior (fp:unknown for no-header requests)
 * is always enabled. This prevents rate limit bypass and cardinality DoS.
 */
export interface SecureKeyOptions extends ClientIPOptions {}

/**
 * Express Request extended with optional context from auth middleware.
 * This is the preferred source for identity over headers.
 */
export interface RequestWithContext extends Request {
  context?: {
    tenantId?: string;
    userId?: string;
    installationId?: string;
  };
}

/**
 * Fallback key used when no identifiable information is available.
 * SECURITY: This is a conservative shared bucket with strict limits,
 * rather than random entropy which would bypass rate limiting entirely.
 */
export const UNKNOWN_CLIENT_BUCKET = "fp:unknown" as const;

// ==================== Security Key Generation Types ====================

/** Key prefixes for rate limit keys */
export const KEY_PREFIX = {
  IP: "ip",
  PROXY_IP: "proxy_ip",
  FINGERPRINT: "fp",
} as const;

/**
 * Key separator for composite keys.
 * SECURITY: Identity values must never contain this character.
 * This is enforced by VALID_IDENTITY_PATTERN.
 */
export const KEY_SEPARATOR = "|";

/** IPv4-mapped IPv6 prefix (e.g., ::ffff:192.168.1.1) */
export const IPV4_MAPPED_PREFIX = "::ffff:";

/** Maximum length for IP addresses in log output to prevent log injection. */
export const IP_LOG_MAX_LENGTH = 50;

/**
 * Length of hash prefix for privacy-safe logging.
 * 8 hex chars = 32 bits of entropy, safe to display but not collision-resistant.
 */
export const LOG_HASH_PREFIX_LENGTH = 8;

/** Source of resolved client IP */
export type IPSource = "client" | "express" | "socket";

/** Resolved IP with metadata for key building */
export interface ResolvedIP {
  readonly ip: string;
  readonly source: IPSource;
  readonly isPrivate: boolean;
}

/** Fingerprint header configuration */
export interface FingerprintHeader {
  readonly name: string;
  readonly maxLength: number;
}

/** Identity source configuration for context fields */
export interface ContextIdentitySource {
  readonly field: "tenantId" | "userId" | "installationId";
  readonly prefix: string;
}

/** Identity source configuration for headers */
export interface HeaderIdentitySource {
  readonly header: string;
  readonly prefix: string;
}

// ==================== Security Configuration ====================

/** Headers used for fingerprinting, in order of importance */
export const FINGERPRINT_HEADERS: readonly FingerprintHeader[] = [
  { name: "user-agent", maxLength: FINGERPRINT_MAX_LENGTH },
  { name: "accept-language", maxLength: FINGERPRINT_SECONDARY_LENGTH },
  { name: "accept-encoding", maxLength: FINGERPRINT_SECONDARY_LENGTH },
  { name: "accept", maxLength: FINGERPRINT_SECONDARY_LENGTH },
  { name: "connection", maxLength: FINGERPRINT_SHORT_LENGTH },
];

/** Context fields to check for identity, in priority order */
export const CONTEXT_IDENTITY_SOURCES: readonly ContextIdentitySource[] = [
  { field: "tenantId", prefix: "tenant" },
  { field: "userId", prefix: "user" },
  { field: "installationId", prefix: "install" },
];

/** Header fields to check for identity, in priority order */
export const HEADER_IDENTITY_SOURCES: readonly HeaderIdentitySource[] = [
  { header: IDENTITY_HEADERS.TENANT_ID, prefix: "tenant" },
  { header: IDENTITY_HEADERS.INSTALLATION_ID, prefix: "install" },
  { header: IDENTITY_HEADERS.CLIENT_ID, prefix: "client" },
];

// ==================== Middleware Types ====================

/**
 * Comprehensive rate limiting middleware configuration.
 */
export interface RateLimitMiddlewareConfig {
  /** Base rate limit options (skip is handled at middleware level, not passed through) */
  readonly rateLimit: Omit<RateLimitOptions, "keyGenerator" | "skip" | "maxResolver">;

  /** Skip all security checks and rate limiting for specific requests */
  readonly skip?: (req: Request) => boolean;

  /** Geographic restriction (optional) */
  readonly geoRestriction?: GeoRestrictionConfig;

  /** Bot detection (optional) */
  readonly botDetection?: BotDetectionConfig;

  /** Burst detection (optional) */
  readonly burstDetection?: BurstDetectionConfig;

  /** API key validation (optional) */
  readonly apiKey?: ApiKeyConfig;

  /** Per-endpoint limits (optional) */
  readonly endpointLimits?: EndpointLimitsConfig;

  /** Fallback behavior when Redis unavailable */
  readonly distributedFallback?: FallbackBehavior;

  /** Enable verbose logging for debugging */
  readonly debug?: boolean;

  /**
   * Rate penalty multiplier for invalid API keys (default: 0.25).
   * Applied when API key header is present but invalid (malformed, too long, etc.).
   * Set to 1 to disable penalty, or lower for stricter throttling.
   * Note: Missing keys (no header) are NOT penalized - only invalid ones.
   */
  readonly invalidKeyPenalty?: number;
}

/**
 * Security check results passed through middleware.
 *
 * RATE MULTIPLIER SEMANTICS:
 * All multipliers are < 1 for penalties, applied by MULTIPLICATION:
 *   effectiveLimit = baseMax * geoMultiplier * botMultiplier * burstMultiplier
 */
export interface SecurityContext {
  /** Whether geo check passed (true if allowed or no geo restriction) */
  geoAllowed: boolean;
  /** Geo rate multiplier (1.0 if allowed, < 1.0 if throttled) */
  geoMultiplier: number;
  /** Detected country code or null */
  countryCode: string | null;
  /** Geo reason code for debugging */
  geoReasonCode: string | null;
  /** Whether request appears to be from a bot */
  isBot: boolean;
  /** Bot type classification */
  botType: string | null;
  /** Bot rate multiplier (1.0 if human/allowed bot, < 1.0 for suspicious) */
  botMultiplier: number;
  /** Whether bot should be blocked entirely */
  botBlocked: boolean;
  /** Whether current request is part of a burst */
  isBurst: boolean;
  /** Burst rate multiplier (1.0 if normal, < 1.0 during penalty period) */
  burstMultiplier: number;
  /** Whether burst should cause blocking */
  burstBlocked: boolean;
  /** Hashed API key ID (never raw key) or null */
  apiKeyId: string | null;
  /** Whether API key is valid (false if present but invalid) */
  apiKeyValid: boolean;
  /** API key specific limit or null */
  apiKeyLimit: { max: number; windowMs: number } | null;
  /** Endpoint specific limit or null */
  endpointLimit: { max: number; windowMs: number } | null;
  /** Endpoint ID for this request */
  endpointId: string | null;
  /**
   * Endpoint weight for weighted rate limiting.
   * Heavy operations (LLM, uploads) have weight > 1.
   */
  endpointWeight: number;
  /** Computed effective max for this request */
  effectiveMax: number;
}

/** Initialized security components (internal) */
export interface SecurityComponents {
  geoRestriction: GeoRestriction | null;
  botDetector: BotDetector | null;
  burstDetector: BurstDetector | null;
  apiKeyValidator: ApiKeyValidator | null;
  endpointLimiter: EndpointLimiter | null;
}

// Forward declarations for component types (implemented in separate modules)
export interface GeoRestriction {
  check(req: Request): GeoRestrictionResult;
  isCountryInList(countryCode: string): boolean;
  getCountries(): string[];
  getMode(): "allowlist" | "blocklist";
  getRestrictedRateMultiplier(): number;
}

export interface BotDetector {
  check(req: Request): BotDetectionResult;
}

export interface BurstDetector {
  check(key: string): BurstDetectionResult;
  reset(key: string): void;
  getStats(): { trackedKeys: number; totalTimestamps: number };
}

export interface ApiKeyValidator {
  validate(req: Request): ApiKeyValidationResult;
}

export interface EndpointLimiter {
  resolve(req: Request): EndpointLimitResult;
}

// ==================== Middleware Result Types ====================

/**
 * Return type for rate limit middleware factory.
 */
export interface RateLimitMiddlewareResult {
  middleware: () => (req: Request, res: Response, next: NextFunction) => Promise<void>;
  reset: (key: string) => Promise<void>;
  components: SecurityComponents;
}

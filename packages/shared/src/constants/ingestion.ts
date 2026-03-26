/**
 * Ingestion Buffer Constants
 *
 * Configuration defaults for the Redis-backed ingestion buffer,
 * windowed processing, and per-platform flush triggers.
 *
 * @module constants/ingestion
 */

// ==================== Buffer Defaults ====================

/**
 * Redis ingestion buffer configuration.
 * Controls accumulation, eviction, and deduplication of continuous log streams.
 */
export const INGESTION_BUFFER_DEFAULTS = {
  /** Maximum tokens per entity buffer before oldest lines are evicted. */
  MAX_BUFFER_TOKENS: 100_000,
  /** Auto-cleanup TTL for abandoned streams (in seconds). */
  BUFFER_TTL_SECONDS: 86_400, // 24 hours
  /** Chars-per-token estimate for buffer size tracking (matches chunkingPipeline). */
  CHARS_PER_TOKEN: 3.5,
  /** Rough token estimate per average log line (~80 chars / 3.5 chars per token). */
  TOKENS_PER_LINE_ESTIMATE: 23,
  /** Percentage of buffer to evict when token ceiling is exceeded. */
  EVICTION_RATIO: 0.2,
} as const;

// ==================== Flush Trigger Defaults ====================

/**
 * Default flush trigger thresholds.
 * A flush is triggered when ANY condition is met (time OR volume).
 * Event triggers (deploy completion, escalation) bypass these and flush immediately.
 */
export const FLUSH_TRIGGER_DEFAULTS = {
  /** Default time window before flushing (in seconds). */
  TIME_WINDOW_SECONDS: 300, // 5 minutes
  /** Default token volume threshold that triggers a flush. */
  VOLUME_THRESHOLD_TOKENS: 10_000,
} as const;

/**
 * Per-platform flush trigger overrides.
 * Platforms with log drains (Vercel, Netlify) use shorter windows
 * since they receive data in near-realtime.
 */
export const PLATFORM_FLUSH_TRIGGERS = {
  vercel: {
    timeWindowSeconds: 180, // 3 min (log drains push fast)
    volumeThresholdTokens: 8_000,
  },
  railway: {
    timeWindowSeconds: 300, // 5 min
    volumeThresholdTokens: 10_000,
  },
  render: {
    timeWindowSeconds: 300, // 5 min
    volumeThresholdTokens: 10_000,
  },
  netlify: {
    timeWindowSeconds: 180, // 3 min (log drains push fast)
    volumeThresholdTokens: 8_000,
  },
} as const;

// ==================== Stream Throttling ====================

/**
 * Budget-aware throttle tiers for stream window intervals.
 * When tenant budget depletes, flush intervals widen to reduce cost.
 */
export const THROTTLE_TIERS = {
  /** Normal: use platform-default flush config. */
  NORMAL: { windowMultiplier: 1, volumeMultiplier: 1 },
  /** Moderate: 3x window, 0.5x volume threshold (budget 10-30%). */
  MODERATE: { windowMultiplier: 3, volumeMultiplier: 0.5 },
  /** Severe: 6x window, 0.25x volume threshold (budget <10%). */
  SEVERE: { windowMultiplier: 6, volumeMultiplier: 0.25 },
} as const;

/**
 * Budget ratio thresholds for throttle tier selection.
 */
export const THROTTLE_BUDGET_THRESHOLDS = {
  /** Below this ratio → MODERATE throttle. */
  MODERATE: 0.3,
  /** Below this ratio → SEVERE throttle. */
  SEVERE: 0.1,
} as const;

// ==================== Windowed Analysis ====================

/**
 * Token budget allocation for windowed (incremental) analysis.
 * Each window processes a batch of new logs + the previous summary.
 */
export const WINDOW_ANALYSIS_BUDGET = {
  /** Maximum tokens for the new log batch in a single window. */
  MAX_BATCH_TOKENS: 25_000,
  /** Maximum tokens for the carry-forward summary. */
  MAX_SUMMARY_TOKENS: 5_000,
  /** Threshold at which the summary is re-compressed. */
  SUMMARY_RECOMPRESSION_THRESHOLD_TOKENS: 5_000,
  /** Target token count after re-compression. */
  SUMMARY_RECOMPRESSION_TARGET_TOKENS: 3_000,
  /** System prompt overhead (reserved). */
  SYSTEM_PROMPT_TOKENS: 2_000,
  /** Safety buffer below the model context limit. */
  SAFETY_BUFFER_TOKENS: 8_000,
} as const;

// ==================== Redis Key Patterns ====================

/**
 * Redis key templates for ingestion buffer infrastructure.
 * All keys include tenantId and entityId for isolation.
 */
export const INGESTION_REDIS_KEYS = {
  /** Sorted set holding buffered log lines. Score = timestamp ms. */
  BUFFER: "kenchi:log-buffer",
  /** Hash holding buffer metadata (lastFlushAt, windowCount, etc.). */
  BUFFER_META: "kenchi:log-buffer-meta",
  /** String holding JSON-serialized IncidentSummary. */
  SUMMARY: "kenchi:log-summary",
  /** Distributed lock key for flush operations. */
  FLUSH_LOCK: "kenchi:flush-lock",
} as const;

/**
 * Distributed lock configuration for flush operations.
 * Prevents multiple service instances from flushing the same buffer concurrently.
 */
export const FLUSH_LOCK_DEFAULTS = {
  /** Lock TTL in seconds (auto-release if holder crashes). */
  LOCK_TTL_SECONDS: 120,
} as const;

// ==================== Log Drain Safety Limits ====================

/**
 * Safety limits for log drain batch processing.
 * Prevents DoS via oversized payloads.
 */
export const LOG_DRAIN_LIMITS = {
  /** Maximum number of lines to process per log drain batch. */
  MAX_LINES_PER_BATCH: 10_000,
  /** Maximum characters per individual log line (truncate beyond). */
  MAX_LINE_LENGTH: 10_000,
  /** Maximum characters for a WebSocket message payload. */
  MAX_WS_MESSAGE_SIZE: 1_000_000,
} as const;

// ==================== Stream Lifecycle ====================

/**
 * Stream lifecycle thresholds.
 */
export const STREAM_LIFECYCLE = {
  /** Auto-close stream if no new lines arrive within this period (in seconds). */
  IDLE_TIMEOUT_SECONDS: 3_600, // 1 hour
  /** Maximum windows per stream before forcing a close (runaway protection). */
  MAX_WINDOWS_PER_STREAM: 500,
} as const;

// ==================== Railway Streaming ====================

/**
 * Railway WebSocket subscription configuration.
 */
export const RAILWAY_STREAMING = {
  /** WebSocket endpoint for Railway GraphQL subscriptions. */
  WS_URL: "wss://backboard.railway.app/graphql/v2",
  /** Delay between reconnection attempts (in ms). */
  RECONNECT_DELAY_MS: 5_000,
  /** Maximum reconnection attempts before giving up. */
  MAX_RECONNECT_ATTEMPTS: 10,
  /** Maximum size of a single WebSocket message in characters. */
  MAX_WS_MESSAGE_SIZE: 1_000_000,
} as const;

/**
 * Burst Detection for Rate Limiting
 *
 * Detects rapid request bursts that may indicate:
 * - Automated scripts or crawlers
 * - Misconfigured clients
 * - DDoS attempts
 *
 * PERFORMANCE:
 * - Uses index pointer approach for O(1) amortized pruning (no filter/shift)
 * - Compacts array when startIdx OR array length exceeds threshold
 * - MAX_KEYS cap prevents memory exhaustion under load
 *
 * SECURITY:
 * - Keys are hashed before logging (privacy-safe)
 * - rateMultiplier clamped to [MIN, 1] (can't accidentally increase quota)
 *
 * RATE MULTIPLIER SEMANTICS (aligned with bot detector):
 * The rateMultiplier field is intended to multiply the max requests allowed:
 *   effectiveLimit = maxRequests * rateMultiplier
 *
 * Values:
 * - 1.0 = normal rate (no penalty)
 * - 0.5 = half rate (default penalty)
 * - 0.1 = minimum (clamped, never 0)
 *
 * For blocking decisions, use shouldBlock instead of rateMultiplier === 0.
 *
 * @module rateLimit/burstDetection
 */

import crypto from "crypto";
import { createLogger } from "../core/logger.js";
import {
  BURST_DETECTION_DEFAULTS,
  LOG_HASH_PREFIX_LENGTH,
  type BurstDetectionConfig,
  type BurstDetectionResult,
  type BurstTrackingEntry,
} from "./types.js";

const logger = createLogger("burst-detection");

/** Hashes a key for privacy-safe logging. Returns truncated SHA-256 hash. */
const hashKeyForLog = (key: string): string =>
  crypto.createHash("sha256").update(key).digest("hex").slice(0, LOG_HASH_PREFIX_LENGTH);

/**
 * In-memory burst detector with sliding window tracking.
 *
 * Uses index pointer approach for efficient timestamp pruning:
 * - Instead of filtering/shifting, advances startIdx pointer
 * - Compacts array when pointer exceeds threshold
 * - Amortized O(1) per request vs O(n) for filter
 */
export class BurstDetector {
  private readonly store = new Map<string, BurstTrackingEntry>();
  private readonly windowMs: number;
  private readonly maxBurst: number;
  private readonly rateMultiplier: number;
  private readonly penaltyDurationMs: number;
  private readonly blockOnBurst: boolean;
  private cleanupCounter = 0;

  constructor(config: BurstDetectionConfig = {}) {
    this.windowMs = config.windowMs ?? BURST_DETECTION_DEFAULTS.WINDOW_MS;
    this.maxBurst = config.maxBurst ?? BURST_DETECTION_DEFAULTS.MAX_BURST;
    // Clamp to [MIN, 1]: values > 1 would INCREASE quota during penalty (not intended)
    this.rateMultiplier = Math.min(
      Math.max(
        config.rateMultiplier ?? BURST_DETECTION_DEFAULTS.RATE_MULTIPLIER,
        BURST_DETECTION_DEFAULTS.MIN_RATE_MULTIPLIER
      ),
      1
    );
    // Separate penalty duration from rate multiplier for clearer semantics
    this.penaltyDurationMs = config.penaltyDurationMs ?? this.windowMs;
    this.blockOnBurst = config.blockOnBurst ?? BURST_DETECTION_DEFAULTS.BLOCK_ON_BURST;
  }

  /**
   * Checks if a request is part of a burst pattern.
   */
  check(key: string): BurstDetectionResult {
    const now = Date.now();
    this.maybeCleanup(now);

    const entry = this.getOrCreateEntry(key, now);
    entry.lastSeen = now; // Update early for consistency
    this.pruneOldTimestamps(entry, now);
    entry.timestamps.push(now);

    // Count valid timestamps (from startIdx to end)
    const requestsInWindow = entry.timestamps.length - entry.startIdx;
    const isBurst = requestsInWindow > this.maxBurst;

    if (isBurst) {
      this.handleBurstDetected(key, entry, now, requestsInWindow);
    }

    const isInPenalty = entry.penaltyUntil > now;
    const shouldBlock = this.blockOnBurst && (isBurst || isInPenalty);
    // Return reduced multiplier during penalty, normal (1.0) otherwise
    const currentMultiplier = isInPenalty ? this.rateMultiplier : 1;

    return {
      isBurst,
      requestsInWindow,
      shouldBlock,
      rateMultiplier: currentMultiplier,
    };
  }

  private getOrCreateEntry(key: string, now: number): BurstTrackingEntry {
    const existing = this.store.get(key);
    if (existing) {
      return existing;
    }

    // Check MAX_KEYS cap before adding new entry
    if (this.store.size >= BURST_DETECTION_DEFAULTS.MAX_KEYS) {
      this.evictLeastRecentlyActiveEntry(now);
    }

    const entry: BurstTrackingEntry = {
      timestamps: [],
      startIdx: 0,
      penaltyUntil: 0,
      lastSeen: now,
    };
    this.store.set(key, entry);
    return entry;
  }

  /**
   * Evicts the least recently active entry when at capacity.
   * Prioritizes entries without active penalties, then by oldest lastSeen.
   */
  private evictLeastRecentlyActiveEntry(now: number): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    // Find least recently active entry without active penalty
    for (const [entryKey, entry] of this.store) {
      // Skip entries in penalty period (protect penalized keys from eviction)
      if (entry.penaltyUntil > now) {
        continue;
      }

      // Use lastSeen for accurate LRU eviction
      if (entry.lastSeen < oldestTime) {
        oldestTime = entry.lastSeen;
        oldestKey = entryKey;
      }
    }

    // If all entries are in penalty, evict the oldest penalized entry
    if (!oldestKey && this.store.size > 0) {
      for (const [entryKey, entry] of this.store) {
        if (entry.lastSeen < oldestTime) {
          oldestTime = entry.lastSeen;
          oldestKey = entryKey;
        }
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey);
    }
  }

  /**
   * Prunes old timestamps using index pointer approach.
   * - Advances startIdx to skip expired timestamps (O(1) per timestamp)
   * - Compacts array when startIdx OR array length exceeds threshold
   */
  private pruneOldTimestamps(entry: BurstTrackingEntry, now: number): void {
    const cutoff = now - this.windowMs;

    // Advance startIdx past expired timestamps
    while (entry.startIdx < entry.timestamps.length && entry.timestamps[entry.startIdx] <= cutoff) {
      entry.startIdx++;
    }

    // Compact array when startIdx exceeds threshold OR array is too large
    const shouldCompact =
      entry.startIdx > BURST_DETECTION_DEFAULTS.COMPACTION_THRESHOLD ||
      entry.timestamps.length > BURST_DETECTION_DEFAULTS.MAX_ARRAY_LENGTH;

    if (shouldCompact && entry.startIdx > 0) {
      entry.timestamps = entry.timestamps.slice(entry.startIdx);
      entry.startIdx = 0;
    }

    // Enforce max timestamps limit (drop oldest valid timestamps if needed)
    const validCount = entry.timestamps.length - entry.startIdx;
    if (validCount > BURST_DETECTION_DEFAULTS.MAX_TIMESTAMPS) {
      const excess = validCount - BURST_DETECTION_DEFAULTS.MAX_TIMESTAMPS;
      entry.startIdx += excess;
    }
  }

  private handleBurstDetected(
    key: string,
    entry: BurstTrackingEntry,
    now: number,
    requestsInWindow: number
  ): void {
    // Extend penalty from current end (if active) or from now (if expired)
    // Cap at MAX_PENALTY_MS from now to prevent infinite penalty under sustained attack
    const maxPenaltyEnd = now + BURST_DETECTION_DEFAULTS.MAX_PENALTY_MS;
    const extendedPenalty =
      entry.penaltyUntil > now
        ? entry.penaltyUntil + this.penaltyDurationMs
        : now + this.penaltyDurationMs;
    entry.penaltyUntil = Math.min(extendedPenalty, maxPenaltyEnd);

    logger.warn("Burst detected", {
      keyHash: hashKeyForLog(key),
      requestsInWindow,
      threshold: this.maxBurst,
      penaltyUntil: entry.penaltyUntil,
      penaltyRemainingMs: Math.max(0, entry.penaltyUntil - now),
    });
  }

  private maybeCleanup(now: number): void {
    this.cleanupCounter++;
    if (this.cleanupCounter < BURST_DETECTION_DEFAULTS.CLEANUP_INTERVAL) {
      return;
    }

    this.cleanupCounter = 0;
    const cutoff = now - this.windowMs * 2;
    const keysToDelete: string[] = [];

    for (const [entryKey, entry] of this.store) {
      // Use lastSeen for accurate staleness check (simpler than array peek)
      const isStale = entry.lastSeen <= cutoff;
      const isInPenalty = entry.penaltyUntil > now;

      if (isStale && !isInPenalty) {
        keysToDelete.push(entryKey);
      }
    }

    for (const keyToDelete of keysToDelete) {
      this.store.delete(keyToDelete);
    }
  }

  reset(key: string): void {
    this.store.delete(key);
  }

  resetAll(): void {
    this.store.clear();
    this.cleanupCounter = 0;
  }

  getStats(): { trackedKeys: number; totalTimestamps: number } {
    let totalTimestamps = 0;
    for (const entry of this.store.values()) {
      // Only count valid timestamps (from startIdx)
      totalTimestamps += entry.timestamps.length - entry.startIdx;
    }
    return { trackedKeys: this.store.size, totalTimestamps };
  }
}

export const createBurstDetector = (config?: BurstDetectionConfig): BurstDetector =>
  new BurstDetector(config);

export const defaultBurstDetector = createBurstDetector();

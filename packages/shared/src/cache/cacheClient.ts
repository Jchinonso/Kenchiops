/**
 * Redis Cache Client
 *
 * Provides type-safe caching operations with TTL, serialization,
 * and cache invalidation patterns.
 *
 * @module cache/cacheClient
 */

import { getRedisClient } from "../queue/redisClient.js";
import { createLogger } from "../core/logger.js";

const logger = createLogger("cache");

// ==================== Types ====================

/**
 * Cache entry with metadata
 */
export interface CacheEntry<T> {
  readonly data: T;
  readonly cachedAt: string;
  readonly expiresAt: string;
}

/**
 * Cache operation result
 */
export interface CacheResult<T> {
  readonly hit: boolean;
  readonly data: T | null;
  readonly cachedAt?: string;
}

/**
 * Cache options for set operations
 */
export interface CacheSetOptions {
  /** Time to live in seconds */
  readonly ttlSeconds: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly hitRate: number;
}

// ==================== Constants ====================

/**
 * Default TTL values in seconds
 */
export const CACHE_TTL = {
  /** Short-lived cache (1 minute) */
  SHORT: 60,
  /** Medium cache (5 minutes) */
  MEDIUM: 300,
  /** Standard cache (15 minutes) */
  STANDARD: 900,
  /** Long cache (1 hour) */
  LONG: 3600,
  /** Extended cache (6 hours) */
  EXTENDED: 21600,
  /** Daily cache (24 hours) */
  DAILY: 86400,
} as const;

// ==================== Statistics Tracking ====================

const stats = {
  hits: 0,
  misses: 0,
};

/**
 * Get cache statistics
 */
export const getCacheStats = (): CacheStats => ({
  hits: stats.hits,
  misses: stats.misses,
  hitRate: stats.hits + stats.misses > 0 ? stats.hits / (stats.hits + stats.misses) : 0,
});

/**
 * Reset cache statistics
 */
export const resetCacheStats = (): void => {
  stats.hits = 0;
  stats.misses = 0;
};

// ==================== Serialization ====================

/**
 * Serialize data for cache storage
 */
const serialize = <T>(data: T, ttlSeconds: number): string => {
  const now = new Date();
  const entry: CacheEntry<T> = {
    data,
    cachedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
  };
  return JSON.stringify(entry);
};

/**
 * Deserialize cached data
 */
const deserialize = <T>(raw: string): CacheEntry<T> | null => {
  try {
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
};

// ==================== Constants ====================

/** Timeout for cache operations in milliseconds */
const CACHE_OPERATION_TIMEOUT_MS = 2000;

/**
 * Wrap a promise with a timeout
 */
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Cache operation timeout")), timeoutMs)
  );
  return Promise.race([promise, timeoutPromise]);
};

// ==================== Core Cache Operations ====================

/**
 * Get a value from cache
 */
export const cacheGet = async <T>(key: string): Promise<CacheResult<T>> => {
  try {
    const client = getRedisClient();

    // Check if client is ready before attempting operation
    if (client.status !== "ready") {
      logger.debug("Redis not ready for cache get", { status: client.status });
      stats.misses++;
      return { hit: false, data: null };
    }

    const raw = await withTimeout(client.get(key), CACHE_OPERATION_TIMEOUT_MS);

    if (!raw) {
      stats.misses++;
      return { hit: false, data: null };
    }

    const entry = deserialize<T>(raw);
    if (!entry) {
      stats.misses++;
      return { hit: false, data: null };
    }

    stats.hits++;
    logger.debug("Cache hit", { key });

    return {
      hit: true,
      data: entry.data,
      cachedAt: entry.cachedAt,
    };
  } catch (error) {
    logger.warn("Cache get failed", {
      key,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    stats.misses++;
    return { hit: false, data: null };
  }
};

/**
 * Set a value in cache with TTL
 */
export const cacheSet = async <T>(
  key: string,
  data: T,
  options: CacheSetOptions
): Promise<boolean> => {
  try {
    const client = getRedisClient();

    // Check if client is ready before attempting operation
    if (client.status !== "ready") {
      logger.debug("Redis not ready for cache set", { status: client.status });
      return false;
    }

    const serialized = serialize(data, options.ttlSeconds);

    await withTimeout(
      client.setex(key, options.ttlSeconds, serialized),
      CACHE_OPERATION_TIMEOUT_MS
    );

    logger.debug("Cache set", { key, ttlSeconds: options.ttlSeconds });
    return true;
  } catch (error) {
    logger.warn("Cache set failed", {
      key,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
};

/**
 * Delete a value from cache
 */
export const cacheDelete = async (key: string): Promise<boolean> => {
  try {
    const client = getRedisClient();

    if (client.status !== "ready") {
      return false;
    }

    const deleted = await withTimeout(client.del(key), CACHE_OPERATION_TIMEOUT_MS);

    logger.debug("Cache delete", { key, deleted: deleted > 0 });
    return deleted > 0;
  } catch (error) {
    logger.warn("Cache delete failed", {
      key,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
};

/**
 * Delete multiple keys matching a pattern
 */
export const cacheDeletePattern = async (pattern: string): Promise<number> => {
  try {
    const client = getRedisClient();

    if (client.status !== "ready") {
      return 0;
    }

    const keys = await withTimeout(client.keys(pattern), CACHE_OPERATION_TIMEOUT_MS);

    if (keys.length === 0) {
      return 0;
    }

    const deleted = await withTimeout(client.del(...keys), CACHE_OPERATION_TIMEOUT_MS);

    logger.debug("Cache delete pattern", { pattern, deleted });
    return deleted;
  } catch (error) {
    logger.warn("Cache delete pattern failed", {
      pattern,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return 0;
  }
};

/**
 * Check if a key exists in cache
 */
export const cacheExists = async (key: string): Promise<boolean> => {
  try {
    const client = getRedisClient();
    if (client.status !== "ready") {
      return false;
    }
    const exists = await withTimeout(client.exists(key), CACHE_OPERATION_TIMEOUT_MS);
    return exists === 1;
  } catch {
    return false;
  }
};

/**
 * Get TTL remaining for a key (in seconds)
 */
export const cacheTTL = async (key: string): Promise<number> => {
  try {
    const client = getRedisClient();
    if (client.status !== "ready") {
      return -1;
    }
    return await withTimeout(client.ttl(key), CACHE_OPERATION_TIMEOUT_MS);
  } catch {
    return -1;
  }
};

// ==================== Cache-Aside Pattern ====================

/**
 * Cache-aside pattern: get from cache or fetch and cache
 */
export const cacheGetOrSet = async <T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheSetOptions
): Promise<T> => {
  // Try cache first
  const cached = await cacheGet<T>(key);
  if (cached.hit && cached.data !== null) {
    return cached.data;
  }

  // Fetch fresh data
  const data = await fetcher();

  // Cache the result (fire and forget)
  cacheSet(key, data, options).catch(() => {
    // Ignore cache set errors
  });

  return data;
};

/**
 * Batch get multiple keys
 */
export const cacheGetMany = async <T>(keys: readonly string[]): Promise<Map<string, T>> => {
  if (keys.length === 0) {
    return new Map();
  }

  try {
    const client = getRedisClient();

    if (client.status !== "ready") {
      return new Map();
    }

    const values = await withTimeout(client.mget(...keys), CACHE_OPERATION_TIMEOUT_MS);

    const result = new Map<string, T>();

    values.forEach((raw, index) => {
      if (raw) {
        const entry = deserialize<T>(raw);
        if (entry) {
          result.set(keys[index], entry.data);
          stats.hits++;
        } else {
          stats.misses++;
        }
      } else {
        stats.misses++;
      }
    });

    return result;
  } catch (error) {
    logger.warn("Cache get many failed", {
      keyCount: keys.length,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return new Map();
  }
};

// ==================== Hash Operations (for structured data) ====================

/**
 * Set a hash field
 */
export const cacheHashSet = async (
  key: string,
  field: string,
  value: unknown,
  ttlSeconds?: number
): Promise<boolean> => {
  try {
    const client = getRedisClient();
    await client.hset(key, field, JSON.stringify(value));

    if (ttlSeconds) {
      await client.expire(key, ttlSeconds);
    }

    return true;
  } catch (error) {
    logger.warn("Cache hash set failed", {
      key,
      field,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
};

/**
 * Get a hash field
 */
export const cacheHashGet = async <T>(key: string, field: string): Promise<T | null> => {
  try {
    const client = getRedisClient();
    const raw = await client.hget(key, field);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

/**
 * Get all hash fields
 */
export const cacheHashGetAll = async <T>(key: string): Promise<Record<string, T>> => {
  try {
    const client = getRedisClient();
    const raw = await client.hgetall(key);

    const result: Record<string, T> = {};

    Object.entries(raw).forEach(([field, value]) => {
      try {
        result[field] = JSON.parse(value) as T;
      } catch {
        // Skip invalid entries
      }
    });

    return result;
  } catch {
    return {};
  }
};

/**
 * Delete a hash field
 */
export const cacheHashDelete = async (key: string, field: string): Promise<boolean> => {
  try {
    const client = getRedisClient();
    const deleted = await client.hdel(key, field);
    return deleted > 0;
  } catch {
    return false;
  }
};

/**
 * Redis Cache Client
 *
 * Provides type-safe caching operations with TTL, serialization,
 * and cache invalidation patterns.
 *
 * @module cache/cacheClient
 */

import { getRedisClient } from "../queue/redisClient.js";
import { createLogger, withTimeout, getErrorMessage } from "../core/index.js";
import { CACHE_TTL_SECONDS, REDIS_TIMEOUTS } from "../constants/index.js";

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

// Re-export for backward compatibility
export const CACHE_TTL = CACHE_TTL_SECONDS;

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

    const raw = await withTimeout(client.get(key), REDIS_TIMEOUTS.CACHE_OPERATION_MS);

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
      error: getErrorMessage(error),
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
      REDIS_TIMEOUTS.CACHE_OPERATION_MS
    );

    logger.debug("Cache set", { key, ttlSeconds: options.ttlSeconds });
    return true;
  } catch (error) {
    logger.warn("Cache set failed", {
      key,
      error: getErrorMessage(error),
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

    const deleted = await withTimeout(client.del(key), REDIS_TIMEOUTS.CACHE_OPERATION_MS);

    logger.debug("Cache delete", { key, deleted: deleted > 0 });
    return deleted > 0;
  } catch (error) {
    logger.warn("Cache delete failed", {
      key,
      error: getErrorMessage(error),
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

    const keys = await withTimeout(client.keys(pattern), REDIS_TIMEOUTS.CACHE_OPERATION_MS);

    if (keys.length === 0) {
      return 0;
    }

    const deleted = await withTimeout(client.del(...keys), REDIS_TIMEOUTS.CACHE_OPERATION_MS);

    logger.debug("Cache delete pattern", { pattern, deleted });
    return deleted;
  } catch (error) {
    logger.warn("Cache delete pattern failed", {
      pattern,
      error: getErrorMessage(error),
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
    const exists = await withTimeout(client.exists(key), REDIS_TIMEOUTS.CACHE_OPERATION_MS);
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
    return await withTimeout(client.ttl(key), REDIS_TIMEOUTS.CACHE_OPERATION_MS);
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

    const values = await withTimeout(client.mget(...keys), REDIS_TIMEOUTS.CACHE_OPERATION_MS);

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
      error: getErrorMessage(error),
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

    if (client.status !== "ready") {
      return false;
    }

    await withTimeout(
      client.hset(key, field, JSON.stringify(value)),
      REDIS_TIMEOUTS.CACHE_OPERATION_MS
    );

    if (ttlSeconds) {
      await withTimeout(client.expire(key, ttlSeconds), REDIS_TIMEOUTS.CACHE_OPERATION_MS);
    }

    return true;
  } catch (error) {
    logger.warn("Cache hash set failed", {
      key,
      field,
      error: getErrorMessage(error),
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

    if (client.status !== "ready") {
      return null;
    }

    const raw = await withTimeout(client.hget(key, field), REDIS_TIMEOUTS.CACHE_OPERATION_MS);

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

    if (client.status !== "ready") {
      return {};
    }

    const raw = await withTimeout(client.hgetall(key), REDIS_TIMEOUTS.CACHE_OPERATION_MS);

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

    if (client.status !== "ready") {
      return false;
    }

    const deleted = await withTimeout(client.hdel(key, field), REDIS_TIMEOUTS.CACHE_OPERATION_MS);
    return deleted > 0;
  } catch {
    return false;
  }
};

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
import {
  CACHE_TTL_SECONDS,
  REDIS_TIMEOUTS,
  TIME_CONSTANTS,
  REDIS_READY_STATUS,
  REDIS_KEY_EXISTS,
  CACHE_TTL_ERROR_DEFAULT,
} from "../constants/index.js";
import type {
  CacheEntry,
  CacheResult,
  CacheSetOptions,
  CacheStats,
  CacheStatsState,
  DeserializeResult,
  CacheClientReadyResult,
} from "./types.js";

const logger = createLogger("cache");

/**
 * Cache TTL constants re-exported for backward compatibility.
 * @deprecated Import directly from `@kenchi/shared` constants instead.
 */
export const CACHE_TTL = CACHE_TTL_SECONDS;

// ==================== Statistics Tracking ====================

/** Internal mutable state for cache statistics. */
const stats: CacheStatsState = { hits: 0, misses: 0 };

/** Records a cache hit in statistics. */
const recordHit = (): void => {
  stats.hits += 1;
};

/** Records a cache miss in statistics. */
const recordMiss = (): void => {
  stats.misses += 1;
};

/** Calculates the cache hit rate from statistics. */
const calculateHitRate = (currentStats: CacheStatsState): number => {
  const totalOperations = currentStats.hits + currentStats.misses;
  return totalOperations === 0 ? 0 : currentStats.hits / totalOperations;
};

/**
 * Gets the current cache statistics.
 */
export const getCacheStats = (): CacheStats => ({
  hits: stats.hits,
  misses: stats.misses,
  hitRate: calculateHitRate(stats),
});

/**
 * Resets all cache statistics to zero.
 */
export const resetCacheStats = (): void => {
  stats.hits = 0;
  stats.misses = 0;
};

// ==================== Redis Client Helpers ====================

/** Checks if Redis client is ready for operations. */
const getReadyClient = (): CacheClientReadyResult => {
  const client = getRedisClient();
  const { status } = client;

  if (status !== REDIS_READY_STATUS) {
    logger.debug("Redis client not ready for cache operation", { status });
    return { ready: false };
  }

  return { ready: true, client };
};

// ==================== Serialization ====================

/** Creates a cache entry with metadata including timestamps. */
const createCacheEntry = <T>(data: T, ttlSeconds: number): CacheEntry<T> => {
  const cachedAt = new Date();
  const expirationMs = ttlSeconds * TIME_CONSTANTS.MILLISECONDS_PER_SECOND;
  const expiresAt = new Date(cachedAt.getTime() + expirationMs);

  return {
    data,
    cachedAt: cachedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
};

/** Serializes data for cache storage with metadata. */
const serialize = <T>(data: T, ttlSeconds: number): string =>
  JSON.stringify(createCacheEntry(data, ttlSeconds));

/** Deserializes cached data with error handling. */
const deserialize = <T>(raw: string): DeserializeResult<T> => {
  try {
    const entry = JSON.parse(raw) as CacheEntry<T>;
    return { success: true, entry };
  } catch (error) {
    logger.debug("Cache deserialization failed", { error: getErrorMessage(error) });
    return { success: false };
  }
};

// ==================== Result Builders ====================

/** Creates a cache miss result. */
const createCacheMissResult = <T>(): CacheResult<T> => ({ hit: false, data: null });

/** Creates a cache hit result from a cache entry. */
const createCacheHitResult = <T>(entry: CacheEntry<T>): CacheResult<T> => ({
  hit: true,
  data: entry.data,
  cachedAt: entry.cachedAt,
});

// ==================== Core Cache Operations ====================

/**
 * Retrieves a value from cache by key.
 *
 * @param key - Cache key to retrieve
 * @returns Cache result with hit status and data (null if miss)
 */
export const cacheGet = async <T>(key: string): Promise<CacheResult<T>> => {
  const clientResult = getReadyClient();

  if (!clientResult.ready) {
    recordMiss();
    return createCacheMissResult();
  }

  try {
    const raw = await withTimeout(clientResult.client.get(key), REDIS_TIMEOUTS.CACHE_OPERATION_MS);

    if (raw === null) {
      recordMiss();
      return createCacheMissResult();
    }

    const deserializeResult = deserialize<T>(raw);

    if (!deserializeResult.success) {
      recordMiss();
      return createCacheMissResult();
    }

    recordHit();
    logger.debug("Cache hit", { key });
    return createCacheHitResult(deserializeResult.entry);
  } catch (error) {
    logger.warn("Cache get operation failed", { key, error: getErrorMessage(error) });
    recordMiss();
    return createCacheMissResult();
  }
};

/**
 * Stores a value in cache with TTL.
 *
 * @param key - Cache key to set
 * @param data - Data to cache
 * @param options - Cache options including TTL in seconds
 * @returns True if successfully cached, false on failure
 */
export const cacheSet = async <T>(
  key: string,
  data: T,
  options: CacheSetOptions
): Promise<boolean> => {
  const clientResult = getReadyClient();

  if (!clientResult.ready) {
    return false;
  }

  try {
    const serialized = serialize(data, options.ttlSeconds);

    await withTimeout(
      clientResult.client.setex(key, options.ttlSeconds, serialized),
      REDIS_TIMEOUTS.CACHE_OPERATION_MS
    );

    logger.debug("Cache set", { key, ttlSeconds: options.ttlSeconds });
    return true;
  } catch (error) {
    logger.warn("Cache set operation failed", {
      key,
      ttlSeconds: options.ttlSeconds,
      error: getErrorMessage(error),
    });
    return false;
  }
};

/**
 * Deletes a value from cache by key.
 *
 * @param key - Cache key to delete
 * @returns True if key was deleted, false if not found or on failure
 */
export const cacheDelete = async (key: string): Promise<boolean> => {
  const clientResult = getReadyClient();

  if (!clientResult.ready) {
    return false;
  }

  try {
    const deletedCount = await withTimeout(
      clientResult.client.del(key),
      REDIS_TIMEOUTS.CACHE_OPERATION_MS
    );

    const wasDeleted = deletedCount > 0;
    logger.debug("Cache delete", { key, deleted: wasDeleted });
    return wasDeleted;
  } catch (error) {
    logger.warn("Cache delete operation failed", { key, error: getErrorMessage(error) });
    return false;
  }
};

/**
 * Deletes multiple keys matching a pattern.
 * Note: Uses KEYS command which can be slow on large datasets.
 *
 * @param pattern - Redis key pattern (e.g., "user:*")
 * @returns Number of keys deleted
 */
export const cacheDeletePattern = async (pattern: string): Promise<number> => {
  const clientResult = getReadyClient();

  if (!clientResult.ready) {
    return 0;
  }

  try {
    const matchingKeys = await withTimeout(
      clientResult.client.keys(pattern),
      REDIS_TIMEOUTS.CACHE_OPERATION_MS
    );

    if (matchingKeys.length === 0) {
      return 0;
    }

    const deletedCount = await withTimeout(
      clientResult.client.del(...matchingKeys),
      REDIS_TIMEOUTS.CACHE_OPERATION_MS
    );

    logger.debug("Cache delete pattern", {
      pattern,
      matchedKeys: matchingKeys.length,
      deletedCount,
    });
    return deletedCount;
  } catch (error) {
    logger.warn("Cache delete pattern operation failed", {
      pattern,
      error: getErrorMessage(error),
    });
    return 0;
  }
};

/**
 * Checks if a key exists in cache.
 *
 * @param key - Cache key to check
 * @returns True if key exists, false otherwise
 */
export const cacheExists = async (key: string): Promise<boolean> => {
  const clientResult = getReadyClient();

  if (!clientResult.ready) {
    return false;
  }

  try {
    const existsCount = await withTimeout(
      clientResult.client.exists(key),
      REDIS_TIMEOUTS.CACHE_OPERATION_MS
    );
    return existsCount === REDIS_KEY_EXISTS;
  } catch (error) {
    logger.debug("Cache exists check failed", { key, error: getErrorMessage(error) });
    return false;
  }
};

/**
 * Gets the remaining TTL for a cache key.
 *
 * @param key - Cache key to check
 * @returns TTL in seconds, -2 if key doesn't exist, -1 if no TTL or on error
 */
export const cacheTTL = async (key: string): Promise<number> => {
  const clientResult = getReadyClient();

  if (!clientResult.ready) {
    return CACHE_TTL_ERROR_DEFAULT;
  }

  try {
    return await withTimeout(clientResult.client.ttl(key), REDIS_TIMEOUTS.CACHE_OPERATION_MS);
  } catch (error) {
    logger.debug("Cache TTL check failed", { key, error: getErrorMessage(error) });
    return CACHE_TTL_ERROR_DEFAULT;
  }
};

// ==================== Cache-Aside Pattern ====================

/** Fire-and-forget cache set with error logging. */
const performAsyncCacheSet = async <T>(
  key: string,
  data: T,
  options: CacheSetOptions
): Promise<void> => {
  try {
    await cacheSet(key, data, options);
  } catch (error) {
    logger.debug("Async cache set failed", { key, error: getErrorMessage(error) });
  }
};

/**
 * Cache-aside pattern: retrieves from cache or fetches and caches.
 *
 * @param key - Cache key
 * @param fetcher - Function to fetch data if not in cache
 * @param options - Cache options including TTL
 * @returns Cached or freshly fetched data
 */
export const cacheGetOrSet = async <T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheSetOptions
): Promise<T> => {
  const cached = await cacheGet<T>(key);

  if (cached.hit && cached.data !== null) {
    return cached.data;
  }

  const freshData = await fetcher();
  void performAsyncCacheSet(key, freshData, options);
  return freshData;
};

// ==================== Batch Operations ====================

/** Processes a single value from batch get and updates results map. */
const processBatchGetValue = <T>(
  rawValue: string | null,
  key: string,
  results: Map<string, T>
): void => {
  if (rawValue === null) {
    recordMiss();
    return;
  }

  const deserializeResult = deserialize<T>(rawValue);

  if (!deserializeResult.success) {
    recordMiss();
    return;
  }

  recordHit();
  results.set(key, deserializeResult.entry.data);
};

/**
 * Retrieves multiple values from cache using Redis MGET.
 *
 * @param keys - Array of cache keys to retrieve
 * @returns Map of key to data for found entries (missing keys omitted)
 */
export const cacheGetMany = async <T>(keys: readonly string[]): Promise<Map<string, T>> => {
  const results = new Map<string, T>();

  if (keys.length === 0) {
    return results;
  }

  const clientResult = getReadyClient();

  if (!clientResult.ready) {
    keys.forEach(() => recordMiss());
    return results;
  }

  try {
    const rawValues = await withTimeout(
      clientResult.client.mget(...keys),
      REDIS_TIMEOUTS.CACHE_OPERATION_MS
    );

    rawValues.forEach((rawValue, index) => {
      processBatchGetValue(rawValue, keys[index], results);
    });

    logger.debug("Cache get many", { requestedCount: keys.length, foundCount: results.size });
    return results;
  } catch (error) {
    logger.warn("Cache get many operation failed", {
      keyCount: keys.length,
      error: getErrorMessage(error),
    });
    keys.forEach(() => recordMiss());
    return results;
  }
};

/**
 * OAuth State Store
 *
 * Redis-backed OAuth state storage with automatic in-memory fallback.
 * Redis keys use TTL for automatic cleanup; in-memory uses expiry checks on read.
 *
 * @module security/oauthStateStore
 */

import { createLogger, getErrorMessage } from "../core/index.js";
import { getRedisClient } from "../queue/redisClient.js";
import { REDIS_READY_STATUS } from "../constants/index.js";
import type { OAuthStoredState, OAuthStateStore } from "./oauthStateStoreTypes.js";

const logger = createLogger("oauth-state-store");

const OAUTH_STATE_PREFIX = "oauth:state:";
const DEFAULT_TTL_SECONDS = 600; // 10 minutes

/**
 * Maximum entries in the in-memory fallback store.
 * Prevents unbounded memory growth if an attacker initiates many OAuth flows
 * while Redis is unavailable. 1000 is generous for legitimate use — a single
 * user can only reasonably have 1-2 concurrent OAuth flows.
 */
const MAX_MEMORY_STORE_ENTRIES = 1000;

/**
 * Checks if the Redis client is connected and ready for operations.
 * Returns the client if ready, null otherwise.
 */
const getReadyRedisClient = (): ReturnType<typeof getRedisClient> | null => {
  try {
    const client = getRedisClient();
    const { status } = client;
    return status === REDIS_READY_STATUS ? client : null;
  } catch {
    return null;
  }
};

/**
 * Creates an OAuth state store backed by Redis with in-memory fallback.
 *
 * When Redis is available and ready, state tokens are stored as Redis keys
 * with automatic TTL expiry. When Redis is unavailable (not configured or
 * disconnected), falls back to an in-memory Map with manual expiry checks
 * on read.
 *
 * @returns An OAuthStateStore instance
 */
export const createOAuthStateStore = (): OAuthStateStore => {
  const memoryStore = new Map<string, OAuthStoredState>();

  /**
   * Evict expired entries from the in-memory store.
   * Called before inserting a new entry to bound memory usage.
   * Map iteration order is insertion order, so oldest entries are first.
   */
  const evictExpiredEntries = (): void => {
    const now = Date.now();
    const expiryMs = DEFAULT_TTL_SECONDS * 1000;

    for (const [key, value] of memoryStore) {
      if (now - value.createdAt > expiryMs) {
        memoryStore.delete(key);
      } else {
        // Entries are in insertion order — once we hit a non-expired entry,
        // all subsequent entries are newer and also non-expired
        break;
      }
    }
  };

  return {
    set: async (token: string, data: OAuthStoredState): Promise<void> => {
      const redis = getReadyRedisClient();
      if (redis) {
        try {
          await redis.setex(
            `${OAUTH_STATE_PREFIX}${token}`,
            DEFAULT_TTL_SECONDS,
            JSON.stringify(data)
          );
          logger.debug("OAuth state stored in Redis", {
            tokenPrefix: token.slice(0, 8),
          });
          return;
        } catch (error) {
          logger.warn("Failed to store OAuth state in Redis, using memory fallback", {
            error: getErrorMessage(error),
          });
        }
      }

      // SECURITY: Evict expired entries first, then enforce size limit
      // to prevent unbounded memory growth from unauthenticated OAuth initiations.
      evictExpiredEntries();

      if (memoryStore.size >= MAX_MEMORY_STORE_ENTRIES) {
        logger.warn("OAuth memory store full, rejecting new state token", {
          storeSize: memoryStore.size,
          maxSize: MAX_MEMORY_STORE_ENTRIES,
        });
        return;
      }

      memoryStore.set(token, data);
    },

    get: async (token: string): Promise<OAuthStoredState | null> => {
      const redis = getReadyRedisClient();
      if (redis) {
        try {
          const raw = await redis.get(`${OAUTH_STATE_PREFIX}${token}`);
          if (!raw) {
            return null;
          }
          try {
            return JSON.parse(raw) as OAuthStoredState;
          } catch {
            logger.warn("Failed to parse OAuth state from Redis", {
              tokenPrefix: token.slice(0, 8),
            });
            return null;
          }
        } catch (error) {
          logger.warn("Failed to read OAuth state from Redis, checking memory fallback", {
            error: getErrorMessage(error),
          });
        }
      }
      const stored = memoryStore.get(token) ?? null;
      if (stored) {
        const isExpired = Date.now() - stored.createdAt > DEFAULT_TTL_SECONDS * 1000;
        if (isExpired) {
          memoryStore.delete(token);
          return null;
        }
      }
      return stored;
    },

    delete: async (token: string): Promise<void> => {
      const redis = getReadyRedisClient();
      if (redis) {
        try {
          await redis.del(`${OAUTH_STATE_PREFIX}${token}`);
          return;
        } catch (error) {
          logger.warn("Failed to delete OAuth state from Redis, cleaning memory fallback", {
            error: getErrorMessage(error),
          });
        }
      }
      memoryStore.delete(token);
    },
  };
};

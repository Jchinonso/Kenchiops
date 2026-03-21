/**
 * Redis Client Module
 *
 * Provides connection management and health checking for Redis.
 * Uses ioredis with automatic reconnection and error handling.
 *
 * @module queue/redisClient
 */

import Redis from "ioredis";
import { createLogger } from "../core/logger.js";
import { config } from "../core/config.js";
import { getErrorMessage, ExternalServiceError } from "../core/errors.js";
import {
  RETRY_DEFAULTS,
  REDIS_CONNECTION_DEFAULTS,
  REDIS_STATUS,
  REDIS_RESPONSES,
} from "../constants/index.js";
import type { RedisOptions } from "./types.js";

export type { RedisOptions } from "./types.js";

const logger = createLogger("redis");

// ==================== Connection Management ====================

let redisClient: Redis | null = null;
let subscriberClient: Redis | null = null;

/**
 * Default Redis options
 */
const DEFAULT_OPTIONS: Required<Omit<RedisOptions, "url">> = {
  maxRetries: REDIS_CONNECTION_DEFAULTS.MAX_RETRIES,
  enableOfflineQueue: REDIS_CONNECTION_DEFAULTS.ENABLE_OFFLINE_QUEUE,
  connectTimeout: REDIS_CONNECTION_DEFAULTS.CONNECT_TIMEOUT_MS,
};

/**
 * Creates a Redis client with the given options
 */
const createRedisClient = (options: RedisOptions = {}): Redis => {
  const url = options.url ?? config.REDIS_URL;
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const client = new Redis(url, {
    maxRetriesPerRequest: opts.maxRetries,
    enableOfflineQueue: opts.enableOfflineQueue,
    connectTimeout: opts.connectTimeout,
    retryStrategy: (times) => {
      if (times > opts.maxRetries) {
        logger.error("Redis max retries exceeded", { attempts: times });
        return null; // Stop retrying
      }
      const delay = Math.min(times * RETRY_DEFAULTS.BASE_DELAY_MS, RETRY_DEFAULTS.MAX_DELAY_MS);
      logger.warn("Redis reconnecting", { attempt: times, delayMs: delay });
      return delay;
    },
  });

  client.on("connect", () => {
    logger.info("Redis connected", { url: url.replace(/:[^:@]+@/, ":***@") });
  });

  client.on("error", (error) => {
    logger.error("Redis error", { error: error.message });
  });

  client.on("close", () => {
    logger.warn("Redis connection closed");
  });

  return client;
};

/**
 * Gets or creates the main Redis client
 */
export const getRedisClient = (options?: RedisOptions): Redis => {
  if (!redisClient) {
    redisClient = createRedisClient(options);
  }
  return redisClient;
};

/**
 * Gets or creates a dedicated subscriber client
 * (Required because subscriber connections can't be used for commands)
 */
export const getSubscriberClient = (options?: RedisOptions): Redis => {
  if (!subscriberClient) {
    subscriberClient = createRedisClient(options);
  }
  return subscriberClient;
};

/**
 * Checks if Redis is healthy
 */
export const isRedisHealthy = async (): Promise<boolean> => {
  try {
    const client = getRedisClient();
    const result = await client.ping();
    return result === REDIS_RESPONSES.PONG;
  } catch (error) {
    logger.warn("Redis health check failed", { error: getErrorMessage(error) });
    return false;
  }
};

/**
 * Waits for Redis to be connected and ready
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @returns Promise that resolves when connected or rejects on timeout
 */
export const waitForRedisConnection = async (
  timeoutMs = REDIS_CONNECTION_DEFAULTS.CONNECT_TIMEOUT_MS
): Promise<void> => {
  const client = getRedisClient();
  const { status } = client;

  // Already connected
  if (status === REDIS_STATUS.READY) {
    return;
  }

  // Wait for connection
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new ExternalServiceError("redis", `Redis connection timeout after ${timeoutMs}ms`, {
          retryable: true,
          metadata: { timeoutMs },
        })
      );
    }, timeoutMs);

    const onReady = (): void => {
      clearTimeout(timeout);
      client.off("ready", onReady);
      client.off("error", onError);
      resolve();
    };

    const onError = (connectionError: Error): void => {
      clearTimeout(timeout);
      client.off("ready", onReady);
      client.off("error", onError);
      reject(connectionError);
    };

    client.once("ready", onReady);
    client.once("error", onError);
  });
};

/**
 * Safely closes a Redis client, logging success or failure.
 */
const safeCloseClient = async (
  client: Redis,
  label: string,
  clearRef: () => void
): Promise<void> => {
  try {
    await client.quit();
    clearRef();
    logger.info(`Redis ${label} closed`);
  } catch (error) {
    clearRef();
    logger.error(`Failed to close Redis ${label}`, { error: getErrorMessage(error) });
  }
};

/**
 * Closes all Redis connections
 */
export const closeRedis = async (): Promise<void> => {
  const closePromises: Array<Promise<void>> = [];

  if (redisClient) {
    const client = redisClient;
    closePromises.push(
      safeCloseClient(client, "main client", () => {
        redisClient = null;
      })
    );
  }

  if (subscriberClient) {
    const client = subscriberClient;
    closePromises.push(
      safeCloseClient(client, "subscriber client", () => {
        subscriberClient = null;
      })
    );
  }

  await Promise.all(closePromises);
};

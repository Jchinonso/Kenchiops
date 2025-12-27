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
import { RETRY_DEFAULTS } from "../constants/index.js";

const logger = createLogger("redis");

// ==================== Types ====================

/**
 * Redis connection options
 */
export interface RedisOptions {
  /** Redis URL (redis://host:port) */
  readonly url?: string;
  /** Maximum retry attempts */
  readonly maxRetries?: number;
  /** Enable offline queue (buffer commands while disconnected) */
  readonly enableOfflineQueue?: boolean;
  /** Connection timeout in milliseconds */
  readonly connectTimeout?: number;
}

// ==================== Connection Management ====================

let redisClient: Redis | null = null;
let subscriberClient: Redis | null = null;

/**
 * Default Redis options
 */
const DEFAULT_OPTIONS: Required<Omit<RedisOptions, "url">> = {
  maxRetries: 10,
  enableOfflineQueue: false, // Disable to fail fast instead of hanging
  connectTimeout: 10000,
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
    return result === "PONG";
  } catch {
    return false;
  }
};

/**
 * Waits for Redis to be connected and ready
 * @param timeoutMs - Maximum time to wait in milliseconds (default: 10000)
 * @returns Promise that resolves when connected or rejects on timeout
 */
export const waitForRedisConnection = async (timeoutMs = 10000): Promise<void> => {
  const client = getRedisClient();
  const status = client.status;

  // Already connected
  if (status === "ready") {
    return;
  }

  // Wait for connection
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Redis connection timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const onReady = (): void => {
      clearTimeout(timeout);
      client.off("ready", onReady);
      client.off("error", onError);
      resolve();
    };

    const onError = (err: Error): void => {
      clearTimeout(timeout);
      client.off("ready", onReady);
      client.off("error", onError);
      reject(err);
    };

    client.once("ready", onReady);
    client.once("error", onError);
  });
};

/**
 * Closes all Redis connections
 */
export const closeRedis = async (): Promise<void> => {
  const closePromises: Promise<void>[] = [];

  if (redisClient) {
    closePromises.push(
      redisClient.quit().then(() => {
        redisClient = null;
        logger.info("Redis main client closed");
      })
    );
  }

  if (subscriberClient) {
    closePromises.push(
      subscriberClient.quit().then(() => {
        subscriberClient = null;
        logger.info("Redis subscriber client closed");
      })
    );
  }

  await Promise.all(closePromises);
};

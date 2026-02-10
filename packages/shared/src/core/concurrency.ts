/**
 * Concurrency Limiter Utility
 *
 * Provides semaphore-based concurrency control for limiting parallel async operations.
 * Useful for preventing rate limiting when making many parallel API calls.
 *
 * @module core/concurrency
 */

import { LLM_CONCURRENCY_DEFAULTS } from "../constants/index.js";
import { ValidationError, QueueTimeoutError } from "./errors.js";
import type { ConcurrencyLimiterConfig, ConcurrencyLimiter, PendingWaiter } from "./types.js";

export type { ConcurrencyLimiterConfig, ConcurrencyLimiter };

const validateMaxConcurrent = (value: number): void => {
  if (value < 1) {
    throw new ValidationError("maxConcurrent must be at least 1", {
      metadata: { maxConcurrent: value },
    });
  }
  if (!Number.isInteger(value)) {
    throw new ValidationError("maxConcurrent must be an integer", {
      metadata: { maxConcurrent: value },
    });
  }
};

/**
 * Creates a semaphore-based concurrency limiter.
 */
export const createConcurrencyLimiter = (config: ConcurrencyLimiterConfig): ConcurrencyLimiter => {
  const {
    maxConcurrent: maxConcurrentValue,
    queueTimeoutMs = LLM_CONCURRENCY_DEFAULTS.QUEUE_TIMEOUT_MS,
  } = config;

  validateMaxConcurrent(maxConcurrentValue);

  let available = maxConcurrentValue;
  const waiters: PendingWaiter[] = [];

  const acquire = (): Promise<void> => {
    if (available > 0) {
      available--;
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const waiter: PendingWaiter = {
        resolve,
        reject,
        timeoutId: setTimeout(() => {
          const waiterIndex = waiters.indexOf(waiter);
          if (waiterIndex !== -1) {
            waiters.splice(waiterIndex, 1);
          }
          if (!waiter.resolved) {
            waiter.resolved = true;
            reject(new QueueTimeoutError(queueTimeoutMs, waiters.length));
          }
        }, queueTimeoutMs),
        resolved: false,
      };
      waiters.push(waiter);
    });
  };

  const release = (): void => {
    const waiter = waiters.shift();
    if (waiter) {
      clearTimeout(waiter.timeoutId);
      if (!waiter.resolved) {
        waiter.resolved = true;
        waiter.resolve();
      }
    } else {
      available = Math.min(available + 1, maxConcurrentValue);
    }
  };

  return {
    acquire,
    release,
    availableSlots: () => available,
    queueLength: () => waiters.length,
    maxConcurrent: () => maxConcurrentValue,
  };
};

/**
 * Maps over an array with concurrency control.
 * Drop-in replacement for `Promise.all(items.map(fn))` with limited concurrency.
 */
export const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  mapper: (item: T, index: number) => Promise<R>,
  maxConcurrent: number,
  queueTimeoutMs?: number
): Promise<R[]> => {
  if (items.length === 0) {
    return [];
  }

  validateMaxConcurrent(maxConcurrent);

  if (maxConcurrent >= items.length) {
    return Promise.all(items.map(mapper));
  }

  const limiter = createConcurrencyLimiter({ maxConcurrent, queueTimeoutMs });

  const processItem = async (item: T, index: number): Promise<R> => {
    await limiter.acquire();
    try {
      return await mapper(item, index);
    } finally {
      limiter.release();
    }
  };

  const settled = await Promise.allSettled(items.map(processItem));

  const firstRejection = settled.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );

  if (firstRejection) {
    const { reason } = firstRejection;
    if (reason instanceof Error) {
      throw reason;
    }
    throw new ValidationError("Mapper threw non-Error value", {
      metadata: { reason: String(reason) },
    });
  }

  return settled.map((result) => (result as PromiseFulfilledResult<R>).value);
};

/**
 * Executes a function with concurrency control using a shared limiter.
 */
export const withConcurrencyLimit = async <R>(
  limiter: ConcurrencyLimiter,
  fn: () => Promise<R>
): Promise<R> => {
  await limiter.acquire();
  try {
    return await fn();
  } finally {
    limiter.release();
  }
};

/**
 * Type guard to check if an error is a QueueTimeoutError.
 */
export const isQueueTimeoutError = (error: unknown): error is QueueTimeoutError =>
  error instanceof QueueTimeoutError;

/**
 * Unit tests for core/concurrency.ts
 */
import { describe, it, expect } from "@jest/globals";
import {
  createConcurrencyLimiter,
  mapWithConcurrency,
  withConcurrencyLimit,
  isQueueTimeoutError,
} from "../../core/concurrency.js";
import { ValidationError, QueueTimeoutError } from "../../core/errors.js";

describe("Concurrency Limiter", () => {
  describe("createConcurrencyLimiter", () => {
    it("should create limiter with specified maxConcurrent", () => {
      const limiter = createConcurrencyLimiter({ maxConcurrent: 5 });

      expect(limiter.availableSlots()).toBe(5);
      expect(limiter.queueLength()).toBe(0);
      expect(limiter.maxConcurrent()).toBe(5);
    });

    it("should throw ValidationError if maxConcurrent is less than 1", () => {
      expect(() => createConcurrencyLimiter({ maxConcurrent: 0 })).toThrow(ValidationError);
      expect(() => createConcurrencyLimiter({ maxConcurrent: -1 })).toThrow(ValidationError);
    });

    it("should throw ValidationError if maxConcurrent is not an integer", () => {
      expect(() => createConcurrencyLimiter({ maxConcurrent: 2.5 })).toThrow(ValidationError);
      expect(() => createConcurrencyLimiter({ maxConcurrent: 1.1 })).toThrow(ValidationError);
    });

    it("should allow acquire when slots are available", async () => {
      const limiter = createConcurrencyLimiter({ maxConcurrent: 2 });

      await limiter.acquire();
      expect(limiter.availableSlots()).toBe(1);

      await limiter.acquire();
      expect(limiter.availableSlots()).toBe(0);
    });

    it("should release slots correctly", async () => {
      const limiter = createConcurrencyLimiter({ maxConcurrent: 2 });

      await limiter.acquire();
      expect(limiter.availableSlots()).toBe(1);

      limiter.release();
      expect(limiter.availableSlots()).toBe(2);
    });

    it("should not over-release beyond maxConcurrent", async () => {
      const limiter = createConcurrencyLimiter({ maxConcurrent: 2 });

      // Release without acquiring (edge case)
      limiter.release();
      limiter.release();
      limiter.release();

      // Should be capped at maxConcurrent
      expect(limiter.availableSlots()).toBe(2);
    });

    it("should queue waiters when no slots available", async () => {
      const limiter = createConcurrencyLimiter({ maxConcurrent: 1 });

      await limiter.acquire();
      expect(limiter.availableSlots()).toBe(0);

      // Start a second acquire that will wait
      const acquirePromise = limiter.acquire();
      expect(limiter.queueLength()).toBe(1);

      // Release to unblock the waiter
      limiter.release();
      await acquirePromise;

      expect(limiter.queueLength()).toBe(0);
      expect(limiter.availableSlots()).toBe(0);
    });

    it("should throw QueueTimeoutError if queue wait exceeds queueTimeoutMs", async () => {
      const limiter = createConcurrencyLimiter({
        maxConcurrent: 1,
        queueTimeoutMs: 50,
      });

      await limiter.acquire();

      // This acquire should timeout
      await expect(limiter.acquire()).rejects.toThrow(QueueTimeoutError);
    });

    it("should include queue length in QueueTimeoutError", async () => {
      const limiter = createConcurrencyLimiter({
        maxConcurrent: 1,
        queueTimeoutMs: 50,
      });

      await limiter.acquire();

      try {
        await limiter.acquire();
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(isQueueTimeoutError(error)).toBe(true);
        if (isQueueTimeoutError(error)) {
          expect(error.queueTimeoutMs).toBe(50);
          expect(typeof error.queueLength).toBe("number");
        }
      }
    });

    it("should process waiters in FIFO order", async () => {
      const limiter = createConcurrencyLimiter({ maxConcurrent: 1 });
      const order: number[] = [];

      await limiter.acquire();

      // Queue multiple waiters
      const waiter1 = limiter.acquire().then(() => order.push(1));
      const waiter2 = limiter.acquire().then(() => order.push(2));
      const waiter3 = limiter.acquire().then(() => order.push(3));

      expect(limiter.queueLength()).toBe(3);

      // Release slots one by one
      limiter.release();
      await waiter1;
      limiter.release();
      await waiter2;
      limiter.release();
      await waiter3;

      expect(order).toEqual([1, 2, 3]);
    });

    it("should handle race between timeout and release", async () => {
      const limiter = createConcurrencyLimiter({
        maxConcurrent: 1,
        queueTimeoutMs: 100,
      });

      await limiter.acquire();

      // Start acquire that will wait
      const acquirePromise = limiter.acquire();

      // Release just before timeout
      setTimeout(() => limiter.release(), 50);

      // Should not timeout
      await expect(acquirePromise).resolves.toBeUndefined();
    });
  });

  describe("mapWithConcurrency", () => {
    it("should return empty array for empty input", async () => {
      const results = await mapWithConcurrency([], async (item: number) => item * 2, 5);
      expect(results).toEqual([]);
    });

    it("should throw ValidationError for maxConcurrent < 1", async () => {
      await expect(mapWithConcurrency([1, 2, 3], async (item) => item, 0)).rejects.toThrow(
        ValidationError
      );
    });

    it("should map items in order", async () => {
      const items = [1, 2, 3, 4, 5];
      const results = await mapWithConcurrency(items, async (item) => item * 2, 10);
      expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    it("should limit concurrent operations", async () => {
      const maxConcurrent = 2;
      let currentConcurrent = 0;
      let maxObservedConcurrent = 0;

      const items = [1, 2, 3, 4, 5, 6];

      await mapWithConcurrency(
        items,
        async (item) => {
          currentConcurrent++;
          maxObservedConcurrent = Math.max(maxObservedConcurrent, currentConcurrent);

          // Simulate async work
          await new Promise((resolve) => setTimeout(resolve, 10));

          currentConcurrent--;
          return item * 2;
        },
        maxConcurrent
      );

      expect(maxObservedConcurrent).toBeLessThanOrEqual(maxConcurrent);
    });

    it("should preserve result order even with varying execution times", async () => {
      const items = [50, 10, 30, 20, 40];

      const results = await mapWithConcurrency(
        items,
        async (delay) => {
          await new Promise((resolve) => setTimeout(resolve, delay));
          return delay;
        },
        2
      );

      // Results should be in original order despite different completion times
      expect(results).toEqual([50, 10, 30, 20, 40]);
    });

    it("should use Promise.all when maxConcurrent >= items.length", async () => {
      const items = [1, 2, 3];
      const results = await mapWithConcurrency(items, async (item) => item * 2, 10);
      expect(results).toEqual([2, 4, 6]);
    });

    it("should pass index to mapper function", async () => {
      const items = ["a", "b", "c"];
      const results = await mapWithConcurrency(items, async (item, index) => `${item}-${index}`, 2);
      expect(results).toEqual(["a-0", "b-1", "c-2"]);
    });

    it("should propagate errors from mapper", async () => {
      const items = [1, 2, 3];

      await expect(
        mapWithConcurrency(
          items,
          async (item) => {
            if (item === 2) {
              throw new ValidationError("Test error");
            }
            return item;
          },
          2
        )
      ).rejects.toThrow(ValidationError);
    });

    it("should throw first error when multiple errors occur", async () => {
      const items = [1, 2, 3, 4, 5];
      const errors: number[] = [];

      await expect(
        mapWithConcurrency(
          items,
          async (item) => {
            // Stagger the errors
            await new Promise((resolve) => setTimeout(resolve, item * 10));
            if (item === 2 || item === 4) {
              errors.push(item);
              throw new ValidationError(`Error at item ${item}`);
            }
            return item;
          },
          3
        )
      ).rejects.toThrow(/Error at item/);
    });

    it("should handle non-Error thrown values", async () => {
      const items = [1, 2, 3];

      await expect(
        mapWithConcurrency(
          items,
          async (item) => {
            if (item === 2) {
              throw "string error"; // eslint-disable-line no-throw-literal
            }
            return item;
          },
          2
        )
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("withConcurrencyLimit", () => {
    it("should execute function with concurrency control", async () => {
      const limiter = createConcurrencyLimiter({ maxConcurrent: 2 });

      const result = await withConcurrencyLimit(limiter, async () => {
        return "success";
      });

      expect(result).toBe("success");
    });

    it("should release slot even if function throws", async () => {
      const limiter = createConcurrencyLimiter({ maxConcurrent: 1 });

      try {
        await withConcurrencyLimit(limiter, async () => {
          throw new ValidationError("Test error");
        });
      } catch {
        // Expected error
      }

      // Slot should be released
      expect(limiter.availableSlots()).toBe(1);
    });

    it("should allow multiple concurrent executions up to limit", async () => {
      const limiter = createConcurrencyLimiter({ maxConcurrent: 2 });
      let currentConcurrent = 0;
      let maxObservedConcurrent = 0;

      const execute = async (): Promise<void> => {
        await withConcurrencyLimit(limiter, async () => {
          currentConcurrent++;
          maxObservedConcurrent = Math.max(maxObservedConcurrent, currentConcurrent);
          await new Promise((resolve) => setTimeout(resolve, 20));
          currentConcurrent--;
        });
      };

      await Promise.all([execute(), execute(), execute(), execute()]);

      expect(maxObservedConcurrent).toBeLessThanOrEqual(2);
    });

    it("should work with sync functions wrapped in async", async () => {
      const limiter = createConcurrencyLimiter({ maxConcurrent: 2 });

      const result = await withConcurrencyLimit(limiter, async () => {
        return 42;
      });

      expect(result).toBe(42);
    });
  });

  describe("isQueueTimeoutError", () => {
    it("should return true for QueueTimeoutError", () => {
      const error = new QueueTimeoutError(1000, 5);
      expect(isQueueTimeoutError(error)).toBe(true);
    });

    it("should return false for ValidationError", () => {
      const error = new ValidationError("test");
      expect(isQueueTimeoutError(error)).toBe(false);
    });

    it("should return false for regular Error", () => {
      const error = new Error("test");
      expect(isQueueTimeoutError(error)).toBe(false);
    });

    it("should return false for non-error values", () => {
      expect(isQueueTimeoutError(null)).toBe(false);
      expect(isQueueTimeoutError(undefined)).toBe(false);
      expect(isQueueTimeoutError("string")).toBe(false);
      expect(isQueueTimeoutError(123)).toBe(false);
    });
  });

  describe("QueueTimeoutError", () => {
    it("should have correct properties", () => {
      const error = new QueueTimeoutError(5000, 10);

      expect(error.queueTimeoutMs).toBe(5000);
      expect(error.queueLength).toBe(10);
      expect(error.retryable).toBe(true);
      expect(error.message).toContain("5000ms");
    });

    it("should be retryable", () => {
      const error = new QueueTimeoutError(1000, 5);
      expect(error.retryable).toBe(true);
      expect(error.retryAfterMs).toBe(1000);
    });
  });

  describe("Integration scenarios", () => {
    it("should handle high volume of operations", async () => {
      const items = Array.from({ length: 100 }, (_, index) => index);
      let processedCount = 0;

      const results = await mapWithConcurrency(
        items,
        async (item) => {
          processedCount++;
          return item * 2;
        },
        5
      );

      expect(results.length).toBe(100);
      expect(processedCount).toBe(100);
      expect(results[0]).toBe(0);
      expect(results[99]).toBe(198);
    });

    it("should work correctly with async/await patterns", async () => {
      const limiter = createConcurrencyLimiter({ maxConcurrent: 3 });

      const fetchMockData = async (id: number): Promise<string> => {
        return withConcurrencyLimit(limiter, async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return `data-${id}`;
        });
      };

      const results = await Promise.all([
        fetchMockData(1),
        fetchMockData(2),
        fetchMockData(3),
        fetchMockData(4),
        fetchMockData(5),
      ]);

      expect(results).toEqual(["data-1", "data-2", "data-3", "data-4", "data-5"]);
    });

    it("should handle rapid acquire/release cycles", async () => {
      const limiter = createConcurrencyLimiter({ maxConcurrent: 1 });

      for (let iteration = 0; iteration < 50; iteration++) {
        await limiter.acquire();
        limiter.release();
      }

      expect(limiter.availableSlots()).toBe(1);
      expect(limiter.queueLength()).toBe(0);
    });

    it("should handle concurrent acquire attempts on single slot", async () => {
      const limiter = createConcurrencyLimiter({ maxConcurrent: 1 });
      const completed: number[] = [];

      const tasks = Array.from({ length: 10 }, (_, index) =>
        withConcurrencyLimit(limiter, async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          completed.push(index);
          return index;
        })
      );

      const results = await Promise.all(tasks);

      expect(results.length).toBe(10);
      expect(completed.length).toBe(10);
      // All numbers 0-9 should be in completed
      expect(new Set(completed).size).toBe(10);
    });
  });
});

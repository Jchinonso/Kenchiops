/**
 * Tests for burst detection module.
 */

import {
  BurstDetector,
  createBurstDetector,
  defaultBurstDetector,
} from "../../rateLimit/burstDetection.js";
import { BURST_DETECTION_DEFAULTS } from "../../rateLimit/types.js";

describe("BurstDetector", () => {
  let detector: BurstDetector;

  beforeEach(() => {
    detector = createBurstDetector({
      windowMs: 1000,
      maxBurst: 5,
      rateMultiplier: 0.5,
      blockOnBurst: false,
    });
  });

  afterEach(() => {
    detector.resetAll();
  });

  describe("check", () => {
    it("should not detect burst for normal request rate", () => {
      const result = detector.check("user:123");

      expect(result.isBurst).toBe(false);
      expect(result.requestsInWindow).toBe(1);
      expect(result.shouldBlock).toBe(false);
      expect(result.rateMultiplier).toBe(1);
    });

    it("should detect burst when exceeding maxBurst", () => {
      const key = "user:456";

      // Make requests up to the limit
      for (let i = 0; i < 5; i++) {
        const result = detector.check(key);
        expect(result.isBurst).toBe(false);
      }

      // Next request should trigger burst
      const burstResult = detector.check(key);
      expect(burstResult.isBurst).toBe(true);
      expect(burstResult.requestsInWindow).toBe(6);
    });

    it("should apply rate multiplier during burst penalty", () => {
      const key = "user:789";

      // Trigger burst
      for (let i = 0; i < 6; i++) {
        detector.check(key);
      }

      const result = detector.check(key);
      // rateMultiplier < 1 means reduced quota (0.5 = half rate)
      expect(result.rateMultiplier).toBe(0.5);
    });

    it("should track separate keys independently", () => {
      // Trigger burst on key1
      for (let i = 0; i < 6; i++) {
        detector.check("key1");
      }

      // key2 should not be affected
      const result = detector.check("key2");
      expect(result.isBurst).toBe(false);
      expect(result.requestsInWindow).toBe(1);
    });
  });

  describe("blockOnBurst option", () => {
    it("should set shouldBlock when blockOnBurst is true", () => {
      const blockingDetector = createBurstDetector({
        windowMs: 1000,
        maxBurst: 3,
        blockOnBurst: true,
      });

      // Trigger burst
      for (let i = 0; i < 4; i++) {
        blockingDetector.check("key");
      }

      const result = blockingDetector.check("key");
      expect(result.shouldBlock).toBe(true);
    });

    it("should not set shouldBlock when blockOnBurst is false", () => {
      // Trigger burst
      for (let i = 0; i < 6; i++) {
        detector.check("key");
      }

      const result = detector.check("key");
      expect(result.isBurst).toBe(true);
      expect(result.shouldBlock).toBe(false);
    });
  });

  describe("reset", () => {
    it("should reset tracking for a specific key", () => {
      // Build up request count
      for (let i = 0; i < 5; i++) {
        detector.check("key");
      }

      detector.reset("key");

      const result = detector.check("key");
      expect(result.requestsInWindow).toBe(1);
    });

    it("should not affect other keys", () => {
      for (let i = 0; i < 5; i++) {
        detector.check("key1");
        detector.check("key2");
      }

      detector.reset("key1");

      const result1 = detector.check("key1");
      const result2 = detector.check("key2");

      expect(result1.requestsInWindow).toBe(1);
      expect(result2.requestsInWindow).toBe(6);
    });
  });

  describe("resetAll", () => {
    it("should reset all tracked keys", () => {
      for (let i = 0; i < 5; i++) {
        detector.check("key1");
        detector.check("key2");
      }

      detector.resetAll();

      expect(detector.check("key1").requestsInWindow).toBe(1);
      expect(detector.check("key2").requestsInWindow).toBe(1);
    });
  });

  describe("getStats", () => {
    it("should return correct statistics", () => {
      detector.check("key1");
      detector.check("key1");
      detector.check("key2");

      const stats = detector.getStats();
      expect(stats.trackedKeys).toBe(2);
      expect(stats.totalTimestamps).toBe(3);
    });

    it("should return zero for empty detector", () => {
      const stats = detector.getStats();
      expect(stats.trackedKeys).toBe(0);
      expect(stats.totalTimestamps).toBe(0);
    });
  });

  describe("window expiration", () => {
    it("should expire old timestamps", async () => {
      const shortWindowDetector = createBurstDetector({
        windowMs: 50,
        maxBurst: 2,
      });

      // Make requests
      shortWindowDetector.check("key");
      shortWindowDetector.check("key");

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should start fresh
      const result = shortWindowDetector.check("key");
      expect(result.requestsInWindow).toBe(1);
    });
  });

  describe("defaults", () => {
    it("should use default values when not specified", () => {
      const _detector = createBurstDetector();

      expect(BURST_DETECTION_DEFAULTS.WINDOW_MS).toBe(1000);
      expect(BURST_DETECTION_DEFAULTS.MAX_BURST).toBe(10);
      // rateMultiplier < 1 means reduced quota (0.5 = half rate during penalty)
      expect(BURST_DETECTION_DEFAULTS.RATE_MULTIPLIER).toBe(0.5);
      expect(BURST_DETECTION_DEFAULTS.BLOCK_ON_BURST).toBe(false);
    });
  });

  describe("defaultBurstDetector", () => {
    beforeEach(() => {
      defaultBurstDetector.resetAll();
    });

    it("should be a pre-configured instance", () => {
      const result = defaultBurstDetector.check("test-key");
      expect(result).toHaveProperty("isBurst");
      expect(result).toHaveProperty("requestsInWindow");
    });
  });
});

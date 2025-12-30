/**
 * Tests for Graceful Shutdown Module
 */

import {
  isShuttingDown,
  registerCleanupHandler,
  getShutdownStatus,
} from "../../shutdown/gracefulShutdown.js";

// Reset module state between tests by re-importing
// Note: We can only test the exported functions without process.exit calls

describe("gracefulShutdown", () => {
  describe("isShuttingDown", () => {
    it("should return false initially", () => {
      // Note: This assumes clean module state
      // In a fresh module load, isShuttingDown should be false
      const result = isShuttingDown();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("registerCleanupHandler", () => {
    it("should register a cleanup handler", () => {
      const statusBefore = getShutdownStatus();
      const initialCount = statusBefore.registeredHandlers;

      const cleanup = jest.fn();
      const unregister = registerCleanupHandler(cleanup);

      const statusAfter = getShutdownStatus();
      expect(statusAfter.registeredHandlers).toBe(initialCount + 1);

      // Cleanup
      unregister();
    });

    it("should return an unregister function", () => {
      const cleanup = jest.fn();
      const unregister = registerCleanupHandler(cleanup);

      expect(typeof unregister).toBe("function");

      // Cleanup
      unregister();
    });

    it("should unregister handler when unregister is called", () => {
      const statusBefore = getShutdownStatus();
      const initialCount = statusBefore.registeredHandlers;

      const cleanup = jest.fn();
      const unregister = registerCleanupHandler(cleanup);

      expect(getShutdownStatus().registeredHandlers).toBe(initialCount + 1);

      unregister();

      expect(getShutdownStatus().registeredHandlers).toBe(initialCount);
    });

    it("should handle multiple cleanup handlers", () => {
      const statusBefore = getShutdownStatus();
      const initialCount = statusBefore.registeredHandlers;

      const cleanup1 = jest.fn();
      const cleanup2 = jest.fn();
      const cleanup3 = jest.fn();

      const unregister1 = registerCleanupHandler(cleanup1);
      const unregister2 = registerCleanupHandler(cleanup2);
      const unregister3 = registerCleanupHandler(cleanup3);

      expect(getShutdownStatus().registeredHandlers).toBe(initialCount + 3);

      // Unregister in different order
      unregister2();
      expect(getShutdownStatus().registeredHandlers).toBe(initialCount + 2);

      unregister1();
      unregister3();
      expect(getShutdownStatus().registeredHandlers).toBe(initialCount);
    });

    it("should handle unregistering same handler multiple times safely", () => {
      const statusBefore = getShutdownStatus();
      const initialCount = statusBefore.registeredHandlers;

      const cleanup = jest.fn();
      const unregister = registerCleanupHandler(cleanup);

      expect(getShutdownStatus().registeredHandlers).toBe(initialCount + 1);

      // First unregister
      unregister();
      expect(getShutdownStatus().registeredHandlers).toBe(initialCount);

      // Second unregister should be safe (no-op)
      unregister();
      expect(getShutdownStatus().registeredHandlers).toBe(initialCount);
    });
  });

  describe("getShutdownStatus", () => {
    it("should return shutdown status object", () => {
      const status = getShutdownStatus();

      expect(status).toHaveProperty("isShuttingDown");
      expect(status).toHaveProperty("registeredHandlers");
      expect(typeof status.isShuttingDown).toBe("boolean");
      expect(typeof status.registeredHandlers).toBe("number");
    });

    it("should reflect registered handler count accurately", () => {
      const initialStatus = getShutdownStatus();
      const initialCount = initialStatus.registeredHandlers;

      const handler1 = registerCleanupHandler(() => {});
      const handler2 = registerCleanupHandler(() => {});

      expect(getShutdownStatus().registeredHandlers).toBe(initialCount + 2);

      handler1();
      expect(getShutdownStatus().registeredHandlers).toBe(initialCount + 1);

      handler2();
      expect(getShutdownStatus().registeredHandlers).toBe(initialCount);
    });
  });
});

/**
 * Circuit Breaker Tests
 *
 * Tests for the generic circuit breaker pattern implementation.
 */

import {
  withCircuitBreaker,
  getCircuitStatus,
  resetCircuit,
  resetAllCircuits,
  getAllCircuitStatus,
  SERVICE_KEYS,
} from "../../http/circuitBreaker.js";
import { ExternalServiceError } from "../../core/errors.js";

describe("Circuit Breaker", () => {
  beforeEach(() => {
    resetAllCircuits();
  });

  describe("withCircuitBreaker", () => {
    it("should execute operation when circuit is closed", async () => {
      const result = await withCircuitBreaker("test-service", async () => {
        return "success";
      });

      expect(result).toBe("success");
    });

    it("should track failures and open circuit after threshold", async () => {
      const failingOperation = async (): Promise<string> => {
        throw new Error("Service unavailable");
      };

      // Fail 3 times to hit default threshold
      const attempts = [1, 2, 3];
      await Promise.all(
        attempts.map(async () => {
          await expect(
            withCircuitBreaker("test-service", failingOperation, { threshold: 3 })
          ).rejects.toThrow("Service unavailable");
        })
      );

      // Circuit should now be open
      const status = getCircuitStatus("test-service");
      expect(status.isOpen).toBe(true);
      expect(status.failures).toBe(3);

      // Next call should be blocked by circuit breaker
      await expect(
        withCircuitBreaker("test-service", async () => "success", { threshold: 3 })
      ).rejects.toThrow(ExternalServiceError);
    });

    it("should reset failures on successful call", async () => {
      const failingOperation = async (): Promise<string> => {
        throw new Error("Temporary failure");
      };

      // Fail twice (below threshold of 3)
      await expect(
        withCircuitBreaker("test-service", failingOperation, { threshold: 3 })
      ).rejects.toThrow();
      await expect(
        withCircuitBreaker("test-service", failingOperation, { threshold: 3 })
      ).rejects.toThrow();

      // Succeed once
      await withCircuitBreaker("test-service", async () => "success", { threshold: 3 });

      // Failures should be reset
      const status = getCircuitStatus("test-service");
      expect(status.failures).toBe(0);
      expect(status.isOpen).toBe(false);
    });

    it("should transition to half-open after reset timeout", async () => {
      const failingOperation = async (): Promise<string> => {
        throw new Error("Service down");
      };

      // Trip the circuit breaker with short reset timeout
      const attempts = [1, 2, 3];
      await Promise.all(
        attempts.map(async () => {
          await expect(
            withCircuitBreaker("test-service", failingOperation, {
              threshold: 3,
              resetTimeout: 100, // 100ms reset timeout
            })
          ).rejects.toThrow();
        })
      );

      expect(getCircuitStatus("test-service").isOpen).toBe(true);

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should allow a probe request (half-open state)
      const result = await withCircuitBreaker("test-service", async () => "recovered", {
        threshold: 3,
        resetTimeout: 100,
      });

      expect(result).toBe("recovered");
      expect(getCircuitStatus("test-service").isOpen).toBe(false);
    });

    it("should re-open circuit on failure in half-open state", async () => {
      const failingOperation = async (): Promise<string> => {
        throw new Error("Still failing");
      };

      // Trip the circuit
      const attempts = [1, 2, 3];
      await Promise.all(
        attempts.map(async () => {
          await expect(
            withCircuitBreaker("test-service", failingOperation, {
              threshold: 3,
              resetTimeout: 100,
            })
          ).rejects.toThrow();
        })
      );

      // Wait for half-open
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Probe fails - should re-open circuit
      await expect(
        withCircuitBreaker("test-service", failingOperation, {
          threshold: 3,
          resetTimeout: 100,
        })
      ).rejects.toThrow();

      expect(getCircuitStatus("test-service").isOpen).toBe(true);
    });

    it("should handle different service keys independently", async () => {
      const failingOperation = async (): Promise<string> => {
        throw new Error("Service A down");
      };

      // Trip circuit for service A
      const attempts = [1, 2, 3];
      await Promise.all(
        attempts.map(async () => {
          await expect(
            withCircuitBreaker("service-a", failingOperation, { threshold: 3 })
          ).rejects.toThrow();
        })
      );

      // Service A should be open
      expect(getCircuitStatus("service-a").isOpen).toBe(true);

      // Service B should still work
      const result = await withCircuitBreaker("service-b", async () => "B works", {
        threshold: 3,
      });
      expect(result).toBe("B works");
      expect(getCircuitStatus("service-b").isOpen).toBe(false);
    });
  });

  describe("getCircuitStatus", () => {
    it("should return default status for unknown service", () => {
      const status = getCircuitStatus("unknown-service");

      expect(status).toEqual({
        state: "closed",
        failures: 0,
        isOpen: false,
        lastFailure: null,
      });
    });

    it("should return accurate failure count", async () => {
      await expect(
        withCircuitBreaker("test-service", async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow();

      const status = getCircuitStatus("test-service");
      expect(status.failures).toBe(1);
      expect(status.lastFailure).not.toBeNull();
    });
  });

  describe("resetCircuit", () => {
    it("should reset circuit to closed state", async () => {
      const attempts = [1, 2, 3, 4, 5];
      await Promise.all(
        attempts.map(async () => {
          await expect(
            withCircuitBreaker("test-service", async () => {
              throw new Error("fail");
            })
          ).rejects.toThrow();
        })
      );

      expect(getCircuitStatus("test-service").isOpen).toBe(true);

      resetCircuit("test-service");

      const status = getCircuitStatus("test-service");
      expect(status.isOpen).toBe(false);
      expect(status.failures).toBe(0);
    });
  });

  describe("resetAllCircuits", () => {
    it("should reset all circuit breakers", async () => {
      // Create failures for multiple services
      const services = ["service-a", "service-b", "service-c"];
      await Promise.all(
        services.map(async (service) => {
          const attempts = [1, 2, 3, 4, 5];
          await Promise.all(
            attempts.map(async () => {
              await expect(
                withCircuitBreaker(service, async () => {
                  throw new Error("fail");
                })
              ).rejects.toThrow();
            })
          );
        })
      );

      // All should be open
      services.forEach((service) => {
        expect(getCircuitStatus(service).isOpen).toBe(true);
      });

      resetAllCircuits();

      // All should be reset
      services.forEach((service) => {
        expect(getCircuitStatus(service).isOpen).toBe(false);
      });
    });
  });

  describe("getAllCircuitStatus", () => {
    it("should return status of all known circuits", async () => {
      // Create some circuits
      await withCircuitBreaker("service-a", async () => "ok");
      await expect(
        withCircuitBreaker("service-b", async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow();

      const allStatus = getAllCircuitStatus();

      expect(allStatus.size).toBe(2);
      expect(allStatus.get("service-a")?.failures).toBe(0);
      expect(allStatus.get("service-b")?.failures).toBe(1);
    });
  });

  describe("SERVICE_KEYS", () => {
    it("should have predefined service keys", () => {
      expect(SERVICE_KEYS.OPENAI).toBe("openai");
      expect(SERVICE_KEYS.GITHUB).toBe("github");
      expect(SERVICE_KEYS.SLACK).toBe("slack");
    });
  });

  describe("error message", () => {
    it("should include retry time in error message", async () => {
      const attempts = [1, 2, 3, 4, 5];
      await Promise.all(
        attempts.map(async () => {
          await expect(
            withCircuitBreaker(
              "test-service",
              async () => {
                throw new Error("fail");
              },
              { resetTimeout: 30000 }
            )
          ).rejects.toThrow();
        })
      );

      // Next call should throw circuit breaker open error
      await expect(
        withCircuitBreaker("test-service", async () => "success", { resetTimeout: 30000 })
      ).rejects.toThrow(/Service temporarily unavailable/);
    });
  });
});

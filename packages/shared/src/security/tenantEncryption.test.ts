/**
 * Tests for per-tenant encryption metrics instrumentation.
 *
 * The basic encrypt/decrypt/decryptAuto functionality is covered in
 * __tests__/security/tenantEncryption.test.ts (integration-style with real crypto).
 *
 * This file focuses on verifying that encryption operations correctly
 * increment Prometheus counters (encryptionOpsTotal, encryptionErrorsTotal)
 * and observe histogram durations (encryptionOpDuration).
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import crypto from "node:crypto";

// ==================== Metrics Mocks ====================

const mockOpsInc = jest.fn();
const mockErrorsInc = jest.fn();
const mockEndTimer = jest.fn();
const mockStartTimer = jest.fn<() => () => void>().mockReturnValue(mockEndTimer);

jest.mock("../observability/metrics.js", () => ({
  encryptionOpsTotal: { inc: (...args: unknown[]) => mockOpsInc(...args) },
  encryptionOpDuration: { startTimer: (...args: unknown[]) => mockStartTimer(...args) },
  encryptionErrorsTotal: { inc: (...args: unknown[]) => mockErrorsInc(...args) },
}));

// ==================== Config & Logger Mocks ====================

// Valid 64-char hex key = 32 bytes
const VALID_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

jest.mock("../core/config.js", () => ({
  config: {
    ENCRYPTION_KEY: VALID_KEY,
    NODE_ENV: "test",
  },
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock("../core/logger.js", () => ({
  createLogger: jest.fn(() => mockLogger),
}));

jest.mock("../core/errors.js", () => ({
  invariant: (condition: boolean, message: string) => {
    if (!condition) {
      throw new Error(message);
    }
  },
}));

// Mock the legacy decryption module
jest.mock("./encryption.js", () => ({
  decryptValue: jest.fn((v: string) => v),
}));

// ==================== Import module under test ====================

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let mod: typeof import("./tenantEncryption.js");

// ==================== Tests ====================

describe("tenantEncryption metrics instrumentation", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();
    mod = await import("./tenantEncryption.js");
  });

  describe("encryptForTenant", () => {
    it("should start a duration timer with tenant_id and operation labels", async () => {
      await mod.encryptForTenant("tenant-1", "hello");

      expect(mockStartTimer).toHaveBeenCalledWith({
        tenant_id: "tenant-1",
        operation: "encrypt",
      });
    });

    it("should call end() on the timer after encryption completes", async () => {
      await mod.encryptForTenant("tenant-1", "hello");

      expect(mockEndTimer).toHaveBeenCalledTimes(1);
    });

    it("should increment encryptionOpsTotal with correct labels on success", async () => {
      await mod.encryptForTenant("tenant-2", "data");

      expect(mockOpsInc).toHaveBeenCalledWith({
        tenant_id: "tenant-2",
        operation: "encrypt",
        key_version: "2",
      });
    });

    it("should not increment encryptionErrorsTotal on success", async () => {
      await mod.encryptForTenant("tenant-ok", "data");

      expect(mockErrorsInc).not.toHaveBeenCalled();
    });

    it("should produce valid v2 format output", async () => {
      const result = await mod.encryptForTenant("tenant-fmt", "test");

      expect(result.startsWith("v2:")).toBe(true);
      expect(result.split(":")).toHaveLength(4);
    });
  });

  describe("decryptForTenant", () => {
    it("should start a duration timer with tenant_id and operation labels", async () => {
      const encrypted = await mod.encryptForTenant("tenant-d", "secret");
      jest.clearAllMocks();

      await mod.decryptForTenant("tenant-d", encrypted);

      expect(mockStartTimer).toHaveBeenCalledWith({
        tenant_id: "tenant-d",
        operation: "decrypt",
      });
    });

    it("should increment encryptionOpsTotal on successful decryption", async () => {
      const encrypted = await mod.encryptForTenant("tenant-d", "secret");
      jest.clearAllMocks();

      await mod.decryptForTenant("tenant-d", encrypted);

      expect(mockOpsInc).toHaveBeenCalledWith({
        tenant_id: "tenant-d",
        operation: "decrypt",
        key_version: "2",
      });
    });

    it("should call end() on the timer after decryption", async () => {
      const encrypted = await mod.encryptForTenant("tenant-d", "secret");
      jest.clearAllMocks();

      await mod.decryptForTenant("tenant-d", encrypted);

      expect(mockEndTimer).toHaveBeenCalledTimes(1);
    });

    it("should increment encryptionErrorsTotal when decryption fails (wrong tenant)", async () => {
      const encrypted = await mod.encryptForTenant("tenant-d", "secret");
      jest.clearAllMocks();

      // Wrong tenant = wrong derived key = decryption failure
      await expect(mod.decryptForTenant("wrong-tenant", encrypted)).rejects.toThrow();

      expect(mockErrorsInc).toHaveBeenCalledWith({
        tenant_id: "wrong-tenant",
        operation: "decrypt",
        error_type: "decrypt_failure",
      });
    });

    it("should call end() on the timer even when decryption fails", async () => {
      const encrypted = await mod.encryptForTenant("tenant-d", "secret");
      jest.clearAllMocks();

      await mod.decryptForTenant("wrong-tenant", encrypted).catch(() => {});

      expect(mockEndTimer).toHaveBeenCalledTimes(1);
    });

    it("should not increment error counter on successful decryption", async () => {
      const encrypted = await mod.encryptForTenant("tenant-d", "secret");
      jest.clearAllMocks();

      await mod.decryptForTenant("tenant-d", encrypted);

      expect(mockErrorsInc).not.toHaveBeenCalled();
    });

    it("should return value as-is when format is not v2", async () => {
      const result = await mod.decryptForTenant("any", "plain-text-no-colons");

      expect(result).toBe("plain-text-no-colons");
    });

    it("should return value as-is when v2 prefix but wrong part count", async () => {
      const result = await mod.decryptForTenant("any", "v2:only-two-parts");

      expect(result).toBe("v2:only-two-parts");
    });

    it("should not start timer for non-v2 format values", async () => {
      jest.clearAllMocks();

      await mod.decryptForTenant("any", "not-v2-format");

      expect(mockStartTimer).not.toHaveBeenCalled();
    });

    it("should increment encryptionErrorsTotal when ciphertext is corrupted", async () => {
      const encrypted = await mod.encryptForTenant("tenant-d", "secret");
      jest.clearAllMocks();

      // Corrupt the ciphertext portion (3rd part) while keeping valid-length hex
      const parts = encrypted.split(":");
      // Flip a byte in the ciphertext to make it invalid
      const corruptedCiphertext =
        parts[2].charAt(0) === "a" ? "b" + parts[2].slice(1) : "a" + parts[2].slice(1);
      const corrupted = [parts[0], parts[1], corruptedCiphertext, parts[3]].join(":");

      await expect(mod.decryptForTenant("tenant-d", corrupted)).rejects.toThrow();

      expect(mockErrorsInc).toHaveBeenCalledWith({
        tenant_id: "tenant-d",
        operation: "decrypt",
        error_type: "decrypt_failure",
      });
    });
  });

  describe("decryptAuto", () => {
    it("should decrypt v2-format values using decryptForTenant path", async () => {
      const encrypted = await mod.encryptForTenant("tenant-auto", "my-secret");
      jest.clearAllMocks();

      const result = await mod.decryptAuto("tenant-auto", encrypted);

      expect(result).toBe("my-secret");
      // Should have started a decrypt timer (from decryptForTenant)
      expect(mockStartTimer).toHaveBeenCalledWith({
        tenant_id: "tenant-auto",
        operation: "decrypt",
      });
    });

    it("should fall back to legacy decryption for non-v2 values", async () => {
      const result = await mod.decryptAuto("any-tenant", "some:legacy:format");

      // decryptValue mock returns the value as-is
      expect(result).toBe("some:legacy:format");
    });

    it("should return plaintext as-is when not encrypted", async () => {
      const result = await mod.decryptAuto("any", "just-plaintext");

      expect(result).toBe("just-plaintext");
    });

    it("should throw when v2 value cannot be decrypted (no silent fallback)", async () => {
      // v2 values MUST decrypt with tenant key or fail loudly (security invariant).
      // Encrypt with one tenant, then try to decryptAuto with a different tenant.
      const encrypted = await mod.encryptForTenant("tenant-a", "secret-data");
      jest.clearAllMocks();

      // Should NOT fall back to legacy -- must throw
      await expect(mod.decryptAuto("wrong-tenant", encrypted)).rejects.toThrow();

      // Should increment error metrics via decryptForTenant
      expect(mockErrorsInc).toHaveBeenCalledWith({
        tenant_id: "wrong-tenant",
        operation: "decrypt",
        error_type: "decrypt_failure",
      });
    });

    it("should throw when v2 value has valid format but corrupted data", async () => {
      // Construct a v2 value with correct structure (4 parts, proper hex lengths)
      // but invalid encrypted content
      const fakeIv = crypto.randomBytes(12).toString("hex"); // 24 hex chars
      const fakeData = crypto.randomBytes(16).toString("hex"); // 32 hex chars
      const fakeTag = crypto.randomBytes(16).toString("hex"); // 32 hex chars
      const badV2 = `v2:${fakeIv}:${fakeData}:${fakeTag}`;

      jest.clearAllMocks();

      // v2 prefix means it MUST be decryptable -- corruption = hard failure
      await expect(mod.decryptAuto("any", badV2)).rejects.toThrow();
    });
  });
});

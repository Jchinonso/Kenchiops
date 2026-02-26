/**
 * Tests for encryption key rotation utilities.
 *
 * Covers:
 * - reEncryptValue: re-encrypts v2 values, returns null for non-v2
 * - createKeyRotationRunner: factory pattern, optional updateKeyVersion callback
 * - rotateTenantValues: batch processing, error counting, updateKeyVersion gating
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import crypto from "node:crypto";
import type { RequestContext } from "../core/types.js";
import type { UpdateKeyVersionFn } from "./tenantEncryptionTypes.js";

// ==================== Mocks ====================

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock("../core/logger.js", () => ({
  createLogger: jest.fn(() => mockLogger),
}));

// ==================== Fixtures ====================

// Generate two valid 32-byte (64 hex char) master keys
const OLD_KEY_HEX = crypto.randomBytes(32).toString("hex");
const NEW_KEY_HEX = crypto.randomBytes(32).toString("hex");

const testContext: RequestContext = {
  requestId: "test-req-rotation",
  tenantId: "system",
};

// ==================== Helpers ====================

/**
 * Encrypt a value using the same HKDF + AES-256-GCM logic as tenantEncryption.ts
 * to produce valid v2-format test data.
 */
const encryptTestValue = async (
  masterKeyHex: string,
  tenantId: string,
  plaintext: string
): Promise<string> => {
  const { promisify } = await import("node:util");
  const hkdf = promisify(crypto.hkdf);

  const masterKey = Buffer.from(masterKeyHex, "hex");
  const derived = Buffer.from(
    await hkdf("sha256", masterKey, tenantId, "kenchi-tenant-encryption", 32)
  );

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", derived, iv, {
    authTagLength: 16,
  });

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return ["v2", iv.toString("hex"), encrypted.toString("hex"), authTag.toString("hex")].join(":");
};

/**
 * Decrypt a v2-format value using the given master key (for verification).
 */
const decryptTestValue = async (
  masterKeyHex: string,
  tenantId: string,
  ciphertext: string
): Promise<string> => {
  const { promisify } = await import("node:util");
  const hkdf = promisify(crypto.hkdf);

  const parts = ciphertext.split(":");
  const masterKey = Buffer.from(masterKeyHex, "hex");
  const derived = Buffer.from(
    await hkdf("sha256", masterKey, tenantId, "kenchi-tenant-encryption", 32)
  );

  const iv = Buffer.from(parts[1], "hex");
  const encrypted = Buffer.from(parts[2], "hex");
  const authTag = Buffer.from(parts[3], "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", derived, iv, {
    authTagLength: 16,
  });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
};

// ==================== Import module under test ====================

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let keyRotation: typeof import("./keyRotation.js");

// ==================== Tests ====================

describe("security/keyRotation", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    keyRotation = await import("./keyRotation.js");
  });

  // ==================== reEncryptValue ====================

  describe("reEncryptValue", () => {
    it("should re-encrypt a v2 value from old key to new key", async () => {
      const tenantId = "tenant-re-1";
      const plaintext = "my-oauth-token";

      const oldEncrypted = await encryptTestValue(OLD_KEY_HEX, tenantId, plaintext);

      const reEncrypted = await keyRotation.reEncryptValue(
        oldEncrypted,
        tenantId,
        Buffer.from(OLD_KEY_HEX, "hex"),
        Buffer.from(NEW_KEY_HEX, "hex")
      );

      expect(reEncrypted).not.toBeNull();
      expect(reEncrypted).not.toBe(oldEncrypted);
      expect(reEncrypted!.startsWith("v2:")).toBe(true);

      // Verify the re-encrypted value decrypts correctly with the new key
      const decrypted = await decryptTestValue(NEW_KEY_HEX, tenantId, reEncrypted!);
      expect(decrypted).toBe(plaintext);
    });

    it("should return null for non-v2 format values", async () => {
      const result = await keyRotation.reEncryptValue(
        "plaintext-no-colons",
        "tenant-1",
        Buffer.from(OLD_KEY_HEX, "hex"),
        Buffer.from(NEW_KEY_HEX, "hex")
      );

      expect(result).toBeNull();
    });

    it("should return null for v1 format values (3 parts, no v2 prefix)", async () => {
      const v1Value = "aabb:ccdd:eeff";

      const result = await keyRotation.reEncryptValue(
        v1Value,
        "tenant-1",
        Buffer.from(OLD_KEY_HEX, "hex"),
        Buffer.from(NEW_KEY_HEX, "hex")
      );

      expect(result).toBeNull();
    });

    it("should return null for values with wrong part count", async () => {
      const wrongParts = "v2:aabb:ccdd"; // Only 3 parts

      const result = await keyRotation.reEncryptValue(
        wrongParts,
        "tenant-1",
        Buffer.from(OLD_KEY_HEX, "hex"),
        Buffer.from(NEW_KEY_HEX, "hex")
      );

      expect(result).toBeNull();
    });

    it("should throw when old key cannot decrypt the value", async () => {
      const tenantId = "tenant-bad";
      // Encrypt with NEW key but try to re-encrypt claiming OLD key was used
      const encrypted = await encryptTestValue(NEW_KEY_HEX, tenantId, "secret");

      await expect(
        keyRotation.reEncryptValue(
          encrypted,
          tenantId,
          Buffer.from(OLD_KEY_HEX, "hex"), // wrong old key
          Buffer.from(NEW_KEY_HEX, "hex")
        )
      ).rejects.toThrow();
    });

    it("should preserve original plaintext through re-encryption round trip", async () => {
      const tenantId = "tenant-roundtrip";
      const originalPlaintext = "complex value with special chars: !@#$%^&*()_+-=[]{};':\",./<>?";

      const oldEncrypted = await encryptTestValue(OLD_KEY_HEX, tenantId, originalPlaintext);
      const newEncrypted = await keyRotation.reEncryptValue(
        oldEncrypted,
        tenantId,
        Buffer.from(OLD_KEY_HEX, "hex"),
        Buffer.from(NEW_KEY_HEX, "hex")
      );

      const decrypted = await decryptTestValue(NEW_KEY_HEX, tenantId, newEncrypted!);
      expect(decrypted).toBe(originalPlaintext);
    });

    it("should produce different ciphertext on each call (random IV)", async () => {
      const tenantId = "tenant-iv";
      const plaintext = "determinism check";

      const oldEncrypted = await encryptTestValue(OLD_KEY_HEX, tenantId, plaintext);

      const result1 = await keyRotation.reEncryptValue(
        oldEncrypted,
        tenantId,
        Buffer.from(OLD_KEY_HEX, "hex"),
        Buffer.from(NEW_KEY_HEX, "hex")
      );

      // Re-encrypt the original again (not the result of the first re-encryption)
      const result2 = await keyRotation.reEncryptValue(
        oldEncrypted,
        tenantId,
        Buffer.from(OLD_KEY_HEX, "hex"),
        Buffer.from(NEW_KEY_HEX, "hex")
      );

      // Different IVs mean different ciphertext
      expect(result1).not.toBe(result2);

      // But both decrypt to the same plaintext
      const dec1 = await decryptTestValue(NEW_KEY_HEX, tenantId, result1!);
      const dec2 = await decryptTestValue(NEW_KEY_HEX, tenantId, result2!);
      expect(dec1).toBe(plaintext);
      expect(dec2).toBe(plaintext);
    });
  });

  // ==================== createKeyRotationRunner ====================

  describe("createKeyRotationRunner", () => {
    it("should return an object with rotateTenantValues method", () => {
      const runner = keyRotation.createKeyRotationRunner(OLD_KEY_HEX, NEW_KEY_HEX);

      expect(runner).toHaveProperty("rotateTenantValues");
      expect(typeof runner.rotateTenantValues).toBe("function");
    });

    it("should accept optional updateKeyVersion callback", () => {
      const mockUpdateKeyVersion = jest.fn<UpdateKeyVersionFn>();

      // Should not throw
      expect(() =>
        keyRotation.createKeyRotationRunner(OLD_KEY_HEX, NEW_KEY_HEX, mockUpdateKeyVersion)
      ).not.toThrow();
    });
  });

  // ==================== rotateTenantValues ====================

  describe("rotateTenantValues", () => {
    it("should re-encrypt all v2 values and return the rotated values", async () => {
      const tenantId = "tenant-rotate";
      const enc1 = await encryptTestValue(OLD_KEY_HEX, tenantId, "secret-1");
      const enc2 = await encryptTestValue(OLD_KEY_HEX, tenantId, "secret-2");

      const runner = keyRotation.createKeyRotationRunner(OLD_KEY_HEX, NEW_KEY_HEX);
      const result = await runner.rotateTenantValues(tenantId, [enc1, enc2], 2, testContext);

      expect(result.tenantId).toBe(tenantId);
      expect(result.valuesRotated).toBe(2);
      expect(result.errors).toBe(0);
      expect(result.rotatedValues).toHaveLength(2);

      // Verify rotated values decrypt with new key
      const dec1 = await decryptTestValue(NEW_KEY_HEX, tenantId, result.rotatedValues[0]);
      const dec2 = await decryptTestValue(NEW_KEY_HEX, tenantId, result.rotatedValues[1]);
      expect(dec1).toBe("secret-1");
      expect(dec2).toBe("secret-2");
    });

    it("should skip non-v2 values (not count as rotated)", async () => {
      const tenantId = "tenant-mixed";
      const v2Value = await encryptTestValue(OLD_KEY_HEX, tenantId, "encrypted");
      const plainValue = "not-encrypted";

      const runner = keyRotation.createKeyRotationRunner(OLD_KEY_HEX, NEW_KEY_HEX);
      const result = await runner.rotateTenantValues(
        tenantId,
        [v2Value, plainValue],
        2,
        testContext
      );

      expect(result.valuesRotated).toBe(1);
      expect(result.rotatedValues).toHaveLength(1);
      expect(result.errors).toBe(0);
    });

    it("should call updateKeyVersion when zero errors and callback provided", async () => {
      const tenantId = "tenant-version";
      const enc = await encryptTestValue(OLD_KEY_HEX, tenantId, "token");

      const mockUpdateKeyVersion = jest.fn<UpdateKeyVersionFn>().mockResolvedValue(undefined);

      const runner = keyRotation.createKeyRotationRunner(
        OLD_KEY_HEX,
        NEW_KEY_HEX,
        mockUpdateKeyVersion
      );
      await runner.rotateTenantValues(tenantId, [enc], 3, testContext);

      expect(mockUpdateKeyVersion).toHaveBeenCalledTimes(1);
      expect(mockUpdateKeyVersion).toHaveBeenCalledWith(tenantId, 3, testContext);
    });

    it("should log key version update when callback succeeds", async () => {
      const tenantId = "tenant-log-ver";
      const enc = await encryptTestValue(OLD_KEY_HEX, tenantId, "token");

      const mockUpdateKeyVersion = jest.fn<UpdateKeyVersionFn>().mockResolvedValue(undefined);

      const runner = keyRotation.createKeyRotationRunner(
        OLD_KEY_HEX,
        NEW_KEY_HEX,
        mockUpdateKeyVersion
      );
      await runner.rotateTenantValues(tenantId, [enc], 5, testContext);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Tenant encryption_key_version updated",
        expect.objectContaining({
          targetTenantId: tenantId,
          newKeyVersion: 5,
          requestId: "test-req-rotation",
        })
      );
    });

    it("should NOT call updateKeyVersion when there are errors", async () => {
      const tenantId = "tenant-errs";
      // Encrypt with NEW key so OLD key cannot decrypt it — will cause an error
      const badEnc = await encryptTestValue(NEW_KEY_HEX, tenantId, "cannot-decrypt");

      const mockUpdateKeyVersion = jest.fn<UpdateKeyVersionFn>().mockResolvedValue(undefined);

      const runner = keyRotation.createKeyRotationRunner(
        OLD_KEY_HEX,
        NEW_KEY_HEX,
        mockUpdateKeyVersion
      );
      const result = await runner.rotateTenantValues(tenantId, [badEnc], 2, testContext);

      expect(result.errors).toBe(1);
      expect(result.valuesRotated).toBe(0);
      expect(mockUpdateKeyVersion).not.toHaveBeenCalled();
    });

    it("should NOT call updateKeyVersion when callback is not provided", async () => {
      const tenantId = "tenant-no-cb";
      const enc = await encryptTestValue(OLD_KEY_HEX, tenantId, "token");

      const runner = keyRotation.createKeyRotationRunner(OLD_KEY_HEX, NEW_KEY_HEX);
      const result = await runner.rotateTenantValues(tenantId, [enc], 2, testContext);

      // No error, but no callback was provided
      expect(result.errors).toBe(0);
      expect(result.valuesRotated).toBe(1);

      // Should NOT have logged the key version update message
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        "Tenant encryption_key_version updated",
        expect.anything()
      );
    });

    it("should count errors per value and continue processing remaining values", async () => {
      const tenantId = "tenant-partial";
      // One good value, one bad value
      const goodEnc = await encryptTestValue(OLD_KEY_HEX, tenantId, "good-secret");
      const badEnc = await encryptTestValue(NEW_KEY_HEX, tenantId, "bad-will-fail");

      const runner = keyRotation.createKeyRotationRunner(OLD_KEY_HEX, NEW_KEY_HEX);
      const result = await runner.rotateTenantValues(tenantId, [goodEnc, badEnc], 2, testContext);

      expect(result.valuesRotated).toBe(1);
      expect(result.errors).toBe(1);
      expect(result.rotatedValues).toHaveLength(1);
    });

    it("should log errors with context for failed values", async () => {
      const tenantId = "tenant-log-err";
      const badEnc = await encryptTestValue(NEW_KEY_HEX, tenantId, "will-fail");

      const runner = keyRotation.createKeyRotationRunner(OLD_KEY_HEX, NEW_KEY_HEX);
      await runner.rotateTenantValues(tenantId, [badEnc], 2, testContext);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to rotate value for tenant",
        expect.objectContaining({
          targetTenantId: tenantId,
          requestId: "test-req-rotation",
        })
      );
    });

    it("should log completion summary for every rotation", async () => {
      const tenantId = "tenant-summary";

      const runner = keyRotation.createKeyRotationRunner(OLD_KEY_HEX, NEW_KEY_HEX);
      await runner.rotateTenantValues(tenantId, [], 1, testContext);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Tenant key rotation completed",
        expect.objectContaining({
          targetTenantId: tenantId,
          valuesRotated: 0,
          errors: 0,
          requestId: "test-req-rotation",
        })
      );
    });

    it("should handle empty value array gracefully", async () => {
      const runner = keyRotation.createKeyRotationRunner(OLD_KEY_HEX, NEW_KEY_HEX);
      const result = await runner.rotateTenantValues("tenant-empty", [], 1, testContext);

      expect(result.tenantId).toBe("tenant-empty");
      expect(result.valuesRotated).toBe(0);
      expect(result.errors).toBe(0);
      expect(result.rotatedValues).toEqual([]);
    });

    it("should include rotatedValues in the result", async () => {
      const tenantId = "tenant-rv";
      const enc1 = await encryptTestValue(OLD_KEY_HEX, tenantId, "val-1");
      const enc2 = await encryptTestValue(OLD_KEY_HEX, tenantId, "val-2");
      const enc3 = await encryptTestValue(OLD_KEY_HEX, tenantId, "val-3");

      const runner = keyRotation.createKeyRotationRunner(OLD_KEY_HEX, NEW_KEY_HEX);
      const result = await runner.rotateTenantValues(tenantId, [enc1, enc2, enc3], 2, testContext);

      expect(result.rotatedValues).toHaveLength(3);
      result.rotatedValues.forEach((v) => {
        expect(v.startsWith("v2:")).toBe(true);
        expect(v.split(":")).toHaveLength(4);
      });
    });

    it("should propagate context to updateKeyVersion callback", async () => {
      const tenantId = "tenant-ctx";
      const enc = await encryptTestValue(OLD_KEY_HEX, tenantId, "secret");

      const customContext: RequestContext = {
        requestId: "custom-req-id",
        tenantId: "admin-system",
      };

      const mockUpdateKeyVersion = jest.fn<UpdateKeyVersionFn>().mockResolvedValue(undefined);

      const runner = keyRotation.createKeyRotationRunner(
        OLD_KEY_HEX,
        NEW_KEY_HEX,
        mockUpdateKeyVersion
      );
      await runner.rotateTenantValues(tenantId, [enc], 7, customContext);

      expect(mockUpdateKeyVersion).toHaveBeenCalledWith(tenantId, 7, customContext);
    });
  });
});

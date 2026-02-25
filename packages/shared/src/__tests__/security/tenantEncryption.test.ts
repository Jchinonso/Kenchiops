import { describe, it, expect, beforeEach, jest } from "@jest/globals";

/**
 * Tests for per-tenant HKDF envelope encryption.
 *
 * These tests set ENCRYPTION_KEY in the environment before importing
 * the module, since the key is cached on first use.
 */

// eslint-disable-next-line no-restricted-syntax -- test setup requires direct env access
const VALID_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("Per-Tenant Encryption (HKDF)", () => {
  // Use dynamic imports to control env setup per test.
  // We need a fresh module for each test to avoid cached key issues.

  beforeEach(() => {
    jest.resetModules();
    // eslint-disable-next-line no-restricted-syntax -- test setup requires direct env access
    process.env.ENCRYPTION_KEY = VALID_KEY;
    // eslint-disable-next-line no-restricted-syntax -- test setup requires direct env access
    process.env.NODE_ENV = "test";
  });

  it("should produce different ciphertext for the same plaintext with different tenants", async () => {
    const { encryptForTenant } = await import("../../security/tenantEncryption.js");

    const plaintext = "super-secret-oauth-token-12345";
    const cipherA = await encryptForTenant("tenant-alpha", plaintext);
    const cipherB = await encryptForTenant("tenant-beta", plaintext);

    // Both should be v2 format
    expect(cipherA.startsWith("v2:")).toBe(true);
    expect(cipherB.startsWith("v2:")).toBe(true);

    // Different tenants must produce different ciphertext (different derived keys + different IVs)
    expect(cipherA).not.toBe(cipherB);
  });

  it("should round-trip: encryptForTenant then decryptForTenant returns original", async () => {
    const { encryptForTenant, decryptForTenant } =
      await import("../../security/tenantEncryption.js");

    const tenantId = "tenant-roundtrip";
    const plaintext = "my-secret-value-with-special-chars: !@#$%^&*()";

    const encrypted = await encryptForTenant(tenantId, plaintext);
    const decrypted = await decryptForTenant(tenantId, encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it("should fail to decrypt with a different tenant's key", async () => {
    const { encryptForTenant, decryptForTenant } =
      await import("../../security/tenantEncryption.js");

    const plaintext = "tenant-a-secret";
    const encrypted = await encryptForTenant("tenant-a", plaintext);

    // Decrypting with a different tenant should throw (wrong key)
    await expect(decryptForTenant("tenant-b", encrypted)).rejects.toThrow();
  });

  it("should produce v2: prefixed output", async () => {
    const { encryptForTenant } = await import("../../security/tenantEncryption.js");

    const encrypted = await encryptForTenant("test-tenant", "hello");

    expect(encrypted.startsWith("v2:")).toBe(true);
    // v2:iv:ciphertext:authTag = 4 parts
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v2");
  });

  it("should derive different keys for different tenants", async () => {
    const { deriveTenantKey } = await import("../../security/tenantEncryption.js");

    const masterKey = Buffer.from(VALID_KEY, "hex");
    const keyA = await deriveTenantKey(masterKey, "tenant-a");
    const keyB = await deriveTenantKey(masterKey, "tenant-b");

    expect(keyA).not.toEqual(keyB);
    expect(keyA).toHaveLength(32);
    expect(keyB).toHaveLength(32);
  });

  it("should derive deterministic keys for the same tenant", async () => {
    const { deriveTenantKey } = await import("../../security/tenantEncryption.js");

    const masterKey = Buffer.from(VALID_KEY, "hex");
    const key1 = await deriveTenantKey(masterKey, "tenant-stable");
    const key2 = await deriveTenantKey(masterKey, "tenant-stable");

    expect(key1).toEqual(key2);
  });

  describe("decryptAuto", () => {
    it("should decrypt v2 format using per-tenant key", async () => {
      const { encryptForTenant, decryptAuto } = await import("../../security/tenantEncryption.js");

      const tenantId = "tenant-auto";
      const plaintext = "auto-detect-this";
      const encrypted = await encryptForTenant(tenantId, plaintext);

      const result = await decryptAuto(tenantId, encrypted);
      expect(result).toBe(plaintext);
    });

    it("should fall back to legacy decryption for non-v2 format", async () => {
      const { encryptValue } = await import("../../security/encryption.js");
      const { decryptAuto } = await import("../../security/tenantEncryption.js");

      const plaintext = "legacy-encrypted-value";
      const legacyEncrypted = encryptValue(plaintext);

      // legacyEncrypted is in iv:ciphertext:authTag format (3 parts, no v2 prefix)
      expect(legacyEncrypted).toBeDefined();
      expect(typeof legacyEncrypted).toBe("string");
      expect((legacyEncrypted as string).startsWith("v2:")).toBe(false);

      const result = await decryptAuto("any-tenant", legacyEncrypted as string);
      expect(result).toBe(plaintext);
    });

    it("should return plaintext as-is when value is not encrypted", async () => {
      const { decryptAuto } = await import("../../security/tenantEncryption.js");

      const plaintext = "just-a-plain-string";
      const result = await decryptAuto("any-tenant", plaintext);
      expect(result).toBe(plaintext);
    });
  });
});

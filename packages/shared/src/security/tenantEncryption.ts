/**
 * Per-Tenant Encryption (HKDF Envelope Encryption)
 *
 * Derives a unique AES-256-GCM key per tenant using HKDF-SHA256.
 * The master key comes from ENCRYPTION_KEY (same as legacy encryption.ts).
 *
 * Ciphertext format: `v2:<hex(iv)>:<hex(ciphertext)>:<hex(authTag)>`
 *
 * Backward compatibility: `decryptAuto()` detects the format prefix
 * and routes to per-tenant (v2) or legacy (v1) decryption accordingly.
 *
 * @module security/tenantEncryption
 */

import crypto from "node:crypto";
import { promisify } from "node:util";
import { config } from "../core/config.js";
import { createLogger } from "../core/logger.js";
import { invariant } from "../core/errors.js";
import { decryptValue } from "./encryption.js";
import {
  encryptionOpsTotal,
  encryptionOpDuration,
  encryptionErrorsTotal,
} from "../observability/metrics.js";
import { TENANT_CRYPTO, type EncryptedPayload } from "./tenantEncryptionTypes.js";

const {
  ALGORITHM,
  IV_BYTE_LENGTH,
  AUTH_TAG_BYTE_LENGTH,
  DERIVED_KEY_LENGTH,
  HKDF_DIGEST,
  HKDF_INFO,
  V2_PREFIX,
  V2_PART_COUNT,
} = TENANT_CRYPTO;
const KEY_HEX_LENGTH = 64;

const hkdf = promisify(crypto.hkdf);

const logger = createLogger("tenant-encryption");

// let: cached master key buffer — computed once on first use, reused thereafter
let cachedMasterKey: Buffer | null = null;
// let: tracks whether warning was already emitted to avoid log spam
let warnedMissingKey = false;

/**
 * Get the master key buffer from config. Returns null in dev if not configured.
 * Fails fast in production.
 */
const getMasterKey = (): Buffer | null => {
  if (cachedMasterKey) {
    return cachedMasterKey;
  }

  const rawKey = config.ENCRYPTION_KEY;
  if (!rawKey) {
    invariant(
      config.NODE_ENV !== "production",
      "ENCRYPTION_KEY must be configured in production (64 hex characters / 32 bytes)"
    );
    if (!warnedMissingKey) {
      logger.warn("ENCRYPTION_KEY not configured — tenant encryption disabled (dev only)");
      warnedMissingKey = true;
    }
    return null;
  }

  if (rawKey.length !== KEY_HEX_LENGTH) {
    logger.warn(
      "ENCRYPTION_KEY must be 64 hex characters (32 bytes) — tenant encryption disabled",
      {
        actualLength: rawKey.length,
      }
    );
    return null;
  }

  cachedMasterKey = Buffer.from(rawKey, "hex");
  return cachedMasterKey;
};

/**
 * Derive a tenant-specific 32-byte key using HKDF-SHA256.
 *
 * @param masterKey - The 32-byte master key
 * @param tenantId - Used as the HKDF salt (ensures unique key per tenant)
 * @returns 32-byte derived key for the tenant
 */
export const deriveTenantKey = async (masterKey: Buffer, tenantId: string): Promise<Buffer> => {
  const derived = await hkdf(HKDF_DIGEST, masterKey, tenantId, HKDF_INFO, DERIVED_KEY_LENGTH);
  return Buffer.from(derived);
};

/**
 * Encrypt a plaintext string for a specific tenant using AES-256-GCM
 * with an HKDF-derived key.
 *
 * Returns the ciphertext in `v2:iv:ciphertext:authTag` hex format.
 * If ENCRYPTION_KEY is not configured, returns the plaintext unchanged.
 *
 * @param tenantId - The tenant whose derived key to use
 * @param plaintext - The value to encrypt
 * @returns Encrypted string in v2 format, or plaintext if encryption is disabled
 */
export const encryptForTenant = async (tenantId: string, plaintext: string): Promise<string> => {
  const masterKey = getMasterKey();
  if (!masterKey) {
    return plaintext;
  }

  const end = encryptionOpDuration.startTimer({ tenant_id: tenantId, operation: "encrypt" });
  try {
    const tenantKey = await deriveTenantKey(masterKey, tenantId);

    const iv = crypto.randomBytes(IV_BYTE_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, tenantKey, iv, {
      authTagLength: AUTH_TAG_BYTE_LENGTH,
    });

    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const payload: EncryptedPayload = {
      version: V2_PREFIX,
      iv: iv.toString("hex"),
      ciphertext: encrypted.toString("hex"),
      authTag: authTag.toString("hex"),
    };

    encryptionOpsTotal.inc({ tenant_id: tenantId, operation: "encrypt", key_version: "2" });
    return [payload.version, payload.iv, payload.ciphertext, payload.authTag].join(":");
  } catch (error) {
    encryptionErrorsTotal.inc({
      tenant_id: tenantId,
      operation: "encrypt",
      error_type: "encrypt_failure",
    });
    throw error;
  } finally {
    end();
  }
};

/**
 * Decrypt a v2-format ciphertext string for a specific tenant.
 *
 * Expects the format `v2:iv:ciphertext:authTag` (all hex-encoded).
 * If ENCRYPTION_KEY is not configured, returns the value unchanged.
 *
 * @param tenantId - The tenant whose derived key to use
 * @param ciphertext - The v2-format encrypted string
 * @returns Decrypted plaintext
 */
export const decryptForTenant = async (tenantId: string, ciphertext: string): Promise<string> => {
  const masterKey = getMasterKey();
  if (!masterKey) {
    return ciphertext;
  }

  const parts = ciphertext.split(":");
  if (parts.length !== V2_PART_COUNT || parts[0] !== V2_PREFIX) {
    return ciphertext;
  }

  const end = encryptionOpDuration.startTimer({ tenant_id: tenantId, operation: "decrypt" });
  try {
    const tenantKey = await deriveTenantKey(masterKey, tenantId);

    const iv = Buffer.from(parts[1], "hex");
    const encrypted = Buffer.from(parts[2], "hex");
    const authTag = Buffer.from(parts[3], "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, tenantKey, iv, {
      authTagLength: AUTH_TAG_BYTE_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const result = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    encryptionOpsTotal.inc({ tenant_id: tenantId, operation: "decrypt", key_version: "2" });
    return result;
  } catch (error) {
    encryptionErrorsTotal.inc({
      tenant_id: tenantId,
      operation: "decrypt",
      error_type: "decrypt_failure",
    });
    throw error;
  } finally {
    end();
  }
};

/**
 * Auto-detect encryption format and decrypt accordingly.
 *
 * - Values starting with `v2:` are decrypted with the tenant-specific derived key
 * - Values in `iv:ciphertext:authTag` format (3 parts) fall back to legacy global key
 * - Other values are returned as-is (plaintext or unrecognized format)
 *
 * @param tenantId - The tenant context for v2 decryption
 * @param value - The encrypted (or plaintext) value
 * @returns Decrypted plaintext
 */
export const decryptAuto = async (tenantId: string, value: string): Promise<string> => {
  // SECURITY: v2-prefixed values MUST decrypt with the tenant key or fail loudly.
  // A v2 value cannot be valid legacy ciphertext — silent fallback would mask
  // cross-tenant decryption attempts and return raw ciphertext as if it were plaintext.
  if (value.startsWith(`${V2_PREFIX}:`)) {
    return decryptForTenant(tenantId, value);
  }

  // Fall back to legacy global-key decryption for non-v2 values
  const legacyResult = decryptValue(value);
  return legacyResult ?? value;
};

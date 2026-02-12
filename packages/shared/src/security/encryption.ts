/**
 * Application-Level Encryption
 *
 * AES-256-GCM encryption for sensitive data at rest (e.g., OAuth tokens).
 * Uses ENCRYPTION_KEY env var (via config). When no key is configured,
 * encrypt/decrypt are no-ops for graceful degradation in dev environments.
 *
 * Ciphertext format: `<hex(iv)>:<hex(ciphertext)>:<hex(authTag)>`
 *
 * @module security/encryption
 */

import crypto from "node:crypto";
import { config } from "../core/config.js";
import { createLogger } from "../core/logger.js";

const ALGORITHM = "aes-256-gcm";
const IV_BYTE_LENGTH = 12;
const AUTH_TAG_BYTE_LENGTH = 16;
const KEY_HEX_LENGTH = 64;
const CIPHERTEXT_PART_COUNT = 3;

const logger = createLogger("encryption");

// let: cached derived key — computed once on first use, reused thereafter
let cachedKey: Buffer | null = null;
// let: tracks whether warning was already emitted to avoid log spam
let warnedMissingKey = false;

/**
 * Derive the 32-byte key from the hex-encoded ENCRYPTION_KEY config value.
 * Returns null if no key is configured (graceful degradation).
 */
const getEncryptionKey = (): Buffer | null => {
  if (cachedKey) {
    return cachedKey;
  }

  const rawKey = config.ENCRYPTION_KEY;
  if (!rawKey) {
    if (!warnedMissingKey) {
      logger.warn("ENCRYPTION_KEY not configured — OAuth tokens stored in plaintext");
      warnedMissingKey = true;
    }
    return null;
  }

  if (rawKey.length !== KEY_HEX_LENGTH) {
    logger.warn("ENCRYPTION_KEY must be 64 hex characters (32 bytes) — encryption disabled", {
      actualLength: rawKey.length,
    });
    return null;
  }

  cachedKey = Buffer.from(rawKey, "hex");
  return cachedKey;
};

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns the ciphertext in `iv:ciphertext:authTag` hex format.
 * If ENCRYPTION_KEY is not configured or value is null/undefined, returns the value unchanged.
 */
export const encryptValue = (plaintext: string | null | undefined): string | null | undefined => {
  if (plaintext === null || plaintext === undefined) {
    return plaintext;
  }

  const key = getEncryptionKey();
  if (!key) {
    return plaintext;
  }

  const iv = crypto.randomBytes(IV_BYTE_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_BYTE_LENGTH,
  });

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${encrypted.toString("hex")}:${authTag.toString("hex")}`;
};

/**
 * Decrypt a ciphertext string produced by encryptValue.
 * If ENCRYPTION_KEY is not configured, value is null/undefined,
 * or value does not look like ciphertext (no colons), returns the value unchanged.
 */
export const decryptValue = (ciphertext: string | null | undefined): string | null | undefined => {
  if (ciphertext === null || ciphertext === undefined) {
    return ciphertext;
  }

  const key = getEncryptionKey();
  if (!key) {
    return ciphertext;
  }

  // If the value doesn't look like our ciphertext format, return as-is
  // (handles migration from plaintext to encrypted)
  const parts = ciphertext.split(":");
  if (parts.length !== CIPHERTEXT_PART_COUNT) {
    return ciphertext;
  }

  try {
    const iv = Buffer.from(parts[0], "hex");
    const encrypted = Buffer.from(parts[1], "hex");
    const authTag = Buffer.from(parts[2], "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_BYTE_LENGTH,
    });
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    // If decryption fails, the value is likely plaintext (pre-encryption migration)
    logger.warn("Failed to decrypt value — returning as-is (possibly plaintext)");
    return ciphertext;
  }
};

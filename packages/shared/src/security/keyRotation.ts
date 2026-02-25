/**
 * Encryption Key Rotation Utilities
 *
 * Supports rotating the master encryption key by re-encrypting
 * tenant data from the old key to the new key.
 *
 * Uses the encryption_key_version column on tenants (migration 033)
 * to track which key version a tenant's data is encrypted with.
 *
 * @module security/keyRotation
 */

import crypto from "node:crypto";
import { promisify } from "node:util";
import { createLogger } from "../core/logger.js";
import type { RequestContext } from "../core/types.js";

const ALGORITHM = "aes-256-gcm";
const IV_BYTE_LENGTH = 12;
const AUTH_TAG_BYTE_LENGTH = 16;
const DERIVED_KEY_LENGTH = 32;
const HKDF_DIGEST = "sha256";
const HKDF_INFO = "kenchi-tenant-encryption";
const V2_PREFIX = "v2";
const V2_PART_COUNT = 4;

const hkdf = promisify(crypto.hkdf);

// ==================== Types ====================

export interface RotationResult {
  readonly tenantId: string;
  readonly valuesRotated: number;
  readonly rotatedValues: readonly string[];
  readonly errors: number;
}

export interface RotationSummary {
  readonly tenantsProcessed: number;
  readonly totalValuesRotated: number;
  readonly totalErrors: number;
  readonly results: readonly RotationResult[];
}

/**
 * Callback to update the encryption_key_version column for a tenant
 * after all values have been successfully re-encrypted.
 */
export type UpdateKeyVersionFn = (
  tenantId: string,
  newVersion: number,
  context: RequestContext
) => Promise<void>;

// ==================== Key Rotation ====================

/**
 * Re-encrypt a single v2-format value from oldKey to newKey.
 *
 * Returns the re-encrypted value, or null if the value is not v2 format.
 */
export const reEncryptValue = async (
  value: string,
  tenantId: string,
  oldMasterKey: Buffer,
  newMasterKey: Buffer
): Promise<string | null> => {
  const parts = value.split(":");
  if (parts.length !== V2_PART_COUNT || parts[0] !== V2_PREFIX) {
    return null;
  }

  // Decrypt with old key
  const oldDerivedKey = Buffer.from(
    await hkdf(HKDF_DIGEST, oldMasterKey, tenantId, HKDF_INFO, DERIVED_KEY_LENGTH)
  );

  const iv = Buffer.from(parts[1], "hex");
  const encrypted = Buffer.from(parts[2], "hex");
  const authTag = Buffer.from(parts[3], "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, oldDerivedKey, iv, {
    authTagLength: AUTH_TAG_BYTE_LENGTH,
  });
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");

  // Re-encrypt with new key
  const newDerivedKey = Buffer.from(
    await hkdf(HKDF_DIGEST, newMasterKey, tenantId, HKDF_INFO, DERIVED_KEY_LENGTH)
  );

  const newIv = crypto.randomBytes(IV_BYTE_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, newDerivedKey, newIv, {
    authTagLength: AUTH_TAG_BYTE_LENGTH,
  });

  const newEncrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const newAuthTag = cipher.getAuthTag();

  return [
    V2_PREFIX,
    newIv.toString("hex"),
    newEncrypted.toString("hex"),
    newAuthTag.toString("hex"),
  ].join(":");
};

/**
 * Create a key rotation runner that processes tenant data in batches.
 *
 * @param oldMasterKeyHex - Current master key (hex-encoded)
 * @param newMasterKeyHex - New master key (hex-encoded)
 * @param updateKeyVersion - Callback to persist the new key version to the database
 *
 * Usage:
 * ```typescript
 * const runner = createKeyRotationRunner(oldKeyHex, newKeyHex, updateKeyVersionFn);
 * const result = await runner.rotateTenantValues("tenant-123", encryptedValues, 2, context);
 * // result.rotatedValues contains the re-encrypted values for persistence
 * ```
 */
export const createKeyRotationRunner = (
  oldMasterKeyHex: string,
  newMasterKeyHex: string,
  updateKeyVersion?: UpdateKeyVersionFn
): {
  readonly rotateTenantValues: (
    tenantId: string,
    encryptedValues: readonly string[],
    newKeyVersion: number,
    context: RequestContext
  ) => Promise<RotationResult>;
} => {
  const logger = createLogger("key-rotation");
  const oldKey = Buffer.from(oldMasterKeyHex, "hex");
  const newKey = Buffer.from(newMasterKeyHex, "hex");

  const rotateTenantValues = async (
    tenantId: string,
    encryptedValues: readonly string[],
    newKeyVersion: number,
    context: RequestContext
  ): Promise<RotationResult> => {
    // let: accumulator for rotation stats during iteration
    let valuesRotated = 0; // let: incremented per successful re-encryption
    // let: accumulator for error count during iteration
    let errors = 0; // let: incremented per failed re-encryption
    const rotatedValues: string[] = [];

    for (const value of encryptedValues) {
      try {
        const rotated = await reEncryptValue(value, tenantId, oldKey, newKey);
        if (rotated) {
          valuesRotated += 1;
          rotatedValues.push(rotated);
        }
      } catch (error) {
        errors += 1;
        logger.error("Failed to rotate value for tenant", {
          ...context,
          targetTenantId: tenantId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Update key version if all values rotated successfully and callback provided
    if (errors === 0 && updateKeyVersion) {
      await updateKeyVersion(tenantId, newKeyVersion, context);
      logger.info("Tenant encryption_key_version updated", {
        ...context,
        targetTenantId: tenantId,
        newKeyVersion,
      });
    }

    logger.info("Tenant key rotation completed", {
      ...context,
      targetTenantId: tenantId,
      valuesRotated,
      errors,
    });

    return { tenantId, valuesRotated, rotatedValues, errors };
  };

  return { rotateTenantValues };
};

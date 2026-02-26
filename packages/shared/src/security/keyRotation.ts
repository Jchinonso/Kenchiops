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
import { createLogger } from "../core/logger.js";
import type { RequestContext } from "../core/types.js";
import { deriveTenantKey } from "./tenantEncryption.js";
import {
  TENANT_CRYPTO,
  type RotationResult,
  type UpdateKeyVersionFn,
} from "./tenantEncryptionTypes.js";

const { ALGORITHM, IV_BYTE_LENGTH, AUTH_TAG_BYTE_LENGTH, V2_PREFIX, V2_PART_COUNT } = TENANT_CRYPTO;

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
  const oldDerivedKey = await deriveTenantKey(oldMasterKey, tenantId);

  const iv = Buffer.from(parts[1], "hex");
  const encrypted = Buffer.from(parts[2], "hex");
  const authTag = Buffer.from(parts[3], "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, oldDerivedKey, iv, {
    authTagLength: AUTH_TAG_BYTE_LENGTH,
  });
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");

  // Re-encrypt with new key
  const newDerivedKey = await deriveTenantKey(newMasterKey, tenantId);

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
    // Sequential crypto operations — for...of required for await + error accumulation
    // Accumulate results immutably via spread
    // let: accumulator state for sequential async iteration with error counting
    let acc: { readonly rotated: readonly string[]; readonly errors: number } = {
      rotated: [],
      errors: 0,
    };

    for (const value of encryptedValues) {
      try {
        const result = await reEncryptValue(value, tenantId, oldKey, newKey);
        if (result) {
          acc = { ...acc, rotated: [...acc.rotated, result] };
        }
      } catch (error) {
        acc = { ...acc, errors: acc.errors + 1 };
        logger.error("Failed to rotate value for tenant", {
          ...context,
          targetTenantId: tenantId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const { rotated: rotatedValues, errors } = acc;
    const valuesRotated = rotatedValues.length;

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

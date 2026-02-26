/**
 * Tenant Encryption Types & Constants
 *
 * Types for per-tenant HKDF-derived envelope encryption.
 * Each tenant gets a unique derived key from the master ENCRYPTION_KEY.
 *
 * Shared crypto constants used by both tenantEncryption and keyRotation modules.
 *
 * @module security/tenantEncryptionTypes
 */

import type { RequestContext } from "../core/types.js";

// ==================== Shared Crypto Constants ====================

export const TENANT_CRYPTO = {
  ALGORITHM: "aes-256-gcm",
  IV_BYTE_LENGTH: 12,
  AUTH_TAG_BYTE_LENGTH: 16,
  DERIVED_KEY_LENGTH: 32,
  HKDF_DIGEST: "sha256",
  HKDF_INFO: "kenchi-tenant-encryption",
  V2_PREFIX: "v2",
  V2_PART_COUNT: 4,
} as const;

// ==================== Encryption Types ====================

export interface TenantEncryptionConfig {
  readonly masterKey: Buffer;
  readonly info: string;
}

export interface EncryptedPayload {
  readonly version: "v2";
  readonly iv: string;
  readonly ciphertext: string;
  readonly authTag: string;
}

// ==================== Key Rotation Types ====================

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

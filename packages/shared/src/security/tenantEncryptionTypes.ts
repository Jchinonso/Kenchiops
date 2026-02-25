/**
 * Tenant Encryption Types
 *
 * Types for per-tenant HKDF-derived envelope encryption.
 * Each tenant gets a unique derived key from the master ENCRYPTION_KEY.
 *
 * @module security/tenantEncryptionTypes
 */

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

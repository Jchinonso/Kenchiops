/**
 * KMS Port Interface
 *
 * Abstraction for Key Management Service operations.
 * Pluggable for AWS KMS, GCP Cloud KMS, or local HKDF derivation.
 *
 * Current implementation uses HKDF (tenantEncryption.ts).
 * This port enables future migration to cloud-hosted KMS
 * for hardware-backed key isolation.
 *
 * @module security/kmsPort
 */

// ==================== Types ====================

export interface KmsKeyMetadata {
  readonly keyId: string;
  readonly algorithm: string;
  readonly createdAt: Date;
  readonly rotatedAt: Date | null;
  readonly version: number;
}

export interface WrapKeyResult {
  readonly encryptedDek: Buffer;
  readonly keyId: string;
  readonly keyVersion: number;
}

export interface UnwrapKeyResult {
  readonly dek: Buffer;
  readonly keyId: string;
}

/**
 * Port interface for Key Management Service operations.
 *
 * Adapters implement this for specific providers:
 * - LocalKmsAdapter: HKDF derivation (current default)
 * - AwsKmsAdapter: AWS KMS envelope encryption
 * - GcpKmsAdapter: GCP Cloud KMS envelope encryption
 */
export interface KmsPort {
  /** Generate or derive a data encryption key for a tenant. */
  readonly generateDek: (tenantId: string) => Promise<Buffer>;

  /** Wrap (encrypt) a DEK using the master key. */
  readonly wrapKey: (dek: Buffer, tenantId: string) => Promise<WrapKeyResult>;

  /** Unwrap (decrypt) a previously wrapped DEK. */
  readonly unwrapKey: (encryptedDek: Buffer, keyId: string) => Promise<UnwrapKeyResult>;

  /** Get metadata about the current master key. */
  readonly getKeyMetadata: () => Promise<KmsKeyMetadata>;

  /** Check if the KMS provider is available and configured. */
  readonly isAvailable: () => Promise<boolean>;
}

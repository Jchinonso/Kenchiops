/**
 * Fingerprint Utilities
 *
 * Shared constants and helper for generating deterministic fingerprints
 * and delivery IDs across all alert source adapters.
 */

import crypto from "crypto";

/** Hash algorithm for fingerprint and delivery ID generation */
export const FINGERPRINT_ALGORITHM = "sha256";

/** Separator between fingerprint components */
export const FINGERPRINT_SEPARATOR = "|";

/** Hex substring length for generated hashes */
export const FINGERPRINT_HASH_LENGTH = 40;

/**
 * Computes a deterministic hash from an ordered list of string components.
 * Used by adapters to generate fingerprints and synthetic delivery IDs.
 *
 * @param components - Ordered fields to hash (joined by FINGERPRINT_SEPARATOR)
 * @returns Hex-encoded hash substring of FINGERPRINT_HASH_LENGTH characters
 */
export const computeHash = (components: readonly string[]): string =>
  crypto
    .createHash(FINGERPRINT_ALGORITHM)
    .update(components.join(FINGERPRINT_SEPARATOR))
    .digest("hex")
    .substring(0, FINGERPRINT_HASH_LENGTH);

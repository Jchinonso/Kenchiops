/**
 * Artifact Signature Module
 *
 * Computes deterministic signatures for artifact deduplication.
 * Uses SHA hashing with fallback for cross-platform consistency.
 *
 * @module formatting/artifactSignature
 */

import {
  CHUNKING_AGGREGATION_DEFAULTS,
  HEX_RADIX,
  HEX_BYTE_WIDTH,
  PARSE_INT_RADIX,
} from "../constants/index.js";
import type { ExtractedArtifact, ArtifactSignature } from "./chunkingTypes.js";

// ==================== Hashing ====================

/**
 * Computes a simple deterministic hash using reduce.
 * Used as fallback when crypto.subtle is unavailable.
 */
const computeSimpleHash = (input: string): number =>
  input.split("").reduce((hash, char) => {
    const charCode = char.charCodeAt(0);
    // eslint-disable-next-line no-bitwise -- Bitwise operations required for hash computation
    return ((hash << CHUNKING_AGGREGATION_DEFAULTS.HASH_SHIFT_BITS) - hash + charCode) | 0;
  }, 0);

/**
 * Computes a SHA hash of the given string.
 * Uses Web Crypto API for consistent cross-platform hashing.
 *
 * @param input - String to hash
 * @returns Truncated hex-encoded hash (length from SIGNATURE_HASH_LENGTH)
 */
const computeHash = async (input: string): Promise<string> => {
  // In Node.js environment
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest(
      CHUNKING_AGGREGATION_DEFAULTS.HASH_ALGORITHM,
      data
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((byte) => byte.toString(HEX_RADIX).padStart(HEX_BYTE_WIDTH, "0"))
      .join("");
    return hashHex.slice(0, CHUNKING_AGGREGATION_DEFAULTS.SIGNATURE_HASH_LENGTH);
  }

  // Fallback for environments without crypto.subtle
  const hash = computeSimpleHash(input);
  const positiveHash = Math.abs(hash);
  return positiveHash
    .toString(HEX_RADIX)
    .padStart(CHUNKING_AGGREGATION_DEFAULTS.SIGNATURE_HASH_LENGTH, "0");
};

// ==================== Signature Components ====================

/**
 * Builds signature components from an artifact.
 * Includes assertion_hash for high-confidence artifacts to prevent over-merging.
 */
const buildSignatureComponents = (
  artifact: ExtractedArtifact
): ArtifactSignature["components"] => ({
  type: artifact.type,
  filePath: artifact.filePath?.toLowerCase(),
  lineNumber: artifact.lineNumber,
  errorCode: artifact.errorCode,
  testName: artifact.testName?.toLowerCase(),
  // Include assertion_hash only for high-confidence artifacts (discriminator)
  assertionHash: artifact.confidence === "high" ? artifact.assertion_hash : undefined,
});

/**
 * Builds deterministic string representation from components.
 */
const buildSignatureString = (components: ArtifactSignature["components"]): string =>
  [
    `type:${components.type}`,
    components.filePath ? `file:${components.filePath}` : "",
    components.lineNumber === undefined ? "" : `line:${components.lineNumber}`,
    components.errorCode ? `code:${components.errorCode}` : "",
    components.testName ? `test:${components.testName}` : "",
    // Include assertion_hash in signature string when present (high-confidence discriminator)
    components.assertionHash ? `assert:${components.assertionHash}` : "",
  ]
    .filter((part) => part.length > 0)
    .join("|");

// ==================== Public API ====================

/**
 * Computes a signature for an artifact for deduplication.
 * Hashes: type, file_path (lowercased), line_number, error_code, test_name (lowercased)
 * Does NOT include snippet or error_message (too variable).
 *
 * @param artifact - Artifact to compute signature for
 * @returns Promise resolving to artifact signature
 */
export const computeArtifactSignature = async (
  artifact: ExtractedArtifact
): Promise<ArtifactSignature> => {
  const components = buildSignatureComponents(artifact);
  const signatureString = buildSignatureString(components);
  const hash = await computeHash(signatureString);

  return { hash, components };
};

/**
 * Synchronous version of signature computation for deterministic ordering.
 * Uses a simple hash function that's fast and deterministic.
 *
 * @param artifact - Artifact to compute signature for
 * @returns Artifact signature
 */
export const computeArtifactSignatureSync = (artifact: ExtractedArtifact): ArtifactSignature => {
  const components = buildSignatureComponents(artifact);
  const signatureString = buildSignatureString(components);

  const hash = computeSimpleHash(signatureString);
  const hashHex = Math.abs(hash)
    .toString(HEX_RADIX)
    .padStart(CHUNKING_AGGREGATION_DEFAULTS.SIGNATURE_HASH_LENGTH, "0")
    .slice(0, CHUNKING_AGGREGATION_DEFAULTS.SIGNATURE_HASH_LENGTH);

  return { hash: hashHex, components };
};

// ==================== Evidence ID Computation ====================

/**
 * Pattern for parsing evidence IDs with named capture groups.
 * Format: "chunk#<id>:L<start>-L<end>"
 */
const EVIDENCE_ID_PATTERN = /chunk#(?<chunkId>\d+):L(?<startLine>\d+)-L(?<endLine>\d+)/;

/**
 * Parsed evidence ID components.
 */
interface ParsedEvidenceId {
  readonly chunkId: string;
  readonly startLine: number;
  readonly endLine: number;
}

/**
 * Parses an evidence ID string into its components.
 *
 * @param evidenceId - Evidence ID to parse
 * @returns Parsed components or undefined if invalid
 */
const parseEvidenceId = (evidenceId: string): ParsedEvidenceId | undefined => {
  const match = evidenceId.match(EVIDENCE_ID_PATTERN);

  if (!match?.groups) {
    return undefined;
  }

  const { chunkId, startLine, endLine } = match.groups;

  return {
    chunkId,
    startLine: parseInt(startLine, PARSE_INT_RADIX),
    endLine: parseInt(endLine, PARSE_INT_RADIX),
  };
};

/**
 * Computes absolute line numbers from chunk-relative line numbers.
 *
 * @param artifact - Artifact with chunk-relative line numbers
 * @param chunkLineOffset - Line offset of the chunk in original log
 * @returns Absolute evidence ID
 */
export const computeAbsoluteEvidenceId = (
  artifact: ExtractedArtifact,
  chunkLineOffset: number
): string => {
  const parsed = parseEvidenceId(artifact.evidenceId);

  // Return original if parsing fails
  if (!parsed) {
    return artifact.evidenceId;
  }

  const absoluteStart = chunkLineOffset + parsed.startLine - 1;
  const absoluteEnd = chunkLineOffset + parsed.endLine - 1;

  return `chunk#${parsed.chunkId}:L${absoluteStart}-L${absoluteEnd}`;
};

/**
 * Artifact Signature
 *
 * Computes deterministic signatures for artifact deduplication.
 * Uses SHA hashing with fallback for cross-platform consistency.
 *
 * @module formatting/aggregation/signature
 */

import {
  CHUNKING_AGGREGATION_DEFAULTS,
  HEX_RADIX,
  HEX_BYTE_WIDTH,
  PARSE_INT_RADIX,
  EVIDENCE_ID_PATTERN,
} from "../../constants/index.js";

import type { ExtractedArtifact } from "../extraction/types.js";
import type { ArtifactSignature, ArtifactSignatureComponents, ParsedEvidenceId } from "./types.js";

// ==================== Hashing ====================

/**
 * Computes a simple deterministic hash using reduce.
 */
const computeSimpleHash = (input: string): number =>
  input.split("").reduce((hash, char) => {
    const charCode = char.charCodeAt(0);
    // eslint-disable-next-line no-bitwise -- Bitwise operations required for hash computation
    return ((hash << CHUNKING_AGGREGATION_DEFAULTS.HASH_SHIFT_BITS) - hash + charCode) | 0;
  }, 0);

/**
 * Computes a SHA hash of the given string.
 *
 * @param input - String to hash
 * @returns Truncated hex-encoded hash
 */
const computeHash = async (input: string): Promise<string> => {
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

  const hash = computeSimpleHash(input);
  const positiveHash = Math.abs(hash);
  return positiveHash
    .toString(HEX_RADIX)
    .padStart(CHUNKING_AGGREGATION_DEFAULTS.SIGNATURE_HASH_LENGTH, "0");
};

// ==================== Signature Components ====================

/**
 * Builds signature components from an artifact.
 */
const buildSignatureComponents = (artifact: ExtractedArtifact): ArtifactSignatureComponents => ({
  type: artifact.type,
  filePath: artifact.filePath?.toLowerCase(),
  lineNumber: artifact.lineNumber,
  errorCode: artifact.errorCode,
  testName: artifact.testName?.toLowerCase(),
  assertionHash: artifact.confidence === "high" ? artifact.assertion_hash : undefined,
});

/**
 * Builds deterministic string representation from components.
 */
const buildSignatureString = (components: ArtifactSignatureComponents): string =>
  [
    `type:${components.type}`,
    components.filePath ? `file:${components.filePath}` : "",
    components.lineNumber === undefined ? "" : `line:${components.lineNumber}`,
    components.errorCode ? `code:${components.errorCode}` : "",
    components.testName ? `test:${components.testName}` : "",
    components.assertionHash ? `assert:${components.assertionHash}` : "",
  ]
    .filter((part) => part.length > 0)
    .join("|");

// ==================== Public API ====================

/**
 * Computes a signature for an artifact for deduplication (async).
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
 * Parses an evidence ID string into its components.
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

  if (!parsed) {
    return artifact.evidenceId;
  }

  const absoluteStart = chunkLineOffset + parsed.startLine - 1;
  const absoluteEnd = chunkLineOffset + parsed.endLine - 1;

  return `chunk#${parsed.chunkId}:L${absoluteStart}-L${absoluteEnd}`;
};

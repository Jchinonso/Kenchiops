/**
 * Extraction Parser
 *
 * Handles parsing and validation of LLM responses for artifact extraction.
 * Provides type guards, validators, and field extractors.
 *
 * @module formatting/extraction/parser
 */

import {
  EXTRACTION_DEFAULTS,
  ARTIFACT_TYPES,
  ARTIFACT_SEVERITY,
  ARTIFACT_CONFIDENCE,
  type ArtifactType,
  type ArtifactSeverity,
  type ArtifactConfidence,
} from "../../constants/index.js";
import { createLogger } from "../../core/logger.js";

import type { ExtractedArtifact, OptionalFieldExtractor } from "./types.js";
import { generateAssertionHash } from "./helpers.js";

const logger = createLogger("extraction-parser");

// ==================== Type Guards ====================

/**
 * Type guard for valid artifact type.
 */
export const isValidArtifactType = (type: unknown): type is ArtifactType =>
  typeof type === "string" && Object.values(ARTIFACT_TYPES).includes(type as ArtifactType);

/**
 * Type guard for valid severity.
 */
export const isValidSeverity = (severity: unknown): severity is ArtifactSeverity =>
  typeof severity === "string" &&
  Object.values(ARTIFACT_SEVERITY).includes(severity as ArtifactSeverity);

/**
 * Type guard for valid confidence.
 */
export const isValidConfidence = (confidence: unknown): confidence is ArtifactConfidence =>
  typeof confidence === "string" &&
  Object.values(ARTIFACT_CONFIDENCE).includes(confidence as ArtifactConfidence);

// ==================== Required Field Validation ====================

/**
 * Checks if required fields are present and valid.
 */
export const hasRequiredFields = (
  artifact: Record<string, unknown>
): artifact is Record<string, unknown> & {
  evidence_id: string;
  error_message: string;
  snippet: string;
  snippet_line_start: number;
} =>
  typeof artifact.evidence_id === "string" &&
  typeof artifact.error_message === "string" &&
  typeof artifact.snippet === "string" &&
  typeof artifact.snippet_line_start === "number";

// ==================== Optional Field Extraction ====================

/**
 * Configuration for extracting optional fields from raw artifact.
 */
const OPTIONAL_FIELD_EXTRACTORS: readonly OptionalFieldExtractor[] = [
  {
    sourceKey: "file_path",
    targetKey: "filePath",
    extract: (value) => value,
    isValid: (value) => typeof value === "string" && value.length > 0,
  },
  {
    sourceKey: "line_number",
    targetKey: "lineNumber",
    extract: (value) => value,
    isValid: (value) => typeof value === "number",
  },
  {
    sourceKey: "column",
    targetKey: "column",
    extract: (value) => value,
    isValid: (value) => typeof value === "number",
  },
  {
    sourceKey: "test_name",
    targetKey: "testName",
    extract: (value) => value,
    isValid: (value) => typeof value === "string" && value.length > 0,
  },
  {
    sourceKey: "test_suite",
    targetKey: "testSuite",
    extract: (value) => value,
    isValid: (value) => typeof value === "string" && value.length > 0,
  },
  {
    sourceKey: "expected",
    targetKey: "expected",
    extract: (value) => (value === null ? null : String(value)),
    isValid: (value) => value !== undefined,
  },
  {
    sourceKey: "actual",
    targetKey: "actual",
    extract: (value) => (value === null ? null : String(value)),
    isValid: (value) => value !== undefined,
  },
  {
    sourceKey: "error_code",
    targetKey: "errorCode",
    extract: (value) => value,
    isValid: (value) => typeof value === "string" && value.length > 0,
  },
  {
    sourceKey: "framework",
    targetKey: "framework",
    extract: (value) => value,
    isValid: (value) => typeof value === "string" && value.length > 0,
  },
];

/**
 * Extracts optional fields from raw artifact using field extractors.
 */
export const extractOptionalFields = (
  artifact: Record<string, unknown>
): Partial<ExtractedArtifact> =>
  OPTIONAL_FIELD_EXTRACTORS.reduce<Partial<ExtractedArtifact>>((accumulated, extractor) => {
    const rawValue = artifact[extractor.sourceKey];
    return extractor.isValid(rawValue)
      ? { ...accumulated, [extractor.targetKey]: extractor.extract(rawValue) }
      : accumulated;
  }, {});

// ==================== Artifact Validation ====================

/**
 * Validates and normalizes a single extracted artifact.
 *
 * @param raw - Raw artifact from LLM response
 * @param _chunkId - Chunk ID for validation (unused but kept for API consistency)
 * @returns Validated artifact or null if invalid
 */
export const validateArtifact = (raw: unknown, _chunkId: number): ExtractedArtifact | null => {
  const isValidObject = typeof raw === "object" && raw !== null;
  if (!isValidObject) {
    return null;
  }

  const artifact = raw as Record<string, unknown>;

  if (!hasRequiredFields(artifact) || !isValidArtifactType(artifact.type)) {
    return null;
  }

  const optionalFields = extractOptionalFields(artifact);

  const assertionHash = generateAssertionHash(
    artifact.type,
    artifact.error_message,
    optionalFields.filePath
  );

  const baseArtifact: ExtractedArtifact = {
    evidenceId: artifact.evidence_id,
    type: artifact.type,
    severity: isValidSeverity(artifact.severity) ? artifact.severity : ARTIFACT_SEVERITY.ERROR,
    errorMessage: artifact.error_message,
    snippet: artifact.snippet,
    snippetLineStart: artifact.snippet_line_start,
    confidence: isValidConfidence(artifact.confidence)
      ? artifact.confidence
      : ARTIFACT_CONFIDENCE.MEDIUM,
    assertion_hash: assertionHash,
  };

  return { ...baseArtifact, ...optionalFields };
};

// ==================== Response Parsing ====================

/**
 * Cleans markdown code fences from LLM response.
 */
const cleanMarkdownFences = (response: string): string => {
  let cleanedResponse = response.trim();

  if (cleanedResponse.startsWith("```")) {
    const lines = cleanedResponse.split("\n");
    // Skip the opening ``` line (with or without "json" language identifier)
    const startIndex = 1;
    const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "```");
    cleanedResponse = lines.slice(startIndex, endIndex > 0 ? endIndex : undefined).join("\n");
  }

  return cleanedResponse;
};

/**
 * Attempts to parse JSON from response, with fallback to regex extraction.
 */
const attemptJsonParse = (response: string): unknown => {
  try {
    return JSON.parse(response);
  } catch (primaryError: unknown) {
    logger.debug("Direct JSON parse failed, trying array extraction", {
      responseLength: response.length,
    });
    const arrayMatch = response.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch (fallbackError: unknown) {
        logger.debug("Fallback array JSON parse also failed", {
          matchLength: arrayMatch[0].length,
        });
        return undefined;
      }
    }
    return undefined;
  }
};

/**
 * Parses the LLM response into validated artifacts.
 *
 * @param response - Raw LLM response string
 * @param chunkId - Chunk ID for validation
 * @param maxArtifacts - Maximum artifacts to return
 * @returns Array of validated artifacts
 */
export const parseExtractionResponse = (
  response: string,
  chunkId: number,
  maxArtifacts: number = EXTRACTION_DEFAULTS.MAX_ARTIFACTS_PER_CHUNK
): readonly ExtractedArtifact[] => {
  const cleanedResponse = cleanMarkdownFences(response);
  const parsed = attemptJsonParse(cleanedResponse);

  if (!Array.isArray(parsed)) {
    return [];
  }

  const validatedArtifacts = parsed
    .map((item) => validateArtifact(item, chunkId))
    .filter((artifact): artifact is ExtractedArtifact => artifact !== null)
    .slice(0, maxArtifacts);

  return validatedArtifacts;
};

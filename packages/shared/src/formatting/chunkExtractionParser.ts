/**
 * Chunk Extraction Parser Module
 *
 * Handles parsing and validation of LLM responses for artifact extraction.
 * Provides type guards, validators, and field extractors.
 *
 * @module formatting/chunkExtractionParser
 */

import {
  EXTRACTION_DEFAULTS,
  ARTIFACT_TYPES,
  ARTIFACT_SEVERITY,
  ARTIFACT_CONFIDENCE,
  type ArtifactType,
  type ArtifactSeverity,
  type ArtifactConfidence,
} from "../constants/index.js";

import type { ExtractedArtifact } from "./chunkingTypes.js";

import { generateAssertionHash } from "./chunkExtractor.js";

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
 * Optional field extractor configuration.
 */
interface OptionalFieldExtractor {
  readonly sourceKey: string;
  readonly targetKey: keyof ExtractedArtifact;
  readonly extract: (value: unknown) => unknown;
  readonly isValid: (value: unknown) => boolean;
}

/**
 * Configuration for extracting optional fields from raw artifact.
 * Each extractor validates and transforms a single field.
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
 * Uses declarative field extraction pattern instead of multiple if statements.
 *
 * @param raw - Raw artifact from LLM response
 * @param _chunkId - Chunk ID for validation (unused but kept for API consistency)
 * @returns Validated artifact or null if invalid
 */
export const validateArtifact = (raw: unknown, _chunkId: number): ExtractedArtifact | null => {
  // Early return for invalid input
  const isValidObject = typeof raw === "object" && raw !== null;
  if (!isValidObject) {
    return null;
  }

  const artifact = raw as Record<string, unknown>;

  // Validate required fields
  if (!hasRequiredFields(artifact) || !isValidArtifactType(artifact.type)) {
    return null;
  }

  // Extract optional fields first to get filePath for hash
  const optionalFields = extractOptionalFields(artifact);

  // Generate assertion hash for deduplication discrimination
  const assertionHash = generateAssertionHash(
    artifact.type,
    artifact.error_message,
    optionalFields.filePath
  );

  // Build base artifact with required fields and validated enums
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

  // Merge optional fields
  return { ...baseArtifact, ...optionalFields };
};

// ==================== Response Parsing ====================

/**
 * Cleans markdown code fences from LLM response.
 *
 * @param response - Raw response string
 * @returns Cleaned response string
 */
const cleanMarkdownFences = (response: string): string => {
  let cleanedResponse = response.trim();

  if (cleanedResponse.startsWith("```")) {
    const lines = cleanedResponse.split("\n");
    const startIndex = lines[0].includes("json") ? 1 : 1;
    const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "```");
    cleanedResponse = lines.slice(startIndex, endIndex > 0 ? endIndex : undefined).join("\n");
  }

  return cleanedResponse;
};

/**
 * Attempts to parse JSON from response, with fallback to regex extraction.
 *
 * @param response - Cleaned response string
 * @returns Parsed JSON or undefined on failure
 */
const attemptJsonParse = (response: string): unknown => {
  try {
    return JSON.parse(response);
  } catch {
    // Try to extract JSON array from response
    const arrayMatch = response.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch {
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

  // Validate it's an array
  if (!Array.isArray(parsed)) {
    return [];
  }

  // Validate each artifact and limit count
  const validatedArtifacts = parsed
    .map((item) => validateArtifact(item, chunkId))
    .filter((artifact): artifact is ExtractedArtifact => artifact !== null)
    .slice(0, maxArtifacts);

  return validatedArtifacts;
};

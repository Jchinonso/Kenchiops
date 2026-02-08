/**
 * Artifact Analysis Validation
 *
 * Post-parse validators for LLM analysis responses.
 * Validates evidence IDs, enum fields, confidence requirements,
 * and array completeness against source artifacts.
 *
 * @module integrations/promptArtifactValidation
 */

import type { AggregatedEvidence } from "../formatting/aggregation/index.js";
import { countTestArtifacts, countLintArtifacts } from "./promptArtifactHelpers.js";

// ==================== Constants ====================

/** Valid confidence values */
const VALID_CONFIDENCE = ["high", "medium", "low"] as const;

/** Valid category values */
const VALID_CATEGORY = [
  "dependency",
  "build",
  "test",
  "deploy",
  "runtime",
  "config",
  "infra",
  "unknown",
] as const;

/** Valid phase values */
const VALID_PHASE = [
  "dependency",
  "build",
  "test",
  "deploy",
  "runtime",
  "config",
  "unknown",
] as const;

// ==================== Evidence ID Validation ====================

/**
 * Validates that an analysis response only references evidence IDs
 * that exist in the provided artifacts.
 *
 * @param response - Analysis response to validate
 * @param validEvidenceIds - Set of valid evidence IDs
 * @returns Array of invalid evidence IDs found
 */
export const validateAnalysisEvidenceIds = (
  response: {
    root_cause?: { evidence_ids?: readonly string[] };
    annotations?: ReadonlyArray<{ evidence_id?: string }>;
    secondary_findings?: ReadonlyArray<{ evidence_ids?: readonly string[] }>;
    test_failures?: ReadonlyArray<{ evidence_id?: string }>;
    lint_errors?: ReadonlyArray<{ evidence_id?: string }>;
  },
  validEvidenceIds: ReadonlySet<string>
): readonly string[] => {
  const rootCauseIds = response.root_cause?.evidence_ids ?? [];
  const annotationIds = (response.annotations ?? [])
    .map((annotation) => annotation.evidence_id)
    .filter((id): id is string => id !== undefined);
  const secondaryFindingIds = (response.secondary_findings ?? []).flatMap(
    (finding) => finding.evidence_ids ?? []
  );
  const testFailureIds = (response.test_failures ?? [])
    .map((failure) => failure.evidence_id)
    .filter((id): id is string => id !== undefined);
  const lintErrorIds = (response.lint_errors ?? [])
    .map((lintError) => lintError.evidence_id)
    .filter((id): id is string => id !== undefined);

  const allReferencedIds = [
    ...rootCauseIds,
    ...annotationIds,
    ...secondaryFindingIds,
    ...testFailureIds,
    ...lintErrorIds,
  ];

  const invalidIds = allReferencedIds.filter((evidenceId) => !validEvidenceIds.has(evidenceId));

  return [...new Set(invalidIds)];
};

// ==================== Enum Field Validation ====================

/**
 * Validates required fields and enum values in the analysis response.
 * Checks both presence of required fields and validity of enum values.
 *
 * @param response - Analysis response to validate
 * @param strict - If true, require all fields to be present (default: true)
 * @returns Array of validation error messages (empty if valid)
 */
export const validateEnumFields = (
  response: {
    confidence?: string;
    category?: string;
    phase?: string;
    root_cause?: { summary?: string; evidence_ids?: readonly string[] };
  },
  strict = true
): readonly string[] => {
  const errors: string[] = [];

  if (strict) {
    if (!response.confidence) {
      errors.push("Missing required field: confidence");
    }
    if (!response.category) {
      errors.push("Missing required field: category");
    }
    if (!response.phase) {
      errors.push("Missing required field: phase");
    }
    if (!response.root_cause) {
      errors.push("Missing required field: root_cause");
    } else if (!response.root_cause.summary) {
      errors.push("Missing required field: root_cause.summary");
    }
  }

  if (
    response.confidence &&
    !VALID_CONFIDENCE.includes(response.confidence as (typeof VALID_CONFIDENCE)[number])
  ) {
    errors.push(
      `Invalid confidence value: "${response.confidence}". Must be one of: ${VALID_CONFIDENCE.join(", ")}`
    );
  }

  if (
    response.category &&
    !VALID_CATEGORY.includes(response.category as (typeof VALID_CATEGORY)[number])
  ) {
    errors.push(
      `Invalid category value: "${response.category}". Must be one of: ${VALID_CATEGORY.join(", ")}`
    );
  }

  if (response.phase && !VALID_PHASE.includes(response.phase as (typeof VALID_PHASE)[number])) {
    errors.push(
      `Invalid phase value: "${response.phase}". Must be one of: ${VALID_PHASE.join(", ")}`
    );
  }

  return errors;
};

// ==================== Confidence Requirements ====================

/**
 * Validates confidence-based requirements for analysis response.
 * When confidence is medium or high, requires evidence_ids and annotations.
 * Also validates that first annotation's evidence_id is valid.
 *
 * @param response - Analysis response to validate
 * @param validEvidenceIds - Set of valid evidence IDs (optional, for first annotation check)
 * @returns Array of validation error messages (empty if valid)
 */
export const validateConfidenceRequirements = (
  response: {
    confidence?: string;
    root_cause?: { evidence_ids?: readonly string[] };
    annotations?: ReadonlyArray<{ evidence_id?: string }>;
  },
  validEvidenceIds?: ReadonlySet<string>
): readonly string[] => {
  const confidence = response.confidence ?? "low";
  const requiresValidation = confidence === "medium" || confidence === "high";

  if (!requiresValidation) {
    return [];
  }

  const rootCauseIds = response.root_cause?.evidence_ids ?? [];
  const annotations = response.annotations ?? [];
  const firstAnnotationId = annotations[0]?.evidence_id;

  const errors: string[] = [];

  if (rootCauseIds.length === 0) {
    errors.push(`Confidence "${confidence}" requires at least 1 evidence_id in root_cause`);
  }

  if (annotations.length === 0) {
    errors.push(`Confidence "${confidence}" requires at least 1 annotation`);
  }

  if (
    rootCauseIds.length > 0 &&
    annotations.length > 0 &&
    firstAnnotationId !== undefined &&
    !rootCauseIds.includes(firstAnnotationId)
  ) {
    errors.push(
      "root_cause.evidence_ids should include the first annotation's evidence_id for coherence"
    );
  }

  if (
    validEvidenceIds &&
    firstAnnotationId !== undefined &&
    !validEvidenceIds.has(firstAnnotationId)
  ) {
    errors.push(`First annotation's evidence_id "${firstAnnotationId}" is not a valid artifact id`);
  }

  return errors;
};

// ==================== Array Completeness ====================

/**
 * Validates that test_failures and lint_errors counts match expected artifact counts.
 *
 * @param response - Analysis response to validate
 * @param evidence - Aggregated evidence containing the source artifacts
 * @returns Array of validation error messages (empty if valid)
 */
export const validateArrayCompleteness = (
  response: {
    test_failures?: readonly unknown[];
    lint_errors?: readonly unknown[];
  },
  evidence: AggregatedEvidence
): readonly string[] => {
  const errors: string[] = [];

  const expectedTestFailures = countTestArtifacts(evidence.artifacts);
  const actualTestFailures = response.test_failures?.length ?? 0;
  if (actualTestFailures !== expectedTestFailures) {
    errors.push(
      `test_failures count mismatch: expected ${expectedTestFailures}, got ${actualTestFailures}`
    );
  }

  const expectedLintErrors = countLintArtifacts(evidence.artifacts);
  const actualLintErrors = response.lint_errors?.length ?? 0;
  if (actualLintErrors !== expectedLintErrors) {
    errors.push(
      `lint_errors count mismatch: expected ${expectedLintErrors}, got ${actualLintErrors}`
    );
  }

  return errors;
};

// ==================== Evidence ID Extraction ====================

/**
 * Extracts all valid evidence IDs from aggregated evidence.
 *
 * @param evidence - Aggregated evidence
 * @returns Set of valid evidence IDs
 */
export const extractValidEvidenceIds = (evidence: AggregatedEvidence): ReadonlySet<string> =>
  new Set(evidence.artifacts.map((artifact) => artifact.absoluteEvidenceId));

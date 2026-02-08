/**
 * Structured data parsing constants.
 * Field name mappings and validation sets for LLM output parsing.
 */

// ==================== Dependency Change Types ====================

/** Valid dependency change types */
export const VALID_DEP_CHANGE_TYPES = new Set(["added", "removed", "updated"]);

/** Valid configuration change types */
export const VALID_CONFIG_CHANGE_TYPES = new Set(["added", "modified", "deleted"]);

// ==================== Test Framework Field Mappings ====================

/** Field name mappings for test_name across frameworks */
export const TEST_NAME_FIELDS = ["test_name", "testName"] as const;

/** Field name mappings for error message across frameworks */
export const ERROR_MESSAGE_FIELDS = ["error_message", "errorMessage", "error", "message"] as const;

/** Field name mappings for expected value across frameworks (Rust: left, Go: want) */
export const EXPECTED_VALUE_FIELDS = ["expected", "left", "want"] as const;

/** Field name mappings for actual value across frameworks (Rust: right, Jest: received, Go: got) */
export const ACTUAL_VALUE_FIELDS = ["actual", "right", "received", "got"] as const;

// ==================== Prompt Artifact Validation ====================

/** Valid confidence values for artifact analysis */
export const VALID_ARTIFACT_CONFIDENCE = ["high", "medium", "low"] as const;

/** Valid category values for artifact analysis */
export const VALID_ARTIFACT_CATEGORY = [
  "dependency",
  "build",
  "test",
  "deploy",
  "runtime",
  "config",
  "infra",
  "unknown",
] as const;

/** Valid phase values for artifact analysis */
export const VALID_ARTIFACT_PHASE = [
  "dependency",
  "build",
  "test",
  "deploy",
  "runtime",
  "config",
  "unknown",
] as const;

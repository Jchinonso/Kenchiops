/**
 * Structured Data Parsers
 *
 * Parses structured data from LLM responses:
 * - Test failures with language-specific field mappings
 * - Lint/compile errors with symbol extraction
 * - Dependency and build config changes
 *
 * @module llm/structuredDataParsers
 */

import type {
  LLMDetectedDependencyChange,
  LLMDetectedBuildConfigChange,
  LLMTestFailure,
  LLMLintError,
} from "../core/types.js";
import {
  VALID_DEP_CHANGE_TYPES,
  VALID_CONFIG_CHANGE_TYPES,
  TEST_NAME_FIELDS,
  ERROR_MESSAGE_FIELDS,
  EXPECTED_VALUE_FIELDS,
  ACTUAL_VALUE_FIELDS,
} from "../constants/index.js";

// ==================== Utility Functions ====================

/**
 * Type guard for checking if a value is a non-null object.
 */
const isNonNullObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Extracts a string field from an object, checking multiple possible field names.
 * Returns null if the field is explicitly null, undefined if not found.
 * Handles language-specific field name variations.
 */
const extractStringField = (
  record: Record<string, unknown>,
  fieldNames: readonly string[]
): string | null | undefined => {
  const foundField = fieldNames.find((fieldName) => {
    const value = record[fieldName];
    return value === null || typeof value === "string";
  });

  if (!foundField) {
    return undefined;
  }

  const value = record[foundField];
  return value === null ? null : (value as string);
};

/**
 * Converts any value to string representation.
 * Handles null/undefined, primitives, and objects.
 */
const valueToString = (value: unknown): string | null | undefined =>
  value === null
    ? null
    : value === undefined
      ? undefined
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

/**
 * Extracts a value as string from an object, checking multiple possible field names.
 * Converts numbers and booleans to strings since LLM may return any primitive type.
 * Returns null if the field is explicitly null, undefined if not found.
 */
const extractValueAsString = (
  record: Record<string, unknown>,
  fieldNames: readonly string[]
): string | null | undefined => {
  const foundField = fieldNames.find((fieldName) => fieldName in record);
  return foundField ? valueToString(record[foundField]) : undefined;
};

/**
 * Extracts a string value from an object field if it exists and is a string.
 */
const extractOptionalString = (
  record: Record<string, unknown>,
  fieldName: string
): string | undefined => {
  const value = record[fieldName];
  return typeof value === "string" ? value : undefined;
};

/**
 * Extracts a number value from an object field if it exists and is a number.
 */
const extractOptionalNumber = (
  record: Record<string, unknown>,
  fieldName: string
): number | undefined => {
  const value = record[fieldName];
  return typeof value === "number" ? value : undefined;
};

/**
 * Extracts a required string value from an object field.
 * Returns null if the field is not a string.
 */
const extractRequiredString = (
  record: Record<string, unknown>,
  fieldName: string
): string | null => {
  const value = record[fieldName];
  return typeof value === "string" ? value : null;
};

/**
 * Extracts a required number value from an object field.
 * Returns null if the field is not a number.
 */
const extractRequiredNumber = (
  record: Record<string, unknown>,
  fieldName: string
): number | null => {
  const value = record[fieldName];
  return typeof value === "number" ? value : null;
};

// ==================== Dependency Change Parsing ====================

/**
 * Validates and parses a single dependency change from raw input.
 */
const parseDependencyChange = (raw: unknown): LLMDetectedDependencyChange | null => {
  if (!isNonNullObject(raw)) {
    return null;
  }

  const name = extractRequiredString(raw, "name");
  const type = extractRequiredString(raw, "type");

  if (!name || !type || !VALID_DEP_CHANGE_TYPES.has(type)) {
    return null;
  }

  return {
    name,
    type: type as LLMDetectedDependencyChange["type"],
    oldVersion: extractOptionalString(raw, "oldVersion"),
    newVersion: extractOptionalString(raw, "newVersion"),
    ecosystem: extractOptionalString(raw, "ecosystem"),
  };
};

/**
 * Parses dependency changes array from parsed response.
 */
export const parseDependencyChanges = (raw: unknown): readonly LLMDetectedDependencyChange[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((rawItem) => parseDependencyChange(rawItem))
    .filter((change): change is LLMDetectedDependencyChange => change !== null);
};

// ==================== Build Config Change Parsing ====================

/**
 * Validates and parses a single build config change from raw input.
 */
const parseBuildConfigChange = (raw: unknown): LLMDetectedBuildConfigChange | null => {
  if (!isNonNullObject(raw)) {
    return null;
  }

  const file = extractRequiredString(raw, "file");
  const changeType = extractRequiredString(raw, "changeType");
  const summary = extractRequiredString(raw, "summary");

  if (!file || !changeType || !summary || !VALID_CONFIG_CHANGE_TYPES.has(changeType)) {
    return null;
  }

  return {
    file,
    changeType: changeType as LLMDetectedBuildConfigChange["changeType"],
    summary,
  };
};

/**
 * Parses build config changes array from parsed response.
 */
export const parseBuildConfigChanges = (raw: unknown): readonly LLMDetectedBuildConfigChange[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((rawItem) => parseBuildConfigChange(rawItem))
    .filter((change): change is LLMDetectedBuildConfigChange => change !== null);
};

// ==================== Test Failure Parsing ====================

/**
 * Validates and parses a single test failure from raw LLM output.
 * Handles language-specific field names:
 * - Rust: left/right instead of expected/actual
 * - Jest: received instead of actual
 * - Go: want/got instead of expected/actual
 */
const parseTestFailure = (raw: unknown): LLMTestFailure | null => {
  if (!isNonNullObject(raw)) {
    return null;
  }

  // test_name - use fallback if missing to avoid dropping entries
  const testName = extractStringField(raw, TEST_NAME_FIELDS);

  // error - use fallback if missing to avoid dropping entries
  const error = extractStringField(raw, ERROR_MESSAGE_FIELDS);

  // Must have at least one of testName or error to be valid
  if (!testName && !error) {
    return null;
  }

  return {
    testName: testName || "Unknown test",
    file: extractOptionalString(raw, "file"),
    line: extractOptionalNumber(raw, "line"),
    // Use extractValueAsString to handle LLM returning numbers (e.g., expected: 3, actual: 2)
    expected: extractValueAsString(raw, EXPECTED_VALUE_FIELDS),
    actual: extractValueAsString(raw, ACTUAL_VALUE_FIELDS),
    error: error || "Test failed",
  };
};

/**
 * Parses test failures array from parsed LLM response.
 */
export const parseTestFailures = (raw: unknown): readonly LLMTestFailure[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((rawItem) => parseTestFailure(rawItem))
    .filter((failure): failure is LLMTestFailure => failure !== null);
};

// ==================== Lint Error Parsing ====================

/**
 * Validates and parses a single lint error from raw LLM output.
 */
const parseLintError = (raw: unknown): LLMLintError | null => {
  if (!isNonNullObject(raw)) {
    return null;
  }

  // Required fields
  const code = extractRequiredString(raw, "code");
  const message = extractRequiredString(raw, "message");
  const file = extractRequiredString(raw, "file");
  const line = extractRequiredNumber(raw, "line");

  if (!code || !message || !file || !line) {
    return null;
  }

  return {
    code,
    message,
    file,
    line,
    column: extractOptionalNumber(raw, "column"),
    symbol: extractOptionalString(raw, "symbol"),
    suggestion: extractOptionalString(raw, "suggestion"),
  };
};

/**
 * Parses lint errors array from parsed LLM response.
 */
export const parseLintErrors = (raw: unknown): readonly LLMLintError[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((rawItem) => parseLintError(rawItem))
    .filter((lintError): lintError is LLMLintError => lintError !== null);
};

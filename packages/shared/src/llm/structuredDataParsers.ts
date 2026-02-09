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

// ==================== Test Failure Deduplication Helpers ====================

interface TestFailureEntry {
  readonly failure: LLMTestFailure;
  readonly index: number;
  readonly normalized: string;
  readonly normalizedKey: string;
  readonly locationKey: string | null;
}

/** Normalizes test name to last "›" segment for matching. */
const normalizeTestName = (name: string): string => {
  const separator = " › ";
  const lastIdx = name.lastIndexOf(separator);
  return lastIdx >= 0 ? name.substring(lastIdx + separator.length).trim() : name.trim();
};

/** Checks if a file path is a test file. */
const isTestFile = (filePath: string): boolean => /\.(test|spec)\.[jt]sx?$/.test(filePath);

/** Extracts the base filename without test/spec suffix. */
const getBaseName = (filePath: string): string => {
  const fileName = filePath.split("/").pop() ?? filePath;
  return fileName.replace(/\.(test|spec)(\.[jt]sx?)$/, "$2");
};

/** Builds enriched entries with normalized keys for deduplication. */
const buildTestFailureEntries = (parsed: readonly LLMTestFailure[]): readonly TestFailureEntry[] =>
  parsed.map((failure, index) => {
    const normalized = normalizeTestName(failure.testName);
    const normalizedKey = `${normalized}::${failure.file ?? ""}`;
    const locationKey =
      failure.file && failure.line !== undefined ? `${failure.file}::${failure.line}` : null;
    return { failure, index, normalized, normalizedKey, locationKey };
  });

/**
 * Deduplicates by normalized name + file and by file + line location.
 * Keeps the entry with the longer (more descriptive) testName on collision.
 */
const deduplicateByNameAndLocation = (entries: readonly TestFailureEntry[]): Set<number> => {
  const seenByNormalizedName = new Map<string, number>();
  const seenByLocation = new Map<string, number>();
  const keepIndices = new Set<number>();

  for (const entry of entries) {
    const existingByName = seenByNormalizedName.get(entry.normalizedKey);
    if (existingByName !== undefined) {
      if (entry.failure.testName.length > entries[existingByName].failure.testName.length) {
        keepIndices.delete(existingByName);
        keepIndices.add(entry.index);
        seenByNormalizedName.set(entry.normalizedKey, entry.index);
      }
      continue;
    }
    seenByNormalizedName.set(entry.normalizedKey, entry.index);

    if (entry.locationKey) {
      const existingByLoc = seenByLocation.get(entry.locationKey);
      if (existingByLoc !== undefined) {
        if (entry.failure.testName.length > entries[existingByLoc].failure.testName.length) {
          keepIndices.delete(existingByLoc);
          keepIndices.add(entry.index);
          seenByLocation.set(entry.locationKey, entry.index);
        }
        continue;
      }
      seenByLocation.set(entry.locationKey, entry.index);
    }

    keepIndices.add(entry.index);
  }

  return keepIndices;
};

/**
 * Resolves test vs. source file preference per normalized name.
 * Returns a map of normalized name → best entry index (prefers test files).
 */
const buildBestByNormalized = (
  entries: readonly TestFailureEntry[],
  keepIndices: ReadonlySet<number>
): ReadonlyMap<string, number> => {
  const bestByNormalized = new Map<string, number>();

  for (const idx of keepIndices) {
    const entry = entries[idx];
    const existing = bestByNormalized.get(entry.normalized);
    if (existing === undefined) {
      bestByNormalized.set(entry.normalized, idx);
      continue;
    }
    const existingFile = entries[existing].failure.file;
    const currentFile = entry.failure.file;
    if (currentFile && isTestFile(currentFile) && (!existingFile || !isTestFile(existingFile))) {
      bestByNormalized.set(entry.normalized, idx);
    }
  }

  return bestByNormalized;
};

/**
 * Final pass: drops file-less duplicates, source-file duplicates when test files exist,
 * and non-best entries when a test file variant is the best.
 */
const applyTestFilePreference = (
  entries: readonly TestFailureEntry[],
  keepIndices: ReadonlySet<number>,
  bestByNormalized: ReadonlyMap<string, number>
): Set<number> => {
  const baseNamesWithTestFiles = new Set<string>();
  for (const idx of keepIndices) {
    const { file } = entries[idx].failure;
    if (file && isTestFile(file)) {
      baseNamesWithTestFiles.add(getBaseName(file));
    }
  }

  const finalIndices = new Set<number>();
  for (const idx of keepIndices) {
    const entry = entries[idx];
    const bestIdx = bestByNormalized.get(entry.normalized);

    if (!entry.failure.file) {
      if (bestIdx !== undefined && entries[bestIdx].failure.file) {
        continue;
      }
    } else if (
      !isTestFile(entry.failure.file) &&
      baseNamesWithTestFiles.has(getBaseName(entry.failure.file))
    ) {
      continue;
    } else if (bestIdx !== undefined && bestIdx !== idx) {
      const bestFile = entries[bestIdx].failure.file;
      if (bestFile && isTestFile(bestFile) && !isTestFile(entry.failure.file)) {
        continue;
      }
    }

    finalIndices.add(idx);
  }

  return finalIndices;
};

// ==================== Test Failure Parsing ====================

/**
 * Parses and deduplicates test failures from LLM response.
 * Handles LLM re-extraction inflation where the same failure appears
 * with different name formats, file attributions, or missing files.
 */
export const parseTestFailures = (raw: unknown): readonly LLMTestFailure[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const parsed = raw
    .map((rawItem) => parseTestFailure(rawItem))
    .filter((failure): failure is LLMTestFailure => failure !== null);

  const entries = buildTestFailureEntries(parsed);
  const keepIndices = deduplicateByNameAndLocation(entries);
  const bestByNormalized = buildBestByNormalized(entries, keepIndices);
  const finalIndices = applyTestFilePreference(entries, keepIndices, bestByNormalized);

  return entries.filter((entry) => finalIndices.has(entry.index)).map((entry) => entry.failure);
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

/**
 * Secret Redaction Module
 *
 * Provides utilities for redacting sensitive information from text
 * before sending to LLMs or logging. This is a critical security
 * feature to prevent accidental exposure of secrets.
 */

import { createLogger } from "../logger.js";
import {
  SECRET_PATTERNS,
  FORBIDDEN_FIELDS,
  REDACTION_PLACEHOLDER,
  type SecretPattern,
} from "../constants.js";

const logger = createLogger("security");

// ==================== Pre-compiled Patterns ====================

/**
 * Pre-compiled regex patterns for O(1) pattern reuse.
 * Compiled once at module load time, avoiding repeated RegExp construction.
 */
interface CompiledPattern {
  readonly name: string;
  readonly regex: RegExp;
}

const COMPILED_PATTERNS: readonly CompiledPattern[] = SECRET_PATTERNS.map(({ name, pattern }) => ({
  name,
  regex: new RegExp(pattern.source, pattern.flags),
}));

// ==================== Validation Helpers ====================

/**
 * Type guard for valid string input.
 * Extracts repeated validation pattern.
 */
const isValidString = (text: unknown): text is string =>
  typeof text === "string" && text.length > 0;

/**
 * Result of a redaction operation, including statistics.
 */
export interface RedactionResult {
  /** The redacted text */
  readonly text: string;
  /** Number of secrets redacted */
  readonly redactedCount: number;
  /** Types of secrets that were redacted */
  readonly redactedTypes: readonly string[];
}

/**
 * Redact secrets from a string using predefined patterns.
 *
 * @param text - The text to scan and redact
 * @param options - Optional configuration
 * @returns The text with secrets replaced by [REDACTED]
 */
export const redactSecrets = (text: string, options: { logRedactions?: boolean } = {}): string => {
  if (!isValidString(text)) {
    return text;
  }

  let result = text;

  // Single pass per pattern using pre-compiled regex
  for (const { name, regex } of COMPILED_PATTERNS) {
    let matchCount = 0;

    // Use replace callback to count matches in a single pass (instead of match + replace)
    result = result.replace(regex, () => {
      matchCount++;
      return REDACTION_PLACEHOLDER;
    });

    if (matchCount > 0 && options.logRedactions) {
      logger.info("Redacted secret from text", {
        type: name,
        count: matchCount,
      });
    }
  }

  return result;
};

/**
 * Redact secrets from a string and return detailed results.
 *
 * @param text - The text to scan and redact
 * @returns Object containing redacted text and statistics
 */
export const redactSecretsWithStats = (text: string): RedactionResult => {
  if (!isValidString(text)) {
    return { text, redactedCount: 0, redactedTypes: [] };
  }

  let result = text;
  let totalRedacted = 0;
  const redactedTypes: string[] = [];

  // Single pass per pattern using pre-compiled regex
  for (const { name, regex } of COMPILED_PATTERNS) {
    let matchCount = 0;

    result = result.replace(regex, () => {
      matchCount++;
      return REDACTION_PLACEHOLDER;
    });

    if (matchCount > 0) {
      totalRedacted += matchCount;
      redactedTypes.push(name);
    }
  }

  return {
    text: result,
    redactedCount: totalRedacted,
    redactedTypes,
  };
};

/**
 * Check if a field name is forbidden (should never be included in output).
 *
 * @param fieldName - The field name to check
 * @returns true if the field should be excluded
 */
export const isForbiddenField = (fieldName: string): boolean => {
  if (!isValidString(fieldName)) {
    return false;
  }
  return FORBIDDEN_FIELDS.has(fieldName.toLowerCase());
};

/**
 * Recursively redact secrets from an object.
 * - Removes forbidden fields entirely
 * - Redacts secret patterns from string values
 *
 * @param obj - The object to redact
 * @param options - Optional configuration
 * @returns A new object with secrets redacted
 */
export const redactObject = <T extends Record<string, unknown>>(
  obj: T,
  options: { logRedactions?: boolean; maxDepth?: number } = {}
): T => {
  const { logRedactions = false, maxDepth = 10 } = options;

  const redactRecursive = (value: unknown, depth: number): unknown => {
    // Prevent infinite recursion
    if (depth > maxDepth) {
      return value;
    }

    // Handle null/undefined
    if (value === null || value === undefined) {
      return value;
    }

    // Handle strings - apply pattern redaction
    if (typeof value === "string") {
      return redactSecrets(value, { logRedactions });
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value.map((item) => redactRecursive(item, depth + 1));
    }

    // Handle objects
    if (typeof value === "object") {
      const result: Record<string, unknown> = {};

      for (const [key, val] of Object.entries(value)) {
        // Skip forbidden fields entirely
        if (isForbiddenField(key)) {
          result[key] = REDACTION_PLACEHOLDER;
          if (logRedactions) {
            logger.info("Removed forbidden field", { field: key });
          }
          continue;
        }

        result[key] = redactRecursive(val, depth + 1);
      }

      return result;
    }

    // Return primitives as-is
    return value;
  };

  return redactRecursive(obj, 0) as T;
};

/**
 * Check if text contains any secrets that should be redacted.
 * Useful for validation before sending data externally.
 *
 * @param text - The text to check
 * @returns true if secrets were detected
 */
export const containsSecrets = (text: string): boolean => {
  if (!isValidString(text)) {
    return false;
  }

  // Early exit on first match using pre-compiled patterns
  for (const { regex } of COMPILED_PATTERNS) {
    if (regex.test(text)) {
      return true;
    }
  }

  return false;
};

/**
 * Get the types of secrets detected in text.
 * Useful for security auditing.
 *
 * @param text - The text to scan
 * @returns Array of detected secret type names
 */
export const detectSecretTypes = (text: string): string[] => {
  if (!isValidString(text)) {
    return [];
  }

  // Use pre-compiled patterns and filter in single pass
  return COMPILED_PATTERNS.filter(({ regex }) => regex.test(text)).map(({ name }) => name);
};

/**
 * Create a custom redactor with additional patterns.
 * Useful for organization-specific secret formats.
 *
 * @param additionalPatterns - Additional patterns to include
 * @returns A redaction function that includes both default and custom patterns
 */
export const createCustomRedactor = (
  additionalPatterns: readonly SecretPattern[]
): ((text: string) => string) => {
  // Pre-compile additional patterns once at creation time
  const compiledAdditional = additionalPatterns.map(
    ({ pattern }) => new RegExp(pattern.source, pattern.flags)
  );
  const allCompiledPatterns = [
    ...COMPILED_PATTERNS.map(({ regex }) => regex),
    ...compiledAdditional,
  ];

  return (text: string): string => {
    if (!isValidString(text)) {
      return text;
    }

    let result = text;

    // Use pre-compiled patterns
    for (const regex of allCompiledPatterns) {
      result = result.replace(regex, REDACTION_PLACEHOLDER);
    }

    return result;
  };
};

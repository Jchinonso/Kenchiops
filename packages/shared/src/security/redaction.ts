/**
 * Secret Redaction Module
 *
 * Provides utilities for redacting sensitive information from text
 * before sending to LLMs or logging. This is a critical security
 * feature to prevent accidental exposure of secrets.
 *
 * ## Design Decisions
 *
 * ### Forbidden Fields Policy
 * Forbidden fields are **masked** (key retained, value replaced with [REDACTED]).
 * This preserves object shape for debugging while hiding sensitive values.
 *
 * ### Redaction Stats Semantics
 * - `redactedTypes`: Unique pattern names that matched (for quick overview)
 * - `redactedTypeCounts`: Count of matches per pattern type (for detailed auditing)
 *
 * ### Large Input Handling
 * Inputs exceeding MAX_INPUT_SIZE are truncated before redaction
 * to prevent ReDoS attacks and excessive CPU usage on large CI logs.
 */

import { createLogger } from "../core/logger.js";
import {
  SECRET_PATTERNS,
  FORBIDDEN_FIELDS,
  REDACTION_PLACEHOLDER,
  REDACTION_DEFAULTS,
  type SecretPattern,
} from "../constants/index.js";

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
 * Truncate input if it exceeds the maximum allowed size.
 * Logs a warning when truncation occurs.
 *
 * @param text - The input text
 * @param maxSize - Maximum allowed size (defaults to REDACTION_DEFAULTS.MAX_INPUT_SIZE)
 * @returns Truncated text if needed, original otherwise
 */
const truncateIfNeeded = (
  text: string,
  maxSize: number = REDACTION_DEFAULTS.MAX_INPUT_SIZE
): string => {
  if (text.length <= maxSize) {
    return text;
  }
  logger.warn("Input truncated for redaction due to size limit", {
    originalSize: text.length,
    maxSize,
    truncatedTo: maxSize,
  });
  return text.slice(0, maxSize);
};

// ==================== Types ====================

/**
 * Result of a redaction operation, including statistics.
 */
export interface RedactionResult {
  /** The redacted text */
  readonly text: string;
  /** Total number of secrets redacted across all pattern types */
  readonly redactedCount: number;
  /**
   * Unique pattern type names that matched.
   * Each pattern name appears at most once, regardless of how many matches.
   * Use `redactedTypeCounts` for per-type match counts.
   */
  readonly redactedTypes: readonly string[];
  /**
   * Count of matches per pattern type.
   * Keys are pattern names, values are match counts.
   */
  readonly redactedTypeCounts: Readonly<Record<string, number>>;
}

/**
 * Options for redaction operations.
 */
export interface RedactionOptions {
  /** Whether to log redaction events */
  readonly logRedactions?: boolean;
  /** Maximum input size (defaults to 5MB) */
  readonly maxInputSize?: number;
}

/**
 * Options for object redaction.
 */
export interface ObjectRedactionOptions extends RedactionOptions {
  /** Maximum recursion depth (defaults to 10) */
  readonly maxDepth?: number;
}

// ==================== Core Functions ====================

/**
 * Redact secrets from a string using predefined patterns.
 * Uses reduce for functional pattern iteration.
 *
 * Large inputs (>5MB by default) are truncated before redaction
 * to prevent ReDoS attacks.
 *
 * @param text - The text to scan and redact
 * @param options - Optional configuration
 * @returns The text with secrets replaced by [REDACTED]
 */
export const redactSecrets = (text: string, options: RedactionOptions = {}): string => {
  if (!isValidString(text)) {
    return text;
  }

  const { logRedactions = false, maxInputSize = REDACTION_DEFAULTS.MAX_INPUT_SIZE } = options;
  const safeText = truncateIfNeeded(text, maxInputSize);

  // Single pass per pattern using reduce
  return COMPILED_PATTERNS.reduce((result, { name, regex }) => {
    let matchCount = 0;

    // Use replace callback to count matches in a single pass
    const redacted = result.replace(regex, () => {
      matchCount++;
      return REDACTION_PLACEHOLDER;
    });

    if (matchCount > 0 && logRedactions) {
      logger.info("Redacted secret from text", { type: name, count: matchCount });
    }

    return redacted;
  }, safeText);
};

/**
 * Redact secrets from a string and return detailed results.
 * Uses reduce for functional pattern iteration.
 *
 * Large inputs (>5MB by default) are truncated before redaction
 * to prevent ReDoS attacks.
 *
 * @param text - The text to scan and redact
 * @param options - Optional configuration
 * @returns Object containing redacted text and statistics
 */
export const redactSecretsWithStats = (
  text: string,
  options: RedactionOptions = {}
): RedactionResult => {
  if (!isValidString(text)) {
    return { text, redactedCount: 0, redactedTypes: [], redactedTypeCounts: {} };
  }

  const { maxInputSize = REDACTION_DEFAULTS.MAX_INPUT_SIZE } = options;
  const safeText = truncateIfNeeded(text, maxInputSize);

  interface AccumulatorState {
    readonly text: string;
    readonly redactedCount: number;
    readonly redactedTypes: readonly string[];
    readonly redactedTypeCounts: Record<string, number>;
  }

  const initial: AccumulatorState = {
    text: safeText,
    redactedCount: 0,
    redactedTypes: [],
    redactedTypeCounts: {},
  };

  // Single pass per pattern using reduce
  return COMPILED_PATTERNS.reduce<AccumulatorState>((acc, { name, regex }) => {
    let matchCount = 0;

    const redacted = acc.text.replace(regex, () => {
      matchCount++;
      return REDACTION_PLACEHOLDER;
    });

    if (matchCount > 0) {
      return {
        text: redacted,
        redactedCount: acc.redactedCount + matchCount,
        redactedTypes: [...acc.redactedTypes, name],
        redactedTypeCounts: {
          ...acc.redactedTypeCounts,
          [name]: matchCount,
        },
      };
    }

    return { ...acc, text: redacted };
  }, initial);
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
 *
 * ## Behavior
 * - **Forbidden fields are masked**: key is retained, value replaced with [REDACTED]
 * - **String values**: secret patterns are redacted
 * - **Arrays**: each element is recursively processed
 * - **Nested objects**: recursively processed up to maxDepth
 *
 * ## Type Safety Note
 * Returns `Record<string, unknown>` because the output shape may differ from input
 * (string values are modified, forbidden field values are replaced).
 *
 * @param obj - The object to redact
 * @param options - Optional configuration
 * @returns A new object with secrets redacted (shape may differ from input)
 */
export const redactObject = (
  obj: Record<string, unknown>,
  options: ObjectRedactionOptions = {}
): Record<string, unknown> => {
  const {
    logRedactions = false,
    maxDepth = REDACTION_DEFAULTS.MAX_DEPTH,
    maxInputSize = REDACTION_DEFAULTS.MAX_INPUT_SIZE,
  } = options;

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
      return redactSecrets(value, { logRedactions, maxInputSize });
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value.map((item) => redactRecursive(item, depth + 1));
    }

    // Handle objects using reduce
    if (typeof value === "object") {
      return Object.entries(value).reduce<Record<string, unknown>>((result, [key, val]) => {
        // Mask forbidden fields (keep key, replace value with placeholder)
        if (isForbiddenField(key)) {
          if (logRedactions) {
            logger.info("Masked forbidden field", { field: key });
          }
          return { ...result, [key]: REDACTION_PLACEHOLDER };
        }
        return { ...result, [key]: redactRecursive(val, depth + 1) };
      }, {});
    }

    // Return primitives as-is
    return value;
  };

  return redactRecursive(obj, 0) as Record<string, unknown>;
};

/**
 * Safely test a regex against text.
 * Reset lastIndex before testing to avoid global regex state issues.
 * Global regexes modify lastIndex after .test(), causing alternating results.
 *
 * @param regex - The regex to test
 * @param text - The text to test against
 * @returns true if the pattern matches
 */
const safeRegexTest = (regex: RegExp, text: string): boolean => {
  regex.lastIndex = 0; // Reset state for global regexes
  return regex.test(text);
};

/**
 * Check if text contains any secrets that should be redacted.
 * Uses .some() for early exit on first match.
 * Safe for global regexes - resets lastIndex before each test.
 *
 * @param text - The text to check
 * @returns true if secrets were detected
 */
export const containsSecrets = (text: string): boolean =>
  isValidString(text) && COMPILED_PATTERNS.some(({ regex }) => safeRegexTest(regex, text));

/**
 * Get the types of secrets detected in text.
 * Useful for security auditing.
 * Safe for global regexes - resets lastIndex before each test.
 *
 * @param text - The text to scan
 * @returns Array of detected secret type names
 */
export const detectSecretTypes = (text: string): string[] => {
  if (!isValidString(text)) {
    return [];
  }

  // Use pre-compiled patterns and filter in single pass
  // Safe test avoids global regex lastIndex issues
  return COMPILED_PATTERNS.filter(({ regex }) => safeRegexTest(regex, text)).map(
    ({ name }) => name
  );
};

// ==================== Custom Redactor Factory ====================

/**
 * Compiled custom pattern with name preserved for stats tracking.
 */
interface CompiledCustomPattern {
  readonly name: string;
  readonly regex: RegExp;
}

/**
 * Result type for custom redactor with stats.
 */
export interface CustomRedactionResult {
  /** The redacted text */
  readonly text: string;
  /** Total matches across all patterns */
  readonly redactedCount: number;
  /** Unique pattern names that matched */
  readonly redactedTypes: readonly string[];
  /** Match counts per pattern type */
  readonly redactedTypeCounts: Readonly<Record<string, number>>;
}

/**
 * Custom redactor function type.
 */
export interface CustomRedactor {
  /** Redact text, returning redacted string */
  (text: string): string;
  /** Redact text with full statistics */
  withStats: (text: string) => CustomRedactionResult;
}

/**
 * Create a custom redactor with additional patterns.
 * Useful for organization-specific secret formats.
 *
 * The returned redactor includes both a simple function and a `withStats` method
 * for detailed redaction statistics including custom pattern names.
 *
 * @param additionalPatterns - Additional patterns to include
 * @returns A redactor function with optional stats support
 *
 * @example
 * ```typescript
 * const redactor = createCustomRedactor([
 *   { name: "Internal API Key", pattern: /INTERNAL_[A-Z0-9]{32}/g }
 * ]);
 *
 * // Simple redaction
 * const redacted = redactor(text);
 *
 * // Redaction with stats
 * const { text, redactedCount, redactedTypeCounts } = redactor.withStats(text);
 * ```
 */
export const createCustomRedactor = (
  additionalPatterns: readonly SecretPattern[]
): CustomRedactor => {
  // Pre-compile additional patterns once at creation time, preserving names
  const compiledAdditional: readonly CompiledCustomPattern[] = additionalPatterns.map(
    ({ name, pattern }) => ({
      name,
      regex: new RegExp(pattern.source, pattern.flags),
    })
  );

  const allCompiledPatterns: readonly CompiledCustomPattern[] = [
    ...COMPILED_PATTERNS,
    ...compiledAdditional,
  ];

  // Simple redaction function
  const redact = (text: string): string => {
    if (!isValidString(text)) {
      return text;
    }

    const safeText = truncateIfNeeded(text);
    return allCompiledPatterns.reduce(
      (result, { regex }) => result.replace(regex, REDACTION_PLACEHOLDER),
      safeText
    );
  };

  // Redaction with statistics
  const redactWithStats = (text: string): CustomRedactionResult => {
    if (!isValidString(text)) {
      return { text, redactedCount: 0, redactedTypes: [], redactedTypeCounts: {} };
    }

    const safeText = truncateIfNeeded(text);

    interface AccumulatorState {
      readonly text: string;
      readonly redactedCount: number;
      readonly redactedTypes: readonly string[];
      readonly redactedTypeCounts: Record<string, number>;
    }

    const initial: AccumulatorState = {
      text: safeText,
      redactedCount: 0,
      redactedTypes: [],
      redactedTypeCounts: {},
    };

    return allCompiledPatterns.reduce<AccumulatorState>((acc, { name, regex }) => {
      let matchCount = 0;

      const redacted = acc.text.replace(regex, () => {
        matchCount++;
        return REDACTION_PLACEHOLDER;
      });

      if (matchCount > 0) {
        return {
          text: redacted,
          redactedCount: acc.redactedCount + matchCount,
          redactedTypes: [...acc.redactedTypes, name],
          redactedTypeCounts: {
            ...acc.redactedTypeCounts,
            [name]: matchCount,
          },
        };
      }

      return { ...acc, text: redacted };
    }, initial);
  };

  // Attach withStats method to the function
  const redactor = redact as CustomRedactor;
  redactor.withStats = redactWithStats;

  return redactor;
};

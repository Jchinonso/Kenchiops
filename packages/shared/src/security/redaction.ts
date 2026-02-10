/**
 * Secret Redaction Module
 *
 * Provides utilities for redacting sensitive information from text
 * before sending to LLMs or logging. This is a critical security
 * feature to prevent accidental exposure of secrets.
 *
 * @module security/redaction
 */

import { createLogger } from "../core/logger.js";
import {
  SECRET_PATTERNS,
  FORBIDDEN_FIELDS,
  REDACTION_PLACEHOLDER,
  REDACTION_DEFAULTS,
  type SecretPattern,
} from "../constants/index.js";
import type {
  CompiledPattern,
  RedactionAccumulator,
  RedactionResult,
  RedactionOptions,
  ObjectRedactionOptions,
  CustomRedactionResult,
  CustomRedactor,
  ValueHandler,
  ValueTypeHandlerEntry,
  PatternMatchResult,
  ValueHandlerOptions,
} from "./types.js";

const logger = createLogger("security");

// ==================== Pre-compiled Patterns ====================

const compilePattern = ({ name, pattern }: SecretPattern): CompiledPattern => ({
  name,
  regex: new RegExp(pattern.source, pattern.flags),
});

const COMPILED_PATTERNS: readonly CompiledPattern[] = SECRET_PATTERNS.map(compilePattern);

// ==================== Pure Helper Functions ====================

/** Type guard for non-empty string */
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

/** Safely test regex against text, resetting lastIndex */
const safeRegexTest = (regex: RegExp, text: string): boolean => {
  regex.lastIndex = 0;
  return regex.test(text);
};

/** Truncates text if it exceeds max size, logging when truncation occurs */
const truncateWithLog = (text: string, maxSize: number): string => {
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

/** Creates empty redaction result */
const createEmptyResult = (text: string): RedactionResult => ({
  text,
  redactedCount: 0,
  redactedTypes: [],
  redactedTypeCounts: {},
});

/** Creates initial accumulator for pattern reduction */
const createInitialAccumulator = (text: string): RedactionAccumulator => ({
  text,
  redactedCount: 0,
  redactedTypes: [],
  redactedTypeCounts: {},
});

/** Updates accumulator with match results */
const updateAccumulator = (
  acc: RedactionAccumulator,
  redactedText: string,
  patternName: string,
  matchCount: number
): RedactionAccumulator =>
  matchCount > 0
    ? {
        text: redactedText,
        redactedCount: acc.redactedCount + matchCount,
        redactedTypes: [...acc.redactedTypes, patternName],
        redactedTypeCounts: { ...acc.redactedTypeCounts, [patternName]: matchCount },
      }
    : { ...acc, text: redactedText };

/** Applies single pattern to text, counting matches */
const applyPatternWithCount = (text: string, regex: RegExp): PatternMatchResult => {
  let matchCount = 0;
  const redacted = text.replace(regex, () => {
    matchCount++;
    return REDACTION_PLACEHOLDER;
  });
  return { redacted, matchCount };
};

/** Reduces patterns over text, accumulating redaction stats */
const reducePatterns = (
  patterns: readonly CompiledPattern[],
  initialText: string,
  onMatch?: (name: string, count: number) => void
): RedactionAccumulator =>
  patterns.reduce((acc, { name, regex }) => {
    const { redacted, matchCount } = applyPatternWithCount(acc.text, regex);
    if (matchCount > 0 && onMatch) {
      onMatch(name, matchCount);
    }
    return updateAccumulator(acc, redacted, name, matchCount);
  }, createInitialAccumulator(initialText));

// ==================== Value Handlers ====================

const handleNull: ValueHandler = (value) => value;

const handleString: ValueHandler = (value, _, { logRedactions, maxInputSize }) =>
  redactSecrets(value as string, { logRedactions, maxInputSize });

const handleArray: ValueHandler = (value, recurse) => (value as unknown[]).map(recurse);

const handleObject: ValueHandler = (value, recurse, { logRedactions }) =>
  Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
    (result, [key, val]) => {
      if (isForbiddenField(key)) {
        if (logRedactions) {
          logger.info("Masked forbidden field", { field: key });
        }
        return { ...result, [key]: REDACTION_PLACEHOLDER };
      }
      return { ...result, [key]: recurse(val) };
    },
    {}
  );

/** Type guard definitions for value dispatch */
const VALUE_TYPE_HANDLERS: readonly ValueTypeHandlerEntry[] = [
  {
    guard: (value): value is null | undefined => value === null || value === undefined,
    handler: handleNull,
  },
  { guard: (value): value is string => typeof value === "string", handler: handleString },
  { guard: (value): value is unknown[] => Array.isArray(value), handler: handleArray },
  { guard: (value): value is object => typeof value === "object", handler: handleObject },
];

/** Determines value type and returns appropriate handler */
const getValueHandler = (value: unknown): ValueHandler | null =>
  VALUE_TYPE_HANDLERS.find(({ guard }) => guard(value))?.handler ?? null;

// ==================== Exports ====================

/**
 * Redact secrets from a string using predefined patterns.
 */
export const redactSecrets = (text: string, options: RedactionOptions = {}): string => {
  if (!isNonEmptyString(text)) {
    return text;
  }

  const { logRedactions = false, maxInputSize = REDACTION_DEFAULTS.MAX_INPUT_SIZE } = options;
  const safeText = truncateWithLog(text, maxInputSize);

  const onMatch = logRedactions
    ? (name: string, count: number) =>
        logger.info("Redacted secret from text", { type: name, count })
    : undefined;

  return reducePatterns(COMPILED_PATTERNS, safeText, onMatch).text;
};

/**
 * Redact secrets from a string and return detailed results.
 */
export const redactSecretsWithStats = (
  text: string,
  options: RedactionOptions = {}
): RedactionResult => {
  if (!isNonEmptyString(text)) {
    return createEmptyResult(text);
  }

  const { maxInputSize = REDACTION_DEFAULTS.MAX_INPUT_SIZE } = options;
  const safeText = truncateWithLog(text, maxInputSize);

  return reducePatterns(COMPILED_PATTERNS, safeText);
};

/**
 * Check if a field name is forbidden.
 */
export const isForbiddenField = (fieldName: string): boolean =>
  isNonEmptyString(fieldName) && FORBIDDEN_FIELDS.has(fieldName.toLowerCase());

/**
 * Recursively redact secrets from an object.
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

  const handlerOptions: ValueHandlerOptions = { logRedactions, maxInputSize };

  const redactRecursive = (value: unknown, depth: number): unknown => {
    if (depth > maxDepth) {
      return value;
    }

    const handler = getValueHandler(value);
    if (!handler) {
      return value;
    }

    return handler(value, (nested) => redactRecursive(nested, depth + 1), handlerOptions);
  };

  return redactRecursive(obj, 0) as Record<string, unknown>;
};

/**
 * Check if text contains any secrets.
 */
export const containsSecrets = (text: string): boolean =>
  isNonEmptyString(text) && COMPILED_PATTERNS.some(({ regex }) => safeRegexTest(regex, text));

/**
 * Get the types of secrets detected in text.
 */
export const detectSecretTypes = (text: string): string[] =>
  isNonEmptyString(text)
    ? COMPILED_PATTERNS.filter(({ regex }) => safeRegexTest(regex, text)).map(({ name }) => name)
    : [];

/**
 * Create a custom redactor with additional patterns.
 */
export const createCustomRedactor = (
  additionalPatterns: readonly SecretPattern[]
): CustomRedactor => {
  const allPatterns: readonly CompiledPattern[] = [
    ...COMPILED_PATTERNS,
    ...additionalPatterns.map(compilePattern),
  ];

  const redact = (text: string): string => {
    if (!isNonEmptyString(text)) {
      return text;
    }
    return reducePatterns(allPatterns, truncateWithLog(text, REDACTION_DEFAULTS.MAX_INPUT_SIZE))
      .text;
  };

  const redactWithStats = (text: string): CustomRedactionResult => {
    if (!isNonEmptyString(text)) {
      return createEmptyResult(text);
    }
    return reducePatterns(allPatterns, truncateWithLog(text, REDACTION_DEFAULTS.MAX_INPUT_SIZE));
  };

  const redactor = redact as CustomRedactor;
  redactor.withStats = redactWithStats;

  return redactor;
};

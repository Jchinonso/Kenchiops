/**
 * Response Parser Validation
 *
 * Field extractors, annotation parsing, and validation utilities
 * for LLM response processing.
 *
 * @module llm/responseParserValidation
 */

import type {
  LLMAnalysisResult,
  LLMCodeAnnotation,
  FailureCategory,
  PipelinePhase,
} from "../core/types.js";
import type { RawAnnotation, RawSecondaryFinding, ConfidenceLevel } from "./types.js";

export type { RawAnnotation, RawSecondaryFinding, ConfidenceLevel } from "./types.js";

// ==================== Field Extractors ====================

/**
 * Extracts a string field with a default value
 */
export const extractString = <T extends string>(value: unknown, defaultValue: T): T =>
  (typeof value === "string" && value.length > 0 ? value : defaultValue) as T;

/**
 * Extracts an optional string field
 */
export const extractOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

/**
 * Extracts an array field with a default value.
 */
export const extractArray = <T>(value: unknown, defaultValue: T[]): T[] =>
  Array.isArray(value) ? (value as T[]) : defaultValue;

/**
 * Extracts an optional field with a default value
 */
export const extractOptional = <T>(value: unknown, defaultValue: T | undefined): T | undefined =>
  value !== null && value !== undefined ? (value as T) : defaultValue;

/**
 * Normalizes string input for enum-like comparisons.
 */
export const normalizeInput = (value: unknown): string | null =>
  typeof value === "string" ? value.trim().toLowerCase() : null;

// ==================== Annotation Parsing ====================

/**
 * File location patterns for different languages/frameworks.
 */
const FILE_LOCATION_PATTERNS: readonly RegExp[] = [
  // Pattern 1: file.ext:line:col or file.ext:line
  /([^\s:()]+\.[a-zA-Z]{1,5}):(\d+)(?::\d+)?/,
  // Pattern 2: at ... (file.ext:line)
  /\(([^()]+\.[a-zA-Z]{1,5}):(\d+)(?::\d+)?\)/,
  // Pattern 3: File "path/file.py", line N (Python)
  /File "([^"]+)", line (\d+)/,
  // Pattern 4: path/file.ext(line) - MSBuild/C# style
  /([^\s()]+\.[a-zA-Z]{1,5})\((\d+)(?:,\d+)?\)/,
];

/**
 * File path pattern without line number (requires path separators).
 */
const FILE_PATH_ONLY_PATTERN = /([^\s:()]*[\\/][^\s:()]+\.[a-zA-Z0-9]+)(?=$|[\s:()])/;

/**
 * Tries to match a pattern against text and extract file location.
 */
const tryMatchPattern = (text: string, pattern: RegExp): { path: string; line: number } | null => {
  const match = text.match(pattern);
  if (!match) {
    return null;
  }
  const line = parseInt(match[2], 10);
  return line > 0 ? { path: match[1], line } : null;
};

/**
 * Attempts to extract file path and line number from a snippet or evidence_id.
 * Looks for common patterns like "file.ext:123" or "at Module.function (file.ext:123)"
 *
 * @param text - The text to parse (snippet or evidence content)
 * @returns Extracted path and line, or null if not found
 */
export const extractFileLocation = (text: string): { path: string; line: number } | null => {
  // Use reduce to find first matching pattern
  const location = FILE_LOCATION_PATTERNS.reduce<{ path: string; line: number } | null>(
    (found, pattern) => found ?? tryMatchPattern(text, pattern),
    null
  );

  if (location) {
    return location;
  }

  const pathMatch = text.match(FILE_PATH_ONLY_PATTERN);
  if (pathMatch) {
    return { path: pathMatch[1], line: 0 };
  }

  return null;
};

/**
 * Validates and converts an annotation to the standard format.
 *
 * @param annotation - Raw annotation from AI
 * @returns Validated annotation or null if invalid
 */
export const validateAnnotation = (annotation: unknown): LLMCodeAnnotation | null => {
  if (!annotation || typeof annotation !== "object") {
    return null;
  }

  const ann = annotation as RawAnnotation;
  const evidenceId = typeof ann.evidence_id === "string" ? ann.evidence_id : null;
  const snippet = typeof ann.snippet === "string" ? ann.snippet : null;
  const explanation = typeof ann.explanation === "string" ? ann.explanation : null;

  // Snippet is required
  if (!snippet) {
    return null;
  }

  // Try to extract file location from the snippet
  const location = extractFileLocation(snippet);

  // Build the message combining snippet and explanation
  const message = explanation ? `${snippet}\n\n${explanation}` : snippet;

  return {
    path: location?.path ?? "unknown",
    line: location?.line ?? 0,
    level: "failure" as const,
    message,
    title: evidenceId ?? "Error",
  };
};

/**
 * Parses annotations array from AI response.
 *
 * @param rawAnnotations - Raw annotations array from AI
 * @returns Validated array of code annotations
 */
export const parseAnnotations = (rawAnnotations: unknown): LLMCodeAnnotation[] => {
  if (!Array.isArray(rawAnnotations)) {
    return [];
  }

  return rawAnnotations
    .map((annotation) => validateAnnotation(annotation))
    .filter((result): result is LLMCodeAnnotation => result !== null);
};

/**
 * Formats a single secondary finding into a string.
 *
 * @param finding - Raw finding from AI response
 * @returns Formatted finding string or null if invalid
 */
const formatSecondaryFinding = (finding: unknown): string | null => {
  if (!finding || typeof finding !== "object") {
    return null;
  }

  const rawFinding = finding as RawSecondaryFinding;
  const issue = typeof rawFinding.issue === "string" ? rawFinding.issue : null;

  if (!issue) {
    return null;
  }

  const evidenceId =
    typeof rawFinding.evidence_id === "string" ? ` [${rawFinding.evidence_id}]` : "";
  return `${issue}${evidenceId}`;
};

/**
 * Parses secondary findings into uncertainties format.
 *
 * @param rawFindings - Raw secondary_findings array from AI
 * @returns Array of finding strings
 */
export const parseSecondaryFindings = (rawFindings: unknown): string[] => {
  if (!Array.isArray(rawFindings)) {
    return [];
  }

  return rawFindings
    .map((finding) => formatSecondaryFinding(finding))
    .filter((result): result is string => result !== null);
};

// ==================== Validation Sets and Functions ====================

/**
 * Valid confidence levels
 */
export const VALID_CONFIDENCE_LEVELS = new Set(["low", "medium", "high"] as const);

/**
 * Valid failure categories
 */
export const VALID_CATEGORIES: ReadonlySet<FailureCategory> = new Set<FailureCategory>([
  "dependency",
  "build",
  "test",
  "runtime",
  "config",
  "infra",
  "unknown",
]);

/**
 * Valid pipeline phases
 */
export const VALID_PHASES: ReadonlySet<PipelinePhase> = new Set<PipelinePhase>([
  "dependency",
  "build",
  "test",
  "deploy",
  "runtime",
  "unknown",
]);

/**
 * Maps simplified confidence to full confidence scale
 */
export const mapConfidence = (confidence: unknown): LLMAnalysisResult["confidence"] => {
  const normalized = normalizeInput(confidence);
  if (normalized && VALID_CONFIDENCE_LEVELS.has(normalized as ConfidenceLevel)) {
    const mapping: Record<ConfidenceLevel, LLMAnalysisResult["confidence"]> = {
      low: "low",
      medium: "medium",
      high: "high",
    };
    return mapping[normalized as ConfidenceLevel];
  }
  return "medium";
};

/**
 * Validates category field
 */
export const validateCategory = (category: unknown): FailureCategory =>
  (() => {
    const normalized = normalizeInput(category);
    return normalized && VALID_CATEGORIES.has(normalized as FailureCategory)
      ? (normalized as FailureCategory)
      : "unknown";
  })();

/**
 * Validates phase field
 */
export const validatePhase = (phase: unknown): PipelinePhase =>
  (() => {
    const normalized = normalizeInput(phase);
    return normalized && VALID_PHASES.has(normalized as PipelinePhase)
      ? (normalized as PipelinePhase)
      : "unknown";
  })();

/**
 * OpenAI Response Parser
 *
 * Parses and validates LLM responses into structured analysis results.
 * Handles JSON extraction, field validation, and safe type conversion.
 *
 * @module openaiClient/responseParser
 */

import { LLMError } from "../core/errors.js";
import { OPENAI_MESSAGES } from "../constants/index.js";
import type { LLMAnalysisResult } from "../core/types.js";

// ==================== Types ====================

/**
 * Raw annotation structure from AI response
 */
interface RawAnnotation {
  readonly path?: unknown;
  readonly line?: unknown;
  readonly level?: unknown;
  readonly message?: unknown;
  readonly title?: unknown;
}

/**
 * Raw dependency change structure from AI response
 */
interface RawDependencyChange {
  readonly name?: unknown;
  readonly type?: unknown;
  readonly oldVersion?: unknown;
  readonly newVersion?: unknown;
  readonly ecosystem?: unknown;
}

/**
 * Raw build config change structure from AI response
 */
interface RawBuildConfigChange {
  readonly file?: unknown;
  readonly changeType?: unknown;
  readonly summary?: unknown;
}

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
 * Returns mutable array for compatibility with existing LLMAnalysisResult types.
 */
export const extractArray = <T>(value: unknown, defaultValue: T[]): T[] =>
  Array.isArray(value) ? (value as T[]) : defaultValue;

/**
 * Extracts an optional field with a default value
 */
export const extractOptional = <T>(value: unknown, defaultValue: T | undefined): T | undefined =>
  value !== null && value !== undefined ? (value as T) : defaultValue;

// ==================== Annotation Parsing ====================

/**
 * Valid annotation levels
 */
const VALID_ANNOTATION_LEVELS = new Set(["failure", "warning", "notice"] as const);
type AnnotationLevel = "failure" | "warning" | "notice";

/**
 * Validates and normalizes a code annotation from AI response.
 *
 * @param annotation - Raw annotation object from AI
 * @returns Validated annotation or null if invalid
 */
export const validateCodeAnnotation = (
  annotation: unknown
): NonNullable<LLMAnalysisResult["codeAnnotations"]>[number] | null => {
  if (!annotation || typeof annotation !== "object") {
    return null;
  }

  const ann = annotation as RawAnnotation;
  const path = typeof ann.path === "string" ? ann.path : null;
  const line = typeof ann.line === "number" ? ann.line : null;
  const level = typeof ann.level === "string" ? ann.level : "warning";
  const message = typeof ann.message === "string" ? ann.message : null;

  // Path and message are required
  if (!path || !message) {
    return null;
  }

  const validLevel: AnnotationLevel = VALID_ANNOTATION_LEVELS.has(level as AnnotationLevel)
    ? (level as AnnotationLevel)
    : "warning";

  return {
    path,
    line: line ?? 1,
    level: validLevel,
    message,
    title: typeof ann.title === "string" ? ann.title : undefined,
  };
};

/**
 * Parses code annotations array from AI response.
 * Uses reduce for single-pass filtering to avoid nested iteration.
 *
 * @param rawAnnotations - Raw annotations array from AI
 * @returns Validated array of code annotations
 */
export const parseCodeAnnotations = (
  rawAnnotations: unknown
): LLMAnalysisResult["codeAnnotations"] => {
  if (!Array.isArray(rawAnnotations)) {
    return [];
  }

  return rawAnnotations.reduce<NonNullable<LLMAnalysisResult["codeAnnotations"]>>(
    (validated, annotation) => {
      const result = validateCodeAnnotation(annotation);
      if (result !== null) {
        validated.push(result);
      }
      return validated;
    },
    []
  );
};

// ==================== Dependency Change Parsing ====================

/**
 * Valid dependency change types
 */
const VALID_DEPENDENCY_TYPES = new Set(["added", "removed", "updated"] as const);
type DependencyChangeType = "added" | "removed" | "updated";

/**
 * Validates and normalizes a detected dependency change from AI response.
 *
 * @param change - Raw dependency change object from AI
 * @returns Validated dependency change or null if invalid
 */
export const validateDependencyChange = (
  change: unknown
): NonNullable<LLMAnalysisResult["detectedDependencyChanges"]>[number] | null => {
  if (!change || typeof change !== "object") {
    return null;
  }

  const dep = change as RawDependencyChange;
  const name = typeof dep.name === "string" ? dep.name : null;
  const type = typeof dep.type === "string" ? dep.type : null;

  if (!name || !type || !VALID_DEPENDENCY_TYPES.has(type as DependencyChangeType)) {
    return null;
  }

  return {
    name,
    type: type as DependencyChangeType,
    oldVersion: typeof dep.oldVersion === "string" ? dep.oldVersion : undefined,
    newVersion: typeof dep.newVersion === "string" ? dep.newVersion : undefined,
    ecosystem: typeof dep.ecosystem === "string" ? dep.ecosystem : undefined,
  };
};

/**
 * Parses detected dependency changes array from AI response.
 * Uses reduce for single-pass filtering to avoid nested iteration.
 *
 * @param rawChanges - Raw dependency changes array from AI
 * @returns Validated array of dependency changes
 */
export const parseDependencyChanges = (
  rawChanges: unknown
): LLMAnalysisResult["detectedDependencyChanges"] => {
  if (!Array.isArray(rawChanges)) {
    return [];
  }

  return rawChanges.reduce<NonNullable<LLMAnalysisResult["detectedDependencyChanges"]>>(
    (validated, change) => {
      const result = validateDependencyChange(change);
      if (result !== null) {
        validated.push(result);
      }
      return validated;
    },
    []
  );
};

// ==================== Build Config Change Parsing ====================

/**
 * Valid build config change types
 */
const VALID_CONFIG_CHANGE_TYPES = new Set(["added", "modified", "deleted"] as const);
type ConfigChangeType = "added" | "modified" | "deleted";

/**
 * Validates and normalizes a detected build config change from AI response.
 *
 * @param change - Raw build config change object from AI
 * @returns Validated build config change or null if invalid
 */
export const validateBuildConfigChange = (
  change: unknown
): NonNullable<LLMAnalysisResult["detectedBuildConfigChanges"]>[number] | null => {
  if (!change || typeof change !== "object") {
    return null;
  }

  const cfg = change as RawBuildConfigChange;
  const file = typeof cfg.file === "string" ? cfg.file : null;
  const changeType = typeof cfg.changeType === "string" ? cfg.changeType : null;
  const summary = typeof cfg.summary === "string" ? cfg.summary : null;

  if (
    !file ||
    !changeType ||
    !summary ||
    !VALID_CONFIG_CHANGE_TYPES.has(changeType as ConfigChangeType)
  ) {
    return null;
  }

  return {
    file,
    changeType: changeType as ConfigChangeType,
    summary,
  };
};

/**
 * Parses detected build config changes array from AI response.
 * Uses reduce for single-pass filtering to avoid nested iteration.
 *
 * @param rawChanges - Raw build config changes array from AI
 * @returns Validated array of build config changes
 */
export const parseBuildConfigChanges = (
  rawChanges: unknown
): LLMAnalysisResult["detectedBuildConfigChanges"] => {
  if (!Array.isArray(rawChanges)) {
    return [];
  }

  return rawChanges.reduce<NonNullable<LLMAnalysisResult["detectedBuildConfigChanges"]>>(
    (validated, change) => {
      const result = validateBuildConfigChange(change);
      if (result !== null) {
        validated.push(result);
      }
      return validated;
    },
    []
  );
};

// ==================== Main Parser ====================

/**
 * Extracts JSON from response content (handles markdown-wrapped JSON).
 *
 * @param responseContent - Raw response content
 * @returns Extracted JSON string
 * @throws {LLMError} If no JSON is found
 */
export const extractJsonFromResponse = (responseContent: string): string => {
  const match = responseContent.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new LLMError(OPENAI_MESSAGES.NO_JSON_FOUND);
  }
  return match[0];
};

/**
 * Creates LLM analysis result from parsed JSON object.
 *
 * @param parsed - Parsed JSON object
 * @param eventId - Event ID for the analysis
 * @returns LLM analysis result with required fields
 */
export const createAnalysisFromParsed = (
  parsed: Record<string, unknown>,
  eventId: string
): LLMAnalysisResult => ({
  eventId,
  summary: extractString(parsed.summary, OPENAI_MESSAGES.NO_SUMMARY),
  identifiedCause: extractOptionalString(parsed.identifiedCause),
  impactAssessment: extractOptional(
    parsed.impactAssessment,
    undefined
  ) as LLMAnalysisResult["impactAssessment"],
  confidence: extractString(parsed.confidence, "medium") as LLMAnalysisResult["confidence"],
  confidenceScore: undefined, // Will be calculated by safety.ts
  reasoning: extractString(parsed.reasoning, ""),
  codeAnnotations: parseCodeAnnotations(parsed.codeAnnotations),
  recommendedActions: extractArray(
    parsed.recommendedActions,
    []
  ) as LLMAnalysisResult["recommendedActions"],
  uncertainties: extractArray(parsed.uncertainties, []) as string[],
  evidenceUsed: extractArray(parsed.evidenceUsed, []) as LLMAnalysisResult["evidenceUsed"],
  relatedIncidents: extractArray(parsed.relatedIncidents, []) as string[],
  nextSteps: extractArray(parsed.nextSteps, []) as string[],
  analyzedAt: new Date().toISOString(),
  // AI-extracted structured data
  detectedDependencyChanges: parseDependencyChanges(parsed.detectedDependencyChanges),
  detectedBuildConfigChanges: parseBuildConfigChanges(parsed.detectedBuildConfigChanges),
});

/**
 * Parses OpenAI response and creates LLM analysis result.
 *
 * @param responseContent - Raw response content from OpenAI
 * @param eventId - Event ID for the analysis
 * @returns Parsed and validated LLM analysis result
 * @throws {LLMError} If parsing fails
 */
export const parseOpenAIResponse = (
  responseContent: string,
  eventId: string
): LLMAnalysisResult => {
  const jsonString = extractJsonFromResponse(responseContent);
  const parsed = JSON.parse(jsonString) as Record<string, unknown>;
  return createAnalysisFromParsed(parsed, eventId);
};

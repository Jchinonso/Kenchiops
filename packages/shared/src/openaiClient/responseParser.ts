/**
 * OpenAI Response Parser
 *
 * Parses and validates LLM responses from the language-agnostic
 * incident analysis format into structured analysis results.
 *
 * New Schema:
 * {
 *   "root_cause": "...",
 *   "confidence": "low|medium|high",
 *   "annotations": [{ "evidence_id": "...", "snippet": "...", "explanation": "..." }],
 *   "next_steps": ["..."],
 *   "secondary_findings": [{ "issue": "...", "evidence_id": "..." }]
 * }
 *
 * @module openaiClient/responseParser
 */

import { LLMError } from "../core/errors.js";
import { OPENAI_MESSAGES } from "../constants/index.js";
import type {
  LLMAnalysisResult,
  LLMCodeAnnotation,
  FailureCategory,
  PipelinePhase,
} from "../core/types.js";

// ==================== Types ====================

/**
 * Raw annotation structure from AI response
 */
interface RawAnnotation {
  readonly evidence_id?: unknown;
  readonly snippet?: unknown;
  readonly explanation?: unknown;
}

/**
 * Raw secondary finding from AI response
 */
interface RawSecondaryFinding {
  readonly issue?: unknown;
  readonly evidence_id?: unknown;
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
const normalizeInput = (value: unknown): string | null =>
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
const extractFileLocation = (text: string): { path: string; line: number } | null => {
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

  return rawAnnotations.reduce<LLMCodeAnnotation[]>((validated, annotation) => {
    const result = validateAnnotation(annotation);
    if (result !== null) {
      validated.push(result);
    }
    return validated;
  }, []);
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

  return rawFindings.reduce<string[]>((findings, finding) => {
    if (finding && typeof finding === "object") {
      const f = finding as RawSecondaryFinding;
      const issue = typeof f.issue === "string" ? f.issue : null;
      const evidenceId = typeof f.evidence_id === "string" ? ` [${f.evidence_id}]` : "";
      if (issue) {
        findings.push(`${issue}${evidenceId}`);
      }
    }
    return findings;
  }, []);
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
  const extracted = extractBalancedJson(responseContent);
  if (!extracted) {
    throw new LLMError(OPENAI_MESSAGES.NO_JSON_FOUND);
  }
  return extracted;
};

/**
 * Extracts the first balanced JSON object from text.
 */
const extractBalancedJson = (responseContent: string): string | null => {
  const initialState = {
    depth: 0,
    startIndex: -1,
    endIndex: null as number | null,
    isInString: false,
    isEscaped: false,
  };

  const result = Array.from(responseContent).reduce((state, char, index) => {
    if (state.endIndex !== null) {
      return state;
    }

    if (state.isInString) {
      if (state.isEscaped) {
        return { ...state, isEscaped: false };
      }
      if (char === "\\") {
        return { ...state, isEscaped: true };
      }
      if (char === '"') {
        return { ...state, isInString: false };
      }
      return state;
    }

    if (char === '"') {
      return { ...state, isInString: true };
    }

    if (char === "{") {
      return {
        ...state,
        depth: state.depth + 1,
        startIndex: state.depth === 0 ? index : state.startIndex,
      };
    }

    if (char === "}") {
      if (state.depth > 0) {
        const nextDepth = state.depth - 1;
        const endIndex = nextDepth === 0 && state.startIndex !== -1 ? index : null;
        return {
          ...state,
          depth: nextDepth,
          endIndex,
        };
      }
    }

    return state;
  }, initialState);

  if (result.endIndex !== null && result.startIndex !== -1) {
    return responseContent.slice(result.startIndex, result.endIndex + 1);
  }

  return null;
};

/**
 * Parses a JSON object from response content.
 */
const parseJsonObject = (responseContent: string): Record<string, unknown> => {
  const trimmed = responseContent.trim();
  const normalized = normalizeJsonObject(trimmed);

  if (normalized) {
    return normalized;
  }

  const jsonString = extractJsonFromResponse(trimmed);
  return JSON.parse(jsonString) as Record<string, unknown>;
};

/**
 * Attempts to parse a JSON object directly from a string.
 */
const normalizeJsonObject = (content: string): Record<string, unknown> | null => {
  if (!content.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
};

/**
 * Valid confidence levels
 */
const VALID_CONFIDENCE_LEVELS = new Set(["low", "medium", "high"] as const);
type ConfidenceLevel = "low" | "medium" | "high";

/**
 * Valid failure categories
 */
const VALID_CATEGORIES: ReadonlySet<FailureCategory> = new Set([
  "dependency",
  "compile",
  "test",
  "runtime",
  "config",
  "infra",
  "unknown",
]);

/**
 * Valid pipeline phases
 */
const VALID_PHASES: ReadonlySet<PipelinePhase> = new Set([
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
const mapConfidence = (confidence: unknown): LLMAnalysisResult["confidence"] => {
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
const validateCategory = (category: unknown): FailureCategory =>
  (() => {
    const normalized = normalizeInput(category);
    return normalized && VALID_CATEGORIES.has(normalized as FailureCategory)
      ? (normalized as FailureCategory)
      : "unknown";
  })();

/**
 * Validates phase field
 */
const validatePhase = (phase: unknown): PipelinePhase =>
  (() => {
    const normalized = normalizeInput(phase);
    return normalized && VALID_PHASES.has(normalized as PipelinePhase)
      ? (normalized as PipelinePhase)
      : "unknown";
  })();

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
): LLMAnalysisResult => {
  const rootCause = extractString(parsed.root_cause, OPENAI_MESSAGES.NO_SUMMARY);
  const confidence = mapConfidence(parsed.confidence);
  const category = validateCategory(parsed.category);
  const phase = validatePhase(parsed.phase);
  const annotations = parseAnnotations(parsed.annotations);
  const nextSteps = extractArray(parsed.next_steps, []) as string[];
  const secondaryFindings = parseSecondaryFindings(parsed.secondary_findings);

  // Extract first sentence of root_cause as summary
  const summaryMatch = rootCause.match(/^[^.!?\n]+[.!?]?/);
  const summary = summaryMatch ? summaryMatch[0] : rootCause;

  // Build reasoning with category and phase context
  const reasoning = `[${category}/${phase}] ${rootCause}`;

  return {
    eventId,
    summary,
    identifiedCause: rootCause,
    impactAssessment: undefined,
    confidence,
    confidenceScore: undefined, // Will be calculated by safety.ts
    reasoning,
    codeAnnotations: annotations,
    recommendedActions: nextSteps.map((step, index) => ({
      description: step,
      priority: index === 0 ? "high" : "medium",
      actionType: "manual_investigation",
    })),
    uncertainties: secondaryFindings,
    evidenceUsed: [],
    relatedIncidents: [],
    nextSteps,
    analyzedAt: new Date().toISOString(),
    category,
    phase,
    detectedDependencyChanges: [],
    detectedBuildConfigChanges: [],
  };
};

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
  const parsed = parseJsonObject(responseContent);
  return createAnalysisFromParsed(parsed, eventId);
};

// ==================== Legacy Exports (for backwards compatibility) ====================

/**
 * @deprecated Use validateAnnotation instead
 */
export const validateSimplifiedAnnotation = validateAnnotation;

/**
 * @deprecated Use parseAnnotations instead
 */
export const parseSimplifiedAnnotations = parseAnnotations;

/**
 * @deprecated Use validateAnnotation instead
 */
export const validateCodeAnnotation = validateAnnotation;

/**
 * @deprecated Use parseAnnotations instead
 */
export const parseCodeAnnotations = parseAnnotations;

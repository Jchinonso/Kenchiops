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
  LLMDetectedDependencyChange,
  LLMDetectedBuildConfigChange,
} from "../core/types.js";

// Import from validation sub-module
import {
  extractString,
  extractArray,
  parseAnnotations,
  parseSecondaryFindings,
  mapConfidence,
  validateCategory,
  validatePhase,
} from "./responseParserValidation.js";

// Re-export validation utilities for backwards compatibility
export {
  extractString,
  extractOptionalString,
  extractArray,
  extractOptional,
  normalizeInput,
  extractFileLocation,
  validateAnnotation,
  parseAnnotations,
  parseSecondaryFindings,
  VALID_CONFIDENCE_LEVELS,
  VALID_CATEGORIES,
  VALID_PHASES,
  mapConfidence,
  validateCategory,
  validatePhase,
  type ConfidenceLevel,
  type RawAnnotation,
  type RawSecondaryFinding,
} from "./responseParserValidation.js";

// ==================== JSON Extraction ====================

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

// ==================== Dependency/Config Change Parsing ====================

const VALID_DEP_CHANGE_TYPES = new Set(["added", "removed", "updated"]);
const VALID_CONFIG_CHANGE_TYPES = new Set(["added", "modified", "deleted"]);

/**
 * Validates and parses a single dependency change from raw input.
 */
const parseDependencyChange = (raw: unknown): LLMDetectedDependencyChange | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const obj = raw as Record<string, unknown>;
  const name = typeof obj.name === "string" ? obj.name : null;
  const type =
    typeof obj.type === "string" && VALID_DEP_CHANGE_TYPES.has(obj.type) ? obj.type : null;

  if (!name || !type) {
    return null;
  }

  return {
    name,
    type: type as LLMDetectedDependencyChange["type"],
    oldVersion: typeof obj.oldVersion === "string" ? obj.oldVersion : undefined,
    newVersion: typeof obj.newVersion === "string" ? obj.newVersion : undefined,
    ecosystem: typeof obj.ecosystem === "string" ? obj.ecosystem : undefined,
  };
};

/**
 * Parses dependency changes array from parsed response.
 */
const parseDependencyChanges = (raw: unknown): readonly LLMDetectedDependencyChange[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => parseDependencyChange(item))
    .filter((change): change is LLMDetectedDependencyChange => change !== null);
};

/**
 * Validates and parses a single build config change from raw input.
 */
const parseBuildConfigChange = (raw: unknown): LLMDetectedBuildConfigChange | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const obj = raw as Record<string, unknown>;
  const file = typeof obj.file === "string" ? obj.file : null;
  const changeType =
    typeof obj.changeType === "string" && VALID_CONFIG_CHANGE_TYPES.has(obj.changeType)
      ? obj.changeType
      : null;
  const summary = typeof obj.summary === "string" ? obj.summary : null;

  if (!file || !changeType || !summary) {
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
const parseBuildConfigChanges = (raw: unknown): readonly LLMDetectedBuildConfigChange[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => parseBuildConfigChange(item))
    .filter((change): change is LLMDetectedBuildConfigChange => change !== null);
};

// ==================== Main Parser ====================

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
      // Generate unique actionType per step to prevent over-aggressive deduplication
      actionType: `llm_action_${index}_${step.slice(0, 20).replace(/\W+/g, "_").toLowerCase()}`,
    })),
    uncertainties: secondaryFindings,
    evidenceUsed: [],
    relatedIncidents: [],
    nextSteps,
    analyzedAt: new Date().toISOString(),
    category,
    phase,
    detectedDependencyChanges: parseDependencyChanges(parsed.detectedDependencyChanges),
    detectedBuildConfigChanges: parseBuildConfigChanges(parsed.detectedBuildConfigChanges),
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
export { validateAnnotation as validateSimplifiedAnnotation } from "./responseParserValidation.js";

/**
 * @deprecated Use parseAnnotations instead
 */
export { parseAnnotations as parseSimplifiedAnnotations } from "./responseParserValidation.js";

/**
 * @deprecated Use validateAnnotation instead
 */
export { validateAnnotation as validateCodeAnnotation } from "./responseParserValidation.js";

/**
 * @deprecated Use parseAnnotations instead
 */
export { parseAnnotations as parseCodeAnnotations } from "./responseParserValidation.js";

/**
 * LLM Response Parser
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
 * @module llm/responseParser
 */

import { createLogger } from "../core/logger.js";
import { LLM_MESSAGES } from "../constants/index.js";
import type { LLMAnalysisResult } from "../core/types.js";
import type { TestFailureLogShape, LintErrorLogShape, ActionPriority } from "./types.js";

// Import from sub-modules
import { parseJsonObject } from "./jsonExtraction.js";
import {
  parseDependencyChanges,
  parseBuildConfigChanges,
  parseTestFailures,
  parseLintErrors,
  parseChangeCorrelations,
} from "./structuredDataParsers.js";
import {
  extractString,
  extractArray,
  parseAnnotations,
  parseSecondaryFindings,
  mapConfidence,
  validateCategory,
  validatePhase,
} from "./responseParserValidation.js";

const logger = createLogger("response-parser");

// ==================== Constants ====================

/** Max characters to use for action type generation */
const ACTION_TYPE_MAX_CHARS = 20;

/** First sentence extraction pattern */
const FIRST_SENTENCE_PATTERN = /^[^.!?\n]+[.!?]?/;

// ==================== Re-exports ====================

// Re-export JSON extraction for external use
export { extractJsonFromResponse } from "./jsonExtraction.js";

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

// ==================== Logging Utilities ====================

/**
 * Builds sample failure data for logging.
 */
const buildSampleFailureLog = (
  testFailures: readonly TestFailureLogShape[]
): Record<string, unknown> | null => {
  const firstFailure = testFailures[0];
  if (!firstFailure) {
    return null;
  }

  return {
    testName: firstFailure.testName,
    hasExpected: firstFailure.expected !== undefined,
    hasActual: firstFailure.actual !== undefined,
    expected: firstFailure.expected,
    actual: firstFailure.actual,
    error: firstFailure.error,
  };
};

/**
 * Logs test failure extraction details for debugging.
 */
const logTestFailureExtraction = (
  eventId: string,
  rawTestFailures: unknown,
  testFailures: readonly TestFailureLogShape[],
  category: string,
  phase: string
): void => {
  logger.info("LLM test_failures extraction", {
    eventId,
    rawTestFailuresPresent: rawTestFailures !== undefined,
    rawTestFailuresType: Array.isArray(rawTestFailures) ? "array" : typeof rawTestFailures,
    rawTestFailuresCount: Array.isArray(rawTestFailures) ? rawTestFailures.length : 0,
    parsedTestFailuresCount: testFailures.length,
    category,
    phase,
    hasExpectedActual: testFailures.some(
      (failure) => failure.expected !== undefined || failure.actual !== undefined
    ),
    sampleFailure: buildSampleFailureLog(testFailures),
  });
};

/**
 * Logs lint error extraction details for debugging.
 */
const logLintErrorExtraction = (
  eventId: string,
  lintErrors: readonly LintErrorLogShape[]
): void => {
  if (lintErrors.length > 0) {
    logger.info("LLM lint_errors extraction", {
      eventId,
      count: lintErrors.length,
      sampleError: lintErrors[0],
    });
  }
};

/**
 * Logs raw test failures from LLM response for debugging.
 */
const logRawTestFailures = (eventId: string, rawFailures: unknown): void => {
  logger.info("Raw LLM test_failures response", {
    eventId,
    count: Array.isArray(rawFailures) ? rawFailures.length : 0,
    sample: Array.isArray(rawFailures) && rawFailures[0] ? rawFailures[0] : null,
  });
};

// ==================== Action Type Generation ====================

/**
 * Generates a unique action type string for deduplication.
 */
const generateActionType = (stepDescription: string, stepIndex: number): string => {
  const sanitized = stepDescription
    .slice(0, ACTION_TYPE_MAX_CHARS)
    .replace(/\W+/g, "_")
    .toLowerCase();
  return `llm_action_${stepIndex}_${sanitized}`;
};

/**
 * Normalizes a step item to a string description.
 * Handles both string format and object format (e.g., { description: "..." }).
 */
const normalizeStepToString = (step: unknown): string => {
  if (typeof step === "string") {
    return step;
  }
  if (step !== null && typeof step === "object") {
    const stepObj = step as Record<string, unknown>;
    if (typeof stepObj.description === "string") {
      return stepObj.description;
    }
    if (typeof stepObj.step === "string") {
      return stepObj.step;
    }
    if (typeof stepObj.action === "string") {
      return stepObj.action;
    }
  }
  return String(step);
};

/**
 * Maps next steps to recommended actions with priorities.
 * Handles both string[] and object[] formats from LLM responses.
 */
const mapNextStepsToActions = (
  nextSteps: readonly unknown[]
): ReadonlyArray<{ description: string; priority: ActionPriority; actionType: string }> =>
  nextSteps.map((step, stepIndex) => {
    const stepDescription = normalizeStepToString(step);
    return {
      description: stepDescription,
      priority: (stepIndex === 0 ? "high" : "medium") as ActionPriority,
      actionType: generateActionType(stepDescription, stepIndex),
    };
  });

// ==================== Summary Extraction ====================

/**
 * Extracts the first sentence from root cause as summary.
 */
const extractSummary = (rootCause: string): string => {
  const summaryMatch = rootCause.match(FIRST_SENTENCE_PATTERN);
  return summaryMatch ? summaryMatch[0] : rootCause;
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
  // Extract core fields
  const rootCause = extractString(parsed.root_cause, LLM_MESSAGES.NO_SUMMARY);
  const confidence = mapConfidence(parsed.confidence);
  const category = validateCategory(parsed.category);
  const phase = validatePhase(parsed.phase);
  const annotations = parseAnnotations(parsed.annotations);
  const rawNextSteps = extractArray(parsed.next_steps, []) as unknown[];
  const nextSteps = rawNextSteps.map(normalizeStepToString);
  const secondaryFindings = parseSecondaryFindings(parsed.secondary_findings);

  // Extract summary and build reasoning
  const summary = extractSummary(rootCause);
  const reasoning = `[${category}/${phase}] ${rootCause}`;

  // Parse structured data from LLM response
  const testFailures = parseTestFailures(parsed.test_failures);
  const lintErrors = parseLintErrors(parsed.lint_errors);
  const changeCorrelations = parseChangeCorrelations(parsed.change_correlations);

  // Extract test command if provided (LLM-generated based on detected framework)
  const testCommand =
    typeof parsed.test_command === "string" && parsed.test_command.trim()
      ? parsed.test_command.trim()
      : undefined;

  // Debug logging
  logTestFailureExtraction(eventId, parsed.test_failures, testFailures, category, phase);
  logLintErrorExtraction(eventId, lintErrors);

  return {
    eventId,
    summary,
    identifiedCause: rootCause,
    impactAssessment: undefined,
    confidence,
    confidenceScore: undefined, // Calculated by safety.ts
    reasoning,
    codeAnnotations: annotations,
    recommendedActions: mapNextStepsToActions(nextSteps),
    uncertainties: secondaryFindings,
    evidenceUsed: [],
    relatedIncidents: [],
    nextSteps,
    analyzedAt: new Date().toISOString(),
    category,
    phase,
    detectedDependencyChanges: parseDependencyChanges(parsed.detectedDependencyChanges),
    detectedBuildConfigChanges: parseBuildConfigChanges(parsed.detectedBuildConfigChanges),
    testFailures: testFailures.length > 0 ? testFailures : undefined,
    lintErrors: lintErrors.length > 0 ? lintErrors : undefined,
    testCommand,
    changeCorrelations: changeCorrelations.length > 0 ? changeCorrelations : undefined,
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
export const parseLLMResponse = (responseContent: string, eventId: string): LLMAnalysisResult => {
  const parsed = parseJsonObject(responseContent);

  // Debug: Log raw test_failures from LLM response
  if (parsed.test_failures !== undefined) {
    logRawTestFailures(eventId, parsed.test_failures);
  }

  return createAnalysisFromParsed(parsed, eventId);
};

// ==================== Legacy Exports ====================

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

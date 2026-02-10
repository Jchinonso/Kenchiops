/**
 * Base score determination from LLM confidence level.
 *
 * @module safety/scoring/confidenceScoring/baseScore
 */

import type { LLMConfidenceLevel } from "../../../core/types.js";
import type { BaseScoreResult } from "../../types.js";
import { BASE_CONFIDENCE_SCORES } from "../../../constants/index.js";
import { createLogger } from "../../../core/logger.js";
import { formatScore } from "../../helpers.js";
import { sanitizeForLog } from "./helpers.js";

const logger = createLogger("confidence-scoring");

// ==================== Type Guards ====================

/**
 * Valid LLM confidence levels for type-safe lookup.
 */
const VALID_CONFIDENCE_LEVELS: ReadonlySet<string> = new Set([
  "very_high",
  "high",
  "medium",
  "low",
  "very_low",
]);

/**
 * Type guard for valid LLM confidence level.
 */
const isValidConfidenceLevel = (value: unknown): value is LLMConfidenceLevel =>
  typeof value === "string" && VALID_CONFIDENCE_LEVELS.has(value);

// ==================== LLM Confidence Mapping ====================

/**
 * LLM confidence level to base score mapping.
 */
const CONFIDENCE_LEVEL_MAP: Readonly<Map<LLMConfidenceLevel, number>> = new Map([
  ["very_high", BASE_CONFIDENCE_SCORES.VERY_HIGH],
  ["high", BASE_CONFIDENCE_SCORES.HIGH],
  ["medium", BASE_CONFIDENCE_SCORES.MEDIUM],
  ["low", BASE_CONFIDENCE_SCORES.LOW],
  ["very_low", BASE_CONFIDENCE_SCORES.VERY_LOW],
]);

// ==================== Base Score Function ====================

/**
 * Determines base score from LLM's stated confidence level.
 * Logs unknown/invalid values for upstream bug detection.
 *
 * @param llmConfidence - LLM's stated confidence level
 * @returns Base score result with reasoning
 */
export const getBaseScore = (llmConfidence?: string): BaseScoreResult => {
  // Missing confidence → use default
  if (llmConfidence === undefined || llmConfidence === null || llmConfidence === "") {
    return {
      score: BASE_CONFIDENCE_SCORES.DEFAULT,
      reasoning: `Base score: ${formatScore(BASE_CONFIDENCE_SCORES.DEFAULT)} (LLM confidence: missing → default)`,
    };
  }

  // Valid confidence level → use mapped score
  if (isValidConfidenceLevel(llmConfidence)) {
    const score = CONFIDENCE_LEVEL_MAP.get(llmConfidence) ?? BASE_CONFIDENCE_SCORES.DEFAULT;
    return {
      score,
      reasoning: `Base score: ${formatScore(score)} (from LLM confidence: ${llmConfidence})`,
    };
  }

  // Unknown/invalid value → log (sanitized) and use default
  const sanitizedValue = sanitizeForLog(llmConfidence);
  logger.warn("Unknown LLM confidence level, using default", {
    providedValue: sanitizedValue,
    defaultScore: BASE_CONFIDENCE_SCORES.DEFAULT,
  });

  return {
    score: BASE_CONFIDENCE_SCORES.DEFAULT,
    reasoning: `Base score: ${formatScore(BASE_CONFIDENCE_SCORES.DEFAULT)} (LLM confidence: "${sanitizedValue}" → unknown, using default)`,
  };
};

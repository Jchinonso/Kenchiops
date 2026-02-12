/**
 * Types for GitHub Analysis Functions
 *
 * @module services/githubAnalysisTypes
 */

import type { LLMAnalysisResult, ConfidenceScoreResult, Event } from "@kenchi/shared";

/**
 * Analysis result with confidence scoring
 */
export interface AnalysisResult {
  readonly analysis: LLMAnalysisResult;
  readonly confidence: ConfidenceScoreResult;
  readonly event: Event;
}

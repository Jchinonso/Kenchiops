/**
 * Analysis Service Types
 *
 * Type definitions for the Slack bot analysis service.
 */

import type { Event, LLMAnalysisResult, ConfidenceScoreResult } from "@kenchi/shared";

/**
 * Analysis result with confidence scoring
 */
export interface AnalysisResult {
  readonly analysis: LLMAnalysisResult;
  readonly confidence: ConfidenceScoreResult;
  readonly event: Event;
}

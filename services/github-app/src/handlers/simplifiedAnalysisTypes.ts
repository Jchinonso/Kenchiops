/**
 * Types for Simplified Analysis Handler
 *
 * Defines interfaces for simplified CI failure analysis results
 * and API response structures.
 *
 * @module handlers/simplifiedAnalysisTypes
 */

import type { LLMAnalysisResult, GitHubCommentOutput, SlackMessageOutput } from "@kenchi/shared";

/**
 * Result of simplified CI failure analysis.
 */
export interface SimplifiedAnalysisResult {
  readonly success: boolean;
  readonly analysis?: LLMAnalysisResult;
  readonly githubComment?: GitHubCommentOutput;
  readonly slackMessage?: SlackMessageOutput;
  readonly error?: string;
  readonly metadata?: SimplifiedAnalysisMetadata;
}

/**
 * Metadata about the analysis process.
 */
export interface SimplifiedAnalysisMetadata {
  readonly originalLogSize: number;
  readonly processedLogSize: number;
  readonly wasTruncated: boolean;
  readonly secretsRedacted: number;
}

/**
 * API response structure from the analysis service.
 */
export interface AnalysisApiResponse {
  readonly analysis?: string;
  readonly identified_cause?: string;
  readonly confidence?: number;
  readonly recommended_actions?: readonly RecommendedActionResponse[];
  readonly full_analysis?: FullAnalysisResponse;
}

/**
 * Recommended action from API response.
 */
export interface RecommendedActionResponse {
  readonly actionType?: string;
  readonly description?: string;
  readonly reasoning?: string;
  readonly priority?: string;
}

/**
 * Full analysis from API response.
 */
export interface FullAnalysisResponse {
  readonly summary?: string;
  readonly identifiedCause?: string;
  readonly confidence?: string;
  readonly category?: string;
  readonly phase?: string;
  readonly codeAnnotations?: readonly AnalysisAnnotation[];
  readonly nextSteps?: readonly string[];
}

/**
 * Annotation from API response.
 */
export interface AnalysisAnnotation {
  readonly path?: string;
  readonly line?: number;
  readonly level?: string;
  readonly message?: string;
  readonly title?: string;
}

/**
 * Types for Combined Analysis Handler
 *
 * Defines interfaces for per-job CI failure analysis,
 * API response structures, and PR diff context.
 *
 * @module handlers/combinedAnalysisTypes
 */

import type { TestFailureInfo, LLMLintError, LineMapping, ParsedTestSummary } from "@kenchi/shared";

// ==================== API Response Types ====================

/**
 * Response from POST /api/analyze - job submission.
 */
export interface JobSubmissionResponse {
  readonly job_id: string;
  readonly status: "pending";
}

/**
 * Response from GET /api/jobs/:id - job status.
 */
export interface JobStatusResponse {
  readonly job_id: string;
  readonly status: "pending" | "processing" | "completed" | "failed";
  readonly result?: PerJobAnalysisApiResponse;
  readonly error?: string;
}

/**
 * Per-job API response structure.
 * Each job gets its own LLM analysis call.
 * full_analysis contains the LLMAnalysisResult with testFailures already in camelCase.
 */
export interface PerJobAnalysisApiResponse {
  readonly analysis?: string;
  readonly identified_cause?: string;
  readonly confidence?: number | string;
  readonly recommended_actions?: readonly RecommendedActionResponse[];
  readonly annotations?: readonly AnalysisAnnotation[];
  readonly full_analysis?: {
    readonly testFailures?: readonly TestFailureInfo[];
    readonly lintErrors?: readonly LLMLintError[];
    /** Command to run failing tests locally (LLM-generated based on detected framework) */
    readonly testCommand?: string;
  };
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
 * Annotation from API response.
 */
export interface AnalysisAnnotation {
  readonly path?: string;
  readonly line?: number;
  readonly level?: string;
  readonly message?: string;
  readonly title?: string;
}

// ==================== Analysis Result Types ====================

/**
 * Result of analyzing a single job.
 */
export interface JobAnalysisResult {
  readonly jobName: string;
  readonly jobLogs: string;
  readonly response: PerJobAnalysisApiResponse;
  /** LLM-extracted test failures with expected/actual values */
  readonly testFailures: readonly TestFailureInfo[];
  /** LLM-extracted lint/compile errors with specific symbols */
  readonly lintErrors: readonly LLMLintError[];
  /** Command to run failing tests locally (LLM-generated based on detected framework) */
  readonly testCommand?: string;
  /** V1.1: Line mappings for original line number recovery */
  readonly lineMappings: readonly LineMapping[];
  /** Deterministic test summary parsed from raw CI log via regex (not LLM-derived) */
  readonly parsedTestSummary?: ParsedTestSummary | null;
}

/**
 * Result type for per-job analysis with optional error info.
 */
export type AnalysisResultWithError = JobAnalysisResult & {
  readonly failed?: true;
  readonly error?: string;
};

// ==================== PR Diff Context ====================

/**
 * PR diff context for threading through analysis pipeline.
 * Contains diff, file list, and metadata for LLM analysis and PR comment enrichment.
 */
export interface PRDiffContext {
  readonly prNumber: number;
  readonly diff: string;
  readonly changedFiles: readonly string[];
  readonly title: string;
  readonly author: string;
  readonly baseBranch: string;
  readonly branch: string;
  readonly labels: readonly string[];
}

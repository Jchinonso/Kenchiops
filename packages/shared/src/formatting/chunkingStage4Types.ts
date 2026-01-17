/**
 * Stage 4: Final Analysis Types
 *
 * TypeScript interfaces for the final analysis stage of the CI log analysis pipeline.
 * Handles LLM-based root cause analysis and structured output generation.
 *
 * @module formatting/chunkingStage4Types
 */

import type { ArtifactSeverity, CIPlatformType } from "../constants/chunkingPipeline.js";

// ==================== Build Metadata ====================

/**
 * Build metadata passed to the final analyzer.
 */
export interface BuildMetadata {
  /** Repository name */
  readonly repo: string;
  /** Branch name */
  readonly branch: string;
  /** Full commit SHA */
  readonly commitSha: string;
  /** CI workflow name */
  readonly workflowName?: string;
  /** CI job name */
  readonly jobName?: string;
  /** CI platform */
  readonly ciPlatform: CIPlatformType;
  /** Process exit code */
  readonly exitCode: number;
  /** Build duration in seconds */
  readonly durationSeconds?: number;
  /** What triggered the build */
  readonly triggeredBy?: string;
  /** Link to the CI run */
  readonly runUrl?: string;
}

// ==================== Annotations ====================

/**
 * File annotation in the analysis response.
 */
export interface FileAnnotation {
  /** File path */
  readonly filePath: string;
  /** Line number (sanitized, after preprocessing) */
  readonly lineNumber: number;
  /** Original line number in raw log before preprocessing */
  readonly original_line_number?: number | null;
  /** Annotation message */
  readonly message: string;
  /** Evidence ID supporting this annotation */
  readonly evidenceId: string;
  /** Severity level */
  readonly severity: ArtifactSeverity;
}

// ==================== Recommended Actions ====================

/**
 * Recommended action in the analysis response.
 */
export interface RecommendedAction {
  /** Action to take */
  readonly action: string;
  /** Reason for this action */
  readonly reason: string;
  /** Whether this action is safe/reversible */
  readonly safe: boolean;
  /** Priority (one = highest) */
  readonly priority: number;
}

// ==================== Secondary Findings ====================

/**
 * Secondary finding in the analysis response.
 */
export interface SecondaryFinding {
  /** Summary of the finding */
  readonly summary: string;
  /** Evidence IDs supporting this finding */
  readonly evidenceIds: readonly string[];
  /** Severity level */
  readonly severity: ArtifactSeverity;
}

// ==================== Test Failures ====================

/**
 * Test failure detail in the analysis response.
 */
export interface TestFailureDetail {
  /** Full test name */
  readonly testName: string;
  /** Test suite name */
  readonly testSuite?: string;
  /** File path where test is defined */
  readonly filePath?: string;
  /** Line number */
  readonly lineNumber?: number;
  /** Expected value */
  readonly expected?: string | null;
  /** Actual value */
  readonly actual?: string | null;
  /** Error message */
  readonly errorMessage: string;
  /** Evidence ID */
  readonly evidenceId: string;
}

// ==================== Lint Errors ====================

/**
 * Lint error detail in the analysis response.
 */
export interface LintErrorDetail {
  /** File path */
  readonly filePath: string;
  /** Line number */
  readonly lineNumber: number;
  /** Column number */
  readonly column?: number;
  /** Rule or error code */
  readonly rule: string;
  /** Error message */
  readonly message: string;
  /** Evidence ID */
  readonly evidenceId: string;
}

// ==================== Root Cause ====================

/**
 * Root cause information in the analysis response.
 */
export interface RootCause {
  /** One-sentence summary */
  readonly summary: string;
  /** Two to three sentence detail */
  readonly detail: string;
  /** Evidence IDs supporting this conclusion */
  readonly evidenceIds: readonly string[];
}

// ==================== Analysis Metadata ====================

/**
 * Analysis metadata in the response.
 */
export interface AnalysisMetadata {
  /** Version of the analysis pipeline */
  readonly analysisVersion: string;
  /** Number of chunks processed */
  readonly chunksProcessed: number;
  /** Number of artifacts analyzed */
  readonly artifactsAnalyzed: number;
  /** Model used for final analysis */
  readonly modelUsed: string;
  /** Total processing time in milliseconds */
  readonly processingTimeMs: number;
}

// ==================== Analysis Response ====================

/**
 * The complete analysis response from the final analyzer.
 */
export interface AnalysisResponse {
  /** Root cause information */
  readonly rootCause: RootCause;
  /** Confidence level */
  readonly confidence: "high" | "medium" | "low";
  /** Failure category */
  readonly category: "dependency" | "build" | "test" | "deploy" | "runtime" | "infra" | "unknown";
  /** Pipeline phase where failure occurred */
  readonly phase: string;
  /** File annotations */
  readonly annotations: readonly FileAnnotation[];
  /** Recommended actions */
  readonly nextSteps: readonly RecommendedAction[];
  /** Secondary findings */
  readonly secondaryFindings: readonly SecondaryFinding[];
  /** Test failure details (when category is "test") */
  readonly testFailures?: readonly TestFailureDetail[];
  /** Lint error details (when category is "build") */
  readonly lintErrors?: readonly LintErrorDetail[];
  /** Analysis metadata */
  readonly metadata: AnalysisMetadata;
  /** True if fallback analysis was used due to extraction failure */
  readonly degraded_mode?: boolean;
}

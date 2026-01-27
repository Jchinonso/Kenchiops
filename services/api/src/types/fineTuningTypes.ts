/**
 * Fine-Tuning Service Type Definitions
 *
 * Types specific to the fine-tuning services in the API service.
 *
 * @module types/fineTuningTypes
 */

import type { DatasetStats, ExtractionResult } from "@kenchi/shared";

// ==================== Dataset Service Types ====================

/**
 * Options for extracting dataset.
 */
export interface ExtractDatasetOptions {
  readonly tenantId?: string;
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly minFeedbackCount?: number;
  readonly limit?: number;
}

/**
 * Extended extraction result with validation.
 */
export interface ExtendedExtractionResult extends ExtractionResult {
  readonly validation: {
    readonly valid: boolean;
    readonly issues: readonly string[];
  };
}

// ==================== Job Service Types ====================

/**
 * Options for starting a fine-tuning job.
 */
export interface StartJobOptions {
  readonly tenantId?: string;
  readonly epochs?: number;
  readonly suffix?: string;
  readonly dryRun?: boolean;
}

/**
 * Result of starting a fine-tuning job.
 */
export interface StartJobResult {
  readonly success: boolean;
  readonly jobId?: string;
  readonly status?: string;
  readonly fileId?: string;
  readonly model?: string;
  readonly datasetStats?: DatasetStats;
  readonly error?: string;
  readonly validationIssues?: readonly string[];
}

// ==================== Model Service Types ====================

/**
 * Options for A/B test configuration.
 */
export interface ABTestOptions {
  readonly controlVersion: string;
  readonly treatmentVersion: string;
  readonly treatmentPercentage: number;
}

// ==================== Stats Service Types ====================

/**
 * Fine-tuning statistics.
 */
export interface FineTuningStats {
  readonly totalFeedback: number;
  readonly positiveFeedback: number;
  readonly negativeFeedback: number;
  readonly feedbackLast7Days: number;
  readonly feedbackLast30Days: number;
  readonly activeModelVersions: number;
  readonly pendingJobs: number;
  readonly completedJobs: number;
  readonly lastJobCompletedAt?: string;
  readonly readyForTraining: boolean;
  readonly readyReason?: string;
}

// ==================== Evaluation Service Types ====================

/**
 * Evaluation metrics for a model.
 */
export interface ModelEvaluationMetrics {
  readonly modelVersionId: string;
  readonly totalAnalyses: number;
  readonly totalFeedback: number;
  readonly positiveRate: number;
  readonly negativeRate: number;
  readonly neutralRate: number;
  readonly averageConfidenceScore: number;
  readonly evaluatedAt: string;
}

/**
 * A/B test comparison result.
 */
export interface ABTestComparisonResult {
  readonly control: ModelEvaluationMetrics;
  readonly treatment: ModelEvaluationMetrics;
  readonly improvement: {
    readonly positiveRateDelta: number;
    readonly confidenceScoreDelta: number;
    readonly isSignificant: boolean;
  };
  readonly sampleSize: {
    readonly control: number;
    readonly treatment: number;
    readonly totalRequired: number;
  };
  readonly recommendation: "keep_treatment" | "keep_control" | "continue_testing";
}

/**
 * Evaluation run options.
 */
export interface EvaluationOptions {
  readonly modelVersionId: string;
  readonly tenantId?: string;
  readonly startDate?: Date;
  readonly endDate?: Date;
}

// ==================== Scheduler Service Types ====================

/**
 * Scheduler configuration.
 */
export interface SchedulerConfig {
  readonly pollIntervalMs: number;
  readonly maxConcurrentPolls: number;
  readonly autoTriggerEnabled: boolean;
  readonly autoTriggerCheckIntervalMs: number;
  readonly minDaysBetweenJobs: number;
}

/**
 * Scheduler state.
 */
export interface SchedulerState {
  isRunning: boolean;
  intervalId: NodeJS.Timeout | null;
  trackedJobs: Set<string>;
  processedCompletions: Set<string>;
  lastAutoTriggerCheck: number;
  lastJobTriggeredAt: number | null;
}

/**
 * Scheduler status response.
 */
export interface SchedulerStatus {
  readonly isRunning: boolean;
  readonly trackedJobCount: number;
  readonly processedCompletionCount: number;
  readonly autoTriggerEnabled: boolean;
  readonly lastAutoTriggerCheck: string | null;
  readonly lastJobTriggeredAt: string | null;
}

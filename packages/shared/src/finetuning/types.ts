/**
 * Fine-Tuning Types
 *
 * Type definitions for fine-tuning operations, dataset building,
 * model versioning, and OpenAI integration.
 *
 * @module finetuning/types
 */

import type { Event, Evidence, LLMAnalysisResult, ActionProposal } from "../core/types.js";
import type { FeedbackRecord } from "../database/index.js";
import type { FineTuningStatus } from "../constants/index.js";

// ==================== Dataset Builder Types ====================

/**
 * Training example for fine-tuning.
 */
export interface TrainingExample {
  readonly id: string;
  readonly eventType: string;
  readonly evidenceSummary: string;
  readonly analysisOutput: string;
  readonly feedbackLabel: FeedbackQualityLabel;
  readonly metadata: TrainingExampleMetadata;
}

/**
 * Quality label derived from feedback.
 */
export type FeedbackQualityLabel = "positive" | "negative" | "neutral" | "unlabeled";

/**
 * Metadata for training example provenance.
 */
export interface TrainingExampleMetadata {
  readonly analysisId: string;
  readonly eventId: string;
  readonly confidenceScore: number;
  readonly feedbackCount: number;
  readonly ragDocsUsed: number;
  readonly actionsProposed: number;
  readonly createdAt: string;
}

/**
 * OpenAI fine-tuning format (chat completion).
 */
export interface OpenAITrainingRow {
  readonly messages: readonly OpenAIMessage[];
}

/**
 * OpenAI message in chat format.
 */
export interface OpenAIMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

/**
 * Input for building a training example.
 */
export interface TrainingExampleInput {
  readonly event: Event;
  readonly evidence: Evidence;
  readonly analysis: LLMAnalysisResult;
  readonly feedback: readonly FeedbackRecord[];
  readonly actions?: readonly ActionProposal[];
}

/**
 * Dataset statistics.
 */
export interface DatasetStats {
  readonly totalExamples: number;
  readonly positiveExamples: number;
  readonly negativeExamples: number;
  readonly neutralExamples: number;
  readonly unlabeledExamples: number;
  readonly averageConfidence: number;
  readonly eventTypeDistribution: Record<string, number>;
}

/**
 * Options for dataset building.
 */
export interface DatasetBuildOptions {
  readonly includeUnlabeled?: boolean;
  readonly minConfidence?: number;
  readonly maxExamples?: number;
  readonly eventTypes?: readonly string[];
}

// ==================== Dataset Extractor Types ====================

/**
 * Raw analysis row from database with aggregation_key for feedback linkage.
 */
export interface AnalysisRow {
  readonly id: string;
  readonly aggregation_key: string;
  readonly event_type: string;
  readonly event_source: string;
  readonly event_severity: string | null;
  readonly summary: string;
  readonly identified_cause: string | null;
  readonly diagnosis_confidence: number;
  readonly full_analysis: Record<string, unknown> | null;
  readonly created_at: string;
}

/**
 * Raw feedback row from database.
 */
export interface ExtractorFeedbackRow {
  readonly id: string;
  readonly analysis_id: string;
  readonly feedback_type: string;
  readonly user_id: string;
  readonly tenant_id: string;
  readonly created_at: string;
}

/**
 * Dataset extraction options.
 */
export interface ExtractionOptions {
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly tenantId?: string;
  readonly minFeedbackCount?: number;
  readonly limit?: number;
}

/**
 * Extraction result with dataset and metadata.
 */
export interface ExtractionResult {
  readonly examples: readonly TrainingExample[];
  readonly stats: DatasetStats;
  readonly jsonl: string;
  readonly extractedAt: string;
  readonly queryParams: ExtractionOptions;
}

/**
 * Validation check definition for dataset quality.
 */
export interface ValidationCheck {
  readonly condition: (result: ExtractionResult, labeledTotal: number) => boolean;
  readonly message: (result: ExtractionResult, labeledTotal: number) => string;
}

// ==================== Fine-Tuning Client Types ====================

/**
 * Options for creating a fine-tuning job.
 */
export interface FineTuningJobOptions {
  /** Training file ID from OpenAI Files API */
  readonly trainingFileId: string;
  /** Optional validation file ID */
  readonly validationFileId?: string;
  /** Base model to fine-tune */
  readonly model?: string;
  /** Number of epochs to train */
  readonly epochs?: number;
  /** Learning rate multiplier */
  readonly learningRateMultiplier?: number;
  /** Batch size */
  readonly batchSize?: number;
  /** Optional suffix for the fine-tuned model name */
  readonly suffix?: string;
}

/**
 * Result of creating a fine-tuning job.
 */
export interface FineTuningJobResult {
  readonly jobId: string;
  readonly status: FineTuningStatus;
  readonly model: string;
  readonly trainingFileId: string;
  readonly validationFileId?: string;
  readonly createdAt: string;
  readonly fineTunedModel?: string;
  readonly error?: string;
}

/**
 * Options for uploading a training file.
 */
export interface FileUploadOptions {
  /** JSONL content to upload */
  readonly content: string;
  /** Optional filename */
  readonly filename?: string;
}

/**
 * Result of uploading a file.
 */
export interface FileUploadResult {
  readonly fileId: string;
  readonly filename: string;
  readonly bytes: number;
  readonly createdAt: string;
  readonly purpose: string;
}

/**
 * Fine-tuning workflow result.
 */
export interface FineTuningWorkflowResult {
  readonly job: FineTuningJobResult;
  readonly fileId: string;
}

/**
 * Callback type for progress updates.
 */
export type ProgressCallback = (job: FineTuningJobResult) => void;

// ==================== Model Versioning Types ====================

/**
 * Model version configuration.
 */
export interface ModelVersion {
  readonly id: string;
  readonly name: string;
  readonly modelId: string;
  readonly description?: string;
  readonly createdAt: string;
  readonly isBaseline: boolean;
  readonly metadata?: ModelMetadata;
}

/**
 * Model metadata for tracking provenance.
 */
export interface ModelMetadata {
  readonly trainingDatasetId?: string;
  readonly trainingExamplesCount?: number;
  readonly evaluationMetrics?: EvaluationMetrics;
  readonly parentModelId?: string;
}

/**
 * Model evaluation metrics.
 */
export interface EvaluationMetrics {
  readonly accuracy?: number;
  readonly helpfulRate?: number;
  readonly recallAt5?: number;
  readonly mrr?: number;
  readonly humanReviewScore?: number;
}

/**
 * Feature flag configuration for model selection.
 */
export interface ModelFeatureFlags {
  readonly defaultModelVersion: string;
  readonly rollbackEnabled: boolean;
  readonly rollbackModelVersion: string;
  readonly abTestEnabled: boolean;
  readonly abTestConfig?: ABTestConfig;
  readonly tenantOverrides?: Record<string, string>;
}

/**
 * A/B test configuration.
 */
export interface ABTestConfig {
  readonly controlVersion: string;
  readonly treatmentVersion: string;
  readonly treatmentPercentage: number;
  readonly startedAt: string;
  readonly endAt?: string;
}

/**
 * Model selection result.
 */
export interface ModelSelectionResult {
  readonly modelId: string;
  readonly versionId: string;
  readonly reason: ModelSelectionReason;
  readonly isABTest: boolean;
  readonly abTestGroup?: "control" | "treatment";
}

/**
 * Reason for model selection.
 */
export type ModelSelectionReason =
  | "default"
  | "tenant_override"
  | "ab_test_control"
  | "ab_test_treatment"
  | "rollback";

// ==================== Feedback Mapping Types ====================

/**
 * Set of positive feedback types.
 */
export type PositiveFeedbackType = "correct" | "rag_helpful";

/**
 * Set of negative feedback types.
 */
export type NegativeFeedbackType = "incorrect" | "rag_not_helpful";

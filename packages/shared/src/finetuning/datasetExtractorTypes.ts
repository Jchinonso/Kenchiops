/**
 * Dataset Extractor Types
 *
 * Type definitions and mappers for fine-tuning dataset extraction.
 * Separated from datasetExtractor for module size compliance.
 *
 * @module finetuning/datasetExtractorTypes
 */

import { CONFIDENCE_LEVEL_THRESHOLDS } from "../constants/index.js";
import type { Event, Evidence, LLMAnalysisResult } from "../core/types.js";
import type { FeedbackRecord } from "../database/index.js";
import type { TrainingExample, DatasetStats } from "./datasetBuilder.js";

// ==================== Database Row Types ====================

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
export interface FeedbackRow {
  readonly id: string;
  readonly analysis_id: string;
  readonly feedback_type: string;
  readonly user_id: string;
  readonly tenant_id: string;
  readonly created_at: string;
}

// ==================== Input/Output Types ====================

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

// ==================== Validation Types ====================

/**
 * Validation check definition for dataset quality.
 */
export interface ValidationCheck {
  readonly condition: (result: ExtractionResult, labeledTotal: number) => boolean;
  readonly message: (result: ExtractionResult, labeledTotal: number) => string;
}

// ==================== Mapping Functions ====================

/**
 * Maps database row to Event type using aggregation_key as event ID.
 */
export const mapRowToEvent = (row: AnalysisRow): Event => ({
  id: row.aggregation_key,
  type: row.event_type as Event["type"],
  source: row.event_source,
  timestamp: row.created_at,
  severity: (row.event_severity ?? "medium") as Event["severity"],
  payload: {},
});

/**
 * Derives confidence level from numeric score using threshold lookup.
 */
export const deriveConfidenceLevel = (score: number): LLMAnalysisResult["confidence"] =>
  CONFIDENCE_LEVEL_THRESHOLDS.find((threshold) => score >= threshold.minScore)?.level ?? "low";

/**
 * Maps database row to LLMAnalysisResult.
 * Uses aggregation_key as eventId to match Event.id for proper linkage.
 */
export const mapRowToAnalysis = (row: AnalysisRow): LLMAnalysisResult => ({
  eventId: row.aggregation_key,
  summary: row.summary,
  identifiedCause: row.identified_cause ?? undefined,
  confidence: deriveConfidenceLevel(row.diagnosis_confidence),
  confidenceScore: row.diagnosis_confidence,
  reasoning: (row.full_analysis?.reasoning as string) ?? undefined,
  analyzedAt: row.created_at,
});

/**
 * Maps database row to FeedbackRecord.
 */
export const mapRowToFeedback = (row: FeedbackRow): FeedbackRecord => ({
  id: row.id,
  analysisId: row.analysis_id,
  feedbackType: row.feedback_type as FeedbackRecord["feedbackType"],
  correction: null,
  userId: row.user_id,
  slackChannel: null,
  slackMessageTs: null,
  knowledgeDocId: null,
  ragRelevance: null,
  retrievalSimilarity: null,
  retrievalRank: null,
  createdAt: new Date(row.created_at),
});

/**
 * Creates minimal evidence for training (not from DB, simplified for now).
 */
export const createMinimalEvidence = (aggregationKey: string): Evidence => ({
  eventId: aggregationKey,
  logs: [],
  gitHistory: [],
  relatedDocs: [],
  collectedAt: new Date().toISOString(),
});

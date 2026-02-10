/**
 * Fine-Tuning Helpers
 *
 * Mapping functions and utilities for fine-tuning operations.
 *
 * @module finetuning/helpers
 */

import { CONFIDENCE_LEVEL_THRESHOLDS } from "../constants/index.js";
import type { Event, Evidence, LLMAnalysisResult } from "../core/types.js";
import type { FeedbackRecord } from "../database/index.js";
import type { AnalysisRow, ExtractorFeedbackRow } from "./types.js";

// ==================== Row Mappers ====================

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
export const mapRowToFeedback = (row: ExtractorFeedbackRow): FeedbackRecord => ({
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

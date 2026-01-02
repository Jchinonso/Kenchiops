/**
 * Dataset Extractor for Fine-Tuning Pipeline
 *
 * Extracts feedback and analyses from the database to build training datasets.
 * Part of the automated ETL pipeline for fine-tuning.
 *
 * @module finetuning/datasetExtractor
 */

import { createLogger } from "../core/logger.js";
import { query } from "../database/client.js";
import { DATASET_THRESHOLDS } from "../constants/index.js";
import {
  buildTrainingExample,
  filterExamples,
  calculateDatasetStats,
  toJSONL,
  logDatasetStats,
  type TrainingExample,
  type TrainingExampleInput,
  type DatasetBuildOptions,
  type DatasetStats,
} from "./datasetBuilder.js";
import type { Event, Evidence, LLMAnalysisResult } from "../core/types.js";
import type { FeedbackRecord } from "../database/feedbackRepository.js";

const logger = createLogger("dataset-extractor");

// ==================== Types ====================

/**
 * Raw analysis row from database (joined with events).
 */
interface AnalysisRow {
  readonly id: string;
  readonly event_id: string;
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
interface FeedbackRow {
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

// ==================== Database Queries ====================

const EXTRACTION_QUERIES = {
  GET_ANALYSES_WITH_FEEDBACK: `
    SELECT
      a.id,
      a.event_id,
      e.type AS event_type,
      e.source AS event_source,
      e.severity AS event_severity,
      a.summary,
      a.identified_cause,
      a.diagnosis_confidence,
      a.full_analysis,
      a.created_at
    FROM analyses a
    INNER JOIN events e ON a.event_id = e.id
    INNER JOIN (
      SELECT DISTINCT analysis_id
      FROM analysis_feedback
      WHERE ($1::timestamp IS NULL OR created_at >= $1)
        AND ($2::timestamp IS NULL OR created_at <= $2)
        AND ($3::text IS NULL OR tenant_id = $3)
      GROUP BY analysis_id
      HAVING COUNT(*) >= $4
    ) f ON a.id = f.analysis_id
    ORDER BY a.created_at DESC
    LIMIT $5
  `,

  GET_FEEDBACK_FOR_ANALYSES: `
    SELECT
      id,
      analysis_id,
      feedback_type,
      user_id,
      tenant_id,
      created_at
    FROM analysis_feedback
    WHERE analysis_id = ANY($1)
    ORDER BY created_at ASC
  `,
} as const;

// ==================== Mapping Functions ====================

/**
 * Maps database row to Event type.
 */
const mapRowToEvent = (row: AnalysisRow): Event => ({
  id: row.event_id,
  type: row.event_type as Event["type"],
  source: row.event_source,
  timestamp: row.created_at,
  severity: (row.event_severity ?? "medium") as Event["severity"],
  payload: {},
});

/**
 * Derives confidence level from numeric score.
 */
const deriveConfidenceLevel = (score: number): LLMAnalysisResult["confidence"] => {
  if (score >= 0.8) {
    return "high";
  }
  if (score >= 0.5) {
    return "medium";
  }
  return "low";
};

/**
 * Maps database row to LLMAnalysisResult.
 */
const mapRowToAnalysis = (row: AnalysisRow): LLMAnalysisResult => ({
  eventId: row.id,
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
const mapRowToFeedback = (row: FeedbackRow): FeedbackRecord => ({
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
const createMinimalEvidence = (eventId: string): Evidence => ({
  eventId,
  logs: [],
  gitHistory: [],
  relatedDocs: [],
  collectedAt: new Date().toISOString(),
});

// ==================== Extraction Functions ====================

/**
 * Extracts analyses with feedback from the database.
 */
const extractAnalysesWithFeedback = async (
  options: ExtractionOptions
): Promise<readonly AnalysisRow[]> => {
  const result = await query<AnalysisRow>(EXTRACTION_QUERIES.GET_ANALYSES_WITH_FEEDBACK, [
    options.startDate?.toISOString() ?? null,
    options.endDate?.toISOString() ?? null,
    options.tenantId ?? null,
    options.minFeedbackCount ?? DATASET_THRESHOLDS.DEFAULT_MIN_FEEDBACK,
    options.limit ?? DATASET_THRESHOLDS.DEFAULT_EXTRACTION_LIMIT,
  ]);

  logger.info("Extracted analyses with feedback", {
    count: result.rows.length,
    startDate: options.startDate?.toISOString(),
    endDate: options.endDate?.toISOString(),
  });

  return result.rows;
};

/**
 * Extracts feedback for a set of analyses.
 */
const extractFeedbackForAnalyses = async (
  analysisIds: readonly string[]
): Promise<Map<string, readonly FeedbackRecord[]>> => {
  if (analysisIds.length === 0) {
    return new Map();
  }

  const result = await query<FeedbackRow>(EXTRACTION_QUERIES.GET_FEEDBACK_FOR_ANALYSES, [
    analysisIds,
  ]);

  const feedbackByAnalysis = new Map<string, FeedbackRecord[]>();

  result.rows.forEach((row) => {
    const feedback = mapRowToFeedback(row);
    const existing = feedbackByAnalysis.get(row.analysis_id) ?? [];
    feedbackByAnalysis.set(row.analysis_id, [...existing, feedback]);
  });

  logger.info("Extracted feedback records", {
    totalRecords: result.rows.length,
    analysesWithFeedback: feedbackByAnalysis.size,
  });

  return feedbackByAnalysis;
};

/**
 * Builds training example inputs from extracted data.
 */
const buildTrainingInputs = (
  analyses: readonly AnalysisRow[],
  feedbackByAnalysis: Map<string, readonly FeedbackRecord[]>
): readonly TrainingExampleInput[] =>
  analyses.map((row) => ({
    event: mapRowToEvent(row),
    evidence: createMinimalEvidence(row.event_id),
    analysis: mapRowToAnalysis(row),
    feedback: feedbackByAnalysis.get(row.id) ?? [],
  }));

// ==================== Public API ====================

/**
 * Extracts training dataset from database.
 *
 * @param extractionOptions - Options for data extraction
 * @param buildOptions - Options for dataset building
 * @returns Extraction result with examples and metadata
 */
export const extractTrainingDataset = async (
  extractionOptions: ExtractionOptions = {},
  buildOptions: DatasetBuildOptions = {}
): Promise<ExtractionResult> => {
  logger.info("Starting dataset extraction", { extractionOptions, buildOptions });

  // Extract analyses with feedback
  const analyses = await extractAnalysesWithFeedback(extractionOptions);

  // Extract all feedback for these analyses
  const analysisIds = analyses.map((analysisRow) => analysisRow.id);
  const feedbackByAnalysis = await extractFeedbackForAnalyses(analysisIds);

  // Build training inputs
  const inputs = buildTrainingInputs(analyses, feedbackByAnalysis);

  // Build training examples
  const allExamples = inputs.map(buildTrainingExample);

  // Filter examples based on options
  const filteredExamples = filterExamples(allExamples, buildOptions);

  // Calculate stats
  const stats = calculateDatasetStats(filteredExamples);
  logDatasetStats(stats);

  // Generate JSONL
  const jsonl = toJSONL(filteredExamples);

  const result: ExtractionResult = {
    examples: filteredExamples,
    stats,
    jsonl,
    extractedAt: new Date().toISOString(),
    queryParams: extractionOptions,
  };

  logger.info("Dataset extraction complete", {
    totalAnalyses: analyses.length,
    totalExamples: allExamples.length,
    filteredExamples: filteredExamples.length,
    jsonlBytes: jsonl.length,
  });

  return result;
};

/**
 * Validates extracted dataset for quality.
 * Returns issues found during validation.
 */
export const validateExtractedDataset = (
  result: ExtractionResult
): { valid: boolean; issues: readonly string[] } => {
  const issues: string[] = [];

  // Check minimum examples
  if (result.examples.length < DATASET_THRESHOLDS.MIN_EXAMPLES) {
    issues.push(
      `Insufficient examples: ${result.examples.length} (minimum ${DATASET_THRESHOLDS.MIN_EXAMPLES} recommended)`
    );
  }

  // Check label distribution
  const { positiveExamples, negativeExamples, unlabeledExamples } = result.stats;
  const labeledTotal = positiveExamples + negativeExamples;

  if (labeledTotal === 0) {
    issues.push("No labeled examples in dataset");
  }

  if (unlabeledExamples > labeledTotal) {
    issues.push(`High unlabeled ratio: ${unlabeledExamples} unlabeled vs ${labeledTotal} labeled`);
  }

  // Check class imbalance
  if (labeledTotal > 0) {
    const positiveRatio = positiveExamples / labeledTotal;
    if (
      positiveRatio < DATASET_THRESHOLDS.MIN_POSITIVE_RATIO ||
      positiveRatio > DATASET_THRESHOLDS.MAX_POSITIVE_RATIO
    ) {
      issues.push(
        `Class imbalance detected: ${(positiveRatio * 100).toFixed(1)}% positive examples`
      );
    }
  }

  // Check average confidence
  if (result.stats.averageConfidence < DATASET_THRESHOLDS.MIN_AVG_CONFIDENCE) {
    issues.push(
      `Low average confidence: ${result.stats.averageConfidence.toFixed(2)} (recommend > ${DATASET_THRESHOLDS.MIN_AVG_CONFIDENCE})`
    );
  }

  return {
    valid: issues.length === 0,
    issues: Object.freeze(issues),
  };
};

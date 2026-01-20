/**
 * Dataset Extractor for Fine-Tuning Pipeline
 *
 * Extracts feedback and analyses from the database to build training datasets.
 * Part of the automated ETL pipeline for fine-tuning.
 *
 * @module finetuning/datasetExtractor
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import { query } from "../database/client/index.js";
import { DATASET_THRESHOLDS, EXTRACTION_QUERIES, VALIDATION_CHECKS } from "../constants/index.js";
import {
  buildTrainingExample,
  filterExamples,
  calculateDatasetStats,
  toJSONL,
  logDatasetStats,
} from "./datasetBuilder.js";
import {
  mapRowToEvent,
  mapRowToAnalysis,
  mapRowToFeedback,
  createMinimalEvidence,
} from "./helpers.js";
import type {
  TrainingExampleInput,
  DatasetBuildOptions,
  AnalysisRow,
  ExtractorFeedbackRow,
  ExtractionOptions,
  ExtractionResult,
} from "./types.js";
import type { FeedbackRecord } from "../database/index.js";

// Re-export types for backward compatibility
export type { ExtractionOptions, ExtractionResult } from "./types.js";

const logger = createLogger("dataset-extractor");

// ==================== Extraction Functions ====================

/**
 * Extracts analyses with feedback from the database.
 *
 * @param options - Extraction options
 * @returns Array of analysis rows
 * @throws Error if database operation fails
 */
const extractAnalysesWithFeedback = async (
  options: ExtractionOptions
): Promise<readonly AnalysisRow[]> => {
  try {
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
  } catch (error) {
    logger.error("Failed to extract analyses with feedback", {
      options,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Extracts feedback for a set of analyses by their aggregation keys.
 * Aggregation keys are stored as analysis_id in the feedback table (repo:commit format).
 *
 * @param aggregationKeys - Array of aggregation keys to fetch feedback for
 * @returns Map of aggregation key to feedback records
 * @throws Error if database operation fails
 */
const extractFeedbackForAnalyses = async (
  aggregationKeys: readonly string[]
): Promise<Map<string, readonly FeedbackRecord[]>> => {
  if (aggregationKeys.length === 0) {
    return new Map();
  }

  try {
    const result = await query<ExtractorFeedbackRow>(EXTRACTION_QUERIES.GET_FEEDBACK_FOR_ANALYSES, [
      aggregationKeys,
    ]);

    const feedbackByAggregationKey = result.rows.reduce<Map<string, FeedbackRecord[]>>(
      (accumulator, feedbackRow) => {
        const feedback = mapRowToFeedback(feedbackRow);
        const existingFeedback = accumulator.get(feedbackRow.analysis_id) ?? [];
        accumulator.set(feedbackRow.analysis_id, [...existingFeedback, feedback]);
        return accumulator;
      },
      new Map()
    );

    logger.info("Extracted feedback records", {
      totalRecords: result.rows.length,
      analysesWithFeedback: feedbackByAggregationKey.size,
    });

    return feedbackByAggregationKey;
  } catch (error) {
    logger.error("Failed to extract feedback for analyses", {
      aggregationKeysCount: aggregationKeys.length,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Builds training example inputs from extracted data.
 * Uses aggregation_key for feedback lookup since that's what feedback stores.
 *
 * @param analyses - Array of analysis rows
 * @param feedbackByAnalysis - Map of aggregation key to feedback records
 * @returns Array of training example inputs
 */
const buildTrainingInputs = (
  analyses: readonly AnalysisRow[],
  feedbackByAnalysis: Map<string, readonly FeedbackRecord[]>
): readonly TrainingExampleInput[] =>
  analyses.map((analysisRow) => ({
    event: mapRowToEvent(analysisRow),
    evidence: createMinimalEvidence(analysisRow.aggregation_key),
    analysis: mapRowToAnalysis(analysisRow),
    feedback: feedbackByAnalysis.get(analysisRow.aggregation_key) ?? [],
  }));

// ==================== Public API ====================

/**
 * Extracts training dataset from database.
 *
 * @param extractionOptions - Options for data extraction
 * @param buildOptions - Options for dataset building
 * @returns Extraction result with examples and metadata
 * @throws Error if database operation fails
 */
export const extractTrainingDataset = async (
  extractionOptions: ExtractionOptions = {},
  buildOptions: DatasetBuildOptions = {}
): Promise<ExtractionResult> => {
  logger.info("Starting dataset extraction", { extractionOptions, buildOptions });

  try {
    // Extract analyses with feedback
    const analyses = await extractAnalysesWithFeedback(extractionOptions);

    // Extract all feedback for these analyses using aggregation_key
    const aggregationKeys = analyses.map((analysisRow) => analysisRow.aggregation_key);
    const feedbackByAnalysis = await extractFeedbackForAnalyses(aggregationKeys);

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
  } catch (error) {
    logger.error("Dataset extraction failed", {
      extractionOptions,
      buildOptions,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Validates extracted dataset for quality.
 * Returns issues found during validation.
 *
 * @param result - Extraction result to validate
 * @returns Validation result with validity flag and issues array
 */
export const validateExtractedDataset = (
  result: ExtractionResult
): { readonly valid: boolean; readonly issues: readonly string[] } => {
  const { positiveExamples, negativeExamples } = result.stats;
  const labeledTotal = positiveExamples + negativeExamples;

  // Apply all validation checks using filter/map pattern
  const issues = VALIDATION_CHECKS.filter((check) => check.condition(result, labeledTotal)).map(
    (check) => check.message(result, labeledTotal)
  );

  return {
    valid: issues.length === 0,
    issues,
  };
};

/**
 * Dataset Extractor Constants
 *
 * SQL queries and validation configuration for fine-tuning dataset extraction.
 *
 * @module constants/datasetExtractor
 */

import { DATASET_THRESHOLDS } from "./llm.js";
import { CONFIDENCE_DISPLAY_THRESHOLDS } from "./confidence.js";
import type { ExtractionResult, ValidationCheck } from "../finetuning/types.js";

// ==================== SQL Queries ====================

/**
 * SQL query templates for dataset extraction operations.
 */
export const EXTRACTION_QUERIES = {
  GET_ANALYSES_WITH_FEEDBACK: `
    SELECT
      a.id,
      a.aggregation_key,
      'CICD_FAILURE' AS event_type,
      'github' AS event_source,
      'medium' AS event_severity,
      a.summary,
      a.identified_cause,
      a.diagnosis_confidence,
      a.full_analysis,
      a.created_at
    FROM analyses a
    INNER JOIN (
      SELECT DISTINCT analysis_id
      FROM analysis_feedback
      WHERE ($1::timestamp IS NULL OR created_at >= $1)
        AND ($2::timestamp IS NULL OR created_at <= $2)
        AND ($3::text IS NULL OR tenant_id = $3)
      GROUP BY analysis_id
      HAVING COUNT(*) >= $4
    ) f ON a.aggregation_key = f.analysis_id
    WHERE a.aggregation_key IS NOT NULL
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

// ==================== Validation Checks ====================

/**
 * Dataset validation checks using handler pattern.
 */
export const VALIDATION_CHECKS: readonly ValidationCheck[] = [
  {
    condition: (result: ExtractionResult) =>
      result.examples.length < DATASET_THRESHOLDS.MIN_EXAMPLES,
    message: (result: ExtractionResult) =>
      `Insufficient examples: ${result.examples.length} (minimum ${DATASET_THRESHOLDS.MIN_EXAMPLES} recommended)`,
  },
  {
    condition: (_: ExtractionResult, labeledTotal: number) => labeledTotal === 0,
    message: () => "No labeled examples in dataset",
  },
  {
    condition: (result: ExtractionResult, labeledTotal: number) =>
      result.stats.unlabeledExamples > labeledTotal,
    message: (result: ExtractionResult, labeledTotal: number) =>
      `High unlabeled ratio: ${result.stats.unlabeledExamples} unlabeled vs ${labeledTotal} labeled`,
  },
  {
    condition: (result: ExtractionResult, labeledTotal: number): boolean => {
      if (labeledTotal === 0) {
        return false;
      }
      const positiveRatio = result.stats.positiveExamples / labeledTotal;
      return (
        positiveRatio < DATASET_THRESHOLDS.MIN_POSITIVE_RATIO ||
        positiveRatio > DATASET_THRESHOLDS.MAX_POSITIVE_RATIO
      );
    },
    message: (result: ExtractionResult, labeledTotal: number): string => {
      const positiveRatio = result.stats.positiveExamples / labeledTotal;
      return `Class imbalance detected: ${(positiveRatio * CONFIDENCE_DISPLAY_THRESHOLDS.PERCENTAGE_MULTIPLIER).toFixed(1)}% positive examples`;
    },
  },
  {
    condition: (result: ExtractionResult) =>
      result.stats.averageConfidence < DATASET_THRESHOLDS.MIN_AVG_CONFIDENCE,
    message: (result: ExtractionResult) =>
      `Low average confidence: ${result.stats.averageConfidence.toFixed(2)} (recommend > ${DATASET_THRESHOLDS.MIN_AVG_CONFIDENCE})`,
  },
];

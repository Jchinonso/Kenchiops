/**
 * Fine-Tuning Evaluation Service
 *
 * Provides evaluation and comparison of fine-tuned models.
 * Calculates metrics like accuracy, precision, recall for model performance.
 *
 * @module services/finetuning/evaluationService
 */

import { createLogger, getErrorMessage, query, FINE_TUNING_READINESS } from "@kenchi/shared";

const logger = createLogger("evaluation-service");

// ==================== Types ====================

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

// ==================== SQL Queries ====================

const EVALUATION_QUERIES = {
  GET_MODEL_FEEDBACK_STATS: `
    SELECT
      COUNT(*) as total_analyses,
      COUNT(CASE WHEN af.feedback_type = 'helpful' THEN 1 END) as positive_count,
      COUNT(CASE WHEN af.feedback_type = 'not_helpful' THEN 1 END) as negative_count,
      COUNT(CASE WHEN af.feedback_type NOT IN ('helpful', 'not_helpful') THEN 1 END) as neutral_count,
      AVG(a.confidence_score) as avg_confidence
    FROM analyses a
    LEFT JOIN analysis_feedback af ON a.id = af.analysis_id
    WHERE ($1::text IS NULL OR a.model_version_id = $1)
      AND ($2::text IS NULL OR af.tenant_id = $2)
      AND ($3::timestamp IS NULL OR a.created_at >= $3)
      AND ($4::timestamp IS NULL OR a.created_at <= $4)
  `,

  GET_FEEDBACK_BY_MODEL: `
    SELECT
      a.model_version_id,
      af.feedback_type,
      COUNT(*) as count
    FROM analyses a
    INNER JOIN analysis_feedback af ON a.id = af.analysis_id
    WHERE a.model_version_id = ANY($1)
      AND ($2::text IS NULL OR af.tenant_id = $2)
      AND ($3::timestamp IS NULL OR a.created_at >= $3)
      AND ($4::timestamp IS NULL OR a.created_at <= $4)
    GROUP BY a.model_version_id, af.feedback_type
  `,
} as const;

// ==================== Constants ====================

/** Minimum sample size for statistical significance */
const MIN_SAMPLE_SIZE = FINE_TUNING_READINESS.MIN_FEEDBACK_FOR_TRAINING;

/** Threshold for considering improvement significant */
const SIGNIFICANCE_THRESHOLD = 0.05;

// ==================== Helper Functions ====================

/**
 * Calculates rate from count and total.
 */
const calculateRate = (count: number, total: number): number => (total > 0 ? count / total : 0);

/**
 * Determines recommendation based on comparison.
 */
const determineRecommendation = (
  improvement: { positiveRateDelta: number; isSignificant: boolean },
  sampleSize: { control: number; treatment: number; totalRequired: number }
): "keep_treatment" | "keep_control" | "continue_testing" => {
  const hasEnoughSamples =
    sampleSize.control >= sampleSize.totalRequired &&
    sampleSize.treatment >= sampleSize.totalRequired;

  if (!hasEnoughSamples) {
    return "continue_testing";
  }

  if (improvement.isSignificant && improvement.positiveRateDelta > 0) {
    return "keep_treatment";
  }

  if (improvement.isSignificant && improvement.positiveRateDelta < 0) {
    return "keep_control";
  }

  return "continue_testing";
};

// ==================== Public API ====================

/**
 * Evaluates a model version's performance.
 *
 * @param options - Evaluation options
 * @returns Model evaluation metrics
 */
export const evaluateModel = async (
  options: EvaluationOptions
): Promise<ModelEvaluationMetrics> => {
  try {
    const result = await query<{
      total_analyses: string;
      positive_count: string;
      negative_count: string;
      neutral_count: string;
      avg_confidence: string | null;
    }>(EVALUATION_QUERIES.GET_MODEL_FEEDBACK_STATS, [
      options.modelVersionId,
      options.tenantId ?? null,
      options.startDate?.toISOString() ?? null,
      options.endDate?.toISOString() ?? null,
    ]);

    const row = result.rows[0];
    const totalAnalyses = parseInt(row?.total_analyses ?? "0", 10);
    const positiveCount = parseInt(row?.positive_count ?? "0", 10);
    const negativeCount = parseInt(row?.negative_count ?? "0", 10);
    const neutralCount = parseInt(row?.neutral_count ?? "0", 10);
    const totalFeedback = positiveCount + negativeCount + neutralCount;

    return {
      modelVersionId: options.modelVersionId,
      totalAnalyses,
      totalFeedback,
      positiveRate: calculateRate(positiveCount, totalFeedback),
      negativeRate: calculateRate(negativeCount, totalFeedback),
      neutralRate: calculateRate(neutralCount, totalFeedback),
      averageConfidenceScore: parseFloat(row?.avg_confidence ?? "0") || 0,
      evaluatedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error("Failed to evaluate model", {
      modelVersionId: options.modelVersionId,
      error: getErrorMessage(error),
    });

    return {
      modelVersionId: options.modelVersionId,
      totalAnalyses: 0,
      totalFeedback: 0,
      positiveRate: 0,
      negativeRate: 0,
      neutralRate: 0,
      averageConfidenceScore: 0,
      evaluatedAt: new Date().toISOString(),
    };
  }
};

/**
 * Compares two model versions for A/B testing.
 *
 * @param controlVersionId - Control model version ID
 * @param treatmentVersionId - Treatment model version ID
 * @param tenantId - Optional tenant ID filter
 * @returns A/B test comparison result
 */
export const compareModels = async (
  controlVersionId: string,
  treatmentVersionId: string,
  tenantId?: string
): Promise<ABTestComparisonResult> => {
  const [controlMetrics, treatmentMetrics] = await Promise.all([
    evaluateModel({ modelVersionId: controlVersionId, tenantId }),
    evaluateModel({ modelVersionId: treatmentVersionId, tenantId }),
  ]);

  const positiveRateDelta = treatmentMetrics.positiveRate - controlMetrics.positiveRate;
  const confidenceScoreDelta =
    treatmentMetrics.averageConfidenceScore - controlMetrics.averageConfidenceScore;

  // Simple significance check (more sophisticated tests could be added)
  const isSignificant = Math.abs(positiveRateDelta) > SIGNIFICANCE_THRESHOLD;

  const sampleSize = {
    control: controlMetrics.totalFeedback,
    treatment: treatmentMetrics.totalFeedback,
    totalRequired: MIN_SAMPLE_SIZE,
  };

  const improvement = {
    positiveRateDelta,
    confidenceScoreDelta,
    isSignificant,
  };

  return {
    control: controlMetrics,
    treatment: treatmentMetrics,
    improvement,
    sampleSize,
    recommendation: determineRecommendation(improvement, sampleSize),
  };
};

/**
 * Gets evaluation history for a model.
 *
 * @param modelVersionId - Model version ID
 * @param limit - Maximum number of evaluations to return
 * @returns Array of evaluation metrics
 */
export const getEvaluationHistory = async (
  modelVersionId: string,
  _limit: number = 10
): Promise<readonly ModelEvaluationMetrics[]> => {
  // For now, just return a single current evaluation
  // In a full implementation, this would query stored evaluation history
  const current = await evaluateModel({ modelVersionId });
  return [current];
};

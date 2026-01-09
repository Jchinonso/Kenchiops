/**
 * Dataset Service
 *
 * Handles dataset extraction and validation for fine-tuning.
 *
 * @module services/finetuning/datasetService
 */

import {
  createLogger,
  extractTrainingDataset,
  validateExtractedDataset,
  type ExtractionOptions,
  type ExtractionResult,
} from "@kenchi/shared";

const logger = createLogger("dataset-service");

// ==================== Types ====================

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

// ==================== Public API ====================

/**
 * Extracts training dataset with validation.
 *
 * @param options - Extraction options
 * @returns Extended extraction result with validation
 */
export const extractDataset = async (
  options: ExtractDatasetOptions
): Promise<ExtendedExtractionResult> => {
  logger.info("Extracting training dataset", { ...options });

  const extractionOptions: ExtractionOptions = {
    tenantId: options.tenantId,
    startDate: options.startDate,
    endDate: options.endDate,
    minFeedbackCount: options.minFeedbackCount,
    limit: options.limit,
  };

  const result = await extractTrainingDataset(extractionOptions);
  const validation = validateExtractedDataset(result);

  logger.info("Dataset extraction complete", {
    exampleCount: result.stats.totalExamples,
    valid: validation.valid,
    issues: validation.issues,
  });

  return {
    ...result,
    validation,
  };
};

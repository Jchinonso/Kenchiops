/**
 * Fine-Tuning Services
 *
 * Barrel export for all fine-tuning related services.
 *
 * @module services/finetuning
 */

// Re-export types from types file
export type {
  ExtractDatasetOptions,
  ExtendedExtractionResult,
  StartJobOptions,
  StartJobResult,
  ABTestOptions,
  FineTuningStats,
  ModelEvaluationMetrics,
  ABTestComparisonResult,
  EvaluationOptions,
  SchedulerConfig,
  SchedulerState,
  SchedulerStatus,
} from "../../types/fineTuningTypes.js";

// Export functions from services
export { extractDataset } from "./datasetService.js";

export {
  startFineTuningJob,
  getJobStatus,
  cancelJob,
  listJobs,
  handleJobCompletion,
} from "./jobService.js";

export {
  getModelVersions,
  getActiveModel,
  activateModel,
  rollbackToBaseline,
  configureABTest,
} from "./modelService.js";

export { getFineTuningStats } from "./statsService.js";

export {
  startScheduler,
  stopScheduler,
  trackJob,
  getSchedulerStatus,
  cleanupProcessedCompletions,
} from "./schedulerService.js";

export { evaluateModel, compareModels, getEvaluationHistory } from "./evaluationService.js";

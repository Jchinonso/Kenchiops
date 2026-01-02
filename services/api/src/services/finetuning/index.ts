/**
 * Fine-Tuning Services
 *
 * Barrel export for all fine-tuning related services.
 *
 * @module services/finetuning
 */

export {
  extractDataset,
  type ExtractDatasetOptions,
  type ExtendedExtractionResult,
} from "./datasetService.js";

export {
  startFineTuningJob,
  getJobStatus,
  cancelJob,
  listJobs,
  handleJobCompletion,
  type StartJobOptions,
  type StartJobResult,
} from "./jobService.js";

export {
  getModelVersions,
  getActiveModel,
  activateModel,
  rollbackToBaseline,
  configureABTest,
  type ABTestOptions,
} from "./modelService.js";

export { getFineTuningStats, type FineTuningStats } from "./statsService.js";

export {
  startScheduler,
  stopScheduler,
  trackJob,
  getSchedulerStatus,
  cleanupProcessedCompletions,
} from "./schedulerService.js";

export {
  evaluateModel,
  compareModels,
  getEvaluationHistory,
  type ModelEvaluationMetrics,
  type ABTestComparisonResult,
  type EvaluationOptions,
} from "./evaluationService.js";

/**
 * Fine-tuning module - dataset construction for model improvement.
 */

// Types - all types exported from types.ts
export type {
  // Dataset Builder Types
  TrainingExample,
  FeedbackQualityLabel,
  TrainingExampleMetadata,
  OpenAITrainingRow,
  OpenAIMessage,
  TrainingExampleInput,
  DatasetStats,
  DatasetBuildOptions,
  FeedbackCounts,
  FeedbackLabelHandler,
  EvidenceSummarizer,
  FilterCondition,
  // Dataset Extractor Types
  AnalysisRow,
  ExtractorFeedbackRow,
  ExtractionOptions,
  ExtractionResult,
  ValidationCheck,
  DatasetValidationResult,
  // Fine-Tuning Client Types
  FineTuningJobOptions,
  FineTuningJobResult,
  FileUploadOptions,
  FileUploadResult,
  FineTuningWorkflowResult,
  ProgressCallback,
  TerminalStatusHandler,
  // Model Versioning Types
  ModelVersion,
  ModelMetadata,
  EvaluationMetrics,
  ModelFeatureFlags,
  ABTestConfig,
  ModelSelectionResult,
  ModelSelectionReason,
  ModelSelectionContext,
  ModelSelectionHandler,
} from "./types.js";

// Dataset Builder Functions
export {
  buildTrainingExample,
  toOpenAIFormat,
  toJSONL,
  filterExamples,
  calculateDatasetStats,
  logDatasetStats,
} from "./datasetBuilder.js";

// Model Versioning Functions
export {
  registerModelVersion,
  getModelVersion,
  getAllModelVersions,
  getBaselineModel,
  updateFeatureFlags,
  getFeatureFlags,
  setTenantModelOverride,
  removeTenantModelOverride,
  triggerRollback,
  clearRollback,
  isRollbackActive,
  selectModel,
  logModelSelection,
} from "./modelVersioning.js";

// Dataset Extractor Functions
export { extractTrainingDataset, validateExtractedDataset } from "./datasetExtractor.js";

// Fine-Tuning Client Functions
export {
  uploadTrainingFile,
  deleteTrainingFile,
  createFineTuningJob,
  getFineTuningJob,
  cancelFineTuningJob,
  listFineTuningJobs,
  waitForFineTuningJob,
  submitFineTuningWorkflow,
} from "./fineTuningClient.js";

// Helpers (for internal use)
export {
  mapRowToEvent,
  mapRowToAnalysis,
  mapRowToFeedback,
  createMinimalEvidence,
  deriveConfidenceLevel,
} from "./helpers.js";

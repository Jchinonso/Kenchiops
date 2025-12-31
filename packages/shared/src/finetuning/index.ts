/**
 * Fine-tuning module - dataset construction for model improvement.
 */

export {
  buildTrainingExample,
  toOpenAIFormat,
  toJSONL,
  filterExamples,
  calculateDatasetStats,
  logDatasetStats,
  type TrainingExample,
  type FeedbackQualityLabel,
  type TrainingExampleMetadata,
  type OpenAITrainingRow,
  type TrainingExampleInput,
  type DatasetStats,
  type DatasetBuildOptions,
} from "./datasetBuilder.js";

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
  type ModelVersion,
  type ModelMetadata,
  type EvaluationMetrics,
  type ModelFeatureFlags,
  type ABTestConfig,
  type ModelSelectionResult,
  type ModelSelectionReason,
} from "./modelVersioning.js";

export {
  extractTrainingDataset,
  validateExtractedDataset,
  type ExtractionOptions,
  type ExtractionResult,
} from "./datasetExtractor.js";

export {
  uploadTrainingFile,
  deleteTrainingFile,
  createFineTuningJob,
  getFineTuningJob,
  cancelFineTuningJob,
  listFineTuningJobs,
  waitForFineTuningJob,
  submitFineTuningWorkflow,
  type FineTuningJobOptions,
  type FineTuningJobResult,
  type FileUploadOptions,
  type FileUploadResult,
  type FineTuningWorkflowResult,
  type ProgressCallback,
} from "./fineTuningClient.js";

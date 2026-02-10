/**
 * Integrations module - external service clients, prompt builders, and validation.
 *
 * @module integrations
 */

// Types (re-export all from types.ts)
export type {
  ArtifactAnalysisPrompt,
  CISystem,
  AnalysisDepth,
  FocusArea,
  VerbosityLevel,
  TechStackConfig,
  PromptPreferences,
  TenantPromptConfig,
  RepositoriesResponse,
} from "./types.js";

// GitHub App client
export { fetchInstallationRepositories } from "./githubAppClient.js";

// Evidence formatters
export {
  estimateTokens,
  truncateEvidence,
  formatLogs,
  formatMetrics,
  formatGitHistory,
  formatRelatedEvents,
  formatKnowledgeDocs,
  formatPRDiffContext,
  formatEvent,
  formatEvidence,
  buildTestFrameworkHint,
} from "./promptEvidenceFormatters.js";

// Raw evidence output schema
export {
  buildOutputFormatSectionForRawEvidence,
  buildOutputFormatSection,
} from "./promptOutputSchema.js";

// Prompt builders (raw evidence path)
export { buildSystemPrompt, buildAnalysisPrompt } from "./prompts.js";

// Artifact analysis prompts (Stage 4 chunking pipeline)
export {
  buildAnalysisFromArtifacts,
  getFinalAnalyzerPromptTemplate,
} from "./promptArtifactAnalysis.js";

// Artifact analysis validation
export {
  validateAnalysisEvidenceIds,
  validateConfidenceRequirements,
  validateEnumFields,
  validateArrayCompleteness,
  extractValidEvidenceIds,
} from "./promptArtifactValidation.js";

// Artifact analysis helpers (used by pipeline consumers)
export {
  formatRankedArtifacts,
  formatBuildMetadata,
  countTestArtifacts,
  countLintArtifacts,
  truncateMiddle,
  MAX_RAW_LOG_PREVIEW_LENGTH,
} from "./promptArtifactHelpers.js";

// Tenant prompt configuration
export {
  buildTenantPromptAdditions,
  createTenantPromptConfig,
  validateTenantPromptConfig,
} from "./tenantPromptConfig.js";

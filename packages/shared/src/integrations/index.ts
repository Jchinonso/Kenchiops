/**
 * Integrations module - external service clients and adapters.
 */

// GitHub App client
export { fetchInstallationRepositories } from "./githubAppClient.js";

// Vector store
export { VectorStore, InMemoryVectorStore } from "./vectorStore.js";

// LLM prompts
export {
  buildSystemPrompt,
  buildAnalysisPrompt,
  formatEvent,
  formatEvidence,
  formatLogs,
  formatMetrics,
  formatGitHistory,
  formatRelatedEvents,
  formatKnowledgeDocs,
  estimateTokens,
  truncateEvidence,
} from "./prompts.js";

// Tenant prompt configuration
export {
  buildTenantPromptAdditions,
  createTenantPromptConfig,
  validateTenantPromptConfig,
  type TenantPromptConfig,
  type TechStackConfig,
  type CISystem,
  type AnalysisDepth,
  type PromptPreferences,
  type FocusArea,
  type VerbosityLevel,
} from "./tenantPromptConfig.js";

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
  formatKnowledgeDocs,
  estimateTokens,
  truncateEvidence,
} from "./prompts.js";

/**
 * LLM Module - Provider-agnostic LLM utilities
 *
 * This module provides:
 * - Provider interfaces for analysis and embeddings
 * - Response parsing utilities (JSON extraction, validation)
 * - Anti-hallucination validation
 * - Token budget management
 *
 * For provider-specific implementations, use:
 * - `@kenchi/shared/llm/providers/openai` for OpenAI
 *
 * @module llm
 */

// ==================== Types ====================

export type {
  LLMAnalysisProvider,
  EmbeddingProvider,
  EmbeddingResult,
  BatchEmbeddingResult,
  LLMProviderConfig,
  AnalysisProviderConfig,
  EmbeddingProviderConfig,
  AnalysisProviderFactory,
  EmbeddingProviderFactory,
  LLMProviderName,
  ProviderRegistryEntry,
  OpenAIConfig,
  EmbeddingClientConfig,
  TokenEstimate,
  RawAnnotation,
  RawSecondaryFinding,
  ConfidenceLevel,
  TestFailureLogShape,
  LintErrorLogShape,
  ActionPriority,
  ValidationLookups,
  EvidenceValidator,
  JsonExtractionState,
} from "./types.js";

// ==================== Response Parsing ====================

// JSON extraction
export { extractJsonFromResponse, parseJsonObject } from "./jsonExtraction.js";

// Response parser
export {
  parseOpenAIResponse,
  createAnalysisFromParsed,
  extractJsonFromResponse as extractJson,
} from "./responseParser.js";

// Response parser validation
export {
  extractString,
  extractOptionalString,
  extractArray,
  extractOptional,
  normalizeInput,
  extractFileLocation,
  validateAnnotation,
  parseAnnotations,
  parseSecondaryFindings,
  VALID_CONFIDENCE_LEVELS,
  VALID_CATEGORIES,
  VALID_PHASES,
  mapConfidence,
  validateCategory,
  validatePhase,
} from "./responseParserValidation.js";

// Structured data parsers
export {
  parseDependencyChanges,
  parseBuildConfigChanges,
  parseTestFailures,
  parseLintErrors,
} from "./structuredDataParsers.js";

// ==================== Validation ====================

export { validateResponse } from "./validation.js";

// ==================== Token Management ====================

export { manageTokenBudget } from "./tokenManager.js";

// ==================== OpenAI Provider (backward compatibility) ====================

// Re-export OpenAI provider for backward compatibility
export {
  OpenAIClient,
  EmbeddingClient,
  getEmbeddingClient,
  clearClientCache,
  createEmbeddingProvider,
  handleOpenAIError,
} from "./providers/openai/index.js";

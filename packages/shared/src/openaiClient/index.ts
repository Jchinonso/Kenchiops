/**
 * OpenAIClient Module - Exports all OpenAI-related functionality
 *
 * This module provides:
 * - OpenAIClient: Main API client for OpenAI integration
 * - EmbeddingClient: Vector embedding generation for RAG
 * - Validation: Anti-hallucination checks and response validation
 * - Token Management: Budget management and evidence truncation
 * - Error Handling: Error enrichment utilities
 *
 * Note: For delay/sleep functionality, use `delay` from `core/utils.js`
 */

export { OpenAIClient } from "./client.js";
export { applyEvidenceGuardrails } from "./analysisGuardrails.js";
export {
  splitEvidenceSections,
  type EvidenceSectionBlock,
  isGenericErrorLine,
} from "./analysisGuardrailsEvidence.js";
export {
  extractAssertionSnippet,
  ASSERTION_DETAIL_PATTERNS,
  MAX_ASSERTION_SNIPPET_LENGTH,
} from "./evidencePatterns.js";
export {
  EmbeddingClient,
  getEmbeddingClient,
  clearClientCache,
  createEmbeddingProvider,
  type EmbeddingResult,
  type BatchEmbeddingResult,
  type EmbeddingProvider,
} from "./embedding.js";
export { validateResponse } from "./validation.js";
export { manageTokenBudget } from "./tokenManager.js";
export { handleOpenAIError } from "./errors.js";

/**
 * LLM Provider Module
 *
 * Provider implementations for LLM interfaces.
 * Provides analysis and embedding capabilities using OpenAI-compatible APIs.
 *
 * @module llm/providers/llmProvider
 */

// Client exports
export { LLMClient } from "./client.js";

// Embedding exports
export {
  EmbeddingClient,
  getEmbeddingClient,
  clearClientCache,
  createEmbeddingProvider,
  type EmbeddingResult,
  type BatchEmbeddingResult,
  type EmbeddingProvider,
} from "./embedding.js";

// Error handling exports
export { handleLLMError } from "./errors.js";

// Type exports
export type { LLMErrorLike, ErrorMessageFactory, ErrorHandler } from "./types.js";

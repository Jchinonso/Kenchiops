/**
 * OpenAI Provider Module
 *
 * OpenAI-specific implementations of LLM interfaces.
 * Provides analysis and embedding capabilities using OpenAI's API.
 *
 * @module llm/providers/openai
 */

// Client exports
export { OpenAIClient } from "./client.js";

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
export { handleOpenAIError } from "./errors.js";

// Type exports
export type { OpenAIErrorLike, ErrorMessageFactory, ErrorHandler } from "./types.js";

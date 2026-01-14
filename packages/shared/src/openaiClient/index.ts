/**
 * OpenAIClient Module - Backward Compatibility Re-exports
 *
 * @deprecated Import from `@kenchi/shared/llm` instead.
 * This module re-exports from the new llm module for backward compatibility.
 *
 * Migration guide:
 * - `import { OpenAIClient } from "@kenchi/shared/openaiClient"` →
 *   `import { OpenAIClient } from "@kenchi/shared/llm"`
 */

// Re-export everything from llm module for backward compatibility
export {
  // OpenAI Provider
  OpenAIClient,
  EmbeddingClient,
  getEmbeddingClient,
  clearClientCache,
  createEmbeddingProvider,
  handleOpenAIError,
  // Types
  type EmbeddingResult,
  type BatchEmbeddingResult,
  type EmbeddingProvider,
  // Validation
  validateResponse,
  // Token Management
  manageTokenBudget,
} from "../llm/index.js";

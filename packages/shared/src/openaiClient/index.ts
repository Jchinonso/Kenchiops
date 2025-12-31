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
export { EmbeddingClient, type EmbeddingResult, type BatchEmbeddingResult } from "./embedding.js";
export { validateResponse } from "./validation.js";
export { manageTokenBudget } from "./tokenManager.js";
export { handleOpenAIError } from "./errors.js";

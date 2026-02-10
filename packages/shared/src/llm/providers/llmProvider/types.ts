/**
 * LLM Provider Types
 *
 * Type definitions for LLM error handling and API interactions.
 *
 * @module llm/providers/llmProvider/types
 */

import type { LLMError } from "../../../core/errors.js";

/**
 * Type definition for LLM API error responses.
 */
export interface LLMErrorLike {
  readonly status?: number;
  readonly code?: string;
  readonly message?: string;
}

/**
 * Error message factory type for status code handlers.
 */
export type ErrorMessageFactory = (message?: string) => string;

/**
 * Error handler function type.
 */
export type ErrorHandler = (error: LLMErrorLike, timeout: number) => LLMError | null;

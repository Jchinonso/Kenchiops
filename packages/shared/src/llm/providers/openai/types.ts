/**
 * OpenAI Provider Types
 *
 * Type definitions for OpenAI error handling and API interactions.
 *
 * @module llm/providers/openai/types
 */

import type { LLMError } from "../../../core/errors.js";

/**
 * Type definition for OpenAI API error responses.
 */
export interface OpenAIErrorLike {
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
export type ErrorHandler = (error: OpenAIErrorLike, timeout: number) => LLMError | null;

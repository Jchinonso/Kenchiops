/**
 * LLM Error Handling Module
 *
 * Provides error handling utilities for LLM API interactions,
 * including error enrichment and retry delay utilities.
 *
 * @module llm/providers/llmProvider/errors
 */

import { HTTP_STATUS, LLM_CONSTANTS } from "../../../constants/index.js";
import { LLMError } from "../../../core/errors.js";
import type { LLMErrorLike, ErrorMessageFactory, ErrorHandler } from "./types.js";

/**
 * Type guard for error-like objects.
 */
const isErrorLike = (error: unknown): error is LLMErrorLike =>
  typeof error === "object" && error !== null;

/**
 * Error message factories for HTTP status codes.
 */
const STATUS_ERROR_MESSAGES: Readonly<Map<number, ErrorMessageFactory>> = new Map([
  [
    HTTP_STATUS.BAD_REQUEST,
    (message?: string) => `LLM request invalid: ${message ?? "Bad request"}`,
  ],
  [HTTP_STATUS.UNAUTHORIZED, () => "LLM authentication failed. Check API key configuration."],
  [
    LLM_CONSTANTS.RATE_LIMIT_STATUS_CODE,
    () => "LLM rate limit exceeded after retries. Please try again later.",
  ],
]);

/**
 * Network error codes that indicate timeout.
 */
const TIMEOUT_ERROR_CODES: Readonly<Set<string>> = new Set(["ECONNABORTED", "ETIMEDOUT"]);

/**
 * Default error message for unknown errors.
 */
const DEFAULT_ERROR_MESSAGE = "Unknown LLM error occurred";

/**
 * Handles HTTP status code errors.
 *
 * @param error - Error object with status code
 * @returns Error instance if status code is handled, null otherwise
 */
const handleStatusError = (error: LLMErrorLike): LLMError | null => {
  if (error.status === undefined) {
    return null;
  }
  const messageFactory = STATUS_ERROR_MESSAGES.get(error.status);
  return messageFactory ? new LLMError(messageFactory(error.message)) : null;
};

/**
 * Handles network timeout errors.
 *
 * @param error - Error object with code
 * @param timeout - Timeout value in milliseconds
 * @returns Error instance if timeout error, null otherwise
 */
const handleTimeoutError = (error: LLMErrorLike, timeout: number): LLMError | null => {
  const isTimeout = error.code !== undefined && TIMEOUT_ERROR_CODES.has(error.code);
  return isTimeout
    ? new LLMError(`LLM request timed out after ${timeout}ms`, { retryable: true })
    : null;
};

/**
 * Handles errors with messages.
 *
 * @param error - Error object with message
 * @returns Error instance if message exists, null otherwise
 */
const handleMessageError = (error: LLMErrorLike): LLMError | null =>
  error.message ? new LLMError(`LLM error: ${error.message}`) : null;

/**
 * Array of error handlers in priority order.
 * Each handler returns an Error if it can handle the error, or null to continue.
 */
const errorHandlers: readonly ErrorHandler[] = [
  handleStatusError,
  handleTimeoutError,
  handleMessageError,
] as const;

/**
 * Handles and enriches errors from LLM API.
 *
 * Uses a functional approach with an array of error handlers that are
 * checked sequentially until one can handle the error.
 *
 * @param error - The error to handle (unknown type for safety)
 * @param timeout - The timeout value in milliseconds for timeout errors
 * @returns A properly formatted LLMError instance
 *
 * @example
 * ```typescript
 * try {
 *   await llmClient.chat.completions.create(...);
 * } catch (error) {
 *   throw handleLLMError(error, 30000);
 * }
 * ```
 */
export const handleLLMError = (error: unknown, timeout: number): LLMError => {
  // Early return for non-error-like objects
  if (!isErrorLike(error)) {
    return new LLMError(DEFAULT_ERROR_MESSAGE);
  }

  // Try each error handler in sequence
  const handledError = errorHandlers
    .map((handler) => handler(error, timeout))
    .find((result) => result !== null);

  // Return handled error or default
  return handledError ?? new LLMError(DEFAULT_ERROR_MESSAGE);
};

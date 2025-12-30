/**
 * OpenAI Error Handling Module
 *
 * Provides error handling utilities for OpenAI API interactions,
 * including error enrichment and retry delay utilities.
 *
 * @module openaiClient/errors
 */

import { HTTP_STATUS, OPENAI_CONSTANTS } from "../constants/index.js";

/**
 * Type definition for OpenAI API error responses.
 */
interface OpenAIErrorLike {
  readonly status?: number;
  readonly code?: string;
  readonly message?: string;
}

/**
 * Type guard for error-like objects.
 */
const isErrorLike = (error: unknown): error is OpenAIErrorLike =>
  typeof error === "object" && error !== null;

/**
 * Error message factory type for status code handlers.
 */
type ErrorMessageFactory = (message?: string) => string;

/**
 * Error handler function type.
 */
type ErrorHandler = (error: OpenAIErrorLike, timeout: number) => Error | null;

/**
 * Error message factories for HTTP status codes.
 */
const STATUS_ERROR_MESSAGES: Readonly<Map<number, ErrorMessageFactory>> = new Map([
  [
    HTTP_STATUS.BAD_REQUEST,
    (message?: string) => `OpenAI request invalid: ${message ?? "Bad request"}`,
  ],
  [
    HTTP_STATUS.UNAUTHORIZED,
    () => "OpenAI authentication failed. Check OPENAI_API_KEY configuration.",
  ],
  [
    OPENAI_CONSTANTS.RATE_LIMIT_STATUS_CODE,
    () => "OpenAI rate limit exceeded after retries. Please try again later.",
  ],
]);

/**
 * Network error codes that indicate timeout.
 */
const TIMEOUT_ERROR_CODES: Readonly<Set<string>> = new Set(["ECONNABORTED", "ETIMEDOUT"]);

/**
 * Default error message for unknown errors.
 */
const DEFAULT_ERROR_MESSAGE = "Unknown OpenAI error occurred";

/**
 * Handles HTTP status code errors.
 *
 * @param error - Error object with status code
 * @returns Error instance if status code is handled, null otherwise
 */
const handleStatusError = (error: OpenAIErrorLike): Error | null => {
  if (error.status === undefined) {
    return null;
  }
  const messageFactory = STATUS_ERROR_MESSAGES.get(error.status);
  return messageFactory ? new Error(messageFactory(error.message)) : null;
};

/**
 * Handles network timeout errors.
 *
 * @param error - Error object with code
 * @param timeout - Timeout value in milliseconds
 * @returns Error instance if timeout error, null otherwise
 */
const handleTimeoutError = (error: OpenAIErrorLike, timeout: number): Error | null => {
  const isTimeout = error.code !== undefined && TIMEOUT_ERROR_CODES.has(error.code);
  return isTimeout ? new Error(`OpenAI request timed out after ${timeout}ms`) : null;
};

/**
 * Handles errors with messages.
 *
 * @param error - Error object with message
 * @returns Error instance if message exists, null otherwise
 */
const handleMessageError = (error: OpenAIErrorLike): Error | null =>
  error.message ? new Error(`OpenAI error: ${error.message}`) : null;

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
 * Handles and enriches errors from OpenAI API.
 *
 * Uses a functional approach with an array of error handlers that are
 * checked sequentially until one can handle the error.
 *
 * @param error - The error to handle (unknown type for safety)
 * @param timeout - The timeout value in milliseconds for timeout errors
 * @returns A properly formatted Error instance
 *
 * @example
 * ```typescript
 * try {
 *   await openaiClient.chat.completions.create(...);
 * } catch (error) {
 *   throw handleOpenAIError(error, 30000);
 * }
 * ```
 */
export const handleOpenAIError = (error: unknown, timeout: number): Error => {
  // Early return for non-error-like objects
  if (!isErrorLike(error)) {
    return new Error(DEFAULT_ERROR_MESSAGE);
  }

  // Try each error handler in sequence
  const handledError = errorHandlers
    .map((handler) => handler(error, timeout))
    .find((result) => result !== null);

  // Return handled error or default
  return handledError ?? new Error(DEFAULT_ERROR_MESSAGE);
};

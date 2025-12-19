/**
 * OpenAI Error Handling Module
 *
 * Provides error handling utilities for OpenAI API interactions,
 * including error enrichment and retry delay utilities.
 */

import { HTTP_STATUS, OPENAI_CONSTANTS } from "../constants.js";

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
const isErrorLike = (error: unknown): error is OpenAIErrorLike => {
  return typeof error === "object" && error !== null;
};

/**
 * Error message factory type for status code handlers.
 */
type ErrorMessageFactory = (message?: string) => string;

/**
 * Error message factories for HTTP status codes.
 */
const STATUS_ERROR_MESSAGES: Readonly<Map<number, ErrorMessageFactory>> = new Map([
  [
    HTTP_STATUS.BAD_REQUEST,
    (message?: string) => `OpenAI request invalid: ${message || "Bad request"}`,
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
 * Handles and enriches errors from OpenAI API.
 *
 * @param error - The error to handle (unknown type for safety)
 * @param timeout - The timeout value in milliseconds for timeout errors
 * @returns A properly formatted Error instance
 */
export const handleOpenAIError = (error: unknown, timeout: number): Error => {
  if (!isErrorLike(error)) {
    return new Error("Unknown OpenAI error occurred");
  }

  // Handle HTTP status codes
  if (error.status !== undefined) {
    const messageFactory = STATUS_ERROR_MESSAGES.get(error.status);
    if (messageFactory) {
      return new Error(messageFactory(error.message));
    }
  }

  // Handle network timeout errors
  if (error.code !== undefined && TIMEOUT_ERROR_CODES.has(error.code)) {
    return new Error(`OpenAI request timed out after ${timeout}ms`);
  }

  // Handle errors with messages
  if (error.message) {
    return new Error(`OpenAI error: ${error.message}`);
  }

  return new Error("Unknown OpenAI error occurred");
};

/**
 * Sleep utility for retry delays.
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the specified delay
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

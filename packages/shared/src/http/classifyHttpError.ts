/**
 * HTTP Error Classification
 *
 * Standardizes error handling for external HTTP calls. Extracts status code,
 * categorizes the error, and determines retryability.
 *
 * @module http/classifyHttpError
 */

import type { ClassifiedHttpError } from "./classifyHttpErrorTypes.js";

/**
 * Extracts a numeric status code from an error, if available.
 * Handles common SDK error shapes (e.g., OpenAI, Axios, node-fetch).
 */
const extractStatusCode = (error: unknown): number | undefined => {
  if (!(error instanceof Error)) {
    return undefined;
  }
  // Most SDKs attach .status or .statusCode
  if ("status" in error && typeof (error as Record<string, unknown>).status === "number") {
    return (error as Record<string, unknown>).status as number;
  }
  if ("statusCode" in error && typeof (error as Record<string, unknown>).statusCode === "number") {
    return (error as Record<string, unknown>).statusCode as number;
  }
  // Axios-style: error.response.status
  if ("response" in error) {
    const resp = (error as Record<string, unknown>).response;
    if (resp && typeof resp === "object" && "status" in resp) {
      const status = (resp as Record<string, unknown>).status;
      if (typeof status === "number") {
        return status;
      }
    }
  }
  return undefined;
};

/**
 * Determines whether the error message indicates a timeout.
 */
const isTimeoutError = (message: string): boolean =>
  message.includes("timed out") ||
  message.includes("timeout") ||
  message.includes("ETIMEDOUT") ||
  message.includes("ESOCKETTIMEDOUT") ||
  message.includes("AbortError");

/**
 * Determines whether the error message indicates a network-level failure.
 */
const isNetworkError = (message: string): boolean =>
  message.includes("ECONNREFUSED") ||
  message.includes("ECONNRESET") ||
  message.includes("ENOTFOUND") ||
  message.includes("network") ||
  message.includes("socket hang up") ||
  message.includes("fetch failed");

/**
 * Classifies an HTTP error into a standardized shape for logging and retry decisions.
 *
 * @param error - The caught error from an HTTP call
 * @returns A classified error with statusCode, category, retryable flag, and message
 */
export const classifyHttpError = (error: unknown): ClassifiedHttpError => {
  const message = error instanceof Error ? error.message : String(error);
  const statusCode = extractStatusCode(error);

  // Timeout errors are always retryable
  if (isTimeoutError(message)) {
    return {
      statusCode,
      category: "retryable",
      retryable: true,
      message,
    };
  }

  // Network errors are retryable
  if (isNetworkError(message)) {
    return {
      statusCode,
      category: "retryable",
      retryable: true,
      message,
    };
  }

  // Classify by status code when available
  if (statusCode !== undefined) {
    // Auth/config errors
    if (statusCode === 401 || statusCode === 403) {
      return {
        statusCode,
        category: "auth_config",
        retryable: false,
        message,
      };
    }

    // Rate limiting is retryable
    if (statusCode === 429) {
      return {
        statusCode,
        category: "retryable",
        retryable: true,
        message,
      };
    }

    // Server errors are retryable
    if (statusCode >= 500) {
      return {
        statusCode,
        category: "retryable",
        retryable: true,
        message,
      };
    }

    // Other 4xx are non-retryable
    if (statusCode >= 400) {
      return {
        statusCode,
        category: "non_retryable",
        retryable: false,
        message,
      };
    }
  }

  // Unknown error — not retryable by default
  return {
    statusCode,
    category: "unknown",
    retryable: false,
    message,
  };
};

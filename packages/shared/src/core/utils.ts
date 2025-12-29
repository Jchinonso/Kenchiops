/**
 * Core Utility Functions
 *
 * Shared utility functions used across the codebase.
 *
 * @module core/utils
 */

import { ID_GENERATION } from "../constants/core.js";

// ==================== Promise Utilities ====================

/**
 * Wrap a promise with a timeout.
 * Rejects with an error if the promise doesn't resolve within the specified time.
 *
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param errorMessage - Optional custom error message
 * @returns The resolved value or rejects with timeout error
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   fetch('https://api.example.com/data'),
 *   5000,
 *   'API request timed out'
 * );
 * ```
 */
export const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = "Operation timed out"
): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
  );
  return Promise.race([promise, timeoutPromise]);
};

// ==================== Error Utilities ====================

/**
 * Check if an error message matches any retryable pattern.
 *
 * @param error - Error message or undefined
 * @param patterns - Array of regex patterns to check against
 * @returns True if the error matches any retryable pattern
 */
export const isRetryableError = (
  error: string | undefined,
  patterns: readonly RegExp[]
): boolean => {
  if (!error) return false;
  return patterns.some((pattern) => pattern.test(error));
};

// ==================== Data Utilities ====================

/**
 * Create a delay promise.
 *
 * @param ms - Delay in milliseconds
 * @returns Promise that resolves after the delay
 */
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Safely parse JSON with type assertion.
 *
 * @param json - JSON string to parse
 * @returns Parsed value or null if parsing fails
 */
export const safeJsonParse = <T>(json: string): T | null => {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
};

// ==================== Number Utilities ====================

/**
 * Parse count from database result.
 * Handles the common pattern of COUNT(*) returning string.
 *
 * @param rows - Query result rows with count field
 * @param radix - Parse radix (default 10)
 * @returns Parsed count number
 */
export const parseDbCount = (rows: readonly { count: string }[], radix = 10): number =>
  parseInt(rows[0]?.count ?? "0", radix);

// ==================== ID Generation ====================

/**
 * Generate a unique event ID with optional prefix.
 *
 * @param prefix - Prefix for the event ID (e.g., "evt", "pr", "check")
 * @returns Unique event ID string
 *
 * @example
 * ```typescript
 * generateEventId("evt");   // "evt_1703683200000_abc123xyz"
 * generateEventId("pr");    // "pr_1703683200000_def456uvw"
 * generateEventId("check"); // "check_1703683200000_ghi789rst"
 * ```
 */
export const generateEventId = (prefix: string = ID_GENERATION.DEFAULT_PREFIX): string => {
  const timestamp = Date.now();
  const random = Math.random()
    .toString(36)
    .substring(ID_GENERATION.RANDOM_START_INDEX, ID_GENERATION.RANDOM_END_INDEX);
  return `${prefix}_${timestamp}_${random}`;
};

// Intentional type error to trigger CI failure
export const brokenFunction = (value: number): string => {
  const result: number = "this should be a number"; // Type error!
  return result + value;
};

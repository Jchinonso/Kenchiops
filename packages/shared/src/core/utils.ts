/**
 * Core Utility Functions
 *
 * Shared utility functions used across the codebase.
 *
 * @module core/utils
 */

import { ID_GENERATION } from "../constants/core.js";
import { FEEDBACK_URL_CONFIG } from "../constants/passiveLearning.js";
import type { SignedUrlParams } from "./types.js";

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
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });
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
  if (!error) {
    return false;
  }
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
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

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
    // Intentional: returns null for malformed JSON — callers handle the null case
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
export const parseDbCount = (rows: ReadonlyArray<{ count: string }>, radix = 10): number =>
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

// ==================== Signed URL Utilities ====================

export type { SignedUrlParams };

/**
 * Generate HMAC-SHA256 signature for URL parameters.
 *
 * @param params - Parameters to sign
 * @param secret - Secret key for signing
 * @returns Base64url-encoded signature
 */
export const generateUrlSignature = async (
  params: SignedUrlParams,
  secret: string
): Promise<string> => {
  const { createHmac } = await import("crypto");
  const data = `${params.analysisId}:${params.feedbackType}:${params.expiresAt}`;
  const hmac = createHmac("sha256", secret);
  hmac.update(data);
  return hmac.digest("base64url");
};

/**
 * Verify HMAC-SHA256 signature for URL parameters.
 *
 * @param params - Parameters that were signed
 * @param signature - Signature to verify
 * @param secret - Secret key used for signing
 * @returns True if signature is valid
 */
export const verifyUrlSignature = async (
  params: SignedUrlParams,
  signature: string,
  secret: string
): Promise<boolean> => {
  const expectedSignature = await generateUrlSignature(params, secret);
  return signature === expectedSignature;
};

/**
 * Generate a signed feedback URL.
 *
 * @param baseUrl - Base URL for the feedback endpoint
 * @param analysisId - Analysis ID to provide feedback for
 * @param feedbackType - Type of feedback (correct/incorrect)
 * @param secret - Secret key for signing
 * @param expiryMs - URL expiry time in milliseconds (default from config)
 * @returns Signed feedback URL
 */
export const generateFeedbackUrl = async (
  baseUrl: string,
  analysisId: string,
  feedbackType: "correct" | "incorrect",
  secret: string,
  expiryMs: number = FEEDBACK_URL_CONFIG.DEFAULT_EXPIRY_MS
): Promise<string> => {
  const expiresAt = Date.now() + expiryMs;
  const params: SignedUrlParams = { analysisId, feedbackType, expiresAt };
  const signature = await generateUrlSignature(params, secret);

  const url = new URL(baseUrl);
  url.searchParams.set("analysisId", analysisId);
  url.searchParams.set("type", feedbackType);
  url.searchParams.set("expires", expiresAt.toString());
  url.searchParams.set("sig", signature);

  return url.toString();
};

/**
 * Parse and verify a signed feedback URL.
 *
 * @param url - URL to parse and verify
 * @param secret - Secret key for verification
 * @returns Parsed parameters if valid, null if invalid or expired
 */
export const parseFeedbackUrl = async (
  url: string,
  secret: string
): Promise<SignedUrlParams | null> => {
  const parsed = new URL(url);
  const analysisId = parsed.searchParams.get("analysisId");
  const feedbackType = parsed.searchParams.get("type");
  const expiresStr = parsed.searchParams.get("expires");
  const signature = parsed.searchParams.get("sig");

  if (!analysisId || !feedbackType || !expiresStr || !signature) {
    return null;
  }

  if (feedbackType !== "correct" && feedbackType !== "incorrect") {
    return null;
  }

  const expiresAt = parseInt(expiresStr, 10);
  if (isNaN(expiresAt) || expiresAt < Date.now()) {
    return null;
  }

  const params: SignedUrlParams = { analysisId, feedbackType, expiresAt };
  const isValid = await verifyUrlSignature(params, signature, secret);

  return isValid ? params : null;
};

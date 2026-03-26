/**
 * HTTP Error Classification Types
 *
 * @module http/classifyHttpErrorTypes
 */

/** Error category for classified HTTP errors. */
export type HttpErrorCategory = "retryable" | "non_retryable" | "auth_config" | "unknown";

/**
 * Standardized error classification for external HTTP calls.
 * Used by adapters for structured logging and retry decisions.
 */
export interface ClassifiedHttpError {
  readonly statusCode: number | undefined;
  readonly category: HttpErrorCategory;
  readonly retryable: boolean;
  readonly message: string;
}

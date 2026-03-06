/**
 * TanStack Query Fetch Wrappers
 *
 * Thin wrappers around apiClient that unwrap the { data: T } envelope
 * and throw typed ApiError on failure. Designed for use as queryFn and
 * mutationFn in TanStack Query hooks.
 */

import { apiClient } from "@/lib/apiClient";

// ==================== Error Types ====================

/**
 * Structured API error with status code and optional error code.
 * Thrown by fetchQuery / fetchMutation when the response is not ok.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ==================== Helpers ====================

/** Truncate error messages to prevent internal details from leaking to the UI. */
const sanitizeErrorMessage = (message: string): string =>
  message.length > 200 ? `${message.slice(0, 200)}...` : message;

/**
 * Parse the API error envelope from a non-ok Response.
 * Returns a sanitized ApiError with status, message, and optional code.
 */
const parseApiError = async (response: Response): Promise<ApiError> => {
  try {
    const body: unknown = await response.json();
    const parsed = body as {
      readonly error?: {
        readonly message?: string;
        readonly code?: string;
      };
    } | null;
    const message = sanitizeErrorMessage(
      parsed?.error?.message ?? `Request failed (${response.status})`
    );
    return new ApiError(message, response.status, parsed?.error?.code);
  } catch {
    return new ApiError(
      sanitizeErrorMessage(`Request failed (${response.status})`),
      response.status
    );
  }
};

// ==================== Query Functions ====================

/**
 * GET query function that unwraps the `{ data: T }` envelope.
 * Throws ApiError on non-ok responses.
 */
export const fetchQuery = async <T>(path: string): Promise<T> => {
  const response = await apiClient(path);

  if (!response.ok) {
    throw await parseApiError(response);
  }

  const json: { readonly data: T } = await response.json();
  return json.data;
};

/**
 * POST-based query function for endpoints that require a request body
 * but are semantically reads (e.g., batch lookups).
 * Unwraps the `{ data: T }` envelope. Throws ApiError on non-ok responses.
 */
export const fetchQueryPost = async <T>(path: string, body: unknown): Promise<T> => {
  const response = await apiClient(path, { method: "POST", body });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  const json: { readonly data: T } = await response.json();
  return json.data;
};

// ==================== Mutation Functions ====================

interface MutationOptions {
  readonly method: string;
  readonly body?: unknown;
}

/**
 * Mutation function that returns the unwrapped `{ data: T }` result.
 * Throws ApiError on non-ok responses.
 */
export const fetchMutation = async <T>(path: string, options: MutationOptions): Promise<T> => {
  const response = await apiClient(path, {
    method: options.method,
    body: options.body,
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  const json: { readonly data: T } = await response.json();
  return json.data;
};

/**
 * Mutation function for endpoints that return no data (204 or empty body).
 * Throws ApiError on non-ok responses.
 */
export const fetchMutationVoid = async (path: string, options: MutationOptions): Promise<void> => {
  const response = await apiClient(path, {
    method: options.method,
    body: options.body,
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }
};

/**
 * Mutation function that returns the raw Response.
 * Used when the caller needs to inspect status codes or headers
 * before deciding how to handle the result (e.g., plan limit checks).
 */
export const fetchMutationRaw = async (path: string, options: MutationOptions): Promise<Response> =>
  apiClient(path, {
    method: options.method,
    body: options.body,
  });

// ==================== Legacy Error Parsing Utilities ====================
// These were originally in useFetch.ts and are used by mutation hooks that
// inspect raw Response objects (useBilling, useSubscription, usePlanLimitError).

/** Safely parse an error message from an API response body, truncated for display safety. */
export const parseErrorBody = async (response: Response, fallback: string): Promise<string> => {
  try {
    const body: unknown = await response.json();
    const parsed = body as { readonly error?: { readonly message?: string } } | null;
    return sanitizeErrorMessage(parsed?.error?.message ?? fallback);
  } catch {
    return sanitizeErrorMessage(fallback);
  }
};

/** Structured API error response with optional metadata. */
export interface ApiErrorResponse {
  readonly code?: string;
  readonly message: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Parse a structured error from an API response, preserving code and metadata.
 * Uses response.clone() so the caller can still read the original response.
 */
export const parseStructuredError = async (
  response: Response
): Promise<ApiErrorResponse | null> => {
  try {
    const body: unknown = await response.clone().json();
    const parsed = body as { readonly error?: ApiErrorResponse } | null;
    return parsed?.error ?? null;
  } catch {
    return null;
  }
};

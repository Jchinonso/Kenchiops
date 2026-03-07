/**
 * TanStack Query Compatibility Adapter
 *
 * Wraps TanStack Query's UseQueryResult into the legacy UseFetchResult<T>
 * shape so existing page consumers don't need to change during the migration.
 *
 * Also defines the legacy type shapes (FetchState, UseFetchResult, MutationState)
 * that were originally in useFetch.ts. These types are still used by hooks that
 * maintain backward-compatible return shapes.
 */

import type { UseQueryResult } from "@tanstack/react-query";

// ==================== Legacy Types ====================

export interface FetchState<T> {
  readonly data: T | null;
  readonly isLoading: boolean;
  readonly error: string | null;
}

export interface UseFetchResult<T> extends FetchState<T> {
  readonly refetch: () => void;
}

export interface MutationState {
  readonly isLoading: boolean;
  readonly error: string | null;
}

// ==================== Adapters ====================

/** Adapt a TanStack UseQueryResult into the legacy UseFetchResult<T> shape. */
export const toFetchResult = <T>(query: UseQueryResult<T, Error>): UseFetchResult<T> => ({
  data: query.data ?? null,
  isLoading: query.isPending,
  error: query.error?.message ?? null,
  refetch: query.refetch,
});

/** Adapt a TanStack UseQueryResult into the legacy FetchState<T> shape (no refetch). */
export const toFetchState = <T>(
  query: UseQueryResult<T, Error>,
  enabled: boolean = true
): FetchState<T> => ({
  data: query.data ?? null,
  isLoading: query.isPending && enabled,
  error: query.error?.message ?? null,
});

/**
 * TanStack Query Compatibility Adapter
 *
 * Wraps TanStack Query's UseQueryResult into the legacy UseFetchResult<T>
 * shape so existing page consumers don't need to change during the migration.
 *
 * Uses useMemo to return stable object references — only re-creates when
 * underlying query state actually changes. This prevents unnecessary
 * re-renders in all 23+ consuming hooks.
 *
 * Also defines the legacy type shapes (FetchState, UseFetchResult, MutationState)
 * that were originally in useFetch.ts. These types are still used by hooks that
 * maintain backward-compatible return shapes.
 */

import { useMemo } from "react";
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
export const useToFetchResult = <T>(query: UseQueryResult<T, Error>): UseFetchResult<T> => {
  const { data, isPending, error, refetch } = query;
  return useMemo(
    () => ({
      data: data ?? null,
      isLoading: isPending,
      error: error?.message ?? null,
      refetch,
    }),
    [data, isPending, error, refetch]
  );
};

/** Adapt a TanStack UseQueryResult into the legacy FetchState<T> shape (no refetch). */
export const useToFetchState = <T>(
  query: UseQueryResult<T, Error>,
  enabled: boolean = true
): FetchState<T> => {
  const { data, isPending, error } = query;
  return useMemo(
    () => ({
      data: data ?? null,
      isLoading: isPending && enabled,
      error: error?.message ?? null,
    }),
    [data, isPending, enabled, error]
  );
};

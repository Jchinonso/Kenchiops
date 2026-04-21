/**
 * Postmortem Data Hooks
 *
 * Custom hooks for fetching and mutating postmortem data.
 * Uses TanStack Query for server state management.
 */

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { fetchQuery, fetchMutation } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";
import { useToFetchResult, type UseFetchResult, type MutationState } from "@/hooks/useQueryCompat";
import type {
  PostmortemRecord,
  PaginatedPostmortems,
  SavePostmortemInput,
  UpdatePostmortemInput,
} from "./types";

// ==================== Query Hooks ====================

export const usePostmortems = (
  limit: number = 20,
  offset: number = 0
): UseFetchResult<PaginatedPostmortems> =>
  useToFetchResult(
    useQuery({
      queryKey: queryKeys.postmortems.list({ limit, offset }),
      queryFn: () =>
        fetchQuery<PaginatedPostmortems>(`/api/v1/postmortems?limit=${limit}&offset=${offset}`),
      placeholderData: keepPreviousData,
    })
  );

export const usePostmortemDetail = (id: string | null): UseFetchResult<PostmortemRecord> =>
  useToFetchResult(
    useQuery({
      queryKey: queryKeys.postmortems.detail(id ?? ""),
      queryFn: () => fetchQuery<PostmortemRecord>(`/api/v1/postmortems/${id}`),
      enabled: id !== null,
    })
  );

// ==================== Mutation Hooks ====================

export const useGeneratePostmortem = (): MutationState & {
  readonly generate: (alertId: string) => Promise<PostmortemRecord | null>;
} => {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (alertId: string) =>
      fetchMutation<PostmortemRecord>("/api/v1/postmortems/generate", {
        method: "POST",
        body: { alertId },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.postmortems.all });
    },
  });

  const generate = useCallback(
    async (alertId: string): Promise<PostmortemRecord | null> => {
      try {
        return await mutation.mutateAsync(alertId);
      } catch {
        return null;
      }
    },
    [mutation]
  );

  return {
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
    generate,
  };
};

export const useSavePostmortem = (): MutationState & {
  readonly save: (input: SavePostmortemInput) => Promise<PostmortemRecord | null>;
} => {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: SavePostmortemInput) =>
      fetchMutation<PostmortemRecord>("/api/v1/postmortems", {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.postmortems.all });
    },
  });

  const save = useCallback(
    async (input: SavePostmortemInput): Promise<PostmortemRecord | null> => {
      try {
        return await mutation.mutateAsync(input);
      } catch {
        return null;
      }
    },
    [mutation]
  );

  return {
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
    save,
  };
};

export const useUpdatePostmortem = (): MutationState & {
  readonly update: (id: string, input: UpdatePostmortemInput) => Promise<PostmortemRecord | null>;
} => {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, input }: { readonly id: string; readonly input: UpdatePostmortemInput }) =>
      fetchMutation<PostmortemRecord>(`/api/v1/postmortems/${id}`, {
        method: "PUT",
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.postmortems.all });
    },
  });

  const update = useCallback(
    async (id: string, input: UpdatePostmortemInput): Promise<PostmortemRecord | null> => {
      try {
        return await mutation.mutateAsync({ id, input });
      } catch {
        return null;
      }
    },
    [mutation]
  );

  return {
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
    update,
  };
};

export const usePublishPostmortem = (): MutationState & {
  readonly publish: (id: string) => Promise<PostmortemRecord | null>;
} => {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (id: string) =>
      fetchMutation<PostmortemRecord>(`/api/v1/postmortems/${id}/publish`, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.postmortems.all });
    },
  });

  const publish = useCallback(
    async (id: string): Promise<PostmortemRecord | null> => {
      try {
        return await mutation.mutateAsync(id);
      } catch {
        return null;
      }
    },
    [mutation]
  );

  return {
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
    publish,
  };
};

/**
 * Analysis Feedback Hooks
 *
 * TanStack Query hooks for submitting and retrieving user feedback
 * on CI failure analyses. Supports the RAG learning feedback loop.
 */

import { useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchQuery, fetchMutation } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";
import type { MutationState } from "@/hooks/useQueryCompat";
import type { FeedbackSubmission, FeedbackResponse, ExistingFeedback } from "./types";

// ==================== Query Hooks ====================

/**
 * Fetches the current user's existing feedback for an analysis.
 * Returns null if the user has not submitted feedback.
 */
export const useMyFeedback = (
  analysisId: string | null
): {
  readonly data: ExistingFeedback | null;
  readonly isLoading: boolean;
  readonly error: string | null;
} => {
  const query = useQuery({
    queryKey: queryKeys.dashboard.analyses.feedback(analysisId ?? ""),
    queryFn: () =>
      fetchQuery<ExistingFeedback | null>(
        `/api/v1/analyses/${encodeURIComponent(analysisId ?? "")}/feedback/mine`
      ),
    enabled: analysisId !== null,
  });

  return useMemo(
    () => ({
      data: query.data ?? null,
      isLoading: query.isPending && analysisId !== null,
      error: query.error?.message ?? null,
    }),
    [query.data, query.isPending, query.error, analysisId]
  );
};

// ==================== Mutation Hooks ====================

/**
 * Submits feedback for an analysis. Invalidates the feedback query on success.
 */
export const useSubmitFeedback = (
  analysisId: string
): MutationState & {
  readonly submitFeedback: (input: FeedbackSubmission) => Promise<FeedbackResponse | null>;
} => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: FeedbackSubmission): Promise<FeedbackResponse> =>
      fetchMutation<FeedbackResponse>(
        `/api/v1/analyses/${encodeURIComponent(analysisId)}/feedback`,
        {
          method: "POST",
          body: input,
        }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.analyses.feedback(analysisId),
      });
    },
  });

  const submitFeedback = useCallback(
    async (input: FeedbackSubmission): Promise<FeedbackResponse | null> => {
      try {
        return await mutation.mutateAsync(input);
      } catch {
        // Error surfaced to caller as null; toast handles user-facing message
        return null;
      }
    },
    [mutation]
  );

  return useMemo(
    () => ({
      isLoading: mutation.isPending,
      error: mutation.error?.message ?? null,
      submitFeedback,
    }),
    [mutation.isPending, mutation.error, submitFeedback]
  );
};

/**
 * Conversation List Hook
 *
 * Fetches and manages the user's conversation history using TanStack Query.
 * Supports listing conversations and deleting individual ones.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchQuery, fetchMutation, fetchMutationVoid } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";
import type { ConversationSummary, UseConversationListResult } from "./types";

const CONVERSATIONS_PATH = "/api/v1/chat/conversations";

export const useConversationList = (): UseConversationListResult => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.chat.conversations(),
    queryFn: () => fetchQuery<readonly ConversationSummary[]>(CONVERSATIONS_PATH),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetchMutationVoid(`${CONVERSATIONS_PATH}/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversations(),
      });
    },
  });

  const renameMutation = useMutation({
    mutationFn: (variables: { readonly id: string; readonly title: string }) =>
      fetchMutation<ConversationSummary>(`${CONVERSATIONS_PATH}/${variables.id}`, {
        method: "PUT",
        body: { title: variables.title },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversations(),
      });
    },
  });

  return {
    conversations: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    deleteConversation: (id: string) => deleteMutation.mutate(id),
    isDeleting: deleteMutation.isPending,
    renameConversation: (id: string, title: string) => renameMutation.mutate({ id, title }),
    isRenaming: renameMutation.isPending,
    refetch: () => {
      void query.refetch();
    },
  };
};

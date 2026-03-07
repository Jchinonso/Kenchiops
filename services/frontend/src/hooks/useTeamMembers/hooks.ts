/**
 * Team Members Hooks
 *
 * Custom hooks for fetching team member data and performing mutations
 * (role changes, member removal). Uses TanStack Query for GET requests
 * and useMutation with cache invalidation for writes.
 */

import { useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchQuery, fetchMutation, fetchMutationVoid } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";
import type { TeamMemberDTO } from "./types";

// ==================== Query Hook ====================

export const useTeamMembers = () => {
  const query = useQuery({
    queryKey: queryKeys.team.members(),
    queryFn: () => fetchQuery<readonly TeamMemberDTO[]>("/api/v1/team/members"),
  });

  return useMemo(
    () => ({
      data: query.data ?? null,
      isLoading: query.isPending,
      error: query.error?.message ?? null,
    }),
    [query.data, query.isPending, query.error]
  );
};

// ==================== Mutation Hooks ====================

interface ChangeRoleInput {
  readonly userId: string;
  readonly role: string;
}

export const useChangeRole = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: ChangeRoleInput): Promise<TeamMemberDTO> =>
      fetchMutation<TeamMemberDTO>(`/api/v1/team/members/${input.userId}/role`, {
        method: "PATCH",
        body: { role: input.role },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.team.members() });
    },
  });

  const changeRole = useCallback(
    async (userId: string, role: string): Promise<TeamMemberDTO | null> => {
      try {
        return await mutation.mutateAsync({ userId, role });
      } catch {
        return null;
      }
    },
    [mutation]
  );

  return {
    changeRole,
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
  };
};

export const useRemoveMember = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (userId: string): Promise<void> =>
      fetchMutationVoid(`/api/v1/team/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.team.members() });
    },
  });

  const removeMember = useCallback(
    async (userId: string): Promise<boolean> => {
      try {
        await mutation.mutateAsync(userId);
        return true;
      } catch {
        return false;
      }
    },
    [mutation]
  );

  return {
    removeMember,
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
  };
};

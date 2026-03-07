/**
 * Invitation Hooks
 *
 * Custom hooks for fetching pending invitations and performing mutations
 * (create, revoke). Uses TanStack Query for GET requests and useMutation
 * with cache invalidation for writes.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchQuery, fetchMutation, fetchMutationVoid } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";

// ==================== DTO Types ====================

export interface InvitationDTO {
  readonly id: string;
  readonly email: string;
  readonly role: string;
  readonly status: string;
  readonly expiresAt: string;
  readonly createdAt: string;
}

// ==================== Query Hook ====================

export const useInvitations = (enabled: boolean = true) => {
  const query = useQuery({
    queryKey: queryKeys.team.invitations(),
    queryFn: () => fetchQuery<readonly InvitationDTO[]>("/api/v1/invitations"),
    enabled,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isPending,
    error: query.error?.message ?? null,
  };
};

// ==================== Mutation Hooks ====================

interface CreateInvitationInput {
  readonly email: string;
  readonly role: string;
}

export const useCreateInvitation = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: CreateInvitationInput): Promise<InvitationDTO> =>
      fetchMutation<InvitationDTO>("/api/v1/invitations", {
        method: "POST",
        body: { email: input.email, role: input.role },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.team.invitations() });
    },
  });

  const createInvitation = async (email: string, role: string): Promise<InvitationDTO | null> => {
    try {
      return await mutation.mutateAsync({ email, role });
    } catch {
      return null;
    }
  };

  return {
    createInvitation,
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
  };
};

export const useRevokeInvitation = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (invitationId: string): Promise<void> =>
      fetchMutationVoid(`/api/v1/invitations/${invitationId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.team.invitations() });
    },
  });

  const revokeInvitation = async (invitationId: string): Promise<boolean> => {
    try {
      await mutation.mutateAsync(invitationId);
      return true;
    } catch {
      return false;
    }
  };

  return {
    revokeInvitation,
    isLoading: mutation.isPending,
    error: mutation.error?.message ?? null,
  };
};

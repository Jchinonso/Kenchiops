/**
 * Invitation Hooks
 *
 * Custom hooks for fetching pending invitations and performing mutations
 * (create, revoke). Uses shared useFetch hook for GET requests and
 * apiClient for mutations. Follows patterns from useTeamMembers.ts.
 */

import { useState, useCallback } from "react";
import { apiClient } from "@/lib/apiClient";
import {
  useFetch,
  parseErrorBody,
  type UseFetchResult,
  type MutationState,
} from "@/hooks/useFetch";

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

export const useInvitations = (
  refreshKey: number = 0,
  enabled: boolean = true
): UseFetchResult<readonly InvitationDTO[]> =>
  useFetch<readonly InvitationDTO[]>(enabled ? "/api/v1/invitations" : "", `${refreshKey}`);

// ==================== Mutation Hooks ====================

export const useCreateInvitation = (): MutationState & {
  readonly createInvitation: (email: string, role: string) => Promise<InvitationDTO | null>;
} => {
  const [state, setState] = useState<MutationState>({
    isLoading: false,
    error: null,
  });

  const createInvitation = useCallback(
    async (email: string, role: string): Promise<InvitationDTO | null> => {
      setState({ isLoading: true, error: null });
      try {
        const response = await apiClient("/api/v1/invitations", {
          method: "POST",
          body: { email, role },
        });
        if (!response.ok) {
          const message = await parseErrorBody(
            response,
            `Failed to create invitation (${response.status})`
          );
          setState({ isLoading: false, error: message });
          return null;
        }
        const json: { readonly data: InvitationDTO } = await response.json();
        setState({ isLoading: false, error: null });
        return json.data;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Unknown error";
        setState({ isLoading: false, error: message });
        return null;
      }
    },
    []
  );

  return { ...state, createInvitation };
};

export const useRevokeInvitation = (): MutationState & {
  readonly revokeInvitation: (invitationId: string) => Promise<boolean>;
} => {
  const [state, setState] = useState<MutationState>({
    isLoading: false,
    error: null,
  });

  const revokeInvitation = useCallback(async (invitationId: string): Promise<boolean> => {
    setState({ isLoading: true, error: null });
    try {
      const response = await apiClient(`/api/v1/invitations/${invitationId}`, { method: "DELETE" });
      if (!response.ok) {
        const message = await parseErrorBody(
          response,
          `Failed to revoke invitation (${response.status})`
        );
        setState({ isLoading: false, error: message });
        return false;
      }
      setState({ isLoading: false, error: null });
      return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unknown error";
      setState({ isLoading: false, error: message });
      return false;
    }
  }, []);

  return { ...state, revokeInvitation };
};

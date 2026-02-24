/**
 * Team Members Hooks
 *
 * Custom hooks for fetching team member data and performing mutations
 * (role changes, member removal). Uses shared useFetch hook for GET
 * requests and apiClient for mutations.
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

export interface TeamMemberDTO {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly avatarUrl: string | null;
  readonly role: string;
  readonly joinedAt: string;
  readonly providers: ReadonlyArray<{
    readonly provider: string;
    readonly username: string | null;
  }>;
}

// ==================== Query Hook ====================

export const useTeamMembers = (refreshKey: number = 0): UseFetchResult<readonly TeamMemberDTO[]> =>
  useFetch<readonly TeamMemberDTO[]>("/api/v1/team/members", `${refreshKey}`);

// ==================== Mutation Hooks ====================

export const useChangeRole = (): MutationState & {
  readonly changeRole: (userId: string, role: string) => Promise<TeamMemberDTO | null>;
} => {
  const [state, setState] = useState<MutationState>({ isLoading: false, error: null });

  const changeRole = useCallback(
    async (userId: string, role: string): Promise<TeamMemberDTO | null> => {
      setState({ isLoading: true, error: null });
      try {
        const response = await apiClient(`/api/v1/team/members/${userId}/role`, {
          method: "PATCH",
          body: { role },
        });
        if (!response.ok) {
          const message = await parseErrorBody(
            response,
            `Failed to change role (${response.status})`
          );
          setState({ isLoading: false, error: message });
          return null;
        }
        const json: { readonly data: TeamMemberDTO } = await response.json();
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

  return { ...state, changeRole };
};

export const useRemoveMember = (): MutationState & {
  readonly removeMember: (userId: string) => Promise<boolean>;
} => {
  const [state, setState] = useState<MutationState>({ isLoading: false, error: null });

  const removeMember = useCallback(async (userId: string): Promise<boolean> => {
    setState({ isLoading: true, error: null });
    try {
      const response = await apiClient(`/api/v1/team/members/${userId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const message = await parseErrorBody(
          response,
          `Failed to remove member (${response.status})`
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

  return { ...state, removeMember };
};

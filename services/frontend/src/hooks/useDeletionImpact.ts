/**
 * Hook for fetching account deletion impact data.
 *
 * Lazy-loaded: only fetches when fetchImpact() is called
 * (triggered when the delete dialog opens).
 * Uses TanStack Query with enabled: false for manual triggering.
 */

import { useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchQuery } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";

interface AffectedResources {
  readonly providerConnections: number;
  readonly gitlabWebhooks: number;
  readonly hasSlackIntegration: boolean;
}

export interface DeletionImpact {
  readonly isLastMember: boolean;
  readonly tenantId: string | null;
  readonly tenantName: string | null;
  readonly memberCount: number;
  readonly willDeleteTenant: boolean;
  readonly affectedResources: AffectedResources;
}

export const useDeletionImpact = () => {
  const query = useQuery({
    queryKey: queryKeys.account.deletionImpact(),
    queryFn: () => fetchQuery<DeletionImpact>("/auth/me/deletion-impact"),
    enabled: false,
  });

  const fetchImpact = useCallback(async (): Promise<void> => {
    await query.refetch();
  }, [query]);

  return useMemo(
    () => ({
      impact: query.data ?? null,
      isLoading: query.isFetching,
      error: query.error?.message ?? null,
      fetchImpact,
    }),
    [query.data, query.isFetching, query.error, fetchImpact]
  );
};

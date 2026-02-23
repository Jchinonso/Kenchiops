/**
 * Hook for fetching account deletion impact data.
 *
 * Lazy-loaded: only fetches when fetchImpact() is called
 * (triggered when the delete dialog opens).
 */

import { useState, useCallback } from "react";
import { apiClient } from "@/lib/apiClient";

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

interface UseDeletionImpactResult {
  readonly impact: DeletionImpact | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly fetchImpact: () => Promise<void>;
}

export const useDeletionImpact = (): UseDeletionImpactResult => {
  const [impact, setImpact] = useState<DeletionImpact | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchImpact = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient("/auth/me/deletion-impact");
      if (response.ok) {
        const json = (await response.json()) as { readonly data: DeletionImpact };
        setImpact(json.data);
      } else {
        setError("Failed to check deletion impact");
      }
    } catch {
      setError("Failed to check deletion impact");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { impact, isLoading, error, fetchImpact };
};

/**
 * Plan Limit Error Hook
 *
 * Reusable hook that detects plan limit errors from API responses or
 * URL redirect params and manages UpgradePrompt dialog state.
 */

import { useState, useCallback } from "react";
import { parseStructuredError } from "@/hooks/useFetch";

// ==================== Types ====================

interface PlanLimitState {
  readonly limitKey: string;
  readonly currentUsage: number;
  readonly limit: number;
  readonly currentPlan: string;
}

export interface UsePlanLimitErrorResult {
  /** Current plan limit error state, or null if no error. */
  readonly planLimitError: PlanLimitState | null;
  /** Whether the UpgradePrompt dialog should be open. */
  readonly isOpen: boolean;
  /** Check an API response for a plan limit error. Returns true if limit was hit. */
  readonly checkResponse: (response: Response) => Promise<boolean>;
  /** Check URL search params for plan limit redirect. Returns true if limit was hit. */
  readonly checkUrlParams: (params: URLSearchParams) => boolean;
  /** Dismiss the UpgradePrompt dialog. */
  readonly dismiss: () => void;
}

// ==================== Hook ====================

export const usePlanLimitError = (): UsePlanLimitErrorResult => {
  const [state, setState] = useState<PlanLimitState | null>(null);

  const checkResponse = useCallback(async (response: Response): Promise<boolean> => {
    if (response.status !== 403) {
      return false;
    }

    const error = await parseStructuredError(response);

    if (error?.metadata?.code !== "PLAN_LIMIT_EXCEEDED") {
      return false;
    }

    setState({
      limitKey: String(error.metadata.limitKey),
      currentUsage: Number(error.metadata.currentUsage),
      limit: Number(error.metadata.limit),
      currentPlan: String(error.metadata.currentPlan),
    });

    return true;
  }, []);

  const checkUrlParams = useCallback((params: URLSearchParams): boolean => {
    if (params.get("status") !== "limit_exceeded") {
      return false;
    }

    setState({
      limitKey: params.get("limitKey") ?? "",
      currentUsage: Number(params.get("currentUsage") ?? 0),
      limit: Number(params.get("limit") ?? 0),
      currentPlan: params.get("currentPlan") ?? "free",
    });

    return true;
  }, []);

  const dismiss = useCallback(() => setState(null), []);

  return {
    planLimitError: state,
    isOpen: state !== null,
    checkResponse,
    checkUrlParams,
    dismiss,
  };
};

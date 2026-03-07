/**
 * Plan Limit Error Hook
 *
 * Reusable hook that detects plan limit errors from API responses or
 * URL redirect params and manages UpgradePrompt dialog state.
 */

import { useState, useCallback, useMemo } from "react";
import { parseStructuredError } from "@/lib/fetchQuery";
import type { PlanLimitState, UsePlanLimitErrorResult } from "./types";

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

  return useMemo(
    () => ({
      planLimitError: state,
      isOpen: state !== null,
      checkResponse,
      checkUrlParams,
      dismiss,
    }),
    [state, checkResponse, checkUrlParams, dismiss]
  );
};

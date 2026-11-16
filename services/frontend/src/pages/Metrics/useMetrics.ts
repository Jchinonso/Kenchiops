/**
 * Data hook for the reliability metrics dashboard.
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchQuery } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";
import { TREND_DAYS } from "./constants";
import type { ReliabilityMetrics } from "./types";

/**
 * Fetch tenant-scoped reliability metrics (MTTR, AI success rate, severity mix,
 * trend, estimated time saved).
 */
export const useReliabilityMetrics = (
  days: number = TREND_DAYS
): UseQueryResult<ReliabilityMetrics> =>
  useQuery({
    queryKey: queryKeys.metrics.reliability(days),
    queryFn: () => fetchQuery<ReliabilityMetrics>(`/api/v1/metrics?days=${days}`),
  });

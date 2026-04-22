/**
 * Timeline Data Hooks
 *
 * Custom hooks for fetching unified timeline data from the API.
 * Uses TanStack Query for server state management.
 */

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchQuery } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";
import { useToFetchResult, type UseFetchResult } from "@/hooks/useQueryCompat";
import type { PaginatedTimeline, UseTimelineOptions } from "./types";

// ==================== URL Builder ====================

const buildTimelineUrl = (
  limit: number,
  offset: number,
  timeRange: string,
  source?: string
): string => {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    timeRange,
  });
  if (source) {
    params.set("source", source);
  }
  return `/api/v1/timeline?${params.toString()}`;
};

// ==================== Query Hook ====================

export const useTimeline = (options: UseTimelineOptions): UseFetchResult<PaginatedTimeline> => {
  const { tenantId, limit = 50, offset = 0, timeRange = "7d", source } = options;
  return useToFetchResult(
    useQuery({
      queryKey: queryKeys.timeline.list({ tenantId, limit, offset, timeRange, source }),
      queryFn: () =>
        fetchQuery<PaginatedTimeline>(buildTimelineUrl(limit, offset, timeRange, source)),
      enabled: !!tenantId,
      placeholderData: keepPreviousData,
    })
  );
};

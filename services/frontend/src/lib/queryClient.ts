/**
 * TanStack Query Client
 *
 * Singleton QueryClient with defaults optimized for Kenchi's SSE-driven
 * dashboard. SSE events trigger targeted cache invalidation, so
 * refetchOnWindowFocus is disabled to avoid rate-limiter pressure.
 */

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      throwOnError: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

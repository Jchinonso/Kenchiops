# TanStack Query Migration Patterns

## Infrastructure Files

- `services/frontend/src/lib/queryClient.ts` -- singleton QueryClient
- `services/frontend/src/lib/queryKeys.ts` -- hierarchical key factory for all domains
- `services/frontend/src/lib/fetchQuery.ts` -- queryFn/mutationFn wrappers around apiClient

## Key Decisions

- `QueryClientProvider` wraps inside `AuthProvider`, outside `Routes` in App.tsx
- `refetchOnWindowFocus: false` -- SSE provides real-time updates
- `staleTime: 2min`, `gcTime: 10min` -- SSE-driven invalidation handles freshness
- `retry: 1` for queries (apiClient handles 401 refresh), `retry: 0` for mutations

## Backward Compatibility Strategy

- Phase 1 leaf hooks (billing, subscription, team, invitations, deletionImpact) return wrapped results: `{ data: T | null, isLoading, error: string | null }` matching the old `UseFetchResult<T>` interface
- Hooks that dashboard pages still pass `refreshKey` to accept `_refreshKey?: number` ignored parameter
- `useBillingStatus()` returns raw useQuery result -- consumers use `data?.` which works with `undefined`
- Phase 2+ hooks will use a compatibility shim wrapping TQ result to match `UseFetchResult<T>`

## fetchQuery.ts API

- `fetchQuery<T>(path)` -- GET, unwraps `{ data: T }` envelope, throws ApiError
- `fetchQueryPost<T>(path, body)` -- POST-based queries (e.g., batch lookups)
- `fetchMutation<T>(path, { method, body })` -- mutations returning data
- `fetchMutationVoid(path, { method, body })` -- mutations with no return data
- `fetchMutationRaw(path, { method, body })` -- returns raw Response (for plan limit checks)
- `ApiError` class with `status` and `code` fields

## Mutation Pattern with Cache Invalidation

```typescript
const mutation = useMutation({
  mutationFn: (input) => fetchMutation("/path", { method: "POST", body: input }),
  onSuccess: () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.domain.entity() });
  },
});
```

## Special Cases

- `useChangePlan` uses `fetchMutationRaw` to get raw Response for `usePlanLimitError.checkResponse()`
- `useDeletionImpact` uses `enabled: false` with `refetch()` for lazy loading
- `useBillingPortal` redirects to external URL after mutation succeeds -- uses `window.location.href`

## Migration Order (Plan)

- Phase 0: Infrastructure (done)
- Phase 1: Leaf hooks -- settings pages only, no SSE interaction (done)
- Phase 2: Core data hooks (dashboard, incidents, investigations) -- with compatibility shim
- Phase 3: SSE integration -- replace refreshKey with queryClient.invalidateQueries()
- Phase 4: Remove refreshKey prop-drilling from all pages
- Phase 5: Delete useFetch.ts, update tests

## useFetch.ts Still Used By

- `useDashboardData.ts` (14 hooks) -- Phase 2
- `useIncidentData.ts` (8 hooks) -- Phase 2
- `useInvestigationData.ts` (3 hooks) -- Phase 2
- `usePlanLimitError.ts` imports `parseStructuredError` from useFetch -- keep until Phase 5

# Frontend Refactor Analyst Memory

## Key Frontend Conventions

- Props interfaces live alongside components (CLAUDE.md exception for frontend)
- `console.warn` behind `import.meta.env.DEV` is accepted practice
- `@kenchi/shared` imports: `import type` works (see `useAnalysisFeedback/types.ts`). Runtime imports may still be blocked by Docker build context. Needs verification.
- TanStack Query for all server state; queryKeys factory in `lib/queryKeys.ts`
- SSE events handled in `useDashboardSSE.ts` with debounced invalidation pattern

## Common Issues Found

### SSE Hook (`src/hooks/useDashboardSSE.ts`)

- Empty catch blocks for sessionStorage (should have comments)
- DashboardNotification type union incomplete (missing investigation/org event types)
- dev-gated console.warn is acceptable but noted

### Investigation Data Hook (`src/hooks/useInvestigationData.ts`)

- `isActiveStatus` check is incomplete -- missing "parsing", "correlating", "diagnosing" statuses
- Polling fallback (30s) won't trigger for those intermediate phases if SSE is down
- Has inline UUID pattern because shared package can't be imported

### Phase 2 RAG Code (`src/hooks/useKnowledgeBase/`, `src/pages/KnowledgeBase.tsx`, `src/components/FeedbackSection.tsx`)

- Uses `/api/rag/` prefix instead of `/api/v1/` -- only module breaking the pattern
- Missing `keepPreviousData` on paginated query (every other paginated hook uses it)
- `.sort()` mutation in `useMemo` (line 74, 168 of KnowledgeBase.tsx) -- use `.toSorted()`
- FeedbackSection has fragile setState-during-render pattern (boolean flag instead of prev-value tracking)
- Inline URL building instead of `urlBuilders.ts` pattern
- `formatDocType` helper defined locally; should go in `lib/formatters.ts`

### Codebase-Wide Patterns (confirmed across multiple audits)

- All paginated queries use `keepPreviousData` -- new hooks must follow
- URL construction centralized in `urlBuilders.ts` per hook module
- `useToFetchResult` adapter wraps all TanStack queries for backward compat
- Error type from `UseFetchResult` is always `string | null` (pre-extracted by adapter)
- Prefetch routes mirror in `DashboardSidebar.tsx` must stay in sync with hook queryKeys
- `staleTime` should match between sidebar prefetch and consuming hook (currently 30s)

# Frontend Refactor Analyst Memory

## Key Frontend Conventions

- Props interfaces live alongside components (CLAUDE.md exception for frontend)
- `console.warn` behind `import.meta.env.DEV` is accepted practice
- Frontend cannot import from `@kenchi/shared` (Docker build context limitation)
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

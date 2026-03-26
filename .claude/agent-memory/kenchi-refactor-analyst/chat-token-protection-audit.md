---
name: Chat Token Protection Audit
description: Audit of chat budget, rate limiting, token usage tracking, and frontend budget warning features (2026-03-23)
type: project
---

## Chat Token Protection Audit (2026-03-23)

### Files: chatBudget.ts, chatRateLimit.ts, chatTokenUsage/_, chatService.ts, chatRoutes.ts, hooks/useCopilotChat/_, CopilotDrawer.tsx, constants/api.ts, migration 039

### HIGH (3)

1. `handleChatCompletion` not wrapped in asyncHandler -- `requireTenantId` at chatRoutes.ts:212 can throw unguarded
2. chatService.ts:18 imports `isOpenRouterProvider` from LLM provider module (Hard Rule #5 violation)
3. `.push()` in chatService.ts:292,300,379,388 -- streaming accumulator, justified but comment style could be clearer

### MEDIUM (4 actionable)

1. `getTodayTokenUsage` accepts `context` param but never uses it (needs `_` prefix)
2. `ChatStreamChunk` type duplicated in frontend types.ts (sync risk)
3. `as keyof typeof` cast in chatBudget.ts:36 before `in` check (minor style)
4. Redundant SQL index in migration 039 (UNIQUE constraint already creates index)

### Quality Positives

- All types in types.ts files. All readonly. All let justified.
- No any, no console.log, no process.env. Parameterized SQL.
- Port interfaces vendor-free. RequestContext propagated.
- Fail-open design on budget checks and rate limits.
- Barrel exports complete. Tests mock at boundaries.
- Frontend: proper useCallback deps, cleanup effects, Tailwind only.

# Auth Implementation: What's Done vs. What's Needed

## Summary

The auth implementation is **~65% complete**. The database layer and shared package foundation are fully implemented and CLAUDE.md-compliant. However, there are critical CLAUDE.md violations in the API layer, missing infrastructure pieces, and the frontend integration is entirely incomplete.

---

## What's DONE and Correct

### Database Layer (100% Complete)

- [x] `database/init/012_users_and_sessions.sql` — Migration with all 4 tables, indexes, triggers
- [x] `packages/shared/src/database/user/types.ts` — Row, domain, input, JWT types (all readonly)
- [x] `packages/shared/src/database/user/helpers.ts` — Row-to-domain mappers, validators
- [x] `packages/shared/src/database/user/serviceLookup.ts` — findUserById, findUserByEmail, findOAuthIdentity
- [x] `packages/shared/src/database/user/serviceLifecycle.ts` — createUser, updateLastLogin, updateUserTenant, upsertOAuthIdentity
- [x] `packages/shared/src/database/user/oauthState.ts` — createOAuthState, consumeOAuthState, cleanupExpiredStates
- [x] `packages/shared/src/database/user/refreshToken.ts` — CRUD + family revocation + cleanup
- [x] `packages/shared/src/database/user/index.ts` — Barrel exports

### Shared Package Foundation (100% Complete)

- [x] `packages/shared/src/constants/auth.ts` — All constants, SQL queries, provider URLs, JWT config
- [x] `packages/shared/src/constants/index.ts` — Exports auth constants
- [x] `packages/shared/src/security/jwt.ts` — generateAccessToken, verifyAccessToken, generateRefreshToken, hashRefreshToken
- [x] `packages/shared/src/security/index.ts` — Exports JWT utilities
- [x] `packages/shared/src/core/config.ts` — JWT_SECRET, OAuth client IDs/secrets, FRONTEND_URL, OAUTH_CALLBACK_BASE_URL
- [x] `packages/shared/src/core/types.ts` — Config interface extended with auth fields (all readonly)
- [x] `packages/shared/src/index.ts` — Exports user module + JWT utilities
- [x] `packages/shared/src/database/index.ts` — Exports user database module
- [x] `packages/shared/package.json` — jsonwebtoken + @types/jsonwebtoken added

### API Service Layer (Exists but has violations)

- [x] `services/api/src/ports/oauthPort.ts` — Port interface (exists, needs fix)
- [x] `services/api/src/adapters/githubOAuthAdapter.ts` — GitHub OAuth adapter (exists, needs fix)
- [x] `services/api/src/adapters/oauthAdapterRegistry.ts` — Provider registry
- [x] `services/api/src/adapters/oauthAdapterTypes.ts` — Vendor-specific response types
- [x] `services/api/src/routes/authRoutes.ts` — OAuth routes (exists, needs fix)
- [x] `services/api/src/services/authService.ts` — Auth business logic (exists, needs fix)
- [x] `services/api/src/services/authServiceTypes.ts` — Auth service types

---

## What's BROKEN (CLAUDE.md Violations to Fix)

### CRITICAL: RequestContext Not Propagated (Rule 8)

**Every async function doing I/O must accept `context: RequestContext` as last param.**

Files needing fixes:

1. **`services/api/src/ports/oauthPort.ts`** — All 3 method signatures missing `context: RequestContext`
2. **`services/api/src/adapters/githubOAuthAdapter.ts`** — All 3 implementations missing `context: RequestContext`, all logs missing `...context` spread
3. **`services/api/src/services/authService.ts`** — All async methods missing `context: RequestContext`, all logs missing `...context` spread
4. **`services/api/src/routes/authRoutes.ts`** — Not passing `req.context` to service/adapter calls

### MAJOR: Logs Missing Required Fields

Per CLAUDE.md, adapter logs MUST include `provider`, `operation`, `durationMs`, `statusCode`, `...context`. Currently `...context` is missing from all adapter and service logs.

### MINOR: Potential Secrets in Error Logs

`githubOAuthAdapter.ts` logs raw error messages from GitHub responses without `redactSecrets()`.

---

## What's MISSING (Not Yet Implemented)

### 1. Auth Middleware — `packages/shared/src/http/authMiddleware.ts`

- JWT verification middleware for Express
- Must skip public routes (`/health`, `/auth/`, `/webhooks/`)
- Must set `req.user` (AuthenticatedUser) and update `req.context` with userId/tenantId
- **This is critical** — without it, protected routes can't verify tokens

### 2. Auth Routes Not Registered in API

- `services/api/src/routes/index.ts` — Does NOT import or register `authRoutes`
- `services/api/src/index.ts` — Does NOT apply `authMiddleware`

### 3. Frontend (Phase 5 — 0% Complete)

- `services/frontend/src/pages/AuthCallback.tsx` — OAuth redirect handler (MISSING)
- `services/frontend/src/lib/apiClient.ts` — Authenticated HTTP client with auto-refresh (MISSING)
- `services/frontend/src/App.tsx` — No `/auth/callback` route
- `services/frontend/src/pages/Login.tsx` — Buttons navigate locally (`navigate('/dashboard')`) instead of redirecting to OAuth endpoints
- No auth state management (context/store)
- No protected route wrapper
- No TanStack Query integration
- Dashboard uses hardcoded mock data

### 4. Additional OAuth Providers (Phase 4)

- `services/api/src/adapters/gitlabOAuthAdapter.ts` — NOT implemented
- `services/api/src/adapters/bitbucketOAuthAdapter.ts` — NOT implemented
- Azure DevOps adapter — NOT implemented

### 5. Missing Integration Points

- `.env.example` — Auth env vars not documented
- No auth-specific rate limiting on `/auth/*` routes

---

## Implementation Plan (Ordered by Phase)

### Phase 1: Fix CLAUDE.md Violations (Backend — Critical)

**Task 1.1**: Add `context: RequestContext` to OAuth port interface

- File: `services/api/src/ports/oauthPort.ts`

**Task 1.2**: Add `context: RequestContext` to GitHub OAuth adapter + spread in all logs

- File: `services/api/src/adapters/githubOAuthAdapter.ts`

**Task 1.3**: Add `context: RequestContext` to auth service + spread in all logs

- File: `services/api/src/services/authService.ts`

**Task 1.4**: Pass `req.context` from route handlers to service/adapter calls

- File: `services/api/src/routes/authRoutes.ts`

**Task 1.5**: Use `redactSecrets()` on external error messages before logging

- File: `services/api/src/adapters/githubOAuthAdapter.ts`

### Phase 2: Create Auth Middleware (Backend — Critical)

**Task 2.1**: Create `packages/shared/src/http/authMiddleware.ts`

- JWT verification middleware
- Public route allowlist
- Set `req.user` and `req.context`
- Export from `packages/shared/src/http/index.ts` and `packages/shared/src/index.ts`

**Task 2.2**: Register auth middleware and routes in API service

- Update `services/api/src/routes/index.ts` to import/register `authRoutes`
- Update `services/api/src/index.ts` to apply `authMiddleware`

### Phase 3: Frontend Auth Integration (Frontend — Critical)

**Task 3.1**: Create `AuthCallback.tsx` page — receives tokens from OAuth redirect
**Task 3.2**: Create `apiClient.ts` — authenticated fetch with auto-refresh
**Task 3.3**: Update `Login.tsx` — buttons redirect to `GET /auth/{provider}/login`
**Task 3.4**: Update `App.tsx` — add `/auth/callback` route
**Task 3.5**: Add auth state management (React Context)
**Task 3.6**: Add protected route wrapper component

### Phase 4: Additional Providers (Lower Priority)

**Task 4.1**: GitLab OAuth adapter
**Task 4.2**: Bitbucket OAuth adapter
**Task 4.3**: Azure DevOps OAuth adapter (most complex)

### Phase 5: Testing & Hardening

**Task 5.1**: Unit tests for JWT utilities
**Task 5.2**: Unit tests for auth service (mocked repos)
**Task 5.3**: Integration tests for OAuth routes
**Task 5.4**: Auth middleware tests
**Task 5.5**: Frontend auth flow E2E tests

---

## Recommended Execution Order

Start with **Phase 1 + Phase 2** in parallel (backend fixes), then **Phase 3** (frontend), then **Phase 4** (additional providers). Phase 5 testing should happen alongside each phase.

The most impactful immediate work is:

1. Fix RequestContext propagation (Phase 1) — security/observability gap
2. Create auth middleware (Phase 2) — blocks all protected route work
3. Frontend auth flow (Phase 3) — blocks user-facing functionality

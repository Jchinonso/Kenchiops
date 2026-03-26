# Test Engineer Memory

## Testing Framework

- **Jest** with `@jest/globals` imports (`import { describe, it, expect, jest, beforeEach } from "@jest/globals"`)
- **ts-jest** with ESM preset (`ts-jest/presets/default-esm`), `isolatedModules: true`
- Root jest.config.js at `/home/chinonso/Documents/kenchi/jest.config.js`
- `moduleNameMapper`: `@kenchi/shared` maps to `<rootDir>/packages/shared/src/index.ts`

## Mocking Pattern (Critical)

- Use `jest.mock()` (NOT `jest.unstable_mockModule` + `await import()`)
- Top-level `await import()` fails with "await is only valid in async functions"
- Pattern: define mock fns at top level -> `jest.mock(...)` -> import module under test
- For `@kenchi/shared` mocks: `jest.requireActual("@kenchi/shared")` + spread actual + override specific fns
- Mock functions must be wrapped: `(...args) => mockFn(...args)` inside `jest.mock()` factory to avoid hoisting issues

## Test File Locations

- Shared package: `packages/shared/src/__tests__/<domain>/` (e.g., `__tests__/security/`, `__tests__/http/`)
- API service: `services/api/src/__tests__/` (flat) or `services/api/src/__tests__/services/` (nested for services)

## Auth & Subscription Test Coverage (updated 2026-02-28)

- `/services/api/src/__tests__/services/authService.test.ts` - 43 tests (all service methods + plan limit enforcement)
- `/services/api/src/__tests__/invitationRoutes.test.ts` - 13 tests (accept/create with enforcePlanLimit)
- `/services/api/src/__tests__/subscriptionRoutes.test.ts` - 10 tests (downgrade validation fence-post)
- `/packages/shared/src/__tests__/security/jwt.test.ts` - 27 tests (all JWT functions)
- `/packages/shared/src/__tests__/http/authMiddleware.test.ts` - 20 tests (middleware)
- OAuth adapters: gitlab(27), bitbucket(30), azureDevOps(32), github(40)

## OAuth Adapter Testing Pattern

- Mock `global.fetch` via `jest.fn<typeof global.fetch>()` at top, assign in `beforeEach`
- Mock `@kenchi/shared` with `jest.requireActual` spread + override config + createLogger
- For config mutation tests: `jest.requireMock("@kenchi/shared")` to get mutable config, save/restore original values
- Use `createFetchResponse(data, status, ok)` factory for consistent Response mocks
- Test retryable classification: 429 and >= 500 are retryable; 400, 401, 403, 404 are non-retryable
- Test response body error field path (non-retryable, error_description fallback to error)
- Test network errors (fetch rejection) always produce retryable ExternalServiceError
- Adapter tests live in `services/api/src/adapters/__tests__/` directory

## Key Patterns

- `createTestUser(overrides)` factory for User domain objects
- `createTestOAuthIdentity(overrides)` for OAuthIdentity
- `createTestRefreshToken(overrides)` for RefreshToken
- `createTestProfile(overrides)` for OAuthProviderProfile
- `createTestTokens(overrides)` for OAuthTokenResponse
- Always use `testContext: RequestContext = { requestId: "test-request-id", tenantId: "test-tenant" }`
- Mock Express req/res/next: `createMockRequest()`, `createMockResponse()`, `createMockNext()`
- For middleware tests: pass `context` via custom property on req, use `jest.fn<NextFunction>()`

## Frontend Testing (Vitest + React Testing Library)

- **Framework**: Vitest 4.x with jsdom, `@testing-library/react`, `@testing-library/jest-dom/vitest`, `@testing-library/user-event`
- **Config**: `services/frontend/vite.config.ts` has `test` block with `environment: "jsdom"`, `setupFiles: ["./src/test-setup.ts"]`
- **Test setup**: `src/test-setup.ts` imports `@testing-library/jest-dom/vitest`, mocks matchMedia, IntersectionObserver, ResizeObserver
- **Run**: `npm test` in `services/frontend/` (triggers `pretest` script first)
- **Import**: `import { describe, it, expect, vi, beforeEach } from "vitest"` (NOT `@jest/globals`)

### Dual React Monorepo Problem (Critical)

- Root monorepo has React 18.3.1, frontend has React 19.2.4
- npm workspace hoists `@testing-library/react`, `lucide-react`, `react-router-dom` to root `node_modules/`
- These packages internally `require('react')` which resolves to React 18 at root
- **Fix**: `pretest` script in package.json copies hoisted packages to local `node_modules/`
- Vite `resolve.alias` with regex patterns pins React resolution: `{ find: /^react($|\/)/, replacement: ... }`
- Radix UI pre-compiled with React 18 JSX cannot be fixed by copying -- must mock `@/components/ui/select` etc.

### Frontend Mock Patterns

- Mock Radix UI Select: `vi.mock("@/components/ui/select", () => ({ Select: ..., SelectTrigger: ..., ... }))` renders native elements
- Mock `sonner` toast: `vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))` -- inline fns, no top-level refs
- Mock `lucide-react`: use `vi.mock("lucide-react", async () => { const React = await import("react"); return {...} })` with `React.createElement`
- Mock hooks: `vi.mock("@/hooks/useMyHook", () => ({ useMyHook: vi.fn() }))` then `vi.mocked(useMyHook)` after import
- Mock `globalThis.fetch` for apiClient tests
- Mock `navigator.clipboard`: use `Object.defineProperty(navigator, "clipboard", { value: ..., writable: true, configurable: true })`
- Mock DOM for CSV download: mock `document.createElement`, `URL.createObjectURL`, etc.
- `userEvent.type` + `vi.useFakeTimers` causes hangs -- use `fireEvent.change` for debounce tests
- Multiple elements with same text in mocked Select -- use `getAllByText(...).length >= 1`
- **CRITICAL**: vi.mock factory cannot reference top-level `const` variables (hoisting). Use inline values or `async () => import("react")`
- **CRITICAL**: Must run `npm run pretest` before Vitest to copy hoisted packages to local node_modules
- Tailwind class assertions: inactive buttons have `hover:text-green-700` -- use `bg-green-50` (active-only) not `text-green-700` as discriminator

### Frontend Test Coverage (2026-02-17)

- 200 tests across 15 files, ~2s runtime
- `src/lib/formatters.test.ts` - 49 tests (all formatter functions)
- `src/lib/utils.test.ts` - 8 tests (cn utility)
- `src/lib/csvExport.test.ts` - 8 tests (CSV export + download)
- `src/lib/apiClient.test.ts` - 12 tests (fetch wrapper, 401 refresh, login URL)
- `src/hooks/useTheme.test.ts` - 11 tests (localStorage, system pref, dark class toggle)
- `src/hooks/useAuth.test.tsx` - 11 tests (context provider, login, logout, refresh)
- `src/hooks/useNotificationPreferences.test.ts` - 10 tests (localStorage, Notification API)
- `src/hooks/use-mobile.test.ts` - 7 tests (breakpoint detection)
- `src/components/FilterBar.test.tsx` - 27 tests (pure fns + component)
- `src/components/PaginationControls.test.tsx` - 13 tests
- `src/components/ErrorBoundary.test.tsx` - 9 tests
- `src/components/ComingSoon.test.tsx` - 7 tests
- `src/components/TimeDisplay.test.tsx` - 5 tests
- `src/components/DashboardFooter.test.tsx` - 5 tests
- `src/__tests__/extractRepoFromKey.test.ts` - 18 tests (migrated from Jest to Vitest)

## Incident Triage Test Coverage (2026-02-20)

- 471 tests across 19 files, ~7s runtime
- Co-located test files (same directory as source)
- **Pure functions (no mocks):** severityClassifier (37), policyEngine (36), evidenceAggregator (31), triageWorkerHelpers (35), fallbackSummary (28), outputValidator (28), slackFormatter (24), metricsService (10)
- **Services with mocked ports:** deduplicationService (9), runbookMatcher (9), incidentCorrelator (11), dispatchService (12), aiSummarizer (10)
- **Adapter tests:** pagerDutyAdapter (30), datadogAdapter (31), grafanaAdapter (35), prometheusAdapter (32), vercelAdapter (29), netlifyAdapter (37)
- Service mocks use `jest.fn()` ports with `as unknown as PortType` cast

### Webhook Adapter Testing Pattern (Incident Triage)

- Adapters don't use headers for delivery ID (unlike PagerDuty) -- Datadog/Grafana/Prometheus/Netlify generate synthetic deliveryIds via `computeHash()`
- Vercel uses `webhook.id` from payload body for deliveryId
- Status/event filtering: adapters throw ValidationError for non-failure statuses (resolved, recovered, ready, success events)
- Constants from `@kenchi/shared`: `DATADOG_FAILURE_STATUSES`, `GRAFANA_ALERT_STATUSES`, `PROMETHEUS_ALERT_STATUSES`, `VERCEL_FAILURE_EVENTS`, `NETLIFY_FAILURE_STATES`
- Grafana/Prometheus share similar structure (Alertmanager format) but with different label prefixes (`grafana_` vs `prometheus_`)
- Netlify label extraction uses regex `NETLIFY_COMMIT_URL_PATTERN` on `commit_url` for owner/repo
- Vercel label extraction reads from `deployment.meta` object (githubOrg, githubRepo, etc.)
- Test `createValidPayload(overrides)` pattern: top-level spread of overrides works for flat payloads; nested objects need manual reconstruction
- AI summarizer additionally mocks `checkForHallucinations` from `@kenchi/shared` and `../config/appConfig.js`
- `collectFallbackCitations` generates `RB-${idx}` IDs from runbooks array, not from catalog -- test catalog must include them or use empty runbooks
- Severity thresholds (from constants): critical >= 75, high >= 55, medium >= 35, low >= 20, info >= 0

## API Service Mock Drift Fixes (2026-02-23)

Common missing `@kenchi/shared` mocks in services/api tests:

- **Middleware factories**: `requireTenantMatch`, `requireRole` -- mock as `() => (req, res, next) => next()`
- **`enforcePlanLimit`** -- mock as `jest.fn().mockResolvedValue(undefined)` (prevents DB access)
- **`getEffectiveTenantId`** -- mock to return `req.body.tenantId ?? "default"` for route tests
- **`getLLMSDKClient`** -- mock in `@kenchi/shared` mock to return mock client object (replaces old `jest.mock("openai")` pattern)
- **`withTimeout`** -- uses real `setTimeout` so works with `jest.useFakeTimers()` + `advanceTimersByTime()`
- GitLab `emailVerified` uses `confirmed_at` field (not just email presence) -- test fixtures must include `confirmed_at`
- `analysisServiceAggregation.test.ts` spreads actual `@kenchi/shared` but needs `enforcePlanLimit` override to avoid real DB calls

## Slack Bot Test Coverage (2026-02-23)

- Tests in `services/slack-bot/src/__tests__/` (flat directory)
- `httpRoutes.test.ts` - 70 tests (message posting, broadcast, health, edge cases)
- `index.test.ts` - 33 tests (service init, handlers, event registration)
- `oauthRoutes.test.ts` - 51 tests (OAuth flow, tenant linking, HTML responses)
- `repoSelectHandler.test.ts` - 30 tests (modal submission, mapping CRUD, edge cases)
- `commandHandler.test.ts`, `mentionHandler.test.ts` - also in same directory

### Slack Bot Mock Drift Pattern (Critical)

- `@kenchi/shared` exports grow over time but test mocks are manual complete replacements
- When source adds new `@kenchi/shared` imports, tests break with "X is not a function"
- Common missing mocks: `createInternalAuthMiddleware`, `createOAuthStateStore`, `createRateLimitMiddleware`, `createSecurityHeaders`
- Middleware factory mocks pattern: `jest.fn(() => (req, res, next) => next())`
- `createOAuthStateStore` must return object with `set`, `get`, `delete` async methods
- `channelHandler.js` mock must include `clearRepoCache` -- without it, the try/catch in repoSelectHandler swallows the error silently and downstream assertions fail
- `Number()` coercion on `externalOrgId` means test assertions must use number, not string

## Jest/Vitest Separation (Critical - 2026-02-23)

- Root `jest.config.js` has `testPathIgnorePatterns` that excludes `services/frontend/`
- Frontend tests use Vitest (imported from `"vitest"`), cannot be run with Jest from root
- Frontend tests MUST be run from `services/frontend/` directory: `cd services/frontend && npx vitest run`
- The `@/` path alias only resolves when Vitest has the frontend vite.config.ts (which defines the alias)
- Running `npx vitest` from monorepo root without `--config` will fail to resolve `@/` imports
- SEVERITY_STYLES in formatters.ts includes "critical" as a valid severity (purple style) -- tests updated

## Alert Context Truncation Test Coverage (2026-03-26)

- `packages/shared/src/alertContext/truncation.test.ts` - 64 tests (co-located, pure functions, no mocks)
- Bug found: `slice(-0)` in `truncateLogSnippets`/`truncateStackFrames` returns full array (JS spec: `-0 === 0`). Tests document this edge case.

## Ingestion Buffer Test Coverage (2026-03-26)

- `packages/shared/src/ingestion/bufferOperations.test.ts` - 38 tests (append, flush, close, isClientReady)
- `packages/shared/src/ingestion/bufferQueries.test.ts` - 42 tests (getMetadata, getSummary, updateSummary, checkFlushTriggers)
- Mock pattern: in-memory Redis store (mockRedisStore, mockSortedSets, mockHashes) simulating sorted sets, hashes, strings
- Mock `../queue/redisClient.js` returning mock client, `../core/index.js` for logger/withTimeout/getErrorMessage
- bufferQueries mocks `./bufferOperations.js` for `isClientReady` since it cross-imports
- All functions are fail-open (Redis errors return empty/null defaults, never throw)
- Budget-aware throttling: MODERATE tier at budgetRatio 0.1-0.3 (3x window, 0.5x volume), SEVERE at <0.1 (6x window, 0.25x volume)

## Multi-Tenant Infrastructure Test Coverage (2026-02-25)

- Co-located tests (same directory as source, not **tests**/)
- `packages/shared/src/database/providerConnection/helpers.test.ts` - 13 tests (async row mapper with decryptAuto)
- `packages/shared/src/database/providerConnection/repository.test.ts` - 27 tests (CRUD with encryptForTenant/encryptNullable)
- `packages/shared/src/billing/webhookHandler.test.ts` - 28 tests (processStripeWebhook + all 5 event handlers + cleanup)
- `packages/shared/src/security/tenantEncryption.test.ts` - 20 tests (metrics instrumentation: ops, duration, errors)
- `packages/shared/src/security/keyRotation.test.ts` - 21 tests (reEncryptValue, rotateTenantValues, updateKeyVersion callback)
- Pre-existing: `packages/shared/src/__tests__/security/tenantEncryption.test.ts` - 9 tests (integration with real crypto)

### Co-located Repository Test Pattern

- Mock `../client/index.js` for `query()`, `../../security/tenantEncryption.js` for encrypt/decrypt
- `encryptNullable` is internal helper -- test indirectly via create/update with null values
- Use `mockQuery.mock.calls[N][1]` to inspect SQL parameter arrays
- Dynamic UPDATE queries: verify SQL string contains expected SET clauses
- `findConnectionById` now requires `(id, tenantId)` -- tenant-scoped for security

### Encryption Metrics Test Pattern

- Separate `mockOpsInc` and `mockErrorsInc` (not shared mockInc) for precise assertions
- Cannot monkey-patch `crypto.randomBytes` in ESM (getter-only) -- test encrypt errors indirectly
- Force decrypt errors by using wrong tenant (wrong derived key)
- Corrupt ciphertext by flipping a hex char in the encrypted portion
- `decryptAuto` v2 values now fail loudly (no silent fallback) -- security invariant since 2026-02-25 refactor

### Key Rotation Test Pattern

- Use real crypto in test helpers (`encryptTestValue`/`decryptTestValue`) to generate valid v2 data
- Verify round-trip: encrypt(old) -> reEncrypt(old->new) -> decrypt(new) = original
- `updateKeyVersion` callback only called when `errors === 0`
- Test partial failures: mix of good and bad encrypted values in same batch

## Chat/Copilot Feature Test Coverage (2026-03-19)

- See [chat-feature-tests.md](./chat-feature-tests.md) for details
- 90 tests: helpers(34), chatService(30), chatContextAdapter(16), chatLLMAdapter(10)
- Co-located tests (same directory as source)

## Route Test Pattern (supertest + Express)

- Use `supertest` with `express()` app + error middleware for route-level tests
- Mock `@kenchi/shared` middleware as passthrough: `requirePermission: () => (req, res, next) => next()`
- Mock `requireTenantId` inline to read from `req.user?.tenantId` (real impl reads same place)
- Mock `asyncHandler` to wrap fn in try/catch that calls `next(error)` (enables error middleware)
- Inject auth via middleware: `Object.assign(req, { user: { userId, tenantId }, context: {...} })`
- Adapter mocks at module level: `jest.mock("../adapters/fooAdapter.js", () => ({ create: () => ({...}) }))`
- Adapter mock paths from `__tests__/` use `../adapters/` (not `../../adapters/`)
- `enforcePlanLimit` throws `AuthorizationError` with `metadata.code: "PLAN_LIMIT_EXCEEDED"` when exceeded
- `isWithinLimit` uses strict `<` (at-limit = blocked), but downgrade uses `>` (at-limit = allowed)

## Common Gotchas

- `jwt.sign()` with `expiresIn: -10` creates an already-expired token for testing
- SHA-256 of empty string is `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- base64url length for N bytes = `Math.ceil(N * 4 / 3)`
- Auth middleware `applyAuthToRequest` uses `Object.assign` - req mutation is expected at handler boundary
- When `user.tenantId` is null, middleware does NOT overwrite `req.context.tenantId`
- `userEvent.type` with `vi.useFakeTimers` causes timeout -- use `fireEvent.change` instead
- `navigator.clipboard` is read-only in jsdom -- use `Object.defineProperty` to mock
- Radix UI components pre-compiled with React 18 JSX cannot run in React 19 tests -- mock the ui/ imports
- shadcn Collapsible mock needs React.createContext for open/close state flow (see AnalysisDetailContent.test.tsx)
- Global radix mock `@radix-ui/react-collapsible` must export both `Trigger` and `CollapsibleTrigger`
- recharts mock must include `Tooltip` export (chart.tsx re-exports it as ChartTooltip)
- cmdk `scrollIntoView` not available in jsdom -- mock `@/components/ui/command` wrapper
- Pages rendering Navbar need `vi.mock("@/hooks/useAuth")` AND `vi.mock("@/hooks/useTheme")`
- "Found multiple elements" errors: use `getAllByText()` when filter buttons share text with table badges
- DashboardOverview onboarding: full card only shows when `completedCount < 2`, test mock must set githubConnected=false + totalAnalyses=0

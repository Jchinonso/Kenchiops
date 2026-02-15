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

## Auth Test Coverage (2026-02-12)

- `/packages/shared/src/__tests__/security/jwt.test.ts` - 27 tests (all JWT functions)
- `/packages/shared/src/__tests__/http/authMiddleware.test.ts` - 20 tests (middleware)
- `/services/api/src/__tests__/services/authService.test.ts` - 37 tests (all service methods)
- `/services/api/src/adapters/__tests__/gitlabOAuthAdapter.test.ts` - 27 tests (all 3 OAuthPort methods)
- `/services/api/src/adapters/__tests__/bitbucketOAuthAdapter.test.ts` - 30 tests (all 3 OAuthPort methods)
- `/services/api/src/adapters/__tests__/azureDevOpsOAuthAdapter.test.ts` - 32 tests (all 3 OAuthPort methods)
- `/services/api/src/adapters/__tests__/githubOAuthAdapter.test.ts` - 40 tests (all 3 OAuthPort methods)

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

## Common Gotchas

- `jwt.sign()` with `expiresIn: -10` creates an already-expired token for testing
- SHA-256 of empty string is `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- base64url length for N bytes = `Math.ceil(N * 4 / 3)`
- Auth middleware `applyAuthToRequest` uses `Object.assign` - req mutation is expected at handler boundary
- When `user.tenantId` is null, middleware does NOT overwrite `req.context.tenantId`

---
name: ESM Module Mocking Pattern
description: jest.mock() fails for ESM modules in this monorepo - must use jest.unstable_mockModule() + dynamic await import()
type: feedback
---

In this monorepo (ts-jest with useESM: true), `jest.mock()` does NOT reliably intercept ESM imports. Modules that import from barrel re-exports or have transitive dependencies on database/Redis clients will load the real modules despite `jest.mock()` calls.

**Working pattern**: Use `jest.unstable_mockModule()` + dynamic `await import()`:

```typescript
const mockFn = jest.fn();
jest.unstable_mockModule("../some/module.js", () => ({
  someExport: (...args: unknown[]) => mockFn(...args),
}));
const { moduleUnderTest } = await import("./moduleUnderTest.js");
```

**Why:** `jest.mock()` relies on CJS hoisting semantics that don't work with ESM. `jest.unstable_mockModule()` properly intercepts ESM module loading when combined with dynamic `await import()`.

**How to apply:** Any test file in `packages/shared/` that needs to mock dependencies should use `jest.unstable_mockModule` instead of `jest.mock`. Static imports of the module under test must be replaced with dynamic imports after mock setup. The `@jest/globals` imports (describe, it, expect, jest) remain as static imports.

**Known affected tests:** `chatBudget.test.ts`, `chatRateLimit.test.ts`, `billing/webhookHandler.test.ts` (still broken).

**Also important:** Mock at the **direct import** level of the module under test, not at transitive dependencies (e.g., mock `repository.js` not `client/client.js`). This is both more reliable and better testing practice.

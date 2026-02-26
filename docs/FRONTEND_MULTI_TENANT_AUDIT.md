# Frontend Multi-Tenancy Audit Report

**Date**: 2026-02-25 (Re-verified 16:55 WAT)
**Scope**: `services/frontend/src/` — tenant isolation, auth, RBAC, feature gating, data leakage

---

## Summary

| Category             | Items  | ✅ Done | ❌ Open |
| -------------------- | ------ | ------- | ------- |
| Security / Isolation | 6      | **6**   | 0       |
| Components           | 4      | **4**   | 0       |
| Hooks / Patterns     | 3      | **3**   | 0       |
| Error Handling       | 3      | **3**   | 0       |
| **Total**            | **16** | **16**  | **0**   |

**All previously identified frontend multi-tenancy gaps have been resolved.** Every component, hook, and security measure that was previously flagged as "dead code" or "not implemented" is now integrated and operational.

---

## 1. Security & Isolation ✅

### 1.1 Tenant ID Removed from API Query Params ✅

All 5 `useIncidentData.ts` hooks no longer send `tenantId` to the server. It's only used as a SWR cache key.

### 1.2 API Client Hardened ✅

[apiClient.ts](file:///home/chinonso/Documents/kenchi/services/frontend/src/lib/apiClient.ts):

- 30s `AbortController` timeout
- Single-flight token refresh (prevents concurrent 401 storms)
- httpOnly cookies with `credentials: "include"`
- Automatic retry after successful refresh

### 1.3 PKCE Implemented ✅

[pkce.ts](file:///home/chinonso/Documents/kenchi/services/frontend/src/lib/pkce.ts) + [Login.tsx](file:///home/chinonso/Documents/kenchi/services/frontend/src/pages/Login.tsx):

- `initPkceFlow()` generates `code_verifier` (43 base64url chars), SHA-256 `code_challenge`
- Verifier stored in `sessionStorage` (survives OAuth redirect)
- Backend: all 3 adapters send `code_verifier` in token exchange. Azure DevOps exempt (JWT bearer grant)

### 1.4 localStorage Tenant-Scoped ✅

[FilterBar.tsx](file:///home/chinonso/Documents/kenchi/services/frontend/src/components/FilterBar.tsx):

- `buildFilterStorageKey(pageKey, tenantId)` → `kenchi_filters_${tenantId}_${pageKey}` (line 149)
- Prevents cross-tenant filter state leakage

### 1.5 localStorage Cleared on Org Switch ✅

[useAuth.tsx](file:///home/chinonso/Documents/kenchi/services/frontend/src/hooks/useAuth.tsx) (lines 218-222):

```typescript
Object.keys(localStorage)
  .filter((key) => key.startsWith("kenchi_filters_"))
  .forEach((key) => localStorage.removeItem(key));
```

### 1.6 Open Redirect Protection ✅

[AuthCallback.tsx](file:///home/chinonso/Documents/kenchi/services/frontend/src/pages/AuthCallback.tsx):

- `isSafeRedirectPath()` validates `redirect_after` on the client side (defense-in-depth)
- Rejects protocol-relative URLs, backslashes, and authority components

---

## 2. Components — All Wired ✅

### 2.1 `<TenantGuard>` — Wrapping Dashboard ✅

[Dashboard.tsx](file:///home/chinonso/Documents/kenchi/services/frontend/src/pages/Dashboard.tsx) (lines 681-714):

```tsx
<TenantGuard>{/* all route content */}</TenantGuard>
```

Blocks suspended tenants from accessing dashboard content.

### 2.2 `<FeatureGate>` — Used in Integrations ✅

[Integrations.tsx](file:///home/chinonso/Documents/kenchi/services/frontend/src/pages/Integrations.tsx) (lines 497-512):

- `<FeatureGate feature="slackIntegration">` — gates Slack integration section
- `<FeatureGate feature="apiAccess">` — gates API access section

### 2.3 `<UsageWarning>` — Rendered in Settings ✅

[Settings.tsx](file:///home/chinonso/Documents/kenchi/services/frontend/src/pages/Settings.tsx) (lines 382-394):

- 3 instances rendering usage warnings for different resource types

### 2.4 `<PageErrorBoundary>` — Per-Route Error Isolation ✅

[Dashboard.tsx](file:///home/chinonso/Documents/kenchi/services/frontend/src/pages/Dashboard.tsx) (line 682):

```tsx
<PageErrorBoundary key={currentPath}>
  <TenantGuard>{/* route content */}</TenantGuard>
</PageErrorBoundary>
```

Crash in one sub-page doesn't take down entire shell.

---

## 3. Hooks & Patterns — All Adopted ✅

### 3.1 `usePermissions` — Adopted in TeamManagement ✅

[TeamManagement.tsx](file:///home/chinonso/Documents/kenchi/services/frontend/src/pages/TeamManagement.tsx) (line 129):

```typescript
const { hasPermission } = usePermissions();
```

No more raw `currentUserRole === "owner"` string checks.

### 3.2 Idle Session Timeout ✅

[useAuth.tsx](file:///home/chinonso/Documents/kenchi/services/frontend/src/hooks/useAuth.tsx) (lines 30-31, 238-248):

- `IDLE_TIMEOUT_MS = 30 * 60 * 1000` (30 minutes — SOC 2 compliance)
- Listens to mousemove, keydown, click, scroll events
- Auto-logout on inactivity

### 3.3 Org Switch Error Feedback ✅

[useAuth.tsx](file:///home/chinonso/Documents/kenchi/services/frontend/src/hooks/useAuth.tsx) (line 214):

```typescript
toast.error("Failed to switch organization. Please try again.");
```

Uses `sonner` toast — no more silent failures.

---

## 4. What's Solid ✅

| Area                   | Status      | Notes                                                           |
| ---------------------- | ----------- | --------------------------------------------------------------- |
| Auth architecture      | ✅ Solid    | httpOnly cookies, no tokens in localStorage/JS                  |
| Token refresh          | ✅ Solid    | Single-flight coordination, automatic retry                     |
| Org switching          | ✅ Solid    | JWT + cookie refresh, per-org role in new token, error feedback |
| `OrganizationSwitcher` | ✅ Deployed | In sidebar, multi-org display, provider icons                   |
| `UpgradePrompt`        | ✅ Used     | Integrated as FeatureGate fallback                              |
| `usePlanLimitError`    | ✅ Used     | Integrated in `useSubscription` for plan change errors          |
| `useSubscription`      | ✅ Solid    | Full plan/usage/features DTO pipeline                           |
| SSE real-time updates  | ✅ Solid    | `withCredentials: true`, auto-reconnect, sessionStorage persist |
| PKCE                   | ✅ Solid    | Frontend + 3 backend adapters                                   |
| Error boundaries       | ✅ Solid    | Root `ErrorBoundary` + per-route `PageErrorBoundary`            |

---

## 5. Remaining Frontend Opportunities

These are **enhancements**, not gaps:

| Item                                                    | Priority | Effort | Notes                                                                                   |
| ------------------------------------------------------- | -------- | ------ | --------------------------------------------------------------------------------------- |
| Add `FeatureGate` to more pages (Risk Rules, Audit Log) | Low      | 2 hrs  | Currently only gates Integrations — backend still enforces                              |
| Add `UsageWarning` to DashboardOverview                 | Low      | 30 min | Currently only in Settings                                                              |
| Tenant-scope notification sessionStorage key            | Low      | 30 min | `kenchi_notifications` is not tenant-prefixed (sessionStorage clears per tab, low risk) |

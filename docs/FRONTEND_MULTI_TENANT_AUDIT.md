# Frontend Multi-Tenancy Audit Report

**Date**: 2026-02-25
**Scope**: `services/frontend/src/` — tenant isolation, auth, RBAC, feature gating, data leakage

---

## Summary

| Category             | Items  | Fixed | Built (Not Wired) | Open  |
| -------------------- | ------ | ----- | ----------------- | ----- |
| Security / Isolation | 5      | 2     | 0                 | 3     |
| Components           | 4      | 0     | 4                 | 0     |
| Hooks / Patterns     | 2      | 0     | 1                 | 1     |
| **Total**            | **11** | **2** | **5**             | **4** |

The frontend has solid implementations for tenant isolation components, but most are **dead code** — implemented and never integrated. The highest-value work is wiring, not building.

---

## 1. Verified Fixed ✅

### 1.1 Tenant ID Removed from API Query Params

All 5 `useIncidentData.ts` hooks no longer pass `?tenantId=${tenantId}`:

| Hook                              | Line | Current URL                                       |
| --------------------------------- | ---- | ------------------------------------------------- |
| `useTriageStats`                  | 137  | `/api/v1/triage/stats`                            |
| `useIntegrationHealth`            | 152  | `/api/v1/incidents/stats/by-source`               |
| `useActiveCountsBySource`         | 179  | `/api/v1/incidents/stats/active-by-source`        |
| `useBalancedRecentIncidents`      | 194  | `/api/v1/incidents/recent/balanced?perSource=...` |
| `useSeverityDistributionBySource` | 207  | `/api/v1/triage/stats/severity-by-source`         |

`tenantId` is only used as a SWR cache key and conditional fetch guard — never sent to the server.

### 1.2 API Client Hardened

[apiClient.ts](file:///home/chinonso/Documents/kenchi/services/frontend/src/lib/apiClient.ts):

- **30s request timeout** via `AbortController` (line 14, 30-37)
- **Single-flight token refresh** prevents concurrent 401 refresh storms (lines 50-81)
- **httpOnly cookies** with `credentials: "include"` — no token in localStorage
- **Automatic retry** after successful refresh (lines 127-139)

---

## 2. Built But Not Integrated ⚠️

These components are fully implemented but have **zero imports** in any page or route. They are dead code.

### 2.1 `<TenantGuard>` — Not Wrapping Dashboard

[TenantGuard.tsx](file:///home/chinonso/Documents/kenchi/services/frontend/src/components/TenantGuard.tsx) (114 lines):

- `suspended` → Full-page block with "Account Suspended" + Update Billing CTA
- `past_due` → Amber banner above content with billing link
- All other statuses → Pass-through

**Not imported in** [Dashboard.tsx](file:///home/chinonso/Documents/kenchi/services/frontend/src/pages/Dashboard.tsx). Users on suspended tenants see normal dashboard content instead of the suspension page.

**Fix** (~30 min):

```diff
// Dashboard.tsx, line 678
  <div id="main-content" className="p-4 sm:p-6 lg:p-8">
+   <TenantGuard>
      {comingSoonConfig ? (
        <ComingSoon {...comingSoonConfig} />
      ) : ...}
+   </TenantGuard>
  </div>
```

---

### 2.2 `<FeatureGate>` — Not Used in Any Page

[FeatureGate.tsx](file:///home/chinonso/Documents/kenchi/services/frontend/src/components/FeatureGate.tsx) (111 lines):

- Reads `subscription.plan.features[feature]` via `useSubscription()`
- 7 feature keys: `slackIntegration`, `customRules`, `teamAnalytics`, `ssoSaml`, `auditLog`, `apiAccess`, `prioritySupport`
- Shows `<DefaultUpgradeFallback>` with plan-aware messaging when feature is unavailable
- Fails open during loading (prevents flash of locked content)

**Not imported in any page.** Free-tier users can see and interact with all features in the UI, even if the backend rejects the request.

**Fix** (~2 hrs) — wrap gated sections in pages:

```tsx
// Settings.tsx, Audit Log section:
<FeatureGate feature="auditLog">
  <AuditLogPanel />
</FeatureGate>

// Risk Rules page:
<FeatureGate feature="customRules">
  <RiskRulesEditor />
</FeatureGate>
```

---

### 2.3 `<UsageWarning>` — Not Rendered Anywhere

[UsageWarning.tsx](file:///home/chinonso/Documents/kenchi/services/frontend/src/components/UsageWarning.tsx) (161 lines):

- 4-tier severity: 75% (badge), 90% (info), 95% (warning), 100% (error)
- Progress bar visualization at 75-89% tier
- Upgrade link option

**Not rendered in any page.** Users hit hard limits without warning.

**Fix** (~1 hr) — add to DashboardOverview and Settings:

```tsx
const { data: usage } = useSubscriptionUsage();
// ...
<UsageWarning
  label="Analyses this month"
  current={usage?.usage.analysesThisMonth.current ?? 0}
  limit={usage?.usage.analysesThisMonth.limit ?? null}
/>;
```

---

### 2.4 `usePermissions` Hook — Built, Not Adopted

[usePermissions.ts](file:///home/chinonso/Documents/kenchi/services/frontend/src/hooks/usePermissions.ts) (84 lines):

- 8 typed permissions: `team.manage`, `billing`, `settings`, `analyses.read`, `analyses.write`, `integrations.manage`, `members.invite`, `members.remove`
- 4 roles mapped: `owner`, `admin`, `member`, `viewer`
- `hasPermission()` and `hasAnyPermission()` with `useMemo` optimization

**Not used by** [TeamManagement.tsx](file:///home/chinonso/Documents/kenchi/services/frontend/src/pages/TeamManagement.tsx), which still does raw role string checks:

```typescript
// Line 129 — raw check:
const canManage = !isSelf && (currentUserRole === "owner" || currentUserRole === "admin");

// Should be:
const { hasPermission } = usePermissions();
const canManage = !isSelf && hasPermission("team.manage");
```

**Fix** (~1 hr): Replace all `currentUserRole === "..."` checks in TeamManagement with `hasPermission()` calls.

---

## 3. New Gaps Not in Original Audit

### 3.1 localStorage Not Tenant-Scoped — Cross-Tenant Data Leak

**Severity**: Medium

When a user switches orgs via `OrganizationSwitcher`, localStorage data from the previous tenant persists.

| Key Pattern                   | File                                                                                                            | Risk                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `kenchi_filters_${pageKey}`   | [FilterBar.tsx:151](file:///home/chinonso/Documents/kenchi/services/frontend/src/components/FilterBar.tsx#L151) | Filter state from Tenant A leaks to Tenant B |
| `kenchi_onboarding_${userId}` | [Dashboard.tsx:503](file:///home/chinonso/Documents/kenchi/services/frontend/src/pages/Dashboard.tsx#L503)      | Low (per-user, not per-tenant)               |
| `kenchi_theme`                | useTheme.ts                                                                                                     | None (user preference)                       |

**Fix** — Option A: Namespace keys:

```diff
- localStorage.getItem(`kenchi_filters_${pageKey}`)
+ localStorage.getItem(`kenchi_filters_${tenantId}_${pageKey}`)
```

**Fix** — Option B: Clear on org switch in [useAuth.tsx](file:///home/chinonso/Documents/kenchi/services/frontend/src/hooks/useAuth.tsx):

```typescript
// In switchOrganization, before refreshUser():
Object.keys(localStorage)
  .filter((key) => key.startsWith("kenchi_filters_"))
  .forEach((key) => localStorage.removeItem(key));
```

---

### 3.2 PKCE Not Implemented

**Severity**: High (required per RFC 9700, January 2025)

No `code_verifier` or `code_challenge` anywhere in the frontend. [Login.tsx](file:///home/chinonso/Documents/kenchi/services/frontend/src/pages/Login.tsx) navigates to the API's OAuth endpoint without generating a PKCE challenge.

**Implementation**:

```typescript
// In Login.tsx, before OAuth redirect:
const generatePKCE = async (): Promise<string> => {
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  sessionStorage.setItem("pkce_verifier", verifier);
  return challenge;
};

// Add to OAuth URL:
const challenge = await generatePKCE();
url.searchParams.set("code_challenge", challenge);
url.searchParams.set("code_challenge_method", "S256");
```

Backend callback handler must accept `code_verifier` from the frontend and include it in the token exchange request.

---

### 3.3 No Idle Session Timeout

**Severity**: Low (SOC 2 recommends 15-30 min)

No client-side idle timeout. Users who leave the dashboard open remain indefinitely authenticated until the JWT expires naturally.

**Fix** — Add to `AuthProvider`:

```typescript
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
useEffect(() => {
  let timeout: ReturnType<typeof setTimeout>;
  const resetTimer = () => {
    clearTimeout(timeout);
    timeout = setTimeout(logout, IDLE_TIMEOUT_MS);
  };
  const events = ["mousemove", "keydown", "click", "scroll"];
  events.forEach((e) => window.addEventListener(e, resetTimer));
  resetTimer();
  return () => {
    clearTimeout(timeout);
    events.forEach((e) => window.removeEventListener(e, resetTimer));
  };
}, [logout]);
```

---

### 3.4 No Per-Route Error Boundaries

**Severity**: Low

[App.tsx](file:///home/chinonso/Documents/kenchi/services/frontend/src/App.tsx) has a single top-level `<ErrorBoundary>`. A crash in any dashboard sub-page takes down the entire shell (sidebar, header, navigation). Production SaaS apps use per-route boundaries to isolate failures.

**Fix**: Wrap route content in Dashboard.tsx with an `<ErrorBoundary>`:

```diff
  <div id="main-content" className="p-4 sm:p-6 lg:p-8">
+   <ErrorBoundary fallback={<RouteErrorFallback />}>
      <TenantGuard>
        {/* existing route rendering */}
      </TenantGuard>
+   </ErrorBoundary>
  </div>
```

---

### 3.5 Org Switch Error Not Surfaced

**Severity**: Low

[useAuth.tsx](file:///home/chinonso/Documents/kenchi/services/frontend/src/hooks/useAuth.tsx) `switchOrganization` (line 200-202) silently returns on failure:

```typescript
if (!response.ok) {
  return; // ← no error feedback to user
}
```

User sees spinner stop but no toast/banner explaining why the switch failed (e.g., suspended org, network error).

**Fix**: Parse error body and surface via toast or state:

```typescript
if (!response.ok) {
  const error = await response.json().catch(() => null);
  toast.error(error?.message ?? "Failed to switch organization");
  return;
}
```

---

## 4. What's Solid ✅

These need no changes:

| Area                     | Status      | Notes                                                           |
| ------------------------ | ----------- | --------------------------------------------------------------- |
| Auth architecture        | ✅ Solid    | httpOnly cookies, no tokens in localStorage/JS                  |
| Token refresh            | ✅ Solid    | Single-flight coordination, automatic retry                     |
| Org switching            | ✅ Solid    | JWT + cookie refresh, per-org role in new token                 |
| `OrganizationSwitcher`   | ✅ Deployed | In sidebar, multi-org display, provider icons                   |
| `UpgradePrompt`          | ✅ Used     | Integrated as FeatureGate fallback                              |
| `usePlanLimitError`      | ✅ Used     | Integrated in `useSubscription` for plan change errors          |
| `useSubscription`        | ✅ Solid    | Full plan/usage/features DTO pipeline                           |
| Subscription-aware hooks | ✅ Solid    | `useSubscriptionUsage`, `usePlans`, `useChangePlan` all working |

---

## 5. Prioritized Action Plan

| #   | Item                                       | Priority   | Effort | Impact                                             |
| --- | ------------------------------------------ | ---------- | ------ | -------------------------------------------------- |
| 1   | Wire `TenantGuard` into Dashboard.tsx      | **High**   | 30 min | Blocks suspended tenants from using dashboard      |
| 2   | Wire `FeatureGate` into gated pages        | **High**   | 2 hrs  | Prevents free-tier users from seeing paid features |
| 3   | Implement PKCE in Login.tsx                | **High**   | 4 hrs  | RFC 9700 compliance                                |
| 4   | Tenant-scope localStorage keys             | **Medium** | 2 hrs  | Prevents cross-tenant filter state leakage         |
| 5   | Wire `UsageWarning` into overview/settings | **Medium** | 1 hr   | Proactive limit awareness                          |
| 6   | Adopt `usePermissions` in TeamManagement   | **Medium** | 1 hr   | Centralized permission model                       |
| 7   | Idle session timeout                       | **Low**    | 1 hr   | SOC 2 compliance                                   |
| 8   | Per-route error boundaries                 | **Low**    | 2 hrs  | Fault isolation                                    |
| 9   | Org switch error feedback                  | **Low**    | 30 min | UX polish                                          |

**Total effort**: ~14 hours (items 1-6 are ~8 hours for the highest impact)

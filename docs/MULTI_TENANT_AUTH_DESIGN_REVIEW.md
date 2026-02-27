# Multi-Tenant Authentication & Organization Design Review

**Date**: 2026-02-26
**Scope**: Auth service, organization lifecycle, tenant creation, role mapping, account linking, JWT issuance, provider connections
**Key Files**:

- `services/api/src/services/authService.ts` -- core auth business logic
- `packages/shared/src/constants/auth.ts` -- provider role maps, JWT config, SQL queries
- `packages/shared/src/database/userOrganization/repository.ts` -- membership CRUD
- `packages/shared/src/database/tenant/serviceLifecycle.ts` -- tenant creation/deletion
- `packages/shared/src/http/authMiddleware.ts` -- JWT + HMAC verification
- `packages/shared/src/http/tenantGuard.ts` -- tenant isolation middleware
- `packages/shared/src/security/jwt.ts` -- token generation/verification
- `services/api/src/routes/authRoutes.ts` -- OAuth login/callback handlers
- `services/api/src/routes/organizationRoutes.ts` -- org switch endpoint
- `services/api/src/routes/integrationRoutes.ts` -- CI provider OAuth connections

**Related Docs**: [MULTI_TENANT_AUDIT.md](./MULTI_TENANT_AUDIT.md), [MULTI_TENANT_REMEDIATION.md](./MULTI_TENANT_REMEDIATION.md)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Design Overview](#2-design-overview)
3. [Design Flaws](#3-design-flaws)
4. [Security Implications](#4-security-implications)
5. [Edge Cases and Race Conditions](#5-edge-cases-and-race-conditions)
6. [Scalability Concerns](#6-scalability-concerns)
7. [Recommended Fixes (Prioritized)](#7-recommended-fixes-prioritized)
8. [Migration Paths](#8-migration-paths)

---

## 1. Executive Summary

Kenchi's multi-tenant authentication system uses OAuth-based sign-up with automatic organization discovery and email-based account linking. The design achieves a frictionless onboarding experience: a developer signs in with GitHub, their orgs are discovered, tenants are created, and they land on a dashboard scoped to their organization -- all in one redirect.

However, this convenience-first approach introduces several design flaws that range from **privilege escalation** (first user becomes owner regardless of provider role) to **data isolation confusion** (provider connections attached to the wrong tenant) to **role staleness** (ON CONFLICT DO NOTHING preventing role updates). These flaws interact with each other in compounding ways -- for example, email-based account linking combined with multi-provider org discovery can merge unrelated organizations into a single user's view with stale permissions.

### Risk Summary

| Severity     | Count | Summary                                                                                                                                                                                                        |
| ------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Critical** | 2     | First-user privilege escalation; cross-provider tenant confusion via email linking                                                                                                                             |
| **High**     | 4     | Stale roles from ON CONFLICT DO NOTHING; provider connections attached to wrong tenant; personal account fallback creating spurious tenants; tenant_id baked into JWT for 15 minutes after org switch          |
| **Medium**   | 5     | Race conditions in concurrent tenant creation; reconciliation removing legitimate memberships; admin/owner bypass in tenantGuard too broad; no role-change audit trail; GitHub personal account treated as org |
| **Low**      | 3     | Missing provider role for GitHub (API returns no role field for orgs); case sensitivity in org name matching; no invitation-based join flow                                                                    |

---

## 2. Design Overview

### Authentication Flow

```
User clicks "Sign in with GitHub"
  --> GET /auth/github/login (generate CSRF state, redirect to GitHub)
  --> GitHub authorizes, redirects to GET /auth/github/callback
       |
       v
  1. Exchange code for tokens (adapter.exchangeCode)
  2. Fetch user profile (adapter.getUserProfile)
  3. findOrCreateUser:
       a. Find existing OAuth identity by (provider, providerUserId, instanceUrl)
       b. If not found, find user by verified email (account linking)
       c. If not found, create new user
  4. autoLinkOrganizations:
       a. Fetch user's orgs from provider API
       b. For each org: find or create tenant, add user_organizations record
       c. If no orgs found (GitHub only): use username as personal account fallback
       d. reconcileStaleMemberships: remove orgs user no longer belongs to
  5. Re-fetch user (may have new selected_tenant_id)
  6. Generate JWT with { sub: userId, tid: tenantId, role: orgRole }
  7. Set httpOnly cookies, redirect to frontend
```

### Key Data Model

```
users (1) --< oauth_identities (N)     # One user, multiple providers
users (1) --< user_organizations (N)    # One user, multiple tenants
tenants (1) --< user_organizations (N)  # One tenant, multiple members
tenants (1) --< provider_connections (N) # One tenant, multiple CI providers
```

The `tenants` table is scoped by `(org_name, provider)` -- a GitHub org "acme" and a GitLab group "acme" are separate tenants. The `user_organizations` join table tracks membership with a `role` column.

### Role Assignment Logic

```
ensureOrgMemberships(userId, provider, orgs, context):
  for each org:
    tenant = findByOrgNameAndProvider(org.login, provider) ?? createTenant(...)
    if tenant already existed:
      role = resolveAutoLinkRole(provider, org.role)  // map provider role to Kenchi role
    else:
      role = "owner"  // first user to trigger creation becomes owner
    addUserOrganization({ userId, tenantId: tenant.id, role })
      // ON CONFLICT (user_id, tenant_id) DO NOTHING
```

### Provider Role Mapping

| Provider     | Provider Role        | Kenchi Role |
| ------------ | -------------------- | ----------- |
| GitHub       | admin                | admin       |
| GitHub       | member               | member      |
| GitHub       | billing_manager      | viewer      |
| GitLab       | owner                | owner       |
| GitLab       | maintainer           | admin       |
| GitLab       | developer            | member      |
| GitLab       | reporter             | viewer      |
| GitLab       | guest                | viewer      |
| Bitbucket    | owner                | owner       |
| Bitbucket    | collaborator         | member      |
| Bitbucket    | member               | member      |
| Azure DevOps | projectadministrator | admin       |
| Azure DevOps | contributor          | member      |
| Azure DevOps | reader               | viewer      |

Default (unknown/missing role): `"member"`

---

## 3. Design Flaws

### FLAW-01: First-User Privilege Escalation [Critical]

**Description**: The first user to sign up and trigger tenant creation for an organization automatically becomes the `"owner"` role, regardless of their actual role in the provider organization.

**Root Cause**: In `ensureOrgMemberships` (authService.ts, line 472), when `existingTenant` is null (tenant was just created), the role is hardcoded to `"owner"`:

```typescript
// authService.ts:472
const memberRole = existingTenant ? resolveAutoLinkRole(provider, org.role) : "owner";
```

**Scenario**:

1. Alice is a `developer` (GitLab) / `member` (GitHub) in the "acme" organization
2. Alice signs up for Kenchi first
3. No "acme" tenant exists yet, so `createFromGitHubLogin("acme")` creates one
4. Alice is assigned role `"owner"` in Kenchi, even though she is just a member on GitHub
5. Bob, the actual GitHub org admin, signs up later
6. The "acme" tenant already exists, so Bob gets `resolveAutoLinkRole("github", "admin")` = `"admin"`
7. Alice (a regular member) now has higher privileges than Bob (the actual admin)

**Impact**: A regular org member can gain owner-level access to the Kenchi tenant, including the ability to manage team members, change billing, and delete the organization. This is an **authorization bypass**.

**Severity**: Critical -- the owner role grants unrestricted access and there is no mechanism for the actual org admin to reclaim ownership.

---

### FLAW-02: Cross-Provider Tenant Confusion via Email Linking [Critical]

**Description**: Email-based account linking merges OAuth identities from different providers into a single user. When `autoLinkOrganizations` runs for each provider, the user accumulates memberships across unrelated tenants. Because the user's `selected_tenant_id` determines the context for subsequent actions (including which tenant provider connections are attached to), a user logged in via GitLab can inadvertently operate on a GitHub-scoped tenant.

**Root Cause**: `findOrCreateUserImpl` (authService.ts, line 131-132) links accounts by verified email:

```typescript
const emailMatch =
  profile.email && profile.emailVerified ? await findUserByEmail(profile.email) : null;
```

This is by design for account merging, but it creates a cross-provider identity that then runs `autoLinkOrganizations` for the login provider, accumulating memberships that may be semantically unrelated.

**Scenario**:

1. Alice signs up via GitHub. Her email is `alice@example.com`. Auto-link discovers GitHub orgs: `kenchiops`, `alice-personal`.
2. Alice later signs in via GitLab using the same email `alice@example.com`.
3. `findOrCreateUserImpl` matches Alice's existing user by email.
4. `autoLinkOrganizations` runs for GitLab, discovering groups: `jaycool19`, `gitlab-corp`.
5. Alice now has memberships in 4 tenants: `kenchiops` (github), `alice-personal` (github), `jaycool19` (gitlab), `gitlab-corp` (gitlab).
6. If Alice's `selected_tenant_id` is the GitHub "kenchiops" tenant and she connects a Vercel integration, that integration is attached to "kenchiops" -- correct.
7. But if Alice switches to the GitLab "jaycool19" tenant and then connects Vercel, the Vercel OAuth callback uses the `tenantId` from the OAuth state metadata (integrationRoutes.ts, line 198), which is the GitLab tenant. Vercel webhooks now land on a GitLab-scoped tenant, creating a confusing cross-provider data mix.

**Impact**: Users can accidentally attach CI provider connections to the wrong tenant. Dashboard data shows a mix of GitHub and Vercel data under a GitLab-scoped tenant, confusing org-level isolation semantics.

**Severity**: Critical -- this breaks the fundamental assumption that a tenant is scoped to a single provider's org. Data from unrelated organizations can leak into the same dashboard view.

---

### FLAW-03: ON CONFLICT DO NOTHING Prevents Role Updates [High]

**Description**: When a user's provider role changes (e.g., promoted from `member` to `admin` on GitHub), the `addUserOrganization` function silently ignores the update because the SQL uses `ON CONFLICT (user_id, tenant_id) DO NOTHING`.

**Root Cause**: `userOrganization/repository.ts` lines 47-49:

```sql
INSERT INTO user_organizations (user_id, tenant_id, role, is_default)
VALUES ($1, $2, $3, $4)
ON CONFLICT (user_id, tenant_id) DO NOTHING
RETURNING *
```

When the conflict occurs (user already has a membership for this tenant), the new role is discarded. The function returns `null`, which the caller ignores.

**Scenario**:

1. Bob joins Kenchi when he is a `member` on GitHub. His Kenchi role is `member`.
2. Bob is promoted to `admin` on GitHub.
3. Bob logs in again. `autoLinkOrganizations` runs, calling `addUserOrganization` with `role: "admin"`.
4. The INSERT conflicts on `(user_id, tenant_id)`. DO NOTHING fires. Bob's role stays `member`.
5. Bob is permanently under-privileged in Kenchi until someone manually changes his role through the team management UI.

**Impact**: Role drift -- Kenchi roles diverge from provider roles over time. Users who are promoted on the provider side never see their elevated permissions in Kenchi. Users who are demoted on the provider side retain their old (higher) permissions.

**Severity**: High -- this is a silent privilege inconsistency that accumulates over time and affects every user who has a role change on the provider side.

---

### FLAW-04: Provider Connections Not Validated Against Tenant Provider [High]

**Description**: When a user connects a CI provider (Vercel, Netlify, GitLab CI) via the integration routes, the connection is attached to the user's current `tenantId` without validating that the provider connection is appropriate for that tenant's provider scope.

**Root Cause**: In `integrationRoutes.ts`, the `handleIntegrationConnect` handler (line 133) reads `tenantId` from `req.user.tenantId` and passes it directly into the OAuth state:

```typescript
const { tenantId } = req.user;
// ...
const stateToken = await createOAuthState({
  provider,
  instanceUrl: null,
  redirectAfter: null,
  metadata: { flow: "integration", tenantId },
});
```

There is no check that the integration provider is compatible with the tenant's primary provider. The callback (line 228) then calls `integrationService.connect(provider, codeStr, redirectUri, tenantId, context)`, creating a `provider_connections` row for the tenant.

**Scenario**:

1. User has a GitLab-scoped tenant ("jaycool19", provider="gitlab") selected.
2. User navigates to integrations and connects Vercel (a deployment platform typically paired with GitHub).
3. The Vercel connection is created under the GitLab tenant.
4. Vercel webhooks arrive and get processed under the GitLab tenant, but there are no GitHub repos there -- the webhooks have no matching context.

**Impact**: Provider connections can be attached to tenants where they have no meaningful relationship, creating orphaned webhooks and confusing dashboard data.

**Severity**: High -- while not a data leak, it breaks the expected correlation between a tenant's provider and its integrations.

---

### FLAW-05: GitHub Personal Account Fallback Creates Spurious Tenants [High]

**Description**: When a GitHub user has no organization memberships, the system falls back to using their GitHub username as a personal "org" and creates a tenant for it. This creates tenants that represent individual users rather than actual organizations.

**Root Cause**: `autoLinkOrganizationsImpl` (authService.ts, lines 181-183):

```typescript
const effectiveOrgs =
  orgCount === 0 && provider === "github" ? [{ login: providerUsername }] : orgs;
```

**Scenario**:

1. Alice has a GitHub account `alice-dev` with no org memberships.
2. Alice signs up for Kenchi.
3. `autoLinkOrganizations` finds zero orgs, so it creates `effectiveOrgs = [{ login: "alice-dev" }]`.
4. `ensureOrgMemberships` creates a tenant with `org_name = "alice-dev"`, `provider = "github"`.
5. Alice is the sole `owner` of this personal tenant.
6. Later, Alice joins the "acme" GitHub org.
7. On next login, `autoLinkOrganizations` discovers "acme" and creates a new tenant for it.
8. Alice now has two tenants: "alice-dev" (personal, probably unused) and "acme" (actual org).
9. The "alice-dev" tenant lingers permanently, consuming plan resources if on a paid tier.
10. If Alice's GitHub username changes (GitHub allows username changes), a new personal tenant is created on next login, while the old one is reconciled away.

**Impact**: Proliferation of single-user "personal" tenants that clutter the organization switcher, may trigger billing for unused tenants, and create confusion between personal and org contexts.

**Severity**: High -- this affects every GitHub user who has no org memberships (or whose orgs are all private and not exposed via the API).

---

### FLAW-06: JWT tenant_id Is Stale for 15 Minutes After Org Switch [High]

**Description**: When a user switches organizations, a new access token is issued with the new `tid` (tenantId). However, any in-flight requests using the old JWT remain valid for up to 15 minutes (`JWT_CONFIG.ACCESS_TOKEN_EXPIRY = "15m"`). The old JWT still carries the previous tenant's ID, meaning requests made with the old token access the old tenant's data.

**Root Cause**: The `handleSwitchOrganization` handler (organizationRoutes.ts, line 136) generates a new access token and sets it as a cookie:

```typescript
const newAccessToken = generateAccessToken(updatedUser, orgRole ?? undefined);
setAccessTokenCookie(res, newAccessToken);
```

But this only affects the response cookie. Any tab, background process, or API client still holding the old JWT can use it for its remaining lifetime.

**Scenario**:

1. Alice has two tenants: "acme" and "beta-corp".
2. Alice is viewing the "acme" dashboard in Tab A.
3. Alice switches to "beta-corp" in Tab B, receiving a new JWT with `tid = beta-corp`.
4. Tab A still has the old JWT with `tid = acme`.
5. Any actions Alice takes in Tab A operate on "acme" data, even though she thinks she switched to "beta-corp".
6. If "acme" is later suspended or deleted, Tab A still has a valid JWT granting access until the old token expires.

**Impact**: Short window of cross-tenant confusion. More critically, if a user is removed from a tenant, their old JWT still grants access.

**Severity**: High -- the 15-minute window is the standard JWT trade-off, but combined with org switching it creates a usability and security gap.

---

### FLAW-07: Reconciliation May Remove Legitimate Memberships [Medium]

**Description**: `reconcileStaleMemberships` removes user_organizations entries for tenants that are not in the current provider's org list. This is problematic when provider API responses are incomplete (rate-limited, paginated incorrectly, or temporarily failing).

**Root Cause**: `reconcileStaleMemberships` (authService.ts, lines 498-559) compares the provider's current org list against all DB memberships for that provider and removes any that are not in the current list:

```typescript
const providerMemberships = dbMemberships.filter((membership) => membership.provider === provider);
const activeTenantIdSet: ReadonlySet<string> = new Set(currentTenantIds);

for (const membership of providerMemberships) {
  if (activeTenantIdSet.has(membership.tenantId)) {
    continue;
  }
  // ... remove membership
}
```

**Scenario**:

1. GitHub's `/user/orgs` endpoint is rate-limited and returns an empty array (or a partial list).
2. `autoLinkOrganizations` gets `orgs = []`, triggering the personal account fallback.
3. `ensureOrgMemberships` returns `[personalTenantId]`.
4. `reconcileStaleMemberships` is called with `currentTenantIds = [personalTenantId]`.
5. All of the user's existing GitHub org memberships are considered "stale" and removed.
6. The user loses access to all their actual organizations.

The code wraps `reconcileStaleMemberships` in a try/catch (authService.ts, line 188-197), making it non-fatal -- but the damage is already done if the removal succeeds.

**Impact**: Transient provider API failures can cause permanent membership loss. The last-owner protection (lines 517-527) prevents the absolute worst case (orphaned tenants), but non-owner members lose access silently.

**Severity**: Medium -- the non-fatal wrapper prevents login failures, but membership loss is disruptive and not easily discoverable by the user.

---

### FLAW-08: Admin/Owner Bypass in tenantGuard Is Too Broad [Medium]

**Description**: The `requireTenantMatch` middleware in `tenantGuard.ts` skips the tenant check entirely for users with `admin` or `owner` roles. This means an admin of tenant A can access tenant B's data if they craft a request with tenant B's ID.

**Root Cause**: `tenantGuard.ts` lines 101-108:

```typescript
export const requireTenantMatch =
  (paramName: string = "tenantId") =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (hasElevatedRole(req)) {
      next();
      return;
    }
    // ... tenant check for regular users
  };
```

The `hasElevatedRole` check (line 39-42) tests the user's role from the JWT, which is their per-org role for their currently selected tenant:

```typescript
const hasElevatedRole = (req: Request): boolean => {
  const role = req.user?.role;
  return role !== undefined && (ELEVATED_ROLES as readonly string[]).includes(role);
};
```

**Scenario**:

1. Alice is an `admin` of tenant "acme" (tenantId: `t_acme`).
2. Alice's JWT contains `role: "admin"`.
3. Alice sends a request to `GET /api/v1/dashboard/analyses?tenantId=t_betacorp`.
4. `requireTenantMatch` sees Alice has an `admin` role and skips the check.
5. Alice sees "beta-corp" data, even though she is not a member of that tenant.

**Impact**: Cross-tenant data access for any user who is admin/owner in _any_ tenant. The `admin` role in tenant A effectively grants global admin privileges across all tenants.

**Severity**: Medium -- this is a cross-tenant data access vulnerability, but it requires the user to have admin/owner role in at least one tenant and to manually craft the request (the UI does not expose this). Nonetheless, it violates tenant isolation principles.

---

### FLAW-09: No Audit Trail for Role Changes [Medium]

**Description**: When a user's role would change (due to provider role changes), the `ON CONFLICT DO NOTHING` means the change is silently discarded. Even if the role update were implemented (via `ON CONFLICT DO UPDATE`), there is no audit logging for role changes within `addUserOrganization`.

**Root Cause**: The `addUserOrganization` function logs the initial add but not updates. The `updateMemberRole` function exists and logs, but it is only called from the team management UI, not from auto-link.

**Impact**: No visibility into how and when roles change. Compliance and incident response require a clear audit trail of permission changes.

**Severity**: Medium -- operational and compliance gap.

---

### FLAW-10: Case Sensitivity Issues in Org Name Matching [Medium]

**Description**: The `FIND_BY_ORG_NAME_AND_PROVIDER` query uses `LOWER(org_name) = LOWER($1)`, which correctly handles case-insensitive matching. However, `INSERT_TENANT_WITH_PROVIDER` stores the org name as-is. This means the same org can be stored with different casings across different insert paths, and the case of the first insert wins.

**Root Cause**: `tenant.ts` lines 90 and 97:

```sql
FIND_BY_ORG_NAME_AND_PROVIDER: SELECT * FROM tenants WHERE LOWER(org_name) = LOWER($1) AND provider = $2 AND status != $3
INSERT_TENANT_WITH_PROVIDER: INSERT INTO tenants (org_name, provider, status) VALUES ($1, $2, $3) RETURNING *
```

**Scenario**:

1. GitHub reports the org as "AcmeCorp" for user A.
2. `ensureTenant` finds no match for "AcmeCorp" (no rows), creates tenant with `org_name = "AcmeCorp"`.
3. GitHub reports the org as "acmecorp" (lowercase) for user B.
4. `findByOrgNameAndProvider` finds the "AcmeCorp" row via `LOWER()` matching.
5. No issue in this case -- but if the `ensureTenant` function inside `serviceLifecycle.ts` uses a different lookup path, or if a `UNIQUE` constraint on `(org_name, provider)` exists without `LOWER()`, duplicate tenants could be created.

**Impact**: Low in current code due to `LOWER()` in the lookup. Could become an issue if a unique constraint is added at the DB level without case normalization.

**Severity**: Medium (latent) -- correct for now but fragile.

---

### FLAW-11: GitHub API Does Not Return User's Org Role [Medium]

**Description**: GitHub's `GET /user/orgs` endpoint returns the user's org memberships but does NOT include the user's role within each org. The `role` field is only available via `GET /orgs/{org}/memberships/{username}`, which requires separate API calls per org. As a result, `org.role` is always `undefined` for GitHub, and `resolveAutoLinkRole("github", undefined)` returns the default `"member"`.

**Root Cause**: The GitHub OAuth adapter fetches `/user/orgs` but does not make per-org membership API calls. The `PROVIDER_ROLE_MAP.github` mapping (`admin`, `member`, `billing_manager`) exists but is never exercised because the role data is never fetched.

**Impact**: All GitHub users (after the first user who gets `owner` via FLAW-01) are assigned `member` role regardless of their actual GitHub org role. GitHub org admins do not get `admin` role in Kenchi.

**Severity**: Medium -- combined with FLAW-03 (no role updates), this means GitHub role mapping is effectively broken.

---

### FLAW-12: No Invitation-Based Join Flow [Low]

**Description**: Users can only join tenants through automatic org discovery during OAuth login. There is no mechanism for a tenant admin to invite users who might not have the same email or provider. The `invitationRoutes.ts` file exists but appears to be a separate feature that is not integrated with the auto-link flow.

**Impact**: Users who cannot be auto-linked (different email, external contractors, etc.) have no path to join a tenant.

**Severity**: Low -- feature gap rather than security flaw.

---

### FLAW-13: GitHub Username Changes Create Orphaned Personal Tenants [Low]

**Description**: When a GitHub user with no orgs changes their GitHub username, the next login creates a new personal tenant for the new username, while `reconcileStaleMemberships` may remove the old personal tenant membership.

**Impact**: Orphaned tenants with potentially attached provider connections and data. No automatic cleanup path.

**Severity**: Low -- affects a narrow population (personal-account-only GitHub users who change usernames).

---

### FLAW-14: ensureTenant Race Condition Without Unique Constraint [Low]

**Description**: The `ensureTenant` function in `serviceLifecycle.ts` checks for existence then inserts, without a `UNIQUE` constraint on `(org_name, provider)` in the `tenants` table (the `LOWER()` in the SELECT suggests no case-normalized unique index). Two concurrent requests could create duplicate tenants.

**Root Cause**: `serviceLifecycle.ts` lines 54-76:

```typescript
const ensureTenant = async (client, orgName, provider, status) => {
  const existing = await client.query(TENANT_QUERIES.FIND_BY_ORG_NAME_AND_PROVIDER, [...]);
  if (existing.rows.length > 0) return existing.rows[0];
  const created = await client.query(TENANT_QUERIES.INSERT_TENANT_WITH_PROVIDER, [...]);
  return created.rows[0];
};
```

Within `authService.ts`, the sequential `for...of` loop in `ensureOrgMemberships` mitigates this for a single user's login. But two users from the same org logging in simultaneously would trigger parallel `ensureTenant` calls (from different request handlers).

**Impact**: Duplicate tenants for the same org. Data is split across two tenants.

**Severity**: Low -- the transaction within `ensureTenant` and sequential processing within a single request reduce the window, but concurrent logins from the same org are plausible.

---

## 4. Security Implications

### 4.1 Privilege Escalation Surface

FLAW-01 (first-user-becomes-owner) combined with FLAW-03 (roles never update) creates a persistent privilege escalation path. An attacker who knows an organization uses Kenchi can sign up first with a low-privilege account and gain permanent owner access.

**Attack Vector**:

1. Attacker creates a GitHub account and gets added to the target org as a `member` (or `billing_manager` / `guest`).
2. Attacker signs up for Kenchi before anyone else in the org.
3. Attacker becomes `owner` of the Kenchi tenant.
4. Even if the target org's actual admin later signs up, they get only `admin` role.
5. The attacker's `owner` role is never corrected because of ON CONFLICT DO NOTHING.

**Mitigation**: The attacker needs to be an actual member of the target org on the provider side. External users cannot create tenants for orgs they do not belong to. The risk is from malicious insiders or compromised accounts.

### 4.2 Cross-Tenant Data Access via tenantGuard Bypass

FLAW-08 (admin bypass) means any tenant admin can access any other tenant's data by including a different `tenantId` in the request. This is a horizontal privilege escalation vulnerability.

**Attack Vector**:

1. Attacker creates their own organization (becomes owner/admin).
2. Attacker's JWT contains `role: "admin"`.
3. Attacker enumerates tenant IDs (if predictable) or guesses them.
4. Attacker sends API requests with `tenantId` parameter of another tenant.
5. `requireTenantMatch` skips validation because the attacker has elevated role.

**Mitigation**: Tenant IDs are UUIDs (not sequential), making enumeration hard. But this violates defense-in-depth.

### 4.3 Session Persistence After Membership Removal

FLAW-06 (JWT staleness) means removing a user from a tenant does not immediately revoke their access. The user's existing JWT continues to grant access for up to 15 minutes.

The auth middleware (authMiddleware.ts, lines 354-367) checks Redis for blocked users, but `removeMemberFromTenant` does not add the user to the blocked list -- it only deletes the `user_organizations` row and clears `selected_tenant_id`. The tenant's JWT claim (`tid`) remains valid.

### 4.4 Email-Based Account Takeover Residual Risk

While `findOrCreateUserImpl` correctly requires `profile.emailVerified === true` for email-based linking (authService.ts, line 131), the verification status is provider-asserted. If a provider's email verification is weak (e.g., a self-hosted GitLab instance that does not enforce email verification), an attacker could claim an unverified email as "verified" and link to a victim's account.

The `instanceUrl` support for self-hosted providers increases this risk surface. The SSRF validation in `validateInstanceUrl` (authRoutes.ts, line 195) protects against internal network access but does not verify the trustworthiness of the self-hosted instance's email verification claims.

---

## 5. Edge Cases and Race Conditions

### 5.1 Concurrent Login from Same Org (Tenant Creation Race)

**Condition**: Two users from the same GitHub org sign in simultaneously, and no tenant exists yet.

**Sequence**:

```
User A: findByOrgNameAndProvider("acme", "github") -> null
User B: findByOrgNameAndProvider("acme", "github") -> null
User A: createFromGitHubLogin("acme") -> tenant_t1
User B: createFromGitHubLogin("acme") -> tenant_t2 (DUPLICATE!)
User A: addUserOrganization(userA, t1, "owner")
User B: addUserOrganization(userB, t2, "owner")
```

**Result**: Two tenants for "acme". User A and User B are each owners of different tenants representing the same org. All subsequent users join whichever tenant the `LOWER()` lookup returns first.

**Likelihood**: Low-medium for small teams signing up together (e.g., after a team lead shares a signup link).

### 5.2 Provider API Failure During Auto-Link

**Condition**: The provider API (e.g., GitHub `/user/orgs`) fails or times out during `autoLinkOrganizations`.

**Sequence**:

1. `adapter.getUserOrganizations` throws or returns empty.
2. For GitHub: empty result triggers personal account fallback.
3. `ensureOrgMemberships` only processes the personal account.
4. `reconcileStaleMemberships` receives only the personal account tenant ID.
5. All existing org memberships are removed as "stale".

**Mitigation Opportunity**: The `autoLinkOrganizations` call is wrapped in a try/catch in `authRoutes.ts` (line 413-429) that catches the entire auto-link failure. But partial failures (empty org list instead of error) bypass this protection.

### 5.3 OAuth Identity Collision Across Providers

**Condition**: User has the same username on GitHub and GitLab but they represent different people (or the same person with different email addresses).

**Sequence**:

1. Person A creates GitHub account "jsmith", uses email `john@company.com`.
2. Person B creates GitLab account "jsmith", uses email `jane@personal.com`.
3. Person A signs up via GitHub. `findOrCreateUser` creates a new user.
4. Person B signs up via GitLab. Different `providerUserId`, different email. New user is created.
5. No collision -- this case is handled correctly because identities are scoped by `(provider, providerUserId)`.

However, if Person A _also_ has a GitLab account with the same verified email `john@company.com`, signing in via GitLab would link to Person A's existing user, giving Person A access to any GitLab orgs. This is the intended behavior of account linking but can surprise users.

### 5.4 Org Switch During Active Operations

**Condition**: User switches org while an SSE connection or long-polling request is active.

**Sequence**:

1. User has SSE connection to `/api/v1/sse` with JWT containing `tid: t_acme`.
2. User switches to org "beta-corp" in another tab.
3. New JWT issued with `tid: t_beta`.
4. SSE connection continues using old JWT, receiving events for "acme".
5. Dashboard in the switched tab shows "beta-corp" data, but SSE events are still for "acme".

**Impact**: Stale real-time data. The SSE route (`sseRoutes.ts`) uses `requireTenantId(req)` which reads from the JWT at connection time and does not re-verify during the connection lifecycle.

### 5.5 User Deletion with Active Memberships

**Condition**: A user who is the last owner of multiple tenants requests account deletion.

**Sequence**: The `accountDeletionService` handles this, but the `reconcileStaleMemberships` last-owner protection (authService.ts, lines 517-526) only prevents automatic removal. Manual deletion via `DELETE /auth/me` follows a different code path that checks deletion impact first.

Edge case: If between the impact check and the actual deletion, another owner is removed (concurrent request), the deletion could proceed and orphan the tenant.

---

## 6. Scalability Concerns

### 6.1 Sequential Org Processing in ensureOrgMemberships

The `for...of` loop in `ensureOrgMemberships` (authService.ts, line 418) processes orgs sequentially to avoid concurrent tenant creation races. For users with many org memberships (common in GitHub for consultants, open-source contributors, etc.), this adds per-org latency to every login.

**Measured Impact**: Each iteration involves:

- `findByOrgNameAndProvider` -- 1 DB query
- Possibly `createTenant` -- 1 DB transaction
- `findUserOrgRole` -- 1 DB query (for existing tenants)
- `checkPlanLimit` -- 1 DB query (for existing tenants without membership)
- `addUserOrganization` -- 1 DB query

For a user with 20 orgs, this is 60-100 DB queries during the OAuth callback, serialized. At 5ms per query, this adds 300-500ms to login time.

### 6.2 Reconciliation Queries Scale with Membership Count

`reconcileStaleMemberships` fetches all memberships (`findOrganizationsByUser`), then iterates over each one to check if it is still valid. For users with many historical memberships (especially across providers), this is O(n) DB queries.

### 6.3 No Batch Tenant Creation

Each org triggers a separate transaction for tenant creation (`createFromGitHubLogin`, etc.). For initial signups of large organizations, this could be batched into a single transaction with a multi-row INSERT.

### 6.4 JWT Size Growth

The JWT currently includes `sub`, `tid`, `role`, `jti`, plus standard claims. If multi-tenant role claims are added (e.g., per-tenant role list), the JWT size could grow significantly. Currently each JWT is ~200 bytes; adding 20 tenant roles would push it to ~1KB, adding overhead to every request header.

---

## 7. Recommended Fixes (Prioritized)

### Priority 1: Critical -- Fix Immediately

#### FIX-01: Replace First-User-Becomes-Owner with Provider Role Mapping [FLAW-01]

**Change**: Always use `resolveAutoLinkRole` for the first user, not hardcoded `"owner"`. Elevate the creator to `admin` if their provider role maps to `member` (ensuring at least one admin exists), but never auto-assign `owner`.

```typescript
// authService.ts, ensureOrgMemberships
const memberRole = existingTenant
  ? resolveAutoLinkRole(provider, org.role)
  : Math.max(resolveAutoLinkRole(provider, org.role), "admin"); // At least admin for creator
```

**Better approach**: Assign the mapped role (or `admin` as minimum for the first user) and add a separate "claim ownership" flow that verifies the user is an actual org admin/owner on the provider side before granting `owner` role.

**Migration**: Audit existing `owner` roles. For each tenant, check if the current owner's provider role matches. Flag mismatches for review.

#### FIX-02: Scope Provider Connections to Matching Tenant Provider [FLAW-02, FLAW-04]

**Change**: In `handleIntegrationConnect`, validate that the integration provider is compatible with the tenant's provider. Alternatively, make tenants provider-agnostic and allow multiple provider connections explicitly.

**Short-term**: Add a compatibility check:

```typescript
const tenant = await findTenantById(tenantId);
const INTEGRATION_TENANT_COMPATIBILITY: Record<IntegrationProvider, string[]> = {
  vercel: ["github", "gitlab", "bitbucket"],
  netlify: ["github", "gitlab", "bitbucket"],
};
if (!INTEGRATION_TENANT_COMPATIBILITY[provider].includes(tenant.provider)) {
  throw new ValidationError("This integration is not compatible with your organization's provider");
}
```

**Long-term**: Re-architect tenants to be provider-agnostic. A tenant represents an "organization" that can have multiple provider connections. The `tenants.provider` column becomes informational ("created via") rather than a scope constraint.

### Priority 2: High -- Fix This Sprint

#### FIX-03: Change ON CONFLICT to ON CONFLICT DO UPDATE for Roles [FLAW-03]

**Change**: Modify the `ADD` query to update the role on conflict:

```sql
INSERT INTO user_organizations (user_id, tenant_id, role, is_default)
VALUES ($1, $2, $3, $4)
ON CONFLICT (user_id, tenant_id) DO UPDATE SET
  role = CASE
    WHEN user_organizations.role = 'owner' THEN user_organizations.role  -- Never demote owners via auto-sync
    ELSE EXCLUDED.role
  END,
  updated_at = NOW()
RETURNING *
```

**Critical safeguard**: Never auto-demote an `owner` role via auto-sync. Owner removal should only happen through explicit UI action or admin API.

**Migration**: Run a one-time reconciliation script that fetches each user's current provider roles and updates their Kenchi roles accordingly.

#### FIX-04: Guard Against Incomplete Provider Org Lists in Reconciliation [FLAW-07]

**Change**: Add a safety check before reconciliation. If the org list is empty or suspiciously small (less than the user's current membership count minus a threshold), skip reconciliation:

```typescript
// authService.ts, autoLinkOrganizationsImpl
const existingMemberships = await findOrganizationsByUser(user.id);
const existingProviderMemberships = existingMemberships.filter((m) => m.provider === provider);

// Skip reconciliation if provider returned significantly fewer orgs than expected
// (likely API failure, rate limit, or pagination issue)
const MIN_RECONCILE_RATIO = 0.5;
if (
  tenantIds.length < existingProviderMemberships.length * MIN_RECONCILE_RATIO &&
  existingProviderMemberships.length > 2
) {
  logger.warn("Skipping reconciliation: provider returned suspiciously few orgs", {
    expected: existingProviderMemberships.length,
    received: tenantIds.length,
    provider,
    ...context,
  });
  return;
}
```

#### FIX-05: Mark Personal Account Tenants Distinctly [FLAW-05]

**Change**: Add a `tenant_type` column (`"organization"` | `"personal"`) to the tenants table. When creating a personal account fallback tenant, set `tenant_type = "personal"`. This enables:

- Different billing treatment (personal tenants could be free-tier only)
- UI distinction (show "Personal" badge in org switcher)
- Cleanup scripts that can target personal tenants

#### FIX-06: Fix Admin/Owner tenantGuard Bypass [FLAW-08]

**Change**: The `requireTenantMatch` middleware should check that the admin/owner role is for the _requested_ tenant, not just any tenant. Replace the blanket `hasElevatedRole` bypass with a membership check:

```typescript
export const requireTenantMatch =
  (paramName: string = "tenantId") =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const userTenantId = req.user?.tenantId ?? undefined;
    const requestedTenantId = extractRequestedTenantId(req, paramName);

    // No cross-tenant request -- always allowed
    if (!requestedTenantId || requestedTenantId === userTenantId) {
      next();
      return;
    }

    // Cross-tenant: verify user has admin/owner membership in the REQUESTED tenant
    if (hasElevatedRole(req)) {
      const roleInRequested = await findUserOrgRole(req.user!.userId, requestedTenantId);
      if (roleInRequested && ["admin", "owner"].includes(roleInRequested)) {
        next();
        return;
      }
    }

    logger.warn("Tenant access denied", { requestedTenantId, userTenantId, path: req.path });
    next(
      new AuthorizationError("Cannot access another tenant's data", {
        operation: "tenantGuard",
      })
    );
  };
```

### Priority 3: Medium -- Fix This Month

#### FIX-07: Fetch GitHub Org Roles via Membership API [FLAW-11]

**Change**: After fetching the org list from `/user/orgs`, make a follow-up API call to `GET /orgs/{org}/memberships/{username}` for each org to get the actual role. Use `pMap` with concurrency limits.

**Trade-off**: This adds N API calls per login (one per org). For users with many orgs, this could hit GitHub's rate limits. Consider caching org roles for 24 hours.

#### FIX-08: Add Role Change Audit Logging [FLAW-09]

**Change**: When `addUserOrganization` detects a conflict and updates the role (after FIX-03), log an audit event with the old and new role values.

#### FIX-09: Add Unique Constraint on Tenants [FLAW-14]

**Change**: Add a case-insensitive unique constraint:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_org_provider_unique
  ON tenants (LOWER(org_name), provider)
  WHERE status != 'deleted';
```

Also normalize `org_name` to lowercase on insert to avoid case confusion.

#### FIX-10: Add Token Revocation on Membership Removal [FLAW-06]

**Change**: When `removeMemberFromTenant` is called, add the user to the Redis blocked-user set with a TTL matching the JWT expiry (15 minutes). This triggers the real-time check in `authMiddleware.ts` (line 354).

Alternatively, revoke all refresh tokens for the user in that tenant's scope:

```typescript
// In removeMemberFromTenant, after DELETE:
await revokeRefreshTokensForUserInTenant(userId, tenantId);
await markUserAsBlocked(userId, JWT_CONFIG.ACCESS_TOKEN_EXPIRY_SECONDS);
```

### Priority 4: Low -- Schedule

#### FIX-11: Implement Invitation-Based Join Flow [FLAW-12]

**Change**: Allow tenant admins to generate invite links or send email invitations. Invited users bypass auto-link for that specific tenant and are directly added with the role specified in the invitation.

#### FIX-12: Handle GitHub Username Changes [FLAW-13]

**Change**: Track the personal tenant's origin (store `tenant_type = "personal"` and `providerUserId` as metadata). On login, if the username has changed, update the tenant's `org_name` rather than creating a new one.

---

## 8. Migration Paths

### For FIX-01 (First-User-Becomes-Owner)

**Assessment Query** (identify affected tenants):

```sql
SELECT
  t.id AS tenant_id,
  t.org_name,
  t.provider,
  uo.user_id,
  uo.role AS kenchi_role,
  uo.joined_at
FROM user_organizations uo
JOIN tenants t ON t.id = uo.tenant_id
WHERE uo.role = 'owner'
ORDER BY t.id, uo.joined_at ASC;
```

**Migration Steps**:

1. Deploy the code fix (use provider role mapping for new tenants).
2. Run the assessment query to identify owners who may be incorrectly assigned.
3. For each flagged tenant, verify the owner's actual provider role via API.
4. If mismatch, notify the tenant and offer to transfer ownership to the actual org admin.
5. Add a "claim ownership" flow for affected tenants.

### For FIX-03 (ON CONFLICT DO UPDATE)

**Migration SQL** (update stale roles in bulk):

```sql
-- This would be a one-time script after deploying the code fix.
-- For each provider, re-map roles based on the provider_role stored at OAuth identity level.
-- Note: This requires storing the provider_role in user_organizations or a separate mapping table.
-- Since we don't currently store the provider_role, this migration requires:
-- 1. Adding a provider_role column to user_organizations
-- 2. On next login, populating provider_role from the API
-- 3. Running the re-mapping

ALTER TABLE user_organizations ADD COLUMN IF NOT EXISTS provider_role VARCHAR(64);
```

### For FIX-05 (Personal Tenant Marking)

**Migration SQL**:

```sql
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tenant_type VARCHAR(32) DEFAULT 'organization';

-- Mark existing personal tenants (single-member GitHub tenants where org_name matches a username)
UPDATE tenants
SET tenant_type = 'personal'
WHERE provider = 'github'
  AND id IN (
    SELECT tenant_id FROM user_organizations
    GROUP BY tenant_id
    HAVING COUNT(*) = 1
  )
  AND org_name IN (
    SELECT oi.provider_username
    FROM oauth_identities oi
    JOIN user_organizations uo ON uo.user_id = oi.user_id
    WHERE oi.provider = 'github'
      AND uo.tenant_id = tenants.id
  );
```

### For FIX-06 (tenantGuard Fix)

**Migration**: Code-only change. No data migration needed. Deploy and verify via integration tests that:

1. Admin of tenant A cannot access tenant B data.
2. Admin of tenant A can still access tenant A data.
3. Users with memberships in multiple tenants can only access tenants they belong to.

### For FIX-09 (Unique Constraint)

**Pre-migration Check** (find duplicate tenants):

```sql
SELECT LOWER(org_name), provider, COUNT(*), ARRAY_AGG(id)
FROM tenants
WHERE status != 'deleted'
GROUP BY LOWER(org_name), provider
HAVING COUNT(*) > 1;
```

**Migration Steps**:

1. Run the duplicate check query.
2. For each set of duplicates, merge memberships into the oldest tenant.
3. Move provider connections from duplicate tenants to the primary.
4. Soft-delete the duplicate tenants.
5. Create the unique index.

---

## Appendix: Complete Code Reference Map

| Concern                  | File                             | Function/Query              | Line    |
| ------------------------ | -------------------------------- | --------------------------- | ------- |
| User resolution          | `authService.ts`                 | `findOrCreateUserImpl`      | 93-157  |
| Email linking            | `authService.ts`                 | `findOrCreateUserImpl`      | 131-132 |
| Org auto-link            | `authService.ts`                 | `autoLinkOrganizationsImpl` | 165-213 |
| Personal fallback        | `authService.ts`                 | `autoLinkOrganizationsImpl` | 182-183 |
| Membership creation      | `authService.ts`                 | `ensureOrgMemberships`      | 409-489 |
| First-user owner         | `authService.ts`                 | `ensureOrgMemberships`      | 472     |
| Stale reconciliation     | `authService.ts`                 | `reconcileStaleMemberships` | 498-559 |
| Role mapping             | `constants/auth.ts`              | `PROVIDER_ROLE_MAP`         | 260-283 |
| Role resolution          | `constants/auth.ts`              | `resolveAutoLinkRole`       | 292-301 |
| ON CONFLICT DO NOTHING   | `userOrganization/repository.ts` | `QUERIES.ADD`               | 47-49   |
| Tenant creation (GitHub) | `tenant/serviceLifecycle.ts`     | `createFromGitHubLogin`     | 309-340 |
| Tenant lookup            | `tenant/serviceLifecycle.ts`     | `ensureTenant`              | 54-76   |
| JWT generation           | `security/jwt.ts`                | `generateAccessToken`       | 41-56   |
| JWT verification         | `security/jwt.ts`                | `verifyAccessToken`         | 58-80   |
| Auth middleware          | `http/authMiddleware.ts`         | `authMiddleware`            | 261-401 |
| Tenant guard             | `http/tenantGuard.ts`            | `requireTenantMatch`        | 101-128 |
| Tenant guard bypass      | `http/tenantGuard.ts`            | `hasElevatedRole`           | 39-42   |
| Tenant guard bypass #2   | `http/tenantGuard.ts`            | `getEffectiveTenantId`      | 70-80   |
| OAuth callback           | `routes/authRoutes.ts`           | `handleOAuthCallback`       | 330-485 |
| Org switch               | `routes/organizationRoutes.ts`   | `handleSwitchOrganization`  | 76-171  |
| Integration connect      | `routes/integrationRoutes.ts`    | `handleIntegrationConnect`  | 124-158 |
| Integration callback     | `routes/integrationRoutes.ts`    | `handleIntegrationCallback` | 164-282 |

---

## 9. Corrections to Original Findings

> **FLAW-14 Correction**: The document states there is no unique constraint on `(org_name, provider)`. This is **factually incorrect**. A `UNIQUE (org_name, provider)` constraint exists in `database/init/023_multi_org_membership.sql` (line 40):
>
> ```sql
> ALTER TABLE tenants ADD CONSTRAINT tenants_org_name_provider_unique UNIQUE (org_name, provider);
> ```
>
> The real issue is that this constraint is **case-sensitive** while lookups use `LOWER()`, meaning "AcmeCorp" and "acmecorp" could coexist. Concurrent inserts would hit a DB constraint error, not create silent duplicates.

> **FLAW-12 Correction**: The document states "There is no mechanism for a tenant admin to invite users." The backend invitation system in `invitationRoutes.ts` is **fully implemented** with 6 endpoints (create, list sent, list pending, accept, decline, revoke). The gap is that the **frontend `TeamManagement.tsx` never wired up the invite UI** — it only shows existing members.

---

## 10. Additional Findings (Post-Verification Audit)

### FLAW-15: Integration & Organization Routes Missing Rate Limiting [Medium]

**Description**: `integrationRoutes.ts` and `organizationRoutes.ts` register routes **without any `rateLimitByCategory()` middleware**, unlike every other route file (authRoutes, dashboardRoutes, billingRoutes, invitationRoutes, subscriptionRoutes, analysisRoutes).

**Affected Endpoints**:

- `GET /integrations` — no rate limit
- `GET /integrations/:provider/connect` — no rate limit (initiates OAuth!)
- `GET /integrations/:provider/callback` — no rate limit
- `DELETE /integrations/:connectionId` — no rate limit (destructive!)
- All GitLab CI routes — no rate limit
- `GET /api/v1/organizations` — no rate limit
- `POST /api/v1/organizations/switch` — no rate limit

**Impact**: An attacker with a valid JWT can rapidly enumerate integrations, spam org switches, or abuse OAuth initiation.

**Severity**: Medium — the global Express rate limiter may provide some protection, but per-endpoint rate limiting is the established pattern.

---

### FLAW-16: `getEffectiveTenantId` Doubles Tenant Guard Bypass Surface [Medium]

**Description**: `tenantGuard.ts:70-80` exports `getEffectiveTenantId()` which uses the same `hasElevatedRole()` bypass as `requireTenantMatch`. Route handlers calling `getEffectiveTenantId()` are vulnerable independently of `requireTenantMatch`, expanding the FLAW-08 attack surface to two code paths.

```typescript
// tenantGuard.ts:70-80
export const getEffectiveTenantId = (req: Request): string | undefined => {
  const userTenantId = req.user?.tenantId ?? undefined;
  if (hasElevatedRole(req)) {
    const requestedTenantId =
      extractBodyTenantId(req) ?? extractParamOrQueryTenantId(req, "tenantId");
    return requestedTenantId ?? userTenantId;
  }
  return userTenantId;
};
```

**Impact**: Any route handler using `getEffectiveTenantId()` inherits the cross-tenant bypass for admin/owner roles. FIX-06 must also apply to this function.

---

### FLAW-17: `removeMemberFromTenant` Does Not Revoke Tokens or Block User [High]

**Description**: In `userOrganization/repository.ts:327-367`, `removeMemberFromTenant` only DELETEs the `user_organizations` row and NULLs `selected_tenant_id`. It does **not** call `markUserAsBlocked()` or revoke refresh tokens.

The `authMiddleware.ts` checks `isUserBlocked()` (line 354) and `isTenantBlocked()` (line 373), but removing a member never triggers either. The removed user's JWT (containing `tid: <old-tenant>`) remains valid for up to 15 minutes.

**Distinction from FLAW-06**: FLAW-06 describes _self-initiated_ org switches. FLAW-17 describes **forced removal by an admin**, which is a more urgent security scenario — the removed user retains access to data they should no longer see.

**Severity**: High — a removed member continues to have read/write access until JWT expiry.

---

### FLAW-18: Provider-Specific Tenant Creation Functions Bypass `ensureTenant` [Medium]

**Description**: The `ensureTenant` helper (serviceLifecycle.ts:54-76) checks for existence before inserting. However, several creation functions bypass it entirely and call `INSERT_TENANT_WITH_PROVIDER` directly:

- `createFromGitHubLogin` (line 314)
- `createFromGitLabGroup` (line 265)
- `createFromBitbucketWorkspace` (line 354)
- `createFromAzureDevOpsAccount` (line 403)

Only `createFromGitHubInstall` and `createFromSlackInstall` use `ensureTenant`.

**Impact**: The callers in `authService.ts:ensureOrgMemberships` (line 419-436) do a `findByOrgNameAndProvider` check first, which mitigates this. But if these functions are called outside that flow, they could produce duplicate tenants (caught by the UNIQUE constraint) or throw unexpected errors.

**Severity**: Medium — mitigated by the unique constraint and the calling code's check, but the inconsistent pattern is fragile.

---

### FLAW-19: PKCE `codeVerifier` Stored in Redis State [Low]

**Description**: The PKCE `codeVerifier` is stored in OAuth state metadata in Redis (`authRoutes.ts:303`). While the state is single-use with TTL, if Redis data is compromised (snapshots, logs, backups), the `codeVerifier` could be extracted. Best practice stores it server-side in an encrypted session.

**Severity**: Low — defense-in-depth concern, not an active vulnerability.

---

### FLAW-20: Account Deletion TOCTOU Between Impact Check and Delete [Low]

**Description**: `GET /auth/me/deletion-impact` and `DELETE /auth/me` have a time-of-check-to-time-of-use gap. Between the impact check (which reports "safe to delete") and the actual deletion, another admin could be removed, making this user the last owner. The deletion could then orphan the tenant.

**Severity**: Low — narrow race window, but `accountDeletionService.deleteAccount()` should re-check within a transaction.

# Authentication & Authorization Implementation Plan

## Overview

Kenchi currently operates as a **webhook-driven system** — events flow in from GitHub Apps and Slack, with no end-user authentication. This document specifies how to add full **multi-provider OAuth authentication** so users can sign in via the frontend, receive JWT tokens, and access protected API routes.

The design preserves Kenchi's existing patterns: typed errors, structured logging, RequestContext propagation, repository pattern, tenant isolation, and the ports/adapters architecture.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Schema: Users & Sessions](#2-database-schema-users--sessions)
3. [Shared Types & Constants](#3-shared-types--constants)
4. [OAuth Flow: Step by Step](#4-oauth-flow-step-by-step)
5. [OAuth Routes Implementation](#5-oauth-routes-implementation)
6. [JWT Token Generation & Refresh](#6-jwt-token-generation--refresh)
7. [Auth Middleware](#7-auth-middleware)
8. [Self-Hosted Provider Support](#8-self-hosted-provider-support)
9. [Provider Configurations](#9-provider-configurations)
10. [Frontend Integration](#10-frontend-integration)
11. [Security Considerations](#11-security-considerations)
12. [Testing Strategy](#12-testing-strategy)
13. [Migration & Rollout Plan](#13-migration--rollout-plan)
14. [File Inventory](#14-file-inventory)

---

## 1. Architecture Overview

### Auth Flow Diagram

```
┌──────────┐     ┌───────────────┐     ┌──────────────┐     ┌──────────┐
│ Frontend │────>│ GET /auth/    │────>│ GitHub/GitLab│────>│ Callback │
│ (React)  │     │ {provider}/   │     │ OAuth Server │     │ Endpoint │
│          │     │ login         │     │              │     │          │
└──────────┘     └───────────────┘     └──────────────┘     └──────────┘
                                                                  │
                                                                  ▼
┌──────────┐     ┌───────────────┐     ┌──────────────┐     ┌──────────┐
│ Frontend │<────│ JWT tokens    │<────│ Create/find  │<────│ Exchange │
│ stores   │     │ (access +     │     │ user + link  │     │ code for │
│ tokens   │     │  refresh)     │     │ to tenant    │     │ token    │
└──────────┘     └───────────────┘     └──────────────┘     └──────────┘
      │
      ▼
┌──────────┐     ┌───────────────┐
│ API call │────>│ Auth          │──── Protected route handler
│ Bearer   │     │ Middleware    │
│ token    │     │ (JWT verify)  │
└──────────┘     └───────────────┘
```

### Where Auth Fits in the Stack

```
services/api/src/index.ts (Express middleware stack)
─────────────────────────────────────────────────────
  express.json()
  requestLogger
  apiRateLimiter
+ authMiddleware          ← NEW: JWT verification (skips public routes)
  registerRoutes()
+ registerAuthRoutes()    ← NEW: OAuth login/callback routes
  errorHandler
```

### Dependency Direction

```
Routes (authRoutes.ts)
  └── Services (authService.ts)         ← Business logic
        ├── Repositories (userRepo.ts)  ← Database access
        ├── Ports (oauthPort.ts)        ← Provider interface
        └── JWT utilities (jwt.ts)      ← Token generation

Adapters (githubOAuthAdapter.ts, gitlabOAuthAdapter.ts, ...)
  └── Implement oauthPort interface
  └── Contain provider SDK/HTTP calls
```

---

## 2. Database Schema: Users & Sessions

### Migration: `012_users_and_sessions.sql`

```sql
-- ============================================================
-- 012_users_and_sessions.sql
-- User authentication tables for multi-provider OAuth
-- ============================================================

-- Users table
CREATE TABLE users (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'usr_' || replace(gen_random_uuid()::text, '-', ''),
    tenant_id VARCHAR(50) REFERENCES tenants(id) ON DELETE SET NULL,
    email VARCHAR(255),
    display_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for users
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status) WHERE status != 'deleted';

-- OAuth identities (one user can have multiple providers)
CREATE TABLE oauth_identities (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'oid_' || replace(gen_random_uuid()::text, '-', ''),
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    provider_username VARCHAR(255),
    provider_email VARCHAR(255),
    provider_avatar_url TEXT,
    instance_url TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    scopes TEXT[],
    raw_profile JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider, provider_user_id, instance_url)
);

-- Indexes for oauth_identities
CREATE INDEX idx_oauth_identities_user_id ON oauth_identities(user_id);
CREATE INDEX idx_oauth_identities_provider_lookup
    ON oauth_identities(provider, provider_user_id);

-- Refresh tokens (stored server-side for rotation)
CREATE TABLE refresh_tokens (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'rtk_' || replace(gen_random_uuid()::text, '-', ''),
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    family_id VARCHAR(50) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replaced_by VARCHAR(50),
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for refresh_tokens
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_family_id ON refresh_tokens(family_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at)
    WHERE revoked_at IS NULL;

-- OAuth state tokens (CSRF protection, replaces in-memory Map)
CREATE TABLE oauth_states (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'ost_' || replace(gen_random_uuid()::text, '-', ''),
    state_token VARCHAR(255) NOT NULL UNIQUE,
    provider VARCHAR(50) NOT NULL,
    instance_url TEXT,
    redirect_after TEXT,
    metadata JSONB DEFAULT '{}',
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index + auto-cleanup for expired states
CREATE INDEX idx_oauth_states_token ON oauth_states(state_token)
    WHERE consumed_at IS NULL;
CREATE INDEX idx_oauth_states_expires ON oauth_states(expires_at);

-- Trigger to update updated_at on users
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_users_updated_at();

CREATE TRIGGER oauth_identities_updated_at
    BEFORE UPDATE ON oauth_identities
    FOR EACH ROW EXECUTE FUNCTION update_users_updated_at();

-- Extend tenant_audit_log actions for auth events
COMMENT ON TABLE users IS 'User accounts linked to tenants via OAuth providers';
COMMENT ON TABLE oauth_identities IS 'OAuth provider identities linked to user accounts (one user, many providers)';
COMMENT ON TABLE refresh_tokens IS 'JWT refresh token families with rotation detection';
COMMENT ON TABLE oauth_states IS 'CSRF state tokens for OAuth flows (replaces in-memory Map)';
```

### Why This Schema

| Design Decision                       | Rationale                                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Separate `oauth_identities` table     | One user can link GitHub + GitLab + Bitbucket. Future-proof for account linking.                               |
| `instance_url` on identity            | Supports self-hosted: `(github, user123, null)` vs `(github, user123, git.acme.com)` are different identities. |
| `refresh_tokens` with `family_id`     | Enables **refresh token rotation** — if a stolen refresh token is reused, the entire family is revoked.        |
| `oauth_states` in DB (not in-memory)  | Works across multiple API instances. Auto-expires. Survives restarts.                                          |
| `users.tenant_id` nullable            | Users created during OAuth may not yet be linked to a tenant (linked later via GitHub org matching).           |
| Prefixed IDs (`usr_`, `oid_`, `rtk_`) | Consistent with Kenchi's existing `ten_`, `evt_`, `ana_` pattern.                                              |

---

## 3. Shared Types & Constants

### Types: `packages/shared/src/database/user/types.ts`

```typescript
// ── Row Types (snake_case, matches DB columns) ──────────────

export interface UserRow {
  readonly id: string;
  readonly tenant_id: string | null;
  readonly email: string | null;
  readonly display_name: string;
  readonly avatar_url: string | null;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly last_login_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export interface OAuthIdentityRow {
  readonly id: string;
  readonly user_id: string;
  readonly provider: OAuthProvider;
  readonly provider_user_id: string;
  readonly provider_username: string | null;
  readonly provider_email: string | null;
  readonly provider_avatar_url: string | null;
  readonly instance_url: string | null;
  readonly access_token: string | null;
  readonly refresh_token: string | null;
  readonly token_expires_at: Date | null;
  readonly scopes: readonly string[] | null;
  readonly raw_profile: Record<string, unknown>;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export interface RefreshTokenRow {
  readonly id: string;
  readonly user_id: string;
  readonly token_hash: string;
  readonly family_id: string;
  readonly expires_at: Date;
  readonly revoked_at: Date | null;
  readonly replaced_by: string | null;
  readonly user_agent: string | null;
  readonly ip_address: string | null;
  readonly created_at: Date;
}

export interface OAuthStateRow {
  readonly id: string;
  readonly state_token: string;
  readonly provider: OAuthProvider;
  readonly instance_url: string | null;
  readonly redirect_after: string | null;
  readonly metadata: Record<string, unknown>;
  readonly expires_at: Date;
  readonly consumed_at: Date | null;
  readonly created_at: Date;
}

// ── Domain Types (camelCase) ──────────────────────────────

export interface User {
  readonly id: string;
  readonly tenantId: string | null;
  readonly email: string | null;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly lastLoginAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OAuthIdentity {
  readonly id: string;
  readonly userId: string;
  readonly provider: OAuthProvider;
  readonly providerUserId: string;
  readonly providerUsername: string | null;
  readonly providerEmail: string | null;
  readonly providerAvatarUrl: string | null;
  readonly instanceUrl: string | null;
  readonly accessToken: string | null;
  readonly refreshToken: string | null;
  readonly tokenExpiresAt: Date | null;
  readonly scopes: readonly string[] | null;
  readonly rawProfile: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RefreshToken {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly familyId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly replacedBy: string | null;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  readonly createdAt: Date;
}

// ── Enums ──────────────────────────────────────────────────

export type OAuthProvider = "github" | "gitlab" | "bitbucket" | "azure_devops";

export type UserRole = "owner" | "admin" | "member" | "viewer";

export type UserStatus = "active" | "suspended" | "deleted";

// ── Input Types ────────────────────────────────────────────

export interface CreateUserInput {
  readonly email: string | null;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly tenantId: string | null;
  readonly role?: UserRole;
}

export interface UpsertOAuthIdentityInput {
  readonly userId: string;
  readonly provider: OAuthProvider;
  readonly providerUserId: string;
  readonly providerUsername: string | null;
  readonly providerEmail: string | null;
  readonly providerAvatarUrl: string | null;
  readonly instanceUrl: string | null;
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly tokenExpiresAt: Date | null;
  readonly scopes: readonly string[];
  readonly rawProfile: Record<string, unknown>;
}

export interface OAuthStateInput {
  readonly provider: OAuthProvider;
  readonly instanceUrl: string | null;
  readonly redirectAfter: string | null;
  readonly metadata?: Record<string, unknown>;
}

export interface OAuthProviderProfile {
  readonly providerUserId: string;
  readonly username: string | null;
  readonly email: string | null;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly rawProfile: Record<string, unknown>;
}

export interface OAuthTokenResponse {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresIn: number | null;
  readonly scope: string;
  readonly tokenType: string;
}

// ── JWT Types ──────────────────────────────────────────────

export interface JWTPayload {
  readonly sub: string; // user ID
  readonly tid: string | null; // tenant ID
  readonly role: UserRole;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string; // unique token ID
}

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
}

export interface AuthenticatedUser {
  readonly userId: string;
  readonly tenantId: string | null;
  readonly role: UserRole;
  readonly tokenId: string;
}
```

### Constants: `packages/shared/src/constants/auth.ts`

```typescript
// ── OAuth Provider Config ──────────────────────────────────

export const OAUTH_PROVIDERS = {
  GITHUB: "github",
  GITLAB: "gitlab",
  BITBUCKET: "bitbucket",
  AZURE_DEVOPS: "azure_devops",
} as const;

export const OAUTH_PROVIDER_URLS = {
  github: {
    authorize: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    userProfile: "https://api.github.com/user",
    userEmails: "https://api.github.com/user/emails",
    scopes: ["read:user", "user:email", "read:org"],
  },
  gitlab: {
    authorize: "https://gitlab.com/oauth/authorize",
    token: "https://gitlab.com/oauth/token",
    userProfile: "https://gitlab.com/api/v4/user",
    scopes: ["read_user", "read_api"],
  },
  bitbucket: {
    authorize: "https://bitbucket.org/site/oauth2/authorize",
    token: "https://bitbucket.org/site/oauth2/access_token",
    userProfile: "https://api.bitbucket.org/2.0/user",
    userEmails: "https://api.bitbucket.org/2.0/user/emails",
    scopes: ["account", "email"],
  },
  azure_devops: {
    authorize: "https://app.vssps.visualstudio.com/oauth2/authorize",
    token: "https://app.vssps.visualstudio.com/oauth2/token",
    userProfile: "https://app.vssps.visualstudio.com/_apis/profile/profiles/me",
    scopes: ["vso.profile", "vso.project"],
  },
} as const;

// ── Self-Hosted URL Overrides ──────────────────────────────

export const SELF_HOSTED_URL_PATTERNS = {
  github: {
    authorize: (baseUrl: string) => `${baseUrl}/login/oauth/authorize`,
    token: (baseUrl: string) => `${baseUrl}/login/oauth/access_token`,
    userProfile: (baseUrl: string) => `${baseUrl}/api/v3/user`,
    userEmails: (baseUrl: string) => `${baseUrl}/api/v3/user/emails`,
  },
  gitlab: {
    authorize: (baseUrl: string) => `${baseUrl}/oauth/authorize`,
    token: (baseUrl: string) => `${baseUrl}/oauth/token`,
    userProfile: (baseUrl: string) => `${baseUrl}/api/v4/user`,
  },
  bitbucket: {
    authorize: (baseUrl: string) => `${baseUrl}/site/oauth2/authorize`,
    token: (baseUrl: string) => `${baseUrl}/site/oauth2/access_token`,
    userProfile: (baseUrl: string) => `${baseUrl}/rest/api/latest/users`,
  },
} as const;

// ── JWT Config ─────────────────────────────────────────────

export const JWT_CONFIG = {
  ACCESS_TOKEN_EXPIRY: "15m",
  ACCESS_TOKEN_EXPIRY_SECONDS: 900,
  REFRESH_TOKEN_EXPIRY: "7d",
  REFRESH_TOKEN_EXPIRY_SECONDS: 604800,
  ISSUER: "kenchi",
  AUDIENCE: "kenchi-api",
  ALGORITHM: "HS256" as const,
} as const;

// ── OAuth State Config ─────────────────────────────────────

export const OAUTH_STATE_CONFIG = {
  STATE_TOKEN_BYTES: 32,
  STATE_TTL_MINUTES: 10,
  CLEANUP_INTERVAL_MINUTES: 30,
} as const;

// ── Auth Route Paths ───────────────────────────────────────

export const AUTH_ROUTES = {
  LOGIN: "/auth/:provider/login",
  CALLBACK: "/auth/:provider/callback",
  REFRESH: "/auth/refresh",
  LOGOUT: "/auth/logout",
  ME: "/auth/me",
} as const;

// ── User Roles ─────────────────────────────────────────────

export const USER_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
  VIEWER: "viewer",
} as const;

// ── Audit Actions (extend existing AUDIT_ACTIONS) ──────────

export const AUTH_AUDIT_ACTIONS = {
  USER_CREATED: "user_created",
  USER_LOGIN: "user_login",
  USER_LOGOUT: "user_logout",
  OAUTH_IDENTITY_LINKED: "oauth_identity_linked",
  OAUTH_IDENTITY_UNLINKED: "oauth_identity_unlinked",
  TOKEN_REFRESHED: "token_refreshed",
  TOKEN_FAMILY_REVOKED: "token_family_revoked",
  TENANT_LINKED: "user_tenant_linked",
} as const;

// ── SQL Queries ────────────────────────────────────────────

export const USER_QUERIES = {
  INSERT: `
    INSERT INTO users (email, display_name, avatar_url, tenant_id, role)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `,
  FIND_BY_ID: `SELECT * FROM users WHERE id = $1 AND status != 'deleted'`,
  FIND_BY_EMAIL: `SELECT * FROM users WHERE email = $1 AND status != 'deleted'`,
  UPDATE_LAST_LOGIN: `
    UPDATE users SET last_login_at = NOW()
    WHERE id = $1 RETURNING *
  `,
  UPDATE_TENANT: `
    UPDATE users SET tenant_id = $1
    WHERE id = $2 RETURNING *
  `,
} as const;

export const OAUTH_IDENTITY_QUERIES = {
  UPSERT: `
    INSERT INTO oauth_identities (
      user_id, provider, provider_user_id, provider_username,
      provider_email, provider_avatar_url, instance_url,
      access_token, refresh_token, token_expires_at, scopes, raw_profile
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (provider, provider_user_id, instance_url)
    DO UPDATE SET
      provider_username = EXCLUDED.provider_username,
      provider_email = EXCLUDED.provider_email,
      provider_avatar_url = EXCLUDED.provider_avatar_url,
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      token_expires_at = EXCLUDED.token_expires_at,
      scopes = EXCLUDED.scopes,
      raw_profile = EXCLUDED.raw_profile,
      updated_at = NOW()
    RETURNING *
  `,
  FIND_BY_PROVIDER: `
    SELECT * FROM oauth_identities
    WHERE provider = $1 AND provider_user_id = $2
    AND (instance_url = $3 OR ($3 IS NULL AND instance_url IS NULL))
  `,
  FIND_BY_USER: `SELECT * FROM oauth_identities WHERE user_id = $1`,
} as const;

export const OAUTH_STATE_QUERIES = {
  INSERT: `
    INSERT INTO oauth_states (state_token, provider, instance_url, redirect_after, metadata, expires_at)
    VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '10 minutes')
    RETURNING *
  `,
  CONSUME: `
    UPDATE oauth_states
    SET consumed_at = NOW()
    WHERE state_token = $1 AND consumed_at IS NULL AND expires_at > NOW()
    RETURNING *
  `,
  CLEANUP_EXPIRED: `DELETE FROM oauth_states WHERE expires_at < NOW()`,
} as const;

export const REFRESH_TOKEN_QUERIES = {
  INSERT: `
    INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, user_agent, ip_address)
    VALUES ($1, $2, $3, NOW() + INTERVAL '7 days', $4, $5)
    RETURNING *
  `,
  FIND_BY_HASH: `
    SELECT * FROM refresh_tokens
    WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()
  `,
  REVOKE: `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`,
  REVOKE_FAMILY: `
    UPDATE refresh_tokens SET revoked_at = NOW()
    WHERE family_id = $1 AND revoked_at IS NULL
  `,
  REPLACE: `
    UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by = $2
    WHERE id = $1
  `,
  CLEANUP_EXPIRED: `DELETE FROM refresh_tokens WHERE expires_at < NOW()`,
} as const;

// ── Public Routes (skip auth middleware) ───────────────────

export const PUBLIC_ROUTES: readonly string[] = [
  "/health",
  "/auth/",
  "/webhooks/",
  "/api/webhooks/",
];
```

---

## 4. OAuth Flow: Step by Step

### Login Flow (Happy Path)

```
1. User clicks "Continue with GitHub" on /login
   └── Frontend redirects to: GET /auth/github/login

2. API generates state token, stores in oauth_states table
   └── Redirects to: https://github.com/login/oauth/authorize
       ?client_id=...&redirect_uri=...&scope=read:user,user:email,read:org&state=...

3. User authorizes on GitHub
   └── GitHub redirects to: GET /auth/github/callback?code=...&state=...

4. API handles callback:
   a. Validate & consume state token (CSRF check)
   b. Exchange code for access token (POST to GitHub token endpoint)
   c. Fetch user profile from GitHub API
   d. Find or create user:
      - Check oauth_identities for existing (provider + provider_user_id)
      - If found → update token, return existing user
      - If not found → create user + oauth_identity
   e. Auto-link tenant:
      - Fetch user's GitHub orgs
      - Match against tenants.github_org
      - If match → set user.tenant_id
   f. Generate JWT token pair (access + refresh)
   g. Redirect to frontend: /auth/callback?token=...&refresh=...

5. Frontend stores tokens, redirects to /dashboard
```

### Self-Hosted Flow (Additional Steps)

```
1. User enters instance URL: https://git.acme.com
   └── Frontend redirects to: GET /auth/github/login?instance_url=https://git.acme.com

2. API stores instance_url in oauth_states
   └── Redirects to: https://git.acme.com/login/oauth/authorize
       (uses self-hosted URL pattern instead of github.com)

3. Callback uses instance_url from stored state to call correct token/profile endpoints
```

### Token Refresh Flow

```
1. Frontend access token expires (15 minutes)
2. Frontend calls: POST /auth/refresh { refreshToken: "..." }
3. API validates refresh token:
   a. Hash the token, look up in refresh_tokens table
   b. Check not revoked, not expired
   c. Generate new access + refresh token pair
   d. Revoke old refresh token (replace with new)
   e. Return new token pair
4. If refresh token was already revoked (reuse detected):
   a. Revoke entire token family (all tokens with same family_id)
   b. Return 401 — user must re-authenticate
```

---

## 5. OAuth Routes Implementation

### Route Registration

```typescript
// services/api/src/routes/authRoutes.ts

import { Router } from "express";
import { asyncHandler, validate, validators } from "@kenchi/shared";
import { AUTH_ROUTES } from "@kenchi/shared";

const router = Router();

// Initiate OAuth login
// GET /auth/:provider/login?instance_url=...&redirect_after=...
router.get(
  AUTH_ROUTES.LOGIN,
  validate({
    params: { provider: validateProvider },
    query: {
      instance_url: validators.optionalUrl,
      redirect_after: validators.optionalString,
    },
  }),
  asyncHandler(handleOAuthLogin)
);

// OAuth callback (from provider)
// GET /auth/:provider/callback?code=...&state=...
router.get(
  AUTH_ROUTES.CALLBACK,
  validate({ params: { provider: validateProvider } }),
  asyncHandler(handleOAuthCallback)
);

// Refresh access token
// POST /auth/refresh { refreshToken: "..." }
router.post(
  AUTH_ROUTES.REFRESH,
  validate({ body: { refreshToken: validators.required } }),
  asyncHandler(handleTokenRefresh)
);

// Logout (revoke refresh token family)
// POST /auth/logout { refreshToken: "..." }
router.post(AUTH_ROUTES.LOGOUT, asyncHandler(handleLogout));

// Get current user (requires auth)
// GET /auth/me
router.get(AUTH_ROUTES.ME, asyncHandler(handleGetCurrentUser));

export { router as authRoutes };
```

### Handler: OAuth Login

```typescript
// services/api/src/routes/handlers/authHandlers.ts

import crypto from "node:crypto";
import { config, createLogger, ValidationError } from "@kenchi/shared";
import {
  OAUTH_PROVIDERS,
  OAUTH_PROVIDER_URLS,
  SELF_HOSTED_URL_PATTERNS,
  OAUTH_STATE_CONFIG,
} from "@kenchi/shared";
import type { OAuthProvider, OAuthStateInput } from "@kenchi/shared";

const logger = createLogger("auth-handler");

export const handleOAuthLogin = async (req: Request, res: Response): Promise<void> => {
  const provider = req.params.provider as OAuthProvider;
  const instanceUrl = (req.query.instance_url as string) ?? null;
  const redirectAfter = (req.query.redirect_after as string) ?? "/dashboard";

  // Generate CSRF state token
  const stateToken = crypto.randomBytes(OAUTH_STATE_CONFIG.STATE_TOKEN_BYTES).toString("hex");

  // Store state in database
  await oauthStateRepo.create({
    stateToken,
    provider,
    instanceUrl,
    redirectAfter,
  });

  // Build authorization URL
  const authUrl = buildAuthorizationUrl(provider, instanceUrl, stateToken);

  logger.info("OAuth login initiated", {
    provider,
    instanceUrl: instanceUrl ? "[self-hosted]" : null,
    redirectAfter,
  });

  res.redirect(authUrl.toString());
};

const buildAuthorizationUrl = (
  provider: OAuthProvider,
  instanceUrl: string | null,
  state: string
): URL => {
  const providerConfig = OAUTH_PROVIDER_URLS[provider];
  const clientId = getClientId(provider);

  // Use self-hosted URL if instance_url is provided
  const authorizeUrl = instanceUrl
    ? SELF_HOSTED_URL_PATTERNS[provider]?.authorize(instanceUrl)
    : providerConfig.authorize;

  if (!authorizeUrl) {
    throw new ValidationError(`Self-hosted not supported for ${provider}`);
  }

  const url = new URL(authorizeUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getRedirectUri(provider));
  url.searchParams.set("scope", providerConfig.scopes.join(" "));
  url.searchParams.set("state", state);

  // Provider-specific params
  if (provider === "gitlab") {
    url.searchParams.set("response_type", "code");
  }

  return url;
};
```

### Handler: OAuth Callback

```typescript
export const handleOAuthCallback = async (req: Request, res: Response): Promise<void> => {
  const provider = req.params.provider as OAuthProvider;
  const { code, state, error: oauthError } = req.query;

  // Check for OAuth denial
  if (oauthError) {
    logger.warn("OAuth denied by user", { provider, error: oauthError });
    return res.redirect(`/login?error=oauth_denied&provider=${provider}`);
  }

  // Validate params
  if (typeof code !== "string" || typeof state !== "string") {
    throw new ValidationError("Missing code or state parameter");
  }

  // Consume state token (CSRF protection)
  const storedState = await oauthStateRepo.consume(state);
  if (!storedState) {
    logger.warn("Invalid or expired OAuth state", { provider });
    return res.redirect("/login?error=invalid_state");
  }

  const startTime = Date.now();

  try {
    // 1. Exchange code for tokens
    const oauthAdapter = getOAuthAdapter(provider);
    const tokens = await oauthAdapter.exchangeCode(code, storedState.instanceUrl);

    // 2. Fetch user profile
    const profile = await oauthAdapter.getUserProfile(tokens.accessToken, storedState.instanceUrl);

    const durationMs = Date.now() - startTime;
    logger.info("OAuth token exchange completed", {
      provider,
      operation: "exchangeAndProfile",
      durationMs,
    });

    // 3. Find or create user
    const { user, isNew } = await authService.findOrCreateUser(
      provider,
      profile,
      tokens,
      storedState.instanceUrl
    );

    // 4. Auto-link tenant (if not already linked)
    if (!user.tenantId) {
      await authService.autoLinkTenant(user, provider, tokens.accessToken, storedState.instanceUrl);
    }

    // 5. Update last login
    await userRepo.updateLastLogin(user.id);

    // 6. Generate JWT token pair
    const tokenPair = await authService.generateTokenPair(user, {
      userAgent: req.headers["user-agent"] ?? null,
      ipAddress: req.ip ?? null,
    });

    // 7. Audit log
    await logAuditEvent(user.tenantId ?? "system", AUTH_AUDIT_ACTIONS.USER_LOGIN, {
      userId: user.id,
      provider,
      isNewUser: isNew,
    });

    logger.info("OAuth login successful", {
      userId: user.id,
      tenantId: user.tenantId,
      provider,
      isNewUser: isNew,
    });

    // 8. Redirect to frontend with tokens
    const redirectUrl = new URL(storedState.redirectAfter ?? "/dashboard", config.FRONTEND_URL);
    redirectUrl.searchParams.set("access_token", tokenPair.accessToken);
    redirectUrl.searchParams.set("refresh_token", tokenPair.refreshToken);
    redirectUrl.searchParams.set("expires_in", String(tokenPair.expiresIn));

    res.redirect(redirectUrl.toString());
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error("OAuth callback failed", {
      provider,
      operation: "oauthCallback",
      durationMs,
      error: getErrorMessage(error),
    });

    res.redirect(`/login?error=auth_failed&provider=${provider}`);
  }
};
```

### Handler: Token Refresh

```typescript
export const handleTokenRefresh = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body;

  const result = await authService.refreshTokens(refreshToken, {
    userAgent: req.headers["user-agent"] ?? null,
    ipAddress: req.ip ?? null,
  });

  res.status(200).json({
    access_token: result.accessToken,
    refresh_token: result.refreshToken,
    expires_in: result.expiresIn,
    token_type: "Bearer",
  });
};
```

---

## 6. JWT Token Generation & Refresh

### JWT Service: `packages/shared/src/security/jwt.ts`

```typescript
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { config, AuthenticationError, invariant } from "@kenchi/shared";
import { JWT_CONFIG } from "../constants/auth.js";
import type { JWTPayload, TokenPair, User, AuthenticatedUser } from "../database/user/types.js";

const getSecret = (): string => {
  invariant(config.JWT_SECRET, "JWT_SECRET env var is required");
  return config.JWT_SECRET;
};

// ── Generate Access Token ──────────────────────────────────

export const generateAccessToken = (user: User): string =>
  jwt.sign(
    {
      sub: user.id,
      tid: user.tenantId,
      role: user.role,
      jti: crypto.randomUUID(),
    },
    getSecret(),
    {
      expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRY,
      issuer: JWT_CONFIG.ISSUER,
      audience: JWT_CONFIG.AUDIENCE,
      algorithm: JWT_CONFIG.ALGORITHM,
    }
  );

// ── Generate Refresh Token ─────────────────────────────────
// Returns a raw random string (NOT a JWT).
// The hash of this string is stored in the database.

export const generateRefreshToken = (): string => crypto.randomBytes(48).toString("base64url");

export const hashRefreshToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

// ── Verify Access Token ────────────────────────────────────

export const verifyAccessToken = (token: string): AuthenticatedUser => {
  try {
    const payload = jwt.verify(token, getSecret(), {
      issuer: JWT_CONFIG.ISSUER,
      audience: JWT_CONFIG.AUDIENCE,
      algorithms: [JWT_CONFIG.ALGORITHM],
    }) as JWTPayload;

    return {
      userId: payload.sub,
      tenantId: payload.tid,
      role: payload.role,
      tokenId: payload.jti,
    };
  } catch (error) {
    const message =
      error instanceof jwt.TokenExpiredError ? "Access token expired" : "Invalid access token";

    throw new AuthenticationError(message, {
      operation: "verifyAccessToken",
    });
  }
};
```

### Auth Service: Token Pair Generation & Refresh

```typescript
// services/api/src/services/authService.ts

import { createLogger, AuthenticationError } from "@kenchi/shared";
import {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  verifyAccessToken,
} from "@kenchi/shared";
import { JWT_CONFIG, AUTH_AUDIT_ACTIONS } from "@kenchi/shared";
import type {
  User,
  TokenPair,
  OAuthProvider,
  OAuthProviderProfile,
  OAuthTokenResponse,
} from "@kenchi/shared";

const logger = createLogger("auth-service");

// ── Find or Create User ────────────────────────────────────

export const findOrCreateUser = async (
  provider: OAuthProvider,
  profile: OAuthProviderProfile,
  tokens: OAuthTokenResponse,
  instanceUrl: string | null
): Promise<{ readonly user: User; readonly isNew: boolean }> => {
  // Check if OAuth identity already exists
  const existingIdentity = await oauthIdentityRepo.findByProvider(
    provider,
    profile.providerUserId,
    instanceUrl
  );

  if (existingIdentity) {
    // Update tokens on existing identity
    await oauthIdentityRepo.upsert({
      userId: existingIdentity.userId,
      provider,
      providerUserId: profile.providerUserId,
      providerUsername: profile.username,
      providerEmail: profile.email,
      providerAvatarUrl: profile.avatarUrl,
      instanceUrl,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null,
      scopes: tokens.scope.split(/[\s,]+/),
      rawProfile: profile.rawProfile,
    });

    const user = await userRepo.findById(existingIdentity.userId);
    invariant(user, "User must exist for existing OAuth identity");

    return { user, isNew: false };
  }

  // Check if user with same email exists (account linking)
  const existingUser = profile.email ? await userRepo.findByEmail(profile.email) : null;

  const user =
    existingUser ??
    (await userRepo.create({
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      tenantId: null,
    }));

  // Create OAuth identity
  await oauthIdentityRepo.upsert({
    userId: user.id,
    provider,
    providerUserId: profile.providerUserId,
    providerUsername: profile.username,
    providerEmail: profile.email,
    providerAvatarUrl: profile.avatarUrl,
    instanceUrl,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenExpiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null,
    scopes: tokens.scope.split(/[\s,]+/),
    rawProfile: profile.rawProfile,
  });

  return { user, isNew: !existingUser };
};

// ── Auto-Link Tenant ───────────────────────────────────────

export const autoLinkTenant = async (
  user: User,
  provider: OAuthProvider,
  accessToken: string,
  instanceUrl: string | null
): Promise<void> => {
  if (provider !== "github" && provider !== "gitlab") return;

  const oauthAdapter = getOAuthAdapter(provider);
  const orgs = await oauthAdapter.getUserOrganizations(accessToken, instanceUrl);

  // Match against known tenants
  for (const org of orgs) {
    const tenant = await findByGitHubOrg(org.login);
    if (tenant) {
      await userRepo.updateTenant(user.id, tenant.id);

      logger.info("User auto-linked to tenant", {
        userId: user.id,
        tenantId: tenant.id,
        matchedOrg: org.login,
      });

      await logAuditEvent(tenant.id, AUTH_AUDIT_ACTIONS.TENANT_LINKED, {
        userId: user.id,
        matchedOrg: org.login,
      });

      return;
    }
  }

  logger.info("No tenant match found for user orgs", {
    userId: user.id,
    orgCount: orgs.length,
  });
};

// ── Generate Token Pair ────────────────────────────────────

export const generateTokenPair = async (
  user: User,
  meta: { readonly userAgent: string | null; readonly ipAddress: string | null }
): Promise<TokenPair> => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);
  const familyId = crypto.randomUUID();

  await refreshTokenRepo.create({
    userId: user.id,
    tokenHash,
    familyId,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRY_SECONDS,
  };
};

// ── Refresh Tokens (with Rotation) ─────────────────────────

export const refreshTokens = async (
  rawRefreshToken: string,
  meta: { readonly userAgent: string | null; readonly ipAddress: string | null }
): Promise<TokenPair> => {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const storedToken = await refreshTokenRepo.findByHash(tokenHash);

  if (!storedToken) {
    // Token not found — could be expired or already revoked
    throw new AuthenticationError("Invalid refresh token", {
      operation: "refreshTokens",
    });
  }

  // Check if this token was already used (reuse detection)
  if (storedToken.revokedAt) {
    // SECURITY: A revoked token was reused — revoke the entire family
    await refreshTokenRepo.revokeFamily(storedToken.familyId);

    logger.warn("Refresh token reuse detected, family revoked", {
      userId: storedToken.userId,
      familyId: storedToken.familyId,
      tokenId: storedToken.id,
    });

    await logAuditEvent("system", AUTH_AUDIT_ACTIONS.TOKEN_FAMILY_REVOKED, {
      userId: storedToken.userId,
      familyId: storedToken.familyId,
      reason: "reuse_detected",
    });

    throw new AuthenticationError("Refresh token reuse detected", {
      operation: "refreshTokens",
    });
  }

  // Get user
  const user = await userRepo.findById(storedToken.userId);
  if (!user || user.status !== "active") {
    throw new AuthenticationError("User not found or inactive", {
      operation: "refreshTokens",
    });
  }

  // Generate new token pair
  const newRefreshToken = generateRefreshToken();
  const newTokenHash = hashRefreshToken(newRefreshToken);

  // Rotate: revoke old, create new in same family
  const newStoredToken = await refreshTokenRepo.create({
    userId: user.id,
    tokenHash: newTokenHash,
    familyId: storedToken.familyId,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });

  await refreshTokenRepo.replace(storedToken.id, newStoredToken.id);

  const accessToken = generateAccessToken(user);

  return {
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRY_SECONDS,
  };
};
```

---

## 7. Auth Middleware

### JWT Verification Middleware

```typescript
// packages/shared/src/http/authMiddleware.ts

import type { Request, Response, NextFunction } from "express";
import { AuthenticationError, createLogger } from "../core/index.js";
import { verifyAccessToken } from "../security/jwt.js";
import { PUBLIC_ROUTES } from "../constants/auth.js";
import type { AuthenticatedUser } from "../database/user/types.js";

const logger = createLogger("auth-middleware");

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const isPublicRoute = (path: string): boolean =>
  PUBLIC_ROUTES.some((prefix) => path.startsWith(prefix));

export const authMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  // Skip auth for public routes
  if (isPublicRoute(req.path)) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthenticationError("Missing or invalid Authorization header", {
      operation: "authMiddleware",
      suggestion: 'Include "Authorization: Bearer <token>" header',
    });
  }

  const token = authHeader.slice(7);
  const user = verifyAccessToken(token);

  // Attach user to request
  req.user = user;

  // Set RequestContext from JWT claims
  req.context = {
    requestId: req.context?.requestId ?? crypto.randomUUID(),
    tenantId: user.tenantId ?? "unlinked",
    actor: user.userId,
  };

  next();
};
```

### Integration in Express App

```typescript
// services/api/src/index.ts

import { authMiddleware } from "@kenchi/shared";
import { authRoutes } from "./routes/authRoutes.js";

const createApp = (): express.Express => {
  const app = express();
  app.set("trust proxy", 1);

  app.use(express.json({ limit: EXPRESS_CONFIG.JSON_BODY_LIMIT }));
  app.use(requestLogger);
  app.use(apiRateLimiter.middleware());

  // Auth middleware (skips public routes automatically)
  app.use(authMiddleware);

  // Auth routes (public — login, callback, refresh)
  app.use(authRoutes);

  // Business routes (protected)
  registerRoutes(app);

  app.use(errorHandler);
  return app;
};
```

### Using `req.user` in Protected Handlers

```typescript
// Example: protected route handler
export const handleGetAnalyses = asyncHandler(async (req, res) => {
  // req.user is guaranteed to be set (auth middleware ran)
  const { userId, tenantId, role } = req.user!;

  if (!tenantId) {
    throw new AuthorizationError("User is not linked to a tenant", {
      operation: "getAnalyses",
      metadata: { userId },
    });
  }

  const analyses = await analysisRepo.findByTenant(tenantId);
  res.status(200).json({ data: analyses.map(mapAnalysisToResponse) });
});
```

---

## 8. Self-Hosted Provider Support

### How It Works

The `instance_url` query parameter changes which OAuth endpoints are used:

```
Cloud (default):
  Authorize: https://github.com/login/oauth/authorize
  Token:     https://github.com/login/oauth/access_token
  Profile:   https://api.github.com/user

Self-hosted (instance_url = https://git.acme.com):
  Authorize: https://git.acme.com/login/oauth/authorize
  Token:     https://git.acme.com/login/oauth/access_token
  Profile:   https://git.acme.com/api/v3/user
```

### OAuth Adapter with Instance URL Support

```typescript
// services/api/src/adapters/githubOAuthAdapter.ts

import { createLogger, ExternalServiceError, classifyHttpError, startTimer } from "@kenchi/shared";
import { OAUTH_PROVIDER_URLS, SELF_HOSTED_URL_PATTERNS } from "@kenchi/shared";
import type { OAuthProviderProfile, OAuthTokenResponse, RequestContext } from "@kenchi/shared";

const logger = createLogger("github-oauth-adapter");

const getUrls = (instanceUrl: string | null) => {
  const cloud = OAUTH_PROVIDER_URLS.github;
  const selfHosted = SELF_HOSTED_URL_PATTERNS.github;

  return instanceUrl
    ? {
        token: selfHosted.token(instanceUrl),
        userProfile: selfHosted.userProfile(instanceUrl),
        userEmails: selfHosted.userEmails(instanceUrl),
      }
    : {
        token: cloud.token,
        userProfile: cloud.userProfile,
        userEmails: cloud.userEmails,
      };
};

export const exchangeCode = async (
  code: string,
  instanceUrl: string | null
): Promise<OAuthTokenResponse> => {
  const urls = getUrls(instanceUrl);
  const timer = startTimer();

  try {
    const response = await fetch(urls.token, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: config.GITHUB_OAUTH_CLIENT_ID,
        client_secret: config.GITHUB_OAUTH_CLIENT_SECRET,
        code,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const data = await response.json();
    const durationMs = timer.elapsedMs();

    if (data.error) {
      logger.error("GitHub token exchange failed", {
        provider: "github",
        operation: "exchangeCode",
        durationMs,
        error: data.error,
        instanceUrl: instanceUrl ? "[self-hosted]" : null,
      });
      throw new ExternalServiceError("github", `Token exchange failed: ${data.error}`, {
        retryable: false,
      });
    }

    logger.info("GitHub token exchange completed", {
      provider: "github",
      operation: "exchangeCode",
      durationMs,
      instanceUrl: instanceUrl ? "[self-hosted]" : null,
    });

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresIn: data.expires_in ?? null,
      scope: data.scope,
      tokenType: data.token_type,
    };
  } catch (error) {
    if (error instanceof ExternalServiceError) throw error;

    const durationMs = timer.elapsedMs();
    const classified = classifyHttpError(error);

    logger.error("GitHub token exchange request failed", {
      provider: "github",
      operation: "exchangeCode",
      durationMs,
      ...classified,
    });

    throw new ExternalServiceError("github", "Failed to exchange OAuth code", {
      retryable: classified.retryable,
    });
  }
};

export const getUserProfile = async (
  accessToken: string,
  instanceUrl: string | null
): Promise<OAuthProviderProfile> => {
  const urls = getUrls(instanceUrl);
  const timer = startTimer();

  const [profileRes, emailsRes] = await Promise.all([
    fetch(urls.userProfile, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    }),
    fetch(urls.userEmails, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    }),
  ]);

  const profile = await profileRes.json();
  const emails = await emailsRes.json();
  const durationMs = timer.elapsedMs();

  logger.info("GitHub profile fetched", {
    provider: "github",
    operation: "getUserProfile",
    durationMs,
  });

  // Find primary verified email
  const primaryEmail = Array.isArray(emails)
    ? (emails.find((e: { primary: boolean; verified: boolean }) => e.primary && e.verified)
        ?.email ??
      emails.find((e: { verified: boolean }) => e.verified)?.email ??
      null)
    : null;

  return {
    providerUserId: String(profile.id),
    username: profile.login,
    email: primaryEmail ?? profile.email,
    displayName: profile.name ?? profile.login,
    avatarUrl: profile.avatar_url,
    rawProfile: profile,
  };
};

export const getUserOrganizations = async (
  accessToken: string,
  instanceUrl: string | null
): Promise<ReadonlyArray<{ readonly login: string }>> => {
  const baseUrl = instanceUrl ? `${instanceUrl}/api/v3` : "https://api.github.com";

  const response = await fetch(`${baseUrl}/user/orgs`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  return response.json();
};
```

### Port Interface

```typescript
// services/api/src/ports/oauthPort.ts

import type { OAuthProviderProfile, OAuthTokenResponse } from "@kenchi/shared";

export interface OAuthPort {
  exchangeCode(code: string, instanceUrl: string | null): Promise<OAuthTokenResponse>;
  getUserProfile(accessToken: string, instanceUrl: string | null): Promise<OAuthProviderProfile>;
  getUserOrganizations(
    accessToken: string,
    instanceUrl: string | null
  ): Promise<ReadonlyArray<{ readonly login: string }>>;
}
```

### Adapter Registry

```typescript
// services/api/src/adapters/oauthAdapterRegistry.ts

import type { OAuthPort } from "../ports/oauthPort.js";
import type { OAuthProvider } from "@kenchi/shared";
import * as githubAdapter from "./githubOAuthAdapter.js";
import * as gitlabAdapter from "./gitlabOAuthAdapter.js";
import * as bitbucketAdapter from "./bitbucketOAuthAdapter.js";

const adapters: Record<OAuthProvider, OAuthPort> = {
  github: githubAdapter,
  gitlab: gitlabAdapter,
  bitbucket: bitbucketAdapter,
  azure_devops: azureDevOpsAdapter,
};

export const getOAuthAdapter = (provider: OAuthProvider): OAuthPort => {
  const adapter = adapters[provider];
  invariant(adapter, `No OAuth adapter for provider: ${provider}`);
  return adapter;
};
```

---

## 9. Provider Configurations

### Environment Variables

Add to `packages/shared/src/core/config.ts`:

```typescript
// ── Auth / OAuth Config ────────────────────────────────────

// JWT
JWT_SECRET: process.env.JWT_SECRET,

// GitHub OAuth App (NOT the GitHub App — separate OAuth app)
GITHUB_OAUTH_CLIENT_ID: process.env.GITHUB_OAUTH_CLIENT_ID,
GITHUB_OAUTH_CLIENT_SECRET: process.env.GITHUB_OAUTH_CLIENT_SECRET,

// GitLab OAuth
GITLAB_OAUTH_CLIENT_ID: process.env.GITLAB_OAUTH_CLIENT_ID,
GITLAB_OAUTH_CLIENT_SECRET: process.env.GITLAB_OAUTH_CLIENT_SECRET,

// Bitbucket OAuth
BITBUCKET_OAUTH_CLIENT_ID: process.env.BITBUCKET_OAUTH_CLIENT_ID,
BITBUCKET_OAUTH_CLIENT_SECRET: process.env.BITBUCKET_OAUTH_CLIENT_SECRET,

// Azure DevOps OAuth
AZURE_DEVOPS_OAUTH_CLIENT_ID: process.env.AZURE_DEVOPS_OAUTH_CLIENT_ID,
AZURE_DEVOPS_OAUTH_CLIENT_SECRET: process.env.AZURE_DEVOPS_OAUTH_CLIENT_SECRET,

// Frontend URL (for OAuth redirects)
FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:3003',

// OAuth callback base URL
OAUTH_CALLBACK_BASE_URL: process.env.OAUTH_CALLBACK_BASE_URL ?? 'http://localhost:3001',
```

### `.env.example` additions

```bash
# ── Authentication ──────────────────────────────────────────
JWT_SECRET=your-256-bit-secret-here-change-in-production

# GitHub OAuth App (create at https://github.com/settings/developers)
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=

# GitLab OAuth App (create at https://gitlab.com/-/user_settings/applications)
GITLAB_OAUTH_CLIENT_ID=
GITLAB_OAUTH_CLIENT_SECRET=

# Bitbucket OAuth Consumer (create at https://bitbucket.org/account/settings/app-passwords/)
BITBUCKET_OAUTH_CLIENT_ID=
BITBUCKET_OAUTH_CLIENT_SECRET=

# Azure DevOps OAuth App
AZURE_DEVOPS_OAUTH_CLIENT_ID=
AZURE_DEVOPS_OAUTH_CLIENT_SECRET=

# Frontend URL (for redirect after OAuth)
FRONTEND_URL=http://localhost:3003

# OAuth callback base (API URL as seen by OAuth providers)
OAUTH_CALLBACK_BASE_URL=http://localhost:3001
```

### Provider Setup Guides

| Provider        | Create OAuth App At                                  | Callback URL                                           |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| GitHub          | github.com/settings/developers → New OAuth App       | `{OAUTH_CALLBACK_BASE_URL}/auth/github/callback`       |
| GitLab          | gitlab.com/-/user_settings/applications              | `{OAUTH_CALLBACK_BASE_URL}/auth/gitlab/callback`       |
| Bitbucket       | bitbucket.org → Workspace settings → OAuth consumers | `{OAUTH_CALLBACK_BASE_URL}/auth/bitbucket/callback`    |
| Azure DevOps    | app.vsaex.visualstudio.com/app/register              | `{OAUTH_CALLBACK_BASE_URL}/auth/azure_devops/callback` |
| GH Enterprise   | `{instance_url}/settings/developers` → New OAuth App | `{OAUTH_CALLBACK_BASE_URL}/auth/github/callback`       |
| GL Self-Managed | `{instance_url}/admin/applications`                  | `{OAUTH_CALLBACK_BASE_URL}/auth/gitlab/callback`       |

> **Note:** For self-hosted providers, the customer creates an OAuth app on their instance pointing to Kenchi's callback URL. The same callback endpoint handles both cloud and self-hosted — the `instance_url` stored in the OAuth state tells the handler which token/profile endpoints to use.

---

## 10. Frontend Integration

### Auth Callback Page: `src/pages/AuthCallback.tsx`

```typescript
// New page that receives tokens from OAuth redirect
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const accessToken = searchParams.get('access_token');
    const refreshToken = searchParams.get('refresh_token');
    const error = searchParams.get('error');

    if (error) {
      navigate(`/login?error=${error}`);
      return;
    }

    if (accessToken && refreshToken) {
      // Store tokens
      localStorage.setItem('kenchi_access_token', accessToken);
      localStorage.setItem('kenchi_refresh_token', refreshToken);

      // Redirect to dashboard
      navigate('/dashboard', { replace: true });
    } else {
      navigate('/login?error=missing_tokens');
    }
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-500">Signing you in...</div>
    </div>
  );
};

export default AuthCallback;
```

### Update Login Buttons

```typescript
// In Login.tsx — change onClick to redirect to API OAuth endpoint

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

const getLoginUrl = (provider: string, instanceUrl?: string): string => {
  const url = new URL(`/auth/${provider}/login`, API_URL);
  if (instanceUrl) {
    url.searchParams.set('instance_url', instanceUrl);
  }
  return url.toString();
};

// In the button:
<button
  onClick={() => window.location.href = getLoginUrl('github')}
>
  Continue with GitHub
</button>

// Self-hosted:
<button
  onClick={() => window.location.href = getLoginUrl('github', instanceUrl)}
>
  Continue with GitHub Enterprise
</button>
```

### API Client with Token Refresh

```typescript
// src/lib/apiClient.ts

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const getAccessToken = (): string | null => localStorage.getItem("kenchi_access_token");

const getRefreshToken = (): string | null => localStorage.getItem("kenchi_refresh_token");

const refreshAccessToken = async (): Promise<string | null> => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    // Refresh failed — clear tokens and redirect to login
    localStorage.removeItem("kenchi_access_token");
    localStorage.removeItem("kenchi_refresh_token");
    window.location.href = "/login";
    return null;
  }

  const data = await response.json();
  localStorage.setItem("kenchi_access_token", data.access_token);
  localStorage.setItem("kenchi_refresh_token", data.refresh_token);
  return data.access_token;
};

export const apiClient = async (path: string, options: RequestInit = {}): Promise<Response> => {
  const accessToken = getAccessToken();

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });

  // If 401, try refreshing the token
  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          ...options.headers,
          "Content-Type": "application/json",
          Authorization: `Bearer ${newToken}`,
        },
      });
    }
  }

  return response;
};
```

### Route: `App.tsx`

```typescript
// Add auth callback route
<Route path="/auth/callback" element={<AuthCallback />} />
```

---

## 11. Security Considerations

### Token Security

| Concern                      | Mitigation                                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| JWT secret exposure          | `JWT_SECRET` loaded from env, never logged, minimum 256-bit                                                                         |
| Refresh token theft          | Refresh token rotation with family-based revocation. If a revoked token is reused, the entire family is revoked.                    |
| Token in URL params          | Tokens are passed via URL redirect params (HTTPS only in production). Frontend immediately stores and clears from URL.              |
| XSS token theft              | Tokens in `localStorage` are vulnerable to XSS. Consider `httpOnly` cookies for production. See **Cookie-Based Alternative** below. |
| CSRF on OAuth flow           | State token in database with 10-minute TTL, consumed on callback                                                                    |
| OAuth provider token storage | Provider access tokens encrypted at rest (TODO: add column-level encryption)                                                        |

### Cookie-Based Alternative (Production Recommendation)

For production, consider setting tokens as `httpOnly` cookies instead of returning them in URL params:

```typescript
// In OAuth callback handler (production):
res.cookie("kenchi_access", tokenPair.accessToken, {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  maxAge: JWT_CONFIG.ACCESS_TOKEN_EXPIRY_SECONDS * 1000,
  path: "/",
});

res.cookie("kenchi_refresh", tokenPair.refreshToken, {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  maxAge: JWT_CONFIG.REFRESH_TOKEN_EXPIRY_SECONDS * 1000,
  path: "/auth/refresh",
});

res.redirect(redirectUrl);
```

This prevents XSS attacks from stealing tokens but requires CSRF protection (handled by `sameSite: 'lax'`).

### Rate Limiting

```typescript
// Additional rate limits for auth endpoints
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 20, // 20 login attempts per window
  keyGenerator: (req) => req.ip,
});

router.use("/auth", authRateLimiter.middleware());
```

### Input Validation

- `instance_url` validated as a proper HTTPS URL (no HTTP in production)
- `provider` param validated against the known provider enum
- State tokens are cryptographically random (32 bytes)
- Refresh tokens are cryptographically random (48 bytes)
- All SQL uses parameterized queries (no injection)

---

## 12. Testing Strategy

### Unit Tests

```
packages/shared/src/__tests__/security/jwt.test.ts
├── generateAccessToken — creates valid JWT with correct claims
├── verifyAccessToken — verifies valid token, rejects expired, rejects tampered
├── hashRefreshToken — produces consistent SHA-256 hash
└── generateRefreshToken — produces URL-safe base64 string

packages/shared/src/__tests__/database/user/repository.test.ts
├── createUser — inserts and returns domain object
├── findById — returns null for missing user
├── findByEmail — case-insensitive lookup
└── updateTenant — links user to tenant

packages/shared/src/__tests__/database/user/oauthIdentity.test.ts
├── upsert — creates new identity
├── upsert — updates existing identity (same provider + user ID)
├── findByProvider — matches on provider + user ID + instance URL
└── findByProvider — distinguishes cloud vs self-hosted
```

### Integration Tests

```
services/api/src/__tests__/routes/auth.test.ts
├── GET /auth/github/login
│   ├── redirects to GitHub OAuth with correct params
│   ├── stores state token in database
│   └── includes instance_url for self-hosted
├── GET /auth/github/callback
│   ├── exchanges code, creates user, returns tokens
│   ├── returns existing user for known OAuth identity
│   ├── auto-links tenant when GitHub org matches
│   ├── rejects invalid state token
│   └── handles OAuth denial gracefully
├── POST /auth/refresh
│   ├── rotates refresh token, returns new pair
│   ├── rejects expired refresh token
│   └── revokes family on token reuse
├── POST /auth/logout
│   └── revokes refresh token family
└── Protected routes
    ├── returns 401 without Bearer token
    ├── returns 401 with expired token
    └── sets req.user and req.context with valid token
```

### E2E Test (Manual / Playwright)

```
1. Navigate to /login
2. Click "Continue with GitHub"
3. Authorize in GitHub OAuth screen
4. Verify redirect to /dashboard
5. Verify API calls include Bearer token
6. Wait 15 minutes, verify token auto-refreshes
7. Click "Sign out", verify redirect to /login
8. Verify refresh token is revoked (POST /auth/refresh returns 401)
```

---

## 13. Migration & Rollout Plan

### Phase 1: Database & Shared Types (No Behavior Change)

1. Add `012_users_and_sessions.sql` migration
2. Add types to `packages/shared/src/database/user/types.ts`
3. Add constants to `packages/shared/src/constants/auth.ts`
4. Add repositories: `userRepo`, `oauthIdentityRepo`, `oauthStateRepo`, `refreshTokenRepo`
5. Add JWT utilities to `packages/shared/src/security/jwt.ts`
6. Export from `packages/shared/src/index.ts`
7. Add env vars to config (with sensible defaults)

**Verification:** `npx tsc -b` passes, existing tests pass, no behavior change.

### Phase 2: Auth Routes (Opt-In)

1. Add OAuth adapter for GitHub (start with one provider)
2. Add auth service (`findOrCreateUser`, `generateTokenPair`, `refreshTokens`)
3. Add auth routes (`/auth/github/login`, `/auth/github/callback`, `/auth/refresh`, `/auth/logout`)
4. Register auth routes in `services/api/src/routes/index.ts`
5. Do NOT add auth middleware yet — existing routes remain unprotected

**Verification:** Can complete full OAuth flow with GitHub. Existing API behavior unchanged.

### Phase 3: Auth Middleware (Gradual)

1. Add `authMiddleware` to shared
2. Apply to API app (with `PUBLIC_ROUTES` allowlist)
3. Update existing route handlers to use `req.user` where needed
4. Webhook routes remain public (already authenticated via HMAC signatures)

**Verification:** Protected routes require Bearer token. Webhooks still work.

### Phase 4: Additional Providers

1. Add GitLab OAuth adapter
2. Add Bitbucket OAuth adapter
3. Add Azure DevOps OAuth adapter
4. Test self-hosted flows for GitHub Enterprise and GitLab Self-Managed

### Phase 5: Frontend Integration

1. Add `AuthCallback` page
2. Update Login.tsx buttons to redirect to API OAuth endpoints
3. Add `apiClient` with automatic token refresh
4. Add auth state management (context or store)
5. Add protected route wrapper
6. Update Dashboard to fetch real data via authenticated API calls

---

## 14. File Inventory

### New Files

| File                                                 | Purpose                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| `database/init/012_users_and_sessions.sql`           | Migration: users, oauth_identities, refresh_tokens, oauth_states |
| `packages/shared/src/database/user/types.ts`         | Row types, domain types, input types, JWT types                  |
| `packages/shared/src/database/user/helpers.ts`       | Row mappers, validators                                          |
| `packages/shared/src/database/user/repository.ts`    | User CRUD operations                                             |
| `packages/shared/src/database/user/oauthIdentity.ts` | OAuth identity operations                                        |
| `packages/shared/src/database/user/oauthState.ts`    | State token operations                                           |
| `packages/shared/src/database/user/refreshToken.ts`  | Refresh token operations                                         |
| `packages/shared/src/database/user/index.ts`         | Barrel exports                                                   |
| `packages/shared/src/constants/auth.ts`              | Auth constants, queries, routes                                  |
| `packages/shared/src/security/jwt.ts`                | JWT generation, verification, hashing                            |
| `packages/shared/src/http/authMiddleware.ts`         | Bearer token verification middleware                             |
| `services/api/src/ports/oauthPort.ts`                | OAuth provider port interface                                    |
| `services/api/src/adapters/githubOAuthAdapter.ts`    | GitHub OAuth adapter                                             |
| `services/api/src/adapters/gitlabOAuthAdapter.ts`    | GitLab OAuth adapter                                             |
| `services/api/src/adapters/bitbucketOAuthAdapter.ts` | Bitbucket OAuth adapter                                          |
| `services/api/src/adapters/oauthAdapterRegistry.ts`  | Provider adapter lookup                                          |
| `services/api/src/services/authService.ts`           | Auth business logic                                              |
| `services/api/src/routes/authRoutes.ts`              | Auth route definitions                                           |
| `services/api/src/routes/handlers/authHandlers.ts`   | Route handler functions                                          |
| `services/frontend/src/pages/AuthCallback.tsx`       | Frontend token receiver                                          |
| `services/frontend/src/lib/apiClient.ts`             | Authenticated API client                                         |

### Modified Files

| File                                     | Change                                          |
| ---------------------------------------- | ----------------------------------------------- |
| `packages/shared/src/core/config.ts`     | Add JWT_SECRET, OAuth client ID/secret env vars |
| `packages/shared/src/index.ts`           | Export new auth modules                         |
| `packages/shared/src/database/index.ts`  | Export user database modules                    |
| `packages/shared/src/constants/index.ts` | Export auth constants                           |
| `services/api/src/index.ts`              | Add authMiddleware, register authRoutes         |
| `services/api/src/routes/index.ts`       | Register authRoutes                             |
| `services/frontend/src/App.tsx`          | Add `/auth/callback` route                      |
| `services/frontend/src/pages/Login.tsx`  | Update buttons to use OAuth URLs                |
| `docker-compose.yml`                     | Add JWT_SECRET and OAuth env vars               |
| `.env.example`                           | Document new env vars                           |

### Dependencies to Add

| Package               | Where                   | Purpose          |
| --------------------- | ----------------------- | ---------------- |
| `jsonwebtoken`        | `packages/shared`       | JWT sign/verify  |
| `@types/jsonwebtoken` | `packages/shared` (dev) | TypeScript types |

---

## Appendix: Provider-Specific Notes

### GitHub

- Uses non-standard token endpoint (returns `application/x-www-form-urlencoded` by default — must send `Accept: application/json`)
- Access tokens don't expire by default (unless the OAuth app enables token expiration)
- User emails require separate API call (`GET /user/emails`) with `user:email` scope
- GitHub Enterprise uses `/api/v3/` prefix for REST API

### GitLab

- Standard OAuth 2.0 with PKCE support
- Uses `response_type=code` in authorize URL
- Access tokens expire (2 hours default), refresh tokens provided
- Self-managed uses same API paths as gitlab.com

### Bitbucket

- Uses `Basic` auth header for token exchange (base64 of `client_id:client_secret`)
- User emails require separate API call (`GET /2.0/user/emails`)
- Bitbucket Server (self-hosted) uses different REST API paths (`/rest/api/latest/`)

### Azure DevOps

- Uses non-standard OAuth flow (Visual Studio app registration)
- Token endpoint requires `client_assertion` instead of `client_secret`
- Self-hosted (Azure DevOps Server) has different endpoint patterns
- Recommend implementing last due to complexity

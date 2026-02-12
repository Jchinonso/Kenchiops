/**
 * Authentication & Authorization Constants
 *
 * OAuth provider configuration, JWT settings, SQL queries,
 * and route definitions for the auth system.
 *
 * @module constants/auth
 */

// ==================== User Status & Roles ====================

export const USER_STATUS = {
  ACTIVE: "active",
  SUSPENDED: "suspended",
  DELETED: "deleted",
} as const;

export const USER_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
  VIEWER: "viewer",
} as const;

// ==================== OAuth Providers ====================

export const OAUTH_PROVIDERS = {
  GITHUB: "github",
  GITLAB: "gitlab",
  BITBUCKET: "bitbucket",
  AZURE_DEVOPS: "azure_devops",
} as const;

export const VALID_OAUTH_PROVIDERS = new Set([
  OAUTH_PROVIDERS.GITHUB,
  OAUTH_PROVIDERS.GITLAB,
  OAUTH_PROVIDERS.BITBUCKET,
  OAUTH_PROVIDERS.AZURE_DEVOPS,
]);

// ==================== OAuth Provider URLs ====================

export const OAUTH_PROVIDER_URLS = {
  github: {
    authorize: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    userProfile: "https://api.github.com/user",
    userEmails: "https://api.github.com/user/emails",
    userOrgs: "https://api.github.com/user/orgs",
    scopes: ["read:user", "user:email", "read:org"],
  },
  gitlab: {
    authorize: "https://gitlab.com/oauth/authorize",
    token: "https://gitlab.com/oauth/token",
    userProfile: "https://gitlab.com/api/v4/user",
    userGroups: "https://gitlab.com/api/v4/groups",
    scopes: ["read_user", "read_api"],
  },
  bitbucket: {
    authorize: "https://bitbucket.org/site/oauth2/authorize",
    token: "https://bitbucket.org/site/oauth2/access_token",
    userProfile: "https://api.bitbucket.org/2.0/user",
    userEmails: "https://api.bitbucket.org/2.0/user/emails",
    userWorkspaces: "https://api.bitbucket.org/2.0/workspaces",
    scopes: ["account", "email"],
  },
  azure_devops: {
    authorize: "https://app.vssps.visualstudio.com/oauth2/authorize",
    token: "https://app.vssps.visualstudio.com/oauth2/token",
    userProfile: "https://app.vssps.visualstudio.com/_apis/profile/profiles/me",
    userAccounts: "https://app.vssps.visualstudio.com/_apis/accounts",
    scopes: ["vso.profile", "vso.project"],
  },
} as const;

// ==================== Self-Hosted URL Patterns ====================

export const SELF_HOSTED_URL_PATTERNS = {
  github: {
    authorize: (baseUrl: string): string => `${baseUrl}/login/oauth/authorize`,
    token: (baseUrl: string): string => `${baseUrl}/login/oauth/access_token`,
    userProfile: (baseUrl: string): string => `${baseUrl}/api/v3/user`,
    userEmails: (baseUrl: string): string => `${baseUrl}/api/v3/user/emails`,
    userOrgs: (baseUrl: string): string => `${baseUrl}/api/v3/user/orgs`,
  },
  gitlab: {
    authorize: (baseUrl: string): string => `${baseUrl}/oauth/authorize`,
    token: (baseUrl: string): string => `${baseUrl}/oauth/token`,
    userProfile: (baseUrl: string): string => `${baseUrl}/api/v4/user`,
    userGroups: (baseUrl: string): string => `${baseUrl}/api/v4/groups`,
  },
  bitbucket: {
    authorize: (baseUrl: string): string => `${baseUrl}/site/oauth2/authorize`,
    token: (baseUrl: string): string => `${baseUrl}/site/oauth2/access_token`,
    userProfile: (baseUrl: string): string => `${baseUrl}/rest/api/latest/users`,
  },
} as const;

// ==================== JWT Configuration ====================

export const JWT_CONFIG = {
  ACCESS_TOKEN_EXPIRY: "15m",
  ACCESS_TOKEN_EXPIRY_SECONDS: 900,
  REFRESH_TOKEN_EXPIRY: "7d",
  REFRESH_TOKEN_EXPIRY_SECONDS: 604_800,
  ISSUER: "kenchi",
  AUDIENCE: "kenchi-api",
  ALGORITHM: "HS256" as const,
} as const;

// ==================== Cookie Configuration ====================

export const COOKIE_CONFIG = {
  /**
   * Cookie name for the JWT access token.
   * In production, use __Host- prefix to enforce Secure + no Domain + Path=/.
   * This prevents subdomain injection and session fixation attacks.
   * Non-prefixed name used in development where Secure=false (HTTP localhost).
   */
  ACCESS_TOKEN_NAME: "kenchi_access",
  ACCESS_TOKEN_NAME_PRODUCTION: "__Host-kenchi_access",
  /** Cookie name for the refresh token (see ACCESS_TOKEN_NAME comment for prefix rationale). */
  REFRESH_TOKEN_NAME: "kenchi_refresh",
  REFRESH_TOKEN_NAME_PRODUCTION: "__Host-kenchi_refresh",
  /** Access token cookie maxAge in seconds (15 minutes) */
  ACCESS_TOKEN_MAX_AGE_SECONDS: 900,
  /** Refresh token cookie maxAge in seconds (7 days) */
  REFRESH_TOKEN_MAX_AGE_SECONDS: 604_800,
  /**
   * SameSite policy — Lax (not Strict) because the OAuth callback is a
   * cross-site redirect from the OAuth provider. Strict would strip the
   * cookie on that redirect. Lax allows top-level navigations while
   * still protecting against CSRF on sub-requests.
   */
  SAME_SITE: "lax" as const,
  /** Cookie path — accessible from all routes */
  PATH: "/",
} as const;

// ==================== OAuth State Configuration ====================

export const OAUTH_STATE_CONFIG = {
  STATE_TOKEN_BYTES: 32,
  STATE_TTL_MINUTES: 10,
  CLEANUP_INTERVAL_MINUTES: 30,
} as const;

// ==================== Instance URL Validation ====================

export const INSTANCE_URL_CONFIG = {
  /** Maximum allowed length for self-hosted instance URLs */
  MAX_LENGTH: 256,
  /** Hostnames/prefixes blocked to prevent SSRF against internal services */
  BLOCKED_HOST_PREFIXES: [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "[::1]",
    "169.254.",
    "metadata.google.",
    "10.",
    "192.168.",
  ] as readonly string[],
} as const;

// ==================== Auth Route Paths ====================

export const AUTH_ROUTES = {
  LOGIN: "/auth/:provider/login",
  CALLBACK: "/auth/:provider/callback",
  REFRESH: "/auth/refresh",
  LOGOUT: "/auth/logout",
  ME: "/auth/me",
} as const;

// ==================== Public Routes (Skip Auth) ====================

export const PUBLIC_ROUTES: readonly string[] = [
  "/health",
  "/live",
  "/ready",
  "/auth/",
  "/webhooks/",
  "/api/webhooks/",
];

// ==================== Auth Audit Actions ====================

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

// ==================== Auth Defaults ====================

export const AUTH_DEFAULTS = {
  USER_ID_PREFIX: "usr_",
  OAUTH_IDENTITY_ID_PREFIX: "oid_",
  REFRESH_TOKEN_ID_PREFIX: "rtk_",
  OAUTH_STATE_ID_PREFIX: "ost_",
  REFRESH_TOKEN_BYTES: 48,
  DEFAULT_ROLE: USER_ROLES.MEMBER,
  DEFAULT_STATUS: USER_STATUS.ACTIVE,
} as const;

// ==================== SQL Queries: Users ====================

export const USER_QUERIES = {
  INSERT: `
    INSERT INTO users (email, display_name, avatar_url, tenant_id, role, status)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `,
  FIND_BY_ID: `
    SELECT * FROM users WHERE id = $1 AND status != 'deleted'
  `,
  FIND_BY_EMAIL: `
    SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND status != 'deleted'
  `,
  UPDATE_LAST_LOGIN: `
    UPDATE users SET last_login_at = NOW(), updated_at = NOW()
    WHERE id = $1 RETURNING *
  `,
  UPDATE_TENANT: `
    UPDATE users SET tenant_id = $1, updated_at = NOW()
    WHERE id = $2 RETURNING *
  `,
  UPDATE_STATUS: `
    UPDATE users SET status = $1, updated_at = NOW()
    WHERE id = $2 RETURNING *
  `,
} as const;

// ==================== SQL Queries: OAuth Identities ====================

export const OAUTH_IDENTITY_QUERIES = {
  UPSERT: `
    INSERT INTO oauth_identities (
      user_id, provider, provider_user_id, provider_username,
      provider_email, provider_avatar_url, instance_url,
      access_token, refresh_token, token_expires_at, scopes, raw_profile
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (provider, provider_user_id, COALESCE(instance_url, ''))
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
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
    AND COALESCE(instance_url, '') = COALESCE($3, '')
  `,
  FIND_BY_USER: `
    SELECT * FROM oauth_identities WHERE user_id = $1
    ORDER BY created_at ASC
  `,
} as const;

// ==================== SQL Queries: OAuth States ====================

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
  CLEANUP_EXPIRED: `
    DELETE FROM oauth_states WHERE expires_at < NOW()
  `,
} as const;

// ==================== SQL Queries: Refresh Tokens ====================

export const REFRESH_TOKEN_QUERIES = {
  INSERT: `
    INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, user_agent, ip_address)
    VALUES ($1, $2, $3, NOW() + INTERVAL '7 days', $4, $5)
    RETURNING *
  `,
  FIND_BY_HASH: `
    SELECT * FROM refresh_tokens
    WHERE token_hash = $1 AND expires_at > NOW()
  `,
  FIND_BY_HASH_FOR_UPDATE: `
    SELECT * FROM refresh_tokens
    WHERE token_hash = $1 AND expires_at > NOW()
    FOR UPDATE
  `,
  REVOKE: `
    UPDATE refresh_tokens SET revoked_at = NOW()
    WHERE id = $1 AND revoked_at IS NULL
  `,
  REVOKE_FAMILY: `
    UPDATE refresh_tokens SET revoked_at = NOW()
    WHERE family_id = $1 AND revoked_at IS NULL
  `,
  REPLACE: `
    UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by = $2
    WHERE id = $1
  `,
  CLEANUP_EXPIRED: `
    DELETE FROM refresh_tokens WHERE expires_at < NOW()
  `,
} as const;

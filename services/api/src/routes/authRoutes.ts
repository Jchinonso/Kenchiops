/**
 * Auth Routes
 *
 * OAuth login, callback, token refresh, and logout endpoints.
 * Handlers validate input and delegate to authService for business logic.
 *
 * @module routes/authRoutes
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  createLogger,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  config,
  VALID_OAUTH_PROVIDERS,
  OAUTH_PROVIDER_URLS,
  SELF_HOSTED_URL_PATTERNS,
  HTTP_STATUS,
  createOAuthState,
  consumeOAuthState,
  getErrorMessage,
  findUserById,
  findOAuthIdentitiesByUser,
  findOrganizationsByUser,
  switchUserOrganization,
  setAuthCookies,
  clearAuthCookies,
  extractRefreshToken,
  INSTANCE_URL_CONFIG,
  createRateLimitMiddleware,
  findByTenantAndProvider,
  generateCodeVerifier,
  generateCodeChallenge,
  encryptValue,
  decryptValue,
  type OAuthProvider,
  type ProviderType,
  rateLimitByCategory,
} from "@kenchi/shared";

import { createAuthService } from "../services/authService.js";
import { createAccountDeletionService } from "../services/accountDeletionService.js";
import { getOAuthAdapter, hasOAuthAdapter } from "../adapters/oauthAdapterRegistry.js";
import { createGitLabProjectsAdapter } from "../adapters/gitlabProjectsAdapter.js";

const router = Router();
const logger = createLogger("auth-routes");
const authService = createAuthService();
const accountDeletionService = createAccountDeletionService(createGitLabProjectsAdapter());

// ==================== Helpers ====================

/** Validate and cast a route parameter to OAuthProvider. */
const validateProvider = (providerParam: string): OAuthProvider => {
  if (!VALID_OAUTH_PROVIDERS.has(providerParam as OAuthProvider)) {
    throw new ValidationError(`Unsupported OAuth provider: ${providerParam}`, {
      operation: "validateProvider",
      metadata: { provider: providerParam },
    });
  }

  if (!hasOAuthAdapter(providerParam as OAuthProvider)) {
    throw new ValidationError(`OAuth provider "${providerParam}" is not yet implemented`, {
      operation: "validateProvider",
      metadata: { provider: providerParam },
    });
  }

  return providerParam as OAuthProvider;
};

/** Get the OAuth client ID for a provider from config. */
const getClientId = (provider: OAuthProvider): string => {
  const CLIENT_ID_MAP: Readonly<Record<string, string | undefined>> = {
    github: config.GITHUB_OAUTH_CLIENT_ID,
    gitlab: config.GITLAB_OAUTH_CLIENT_ID,
    bitbucket: config.BITBUCKET_OAUTH_CLIENT_ID,
    azure_devops: config.AZURE_DEVOPS_OAUTH_CLIENT_ID,
  };

  const clientId = CLIENT_ID_MAP[provider];

  if (!clientId) {
    throw new ValidationError(`OAuth client ID not configured for ${provider}`, {
      operation: "getClientId",
      metadata: { provider },
    });
  }

  return clientId;
};

/** Build the OAuth callback redirect URI for a provider. */
const getRedirectUri = (provider: OAuthProvider): string =>
  `${config.OAUTH_CALLBACK_BASE_URL}/auth/${provider}/callback`;

/** Build the full provider authorization URL with query parameters. */
const buildAuthorizeUrl = (
  provider: OAuthProvider,
  instanceUrl: string | null,
  clientId: string,
  redirectUri: string,
  scopes: readonly string[],
  state: string,
  codeChallenge: string | null
): string => {
  const selfHostedPatterns =
    provider in SELF_HOSTED_URL_PATTERNS
      ? SELF_HOSTED_URL_PATTERNS[provider as keyof typeof SELF_HOSTED_URL_PATTERNS]
      : undefined;
  const baseUrl = instanceUrl
    ? selfHostedPatterns?.authorize(instanceUrl)
    : OAUTH_PROVIDER_URLS[provider]?.authorize;

  if (!baseUrl) {
    throw new ValidationError(`No authorize URL configured for ${provider}`, {
      operation: "buildAuthorizeUrl",
      metadata: { provider },
    });
  }

  const url = new URL(baseUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");

  if (codeChallenge) {
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }

  return url.toString();
};

/**
 * Sanitize a redirect URL to prevent open redirect attacks.
 * Only allows relative paths (starting with /, not //) or same-origin URLs.
 * Returns null for external URLs or invalid input.
 */
const sanitizeRedirectUrl = (url: string | null, frontendUrl: string): string | null => {
  if (!url) {
    return null;
  }
  // Allow relative paths starting with / but not // (protocol-relative URLs)
  // Also block backslash which some browsers normalize to forward slash
  if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")) {
    return url;
  }
  // Allow same-origin URLs only
  try {
    const { origin: candidateOrigin } = new URL(url);
    const { origin: referenceOrigin } = new URL(frontendUrl);
    return candidateOrigin === referenceOrigin ? url : null;
  } catch {
    return null;
  }
};

/** Check whether a URL protocol is HTTPS. */
const isHttpsProtocol = (protocol: string): boolean => protocol === "https:";

/** Check whether a URL protocol is HTTP or HTTPS. */
const isHttpOrHttpsProtocol = (protocol: string): boolean =>
  protocol === "https:" || protocol === "http:";

/** Check whether a hostname matches a private/blocked pattern. */
const isBlockedHostname = (hostname: string): boolean => {
  const matchesPrefix = INSTANCE_URL_CONFIG.BLOCKED_HOST_PREFIXES.some((prefix) =>
    hostname.startsWith(prefix)
  );
  // Also block 172.16.0.0/12 private range
  const matchesPrivate172 = /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
  // Block IPv6 private/loopback ranges wrapped in brackets by URL constructor:
  // [::1] (loopback), [fe80:...] (link-local), [fc00:...]/[fd...] (unique local)
  const matchesIpv6Private = /^\[?(::1|fe80:|fc00:|fd[0-9a-f]{2}:)/i.test(hostname);
  return matchesPrefix || matchesPrivate172 || matchesIpv6Private;
};

/** Check whether a hostname is a bare IPv4 address. */
const isIpv4Address = (hostname: string): boolean => /^\d+\.\d+\.\d+\.\d+$/.test(hostname);

/**
 * Validate a self-hosted instance URL to prevent SSRF.
 *
 * Rules:
 * - Must be HTTPS in production (HTTP allowed in dev for localhost)
 * - Must not resolve to private/internal IP ranges (metadata endpoints, etc.)
 * - Must not contain fragments, userinfo, or unusual ports
 * - Returns the origin only (strips path/query) so adapters append correct API paths
 *
 * Throws ValidationError for invalid or dangerous URLs.
 */
const validateInstanceUrl = (rawUrl: string): string => {
  if (rawUrl.length > INSTANCE_URL_CONFIG.MAX_LENGTH) {
    throw new ValidationError("instance_url exceeds maximum length", {
      operation: "validateInstanceUrl",
      metadata: { length: rawUrl.length },
    });
  }

  const parsed = (() => {
    try {
      return new URL(rawUrl);
    } catch {
      throw new ValidationError("instance_url is not a valid URL", {
        operation: "validateInstanceUrl",
      });
    }
  })();

  const { protocol, username, password, hash, hostname: rawHostname, origin } = parsed;
  const { NODE_ENV } = config;

  // Block non-HTTP(S) schemes (javascript:, data:, file:, ftp:, etc.)
  const isProduction = NODE_ENV === "production";
  if (isProduction && !isHttpsProtocol(protocol)) {
    throw new ValidationError("instance_url must use HTTPS in production", {
      operation: "validateInstanceUrl",
    });
  }
  if (!isProduction && !isHttpOrHttpsProtocol(protocol)) {
    throw new ValidationError("instance_url must use HTTP or HTTPS", {
      operation: "validateInstanceUrl",
    });
  }

  // Block userinfo (http://user:pass@host is suspicious)
  if (username || password) {
    throw new ValidationError("instance_url must not contain user credentials", {
      operation: "validateInstanceUrl",
    });
  }

  // Block fragments (should not be in a server-to-server URL)
  if (hash) {
    throw new ValidationError("instance_url must not contain a fragment", {
      operation: "validateInstanceUrl",
    });
  }

  // Block private/reserved hostnames and IP ranges to prevent SSRF
  const hostname = rawHostname.toLowerCase();
  if (isBlockedHostname(hostname)) {
    throw new ValidationError("instance_url must not point to a private or reserved address", {
      operation: "validateInstanceUrl",
    });
  }

  // Must have a valid hostname (not just an IP in production)
  if (isProduction && isIpv4Address(hostname)) {
    throw new ValidationError(
      "instance_url must use a hostname, not an IP address, in production",
      {
        operation: "validateInstanceUrl",
      }
    );
  }

  // Return the origin only (strip path, query, fragment) to prevent path injection
  // The adapter will append the correct API paths
  return origin;
};

/** Extract token metadata from a request. */
const extractTokenMeta = (
  req: Request
): { readonly userAgent: string | null; readonly ipAddress: string | null } => ({
  userAgent: req.headers["user-agent"] ?? null,
  ipAddress: req.ip ?? null,
});

// ==================== Route Handlers ====================

/**
 * GET /auth/:provider/login
 * Generate CSRF state and redirect to the OAuth provider's authorize URL.
 */
const handleOAuthLogin = async (req: Request, res: Response): Promise<void> => {
  const { context } = req;
  const provider = validateProvider(req.params.provider);
  const rawInstanceUrl = (req.query.instance_url as string) ?? null;
  // Validate instance URL to prevent SSRF (only for self-hosted providers)
  const instanceUrl = rawInstanceUrl ? validateInstanceUrl(rawInstanceUrl) : null;
  const rawRedirectAfter = (req.query.redirect_after as string) ?? null;
  const redirectAfter = sanitizeRedirectUrl(rawRedirectAfter, config.FRONTEND_URL);

  const clientId = getClientId(provider);
  const redirectUri = getRedirectUri(provider);
  const providerConfig = OAUTH_PROVIDER_URLS[provider];
  const scopes = "scopes" in providerConfig ? providerConfig.scopes : [];

  // Generate PKCE pair for standard OAuth providers (Azure DevOps uses JWT bearer grant, exempt)
  const usePkce = provider !== "azure_devops";
  const codeVerifier = usePkce ? generateCodeVerifier() : null;
  const codeChallenge = codeVerifier ? generateCodeChallenge(codeVerifier) : null;

  const stateToken = await createOAuthState({
    provider,
    instanceUrl,
    redirectAfter,
    metadata: codeVerifier ? { codeVerifier: encryptValue(codeVerifier) } : undefined,
  });

  const authorizeUrl = buildAuthorizeUrl(
    provider,
    instanceUrl,
    clientId,
    redirectUri,
    scopes,
    stateToken,
    codeChallenge
  );

  logger.info("OAuth login initiated", {
    provider,
    pkce: usePkce,
    redirectUri,
    ...context,
  });

  res.redirect(authorizeUrl);
};

/**
 * GET /auth/:provider/callback
 * Exchange authorization code for tokens, find/create user, issue JWT pair.
 */
const handleOAuthCallback = async (req: Request, res: Response): Promise<void> => {
  const { context } = req;
  const frontendUrl = config.FRONTEND_URL;
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    res.redirect(`${frontendUrl}/login?error=oauth_denied`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${frontendUrl}/login?error=missing_params`);
    return;
  }

  const codeStr = String(code);
  const stateStr = String(state);

  // Validate input lengths to prevent DoS via oversized parameters.
  // State tokens are 64 hex chars (32 bytes); codes are typically < 512 chars.
  if (stateStr.length > 128 || codeStr.length > 2048) {
    res.redirect(`${frontendUrl}/login?error=invalid_params`);
    return;
  }

  const oauthState = await consumeOAuthState(stateStr);

  if (!oauthState) {
    res.redirect(`${frontendUrl}/login?error=invalid_state`);
    return;
  }

  // Prevent provider-confusion attacks: ensure the URL :provider param
  // matches the provider stored in the CSRF state token
  const callbackProvider = req.params.provider;
  if (callbackProvider !== oauthState.provider) {
    logger.warn("OAuth provider mismatch between URL and state", {
      urlProvider: callbackProvider,
      stateProvider: oauthState.provider,
      ...context,
    });
    res.redirect(`${frontendUrl}/login?error=provider_mismatch`);
    return;
  }

  const startTime = Date.now();
  const adapter = getOAuthAdapter(oauthState.provider);
  const rawVerifier =
    typeof oauthState.metadata.codeVerifier === "string"
      ? oauthState.metadata.codeVerifier
      : undefined;
  // Decrypt PKCE verifier (stored encrypted since FLAW-19 fix; decryptValue
  // handles plaintext gracefully for pre-existing state tokens during rollout).
  const codeVerifier = rawVerifier ? (decryptValue(rawVerifier) ?? undefined) : undefined;
  const tokens = await adapter.exchangeCode(codeStr, oauthState.instanceUrl, context, codeVerifier);
  const profile = await adapter.getUserProfile(tokens.accessToken, oauthState.instanceUrl, context);

  // Validate returned scopes against requested scopes (non-blocking — log only)
  const providerScopes = OAUTH_PROVIDER_URLS[oauthState.provider];
  const requestedScopes: readonly string[] =
    "scopes" in providerScopes ? providerScopes.scopes : [];
  if (tokens.scope && requestedScopes.length > 0) {
    // Providers use space or comma as scope separator
    const grantedScopes = new Set(tokens.scope.split(/[\s,]+/).filter(Boolean));
    const missingScopes = requestedScopes.filter((scope) => !grantedScopes.has(scope));
    if (missingScopes.length > 0) {
      logger.warn("OAuth token exchange returned fewer scopes than requested", {
        provider: oauthState.provider,
        requestedScopes,
        grantedScopes: [...grantedScopes],
        missingScopes,
        durationMs: Date.now() - startTime,
        ...context,
      });
    }
  }

  const { user } = await authService.findOrCreateUser(
    oauthState.provider,
    profile,
    tokens,
    oauthState.instanceUrl,
    context
  );

  // Auto-link organizations — best-effort, don't fail the login
  try {
    await authService.autoLinkOrganizations(
      user,
      oauthState.provider,
      tokens.accessToken,
      oauthState.instanceUrl,
      profile.username ?? profile.displayName ?? "unknown",
      context
    );
  } catch (linkError: unknown) {
    logger.warn("Auto-link organizations failed (non-fatal)", {
      userId: user.id,
      provider: oauthState.provider,
      error: getErrorMessage(linkError),
      ...context,
    });
  }

  // Re-fetch user to pick up org linking (autoLinkOrganizations may have updated selected_tenant_id)
  const freshUser = (await findUserById(user.id)) ?? user;

  const tokenPair = await authService.generateTokenPair(freshUser, extractTokenMeta(req), context);
  const durationMs = Date.now() - startTime;

  // Set tokens as httpOnly cookies (never exposed in URL or response body)
  setAuthCookies(res, {
    accessToken: tokenPair.accessToken,
    refreshToken: tokenPair.refreshToken,
  });

  // Redirect with only non-sensitive params (no tokens in URL)
  const callbackUrl = new URL(`${frontendUrl}/oauth/callback`);

  // Redirect to onboarding setup if no platform connection exists for the user's provider
  const PROVIDER_PLATFORM_TYPE: Readonly<Record<string, ProviderType>> = {
    github: "github_app",
    gitlab: "gitlab",
    bitbucket: "bitbucket",
    azure_devops: "azure_devops",
  };

  const resolveProviderSetupRedirect = async (): Promise<string | null> => {
    if (!freshUser.tenantId) {
      return null;
    }

    const platformType = PROVIDER_PLATFORM_TYPE[oauthState.provider];
    if (!platformType) {
      return null;
    }

    const existingConnection = await findByTenantAndProvider(freshUser.tenantId, platformType);
    return existingConnection ? null : `/dashboard/setup/${oauthState.provider}`;
  };

  const providerSetupRedirect = await resolveProviderSetupRedirect();
  const sanitizedRedirect =
    providerSetupRedirect ?? sanitizeRedirectUrl(oauthState.redirectAfter, frontendUrl);
  if (sanitizedRedirect) {
    callbackUrl.searchParams.set("redirect_after", sanitizedRedirect);
  }

  logger.info("OAuth callback completed", {
    provider: oauthState.provider,
    userId: user.id,
    durationMs,
    ...context,
  });

  // Referrer-Policy for defense-in-depth
  res.setHeader("Referrer-Policy", "no-referrer");
  res.redirect(callbackUrl.toString());
};

/**
 * POST /auth/refresh
 * Rotate a refresh token and return a new token pair.
 */
const handleTokenRefresh = async (req: Request, res: Response): Promise<void> => {
  const { context } = req;
  const refreshToken = extractRefreshToken(req);

  if (!refreshToken) {
    throw new ValidationError("refreshToken is required", {
      operation: "handleTokenRefresh",
      metadata: { field: "refreshToken" },
    });
  }

  const tokenPair = await authService.refreshTokens(refreshToken, extractTokenMeta(req), context);

  // Set new cookies (browser clients)
  setAuthCookies(res, {
    accessToken: tokenPair.accessToken,
    refreshToken: tokenPair.refreshToken,
  });

  // Return metadata only — tokens are delivered exclusively via httpOnly cookies
  // to prevent XSS token theft. API clients using Bearer headers should use
  // the /auth/:provider/callback flow which also sets cookies.
  res.status(HTTP_STATUS.OK).json({
    expires_in: tokenPair.expiresIn,
    token_type: "Bearer",
  });
};

/**
 * POST /auth/logout
 * Revoke the refresh token family. Idempotent.
 */
const handleLogout = async (req: Request, res: Response): Promise<void> => {
  const { context } = req;
  const refreshToken = extractRefreshToken(req);

  if (refreshToken) {
    await authService.revokeUserTokens(refreshToken, context);
  }

  // Always clear auth cookies
  clearAuthCookies(res);

  res.status(HTTP_STATUS.OK).json({ success: true });
};

/**
 * GET /auth/me
 * Return the authenticated user's profile and linked providers.
 * Requires a valid JWT (auth middleware enforced).
 */
const handleGetCurrentUser = async (req: Request, res: Response): Promise<void> => {
  const { context } = req;

  if (!req.user) {
    throw new AuthenticationError("Authentication required", {
      operation: "handleGetCurrentUser",
    });
  }

  const [user, identities, organizations] = await Promise.all([
    findUserById(req.user.userId),
    findOAuthIdentitiesByUser(req.user.userId),
    findOrganizationsByUser(req.user.userId),
  ]);

  if (!user) {
    throw new NotFoundError("User not found", {
      operation: "handleGetCurrentUser",
      metadata: { userId: req.user.userId },
    });
  }

  logger.info("User profile retrieved", {
    userId: user.id,
    ...context,
  });

  // Prevent browser from caching auth state — stale cached responses
  // after logout would make the user appear still authenticated.
  res.setHeader("Cache-Control", "no-store");

  res.status(HTTP_STATUS.OK).json({
    data: {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        tenantId: user.tenantId,
        role: user.role,
        providers: identities.map((identity) => ({
          provider: identity.provider,
          username: identity.providerUsername,
        })),
        createdAt: user.createdAt.toISOString(),
      },
      organizations: organizations.map((org) => ({
        id: org.id,
        tenantId: org.tenantId,
        orgName: org.orgName,
        provider: org.provider,
        role: org.role,
        isDefault: org.isDefault,
        tenantType: org.tenantType,
      })),
    },
  });
};

/**
 * POST /auth/refresh-orgs
 * Re-discover organizations by calling the OAuth provider APIs for each
 * of the user's linked identities. This handles the case where a GitHub App
 * installation webhook couldn't link the user directly (e.g., identity lookup
 * failed at webhook time). The frontend calls this on SSE organization_updated
 * events so the org switcher picks up newly installed orgs.
 */
const handleRefreshOrgs = async (req: Request, res: Response): Promise<void> => {
  const { context } = req;

  if (!req.user) {
    throw new AuthenticationError("Authentication required", {
      operation: "handleRefreshOrgs",
    });
  }

  const { userId } = req.user;
  const identities = await findOAuthIdentitiesByUser(userId);
  const user = await findUserById(userId);

  if (!user) {
    throw new NotFoundError("User not found", {
      operation: "handleRefreshOrgs",
      metadata: { userId },
    });
  }

  // Auto-link orgs for each identity that has a valid access token.
  // autoLinkOrganizations internally skips non-org-capable providers.
  // Save the user's current tenant so we can restore it after — running
  // autoLink for multiple providers in parallel can cause a race where
  // each provider switches the user to its own tenant.
  const originalTenantId = user.tenantId;

  const linkResults = await Promise.allSettled(
    identities
      .filter((identity) => identity.accessToken !== null)
      .map((identity) =>
        authService.autoLinkOrganizations(
          user,
          identity.provider,
          identity.accessToken as string,
          identity.instanceUrl,
          identity.providerUsername ?? "unknown",
          context
        )
      )
  );

  // Restore the original selected tenant if it was set before refresh.
  // autoLinkOrganizations switches the user to the login provider's tenant,
  // but during a background refresh we want to preserve the user's current context.
  if (originalTenantId !== null) {
    try {
      await switchUserOrganization(userId, originalTenantId);
    } catch {
      // Best-effort restore — the tenant may have been deleted
    }
  }

  const failedCount = linkResults.filter((result) => result.status === "rejected").length;

  if (failedCount > 0) {
    logger.warn("Some org auto-link attempts failed during refresh", {
      userId,
      failedCount,
      totalAttempts: linkResults.length,
      ...context,
    });
  }

  // Re-fetch user + orgs + fresh identities after linking to get updated state
  const [freshUser, freshIdentities, organizations] = await Promise.all([
    findUserById(userId),
    findOAuthIdentitiesByUser(userId),
    findOrganizationsByUser(userId),
  ]);

  const resolvedUser = freshUser ?? user;

  logger.info("Organization refresh completed", {
    userId,
    orgCount: organizations.length,
    ...context,
  });

  res.setHeader("Cache-Control", "no-store");

  res.status(HTTP_STATUS.OK).json({
    data: {
      user: {
        id: resolvedUser.id,
        email: resolvedUser.email,
        displayName: resolvedUser.displayName,
        avatarUrl: resolvedUser.avatarUrl,
        tenantId: resolvedUser.tenantId,
        role: resolvedUser.role,
        providers: freshIdentities.map((identity) => ({
          provider: identity.provider,
          username: identity.providerUsername,
        })),
        createdAt: resolvedUser.createdAt.toISOString(),
      },
      organizations: organizations.map((org) => ({
        id: org.id,
        tenantId: org.tenantId,
        orgName: org.orgName,
        provider: org.provider,
        role: org.role,
        isDefault: org.isDefault,
        tenantType: org.tenantType,
      })),
    },
  });
};

/**
 * GET /auth/me/deletion-impact
 * Returns the impact of deleting the current user's account.
 * Tells the frontend whether the user is the last tenant member
 * and what resources would be affected.
 */
const handleGetDeletionImpact = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw new AuthenticationError("Authentication required", {
      operation: "handleGetDeletionImpact",
    });
  }

  const impact = await accountDeletionService.getDeletionImpact(req.user.userId, req.context);

  res.status(HTTP_STATUS.OK).json({ data: impact });
};

/**
 * DELETE /auth/me
 * Permanently delete the authenticated user's account and all associated data.
 * If the user is the last tenant member, also cleans up external resources
 * and hard-deletes the tenant.
 * Requires a valid JWT and "DELETE" confirmation in the request body.
 */
const handleDeleteAccount = async (req: Request, res: Response): Promise<void> => {
  const { context } = req;

  if (!req.user) {
    throw new AuthenticationError("Authentication required", {
      operation: "handleDeleteAccount",
    });
  }

  const body = req.body as { readonly confirmation?: string } | undefined;
  const confirmation = body?.confirmation;

  if (confirmation !== "DELETE") {
    throw new ValidationError('Confirmation required: send { confirmation: "DELETE" }', {
      operation: "handleDeleteAccount",
    });
  }

  const { userId } = req.user;

  await accountDeletionService.deleteAccount(userId, context);

  clearAuthCookies(res);

  logger.info("User account deleted", {
    userId,
    ...context,
  });

  res.status(HTTP_STATUS.OK).json({ success: true });
};

// ==================== Endpoint Rate Limiter ====================

/** Rate limit error shown to clients who exceed the endpoint limit. */
const SENSITIVE_RATE_LIMIT_MSG = "Too many requests, please try again later";

/**
 * Stricter rate limit for sensitive endpoints (refresh, logout).
 * 20 requests per 15-minute window per IP -- prevents brute-force
 * token enumeration while allowing normal usage patterns.
 * Applied in addition to the global API rate limiter.
 */
const sensitiveEndpointLimiter = createRateLimitMiddleware({
  rateLimit: {
    windowMs: 900_000,
    max: 20,
    message: SENSITIVE_RATE_LIMIT_MSG,
    keyPrefix: "rl:sensitive:",
  },
  distributedFallback: "fail",
});

// ==================== Route Definitions ====================

router.get(
  "/auth/:provider/login",
  rateLimitByCategory("standard"),
  asyncHandler(handleOAuthLogin)
);
router.get(
  "/auth/:provider/callback",
  rateLimitByCategory("standard"),
  asyncHandler(handleOAuthCallback)
);
router.post(
  "/auth/refresh",
  rateLimitByCategory("expensive"),
  sensitiveEndpointLimiter.middleware(),
  asyncHandler(handleTokenRefresh)
);
router.post(
  "/auth/logout",
  rateLimitByCategory("standard"),
  sensitiveEndpointLimiter.middleware(),
  asyncHandler(handleLogout)
);
router.post(
  "/auth/refresh-orgs",
  rateLimitByCategory("expensive"),
  asyncHandler(handleRefreshOrgs)
);
router.get(
  "/auth/me/deletion-impact",
  rateLimitByCategory("readonly"),
  asyncHandler(handleGetDeletionImpact)
);
router.get("/auth/me", rateLimitByCategory("readonly"), asyncHandler(handleGetCurrentUser));
router.delete(
  "/auth/me",
  rateLimitByCategory("standard"),
  sensitiveEndpointLimiter.middleware(),
  asyncHandler(handleDeleteAccount)
);

export { router as authRoutes };

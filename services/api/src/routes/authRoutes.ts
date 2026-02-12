/**
 * Auth Routes
 *
 * OAuth login, callback, token refresh, and logout endpoints.
 * Handlers validate input and delegate to authService for business logic.
 *
 * @module routes/authRoutes
 */

import crypto from "node:crypto";
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
  setAuthCookies,
  clearAuthCookies,
  extractRefreshToken,
  INSTANCE_URL_CONFIG,
  type OAuthProvider,
  type RequestContext,
} from "@kenchi/shared";

import { createAuthService } from "../services/authService.js";
import { getOAuthAdapter, hasOAuthAdapter } from "../adapters/oauthAdapterRegistry.js";

/**
 * Extract the RequestContext from an Express request.
 * Context is set by upstream middleware; if missing, creates a
 * minimal context from the request to ensure propagation.
 */
const getRequestContext = (req: Request): RequestContext => {
  const reqWithContext = req as Request & { readonly context?: RequestContext };
  return (
    reqWithContext.context ?? {
      requestId: crypto.randomUUID(),
      tenantId: "anonymous",
    }
  );
};

const router = Router();
const logger = createLogger("auth-routes");
const authService = createAuthService();

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
  state: string
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
  return matchesPrefix || matchesPrivate172;
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
  const context = getRequestContext(req);
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

  const stateToken = await createOAuthState({
    provider,
    instanceUrl,
    redirectAfter,
  });

  const authorizeUrl = buildAuthorizeUrl(
    provider,
    instanceUrl,
    clientId,
    redirectUri,
    scopes,
    stateToken
  );

  logger.info("OAuth login initiated", { provider, ...context });

  res.redirect(authorizeUrl);
};

/**
 * GET /auth/:provider/callback
 * Exchange authorization code for tokens, find/create user, issue JWT pair.
 */
const handleOAuthCallback = async (req: Request, res: Response): Promise<void> => {
  const context = getRequestContext(req);
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

  const oauthState = await consumeOAuthState(state as string);

  if (!oauthState) {
    res.redirect(`${frontendUrl}/login?error=invalid_state`);
    return;
  }

  const startTime = Date.now();
  const adapter = getOAuthAdapter(oauthState.provider);
  const tokens = await adapter.exchangeCode(code as string, oauthState.instanceUrl, context);
  const profile = await adapter.getUserProfile(tokens.accessToken, oauthState.instanceUrl, context);

  const { user } = await authService.findOrCreateUser(
    oauthState.provider,
    profile,
    tokens,
    oauthState.instanceUrl,
    context
  );

  // Auto-link tenant — fire-and-forget, don't fail the login
  try {
    await authService.autoLinkTenant(
      user,
      oauthState.provider,
      tokens.accessToken,
      oauthState.instanceUrl,
      context
    );
  } catch (linkError: unknown) {
    logger.warn("Auto-link tenant failed (non-fatal)", {
      userId: user.id,
      provider: oauthState.provider,
      error: getErrorMessage(linkError),
      ...context,
    });
  }

  const tokenPair = await authService.generateTokenPair(user, extractTokenMeta(req), context);
  const durationMs = Date.now() - startTime;

  // Set tokens as httpOnly cookies (never exposed in URL or response body)
  setAuthCookies(res, {
    accessToken: tokenPair.accessToken,
    refreshToken: tokenPair.refreshToken,
  });

  // Redirect with only non-sensitive params (no tokens in URL)
  const callbackUrl = new URL(`${frontendUrl}/auth/callback`);

  const sanitizedRedirect = sanitizeRedirectUrl(oauthState.redirectAfter, frontendUrl);
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
  const context = getRequestContext(req);
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
  const context = getRequestContext(req);
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
  const context = getRequestContext(req);

  if (!req.user) {
    throw new AuthenticationError("Authentication required", {
      operation: "handleGetCurrentUser",
    });
  }

  const [user, identities] = await Promise.all([
    findUserById(req.user.userId),
    findOAuthIdentitiesByUser(req.user.userId),
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

  res.status(HTTP_STATUS.OK).json({
    data: {
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
  });
};

// ==================== Route Definitions ====================

router.get("/auth/:provider/login", asyncHandler(handleOAuthLogin));
router.get("/auth/:provider/callback", asyncHandler(handleOAuthCallback));
router.post("/auth/refresh", asyncHandler(handleTokenRefresh));
router.post("/auth/logout", asyncHandler(handleLogout));
router.get("/auth/me", asyncHandler(handleGetCurrentUser));

export { router as authRoutes };

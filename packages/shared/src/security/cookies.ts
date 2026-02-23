/**
 * Auth Cookie Utilities
 *
 * Helpers for setting, clearing, and extracting httpOnly auth cookies.
 * Used by auth routes (callback, refresh, logout) and auth middleware.
 *
 * Cookie design:
 * - httpOnly: prevents JavaScript access (XSS protection)
 * - SameSite=Lax: allows OAuth cross-site redirects, blocks CSRF sub-requests
 * - Secure: true in production (HTTPS only), false in dev (HTTP localhost)
 * - __Host- prefix in production: enforces Secure + no Domain + Path=/
 *   (prevents subdomain injection and session fixation)
 * - No explicit domain: defaults to request host per RFC 6265 (port-agnostic)
 *
 * @module security/cookies
 */

import type { Response, Request } from "express";
import { COOKIE_CONFIG } from "../constants/auth.js";
import { config } from "../core/config.js";

// ==================== Types ====================

export interface AuthCookieTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

interface CookieOptions {
  readonly httpOnly: true;
  readonly sameSite: "lax";
  readonly secure: boolean;
  readonly path: string;
}

// ==================== Helpers ====================

/** Whether the current environment is production. */
const isProduction = (): boolean => {
  const { NODE_ENV } = config;
  return NODE_ENV === "production";
};

/** Build common cookie options shared across auth cookies. */
const buildCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: COOKIE_CONFIG.SAME_SITE,
  secure: isProduction(),
  path: COOKIE_CONFIG.PATH,
});

/**
 * Resolve the cookie name, using __Host- prefixed names in production.
 * The __Host- prefix tells the browser to enforce:
 * - Secure flag (HTTPS only)
 * - No Domain attribute (exact host match)
 * - Path must be "/"
 * This prevents a compromised subdomain from setting auth cookies.
 */
const resolveAccessTokenName = (): string =>
  isProduction() ? COOKIE_CONFIG.ACCESS_TOKEN_NAME_PRODUCTION : COOKIE_CONFIG.ACCESS_TOKEN_NAME;

const resolveRefreshTokenName = (): string =>
  isProduction() ? COOKIE_CONFIG.REFRESH_TOKEN_NAME_PRODUCTION : COOKIE_CONFIG.REFRESH_TOKEN_NAME;

/** Maximum acceptable token length to reject oversized values early. */
const TOKEN_LENGTH_LIMIT = 4096;

/**
 * Validate a token string is present and within length bounds.
 * Rejects empty strings and values that are suspiciously large
 * to prevent DoS via oversized cookie/header payloads.
 */
const isValidTokenLength = (token: string): boolean =>
  token.length > 0 && token.length <= TOKEN_LENGTH_LIMIT;

// ==================== Public API ====================

/**
 * Set httpOnly auth cookies on the response.
 *
 * Used after OAuth callback and token refresh to deliver
 * tokens to the browser securely without URL exposure.
 */
export const setAuthCookies = (res: Response, tokens: AuthCookieTokens): void => {
  const options = buildCookieOptions();
  const accessName = resolveAccessTokenName();
  const refreshName = resolveRefreshTokenName();

  // Express res.cookie maxAge expects milliseconds
  res.cookie(accessName, tokens.accessToken, {
    ...options,
    maxAge: COOKIE_CONFIG.ACCESS_TOKEN_MAX_AGE_SECONDS * 1000,
  });

  res.cookie(refreshName, tokens.refreshToken, {
    ...options,
    maxAge: COOKIE_CONFIG.REFRESH_TOKEN_MAX_AGE_SECONDS * 1000,
  });
};

/**
 * Set only the access token cookie on the response.
 *
 * Used during org switching where only the JWT (with updated tenantId)
 * changes — the refresh token must remain untouched.
 */
export const setAccessTokenCookie = (res: Response, accessToken: string): void => {
  const options = buildCookieOptions();
  const accessName = resolveAccessTokenName();

  res.cookie(accessName, accessToken, {
    ...options,
    maxAge: COOKIE_CONFIG.ACCESS_TOKEN_MAX_AGE_SECONDS * 1000,
  });
};

/**
 * Clear auth cookies from the response.
 *
 * Used during logout. Sets maxAge=0 with the same path/domain
 * so the browser deletes them. Clears both prefixed and unprefixed
 * names to handle the transition period.
 */
export const clearAuthCookies = (res: Response): void => {
  const options = buildCookieOptions();

  // Clear the environment-appropriate cookie names
  res.clearCookie(resolveAccessTokenName(), options);
  res.clearCookie(resolveRefreshTokenName(), options);

  // Also clear the alternate names during the __Host- migration
  // so stale cookies from before/after the migration are cleaned up
  if (isProduction()) {
    res.clearCookie(COOKIE_CONFIG.ACCESS_TOKEN_NAME, options);
    res.clearCookie(COOKIE_CONFIG.REFRESH_TOKEN_NAME, options);
  }
};

/**
 * Extract the access token from the request.
 *
 * Priority: Authorization Bearer header (API clients) > cookie (browser).
 * Returns null if neither is present or if the value exceeds length bounds.
 */
export const extractAccessToken = (req: Request): string | null => {
  // 1. Authorization header (backward compat for API clients)
  const { authorization } = req.headers;
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice(7);
    if (isValidTokenLength(token)) {
      return token;
    }
  }

  // 2. Cookie fallback — check both prefixed and unprefixed names
  const cookies = req.cookies as Record<string, string> | undefined;
  const prefixedToken = cookies?.[COOKIE_CONFIG.ACCESS_TOKEN_NAME_PRODUCTION];
  if (prefixedToken && isValidTokenLength(prefixedToken)) {
    return prefixedToken;
  }
  const plainToken = cookies?.[COOKIE_CONFIG.ACCESS_TOKEN_NAME];
  return plainToken && isValidTokenLength(plainToken) ? plainToken : null;
};

/**
 * Extract the refresh token from the request.
 *
 * Priority: request body (API clients) > cookie (browser).
 * Returns null if neither is present or if the value exceeds length bounds.
 */
export const extractRefreshToken = (req: Request): string | null => {
  // 1. Request body (backward compat for API clients)
  const body = req.body as { readonly refreshToken?: string } | undefined;
  const bodyToken = body?.refreshToken;
  if (
    typeof bodyToken === "string" &&
    bodyToken.trim().length > 0 &&
    isValidTokenLength(bodyToken)
  ) {
    return bodyToken;
  }

  // 2. Cookie fallback — check both prefixed and unprefixed names
  const cookies = req.cookies as Record<string, string> | undefined;
  const prefixedToken = cookies?.[COOKIE_CONFIG.REFRESH_TOKEN_NAME_PRODUCTION];
  if (prefixedToken && isValidTokenLength(prefixedToken)) {
    return prefixedToken;
  }
  const plainToken = cookies?.[COOKIE_CONFIG.REFRESH_TOKEN_NAME];
  return plainToken && isValidTokenLength(plainToken) ? plainToken : null;
};

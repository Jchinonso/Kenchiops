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

/** Build common cookie options shared across auth cookies. */
const buildCookieOptions = (): CookieOptions => {
  const { NODE_ENV } = config;
  return {
    httpOnly: true,
    sameSite: COOKIE_CONFIG.SAME_SITE,
    secure: NODE_ENV === "production",
    path: COOKIE_CONFIG.PATH,
  };
};

// ==================== Public API ====================

/**
 * Set httpOnly auth cookies on the response.
 *
 * Used after OAuth callback and token refresh to deliver
 * tokens to the browser securely without URL exposure.
 */
export const setAuthCookies = (res: Response, tokens: AuthCookieTokens): void => {
  const options = buildCookieOptions();

  // Express res.cookie maxAge expects milliseconds
  res.cookie(COOKIE_CONFIG.ACCESS_TOKEN_NAME, tokens.accessToken, {
    ...options,
    maxAge: COOKIE_CONFIG.ACCESS_TOKEN_MAX_AGE_SECONDS * 1000,
  });

  res.cookie(COOKIE_CONFIG.REFRESH_TOKEN_NAME, tokens.refreshToken, {
    ...options,
    maxAge: COOKIE_CONFIG.REFRESH_TOKEN_MAX_AGE_SECONDS * 1000,
  });
};

/**
 * Clear auth cookies from the response.
 *
 * Used during logout. Sets maxAge=0 with the same path/domain
 * so the browser deletes them.
 */
export const clearAuthCookies = (res: Response): void => {
  const options = buildCookieOptions();

  res.clearCookie(COOKIE_CONFIG.ACCESS_TOKEN_NAME, options);
  res.clearCookie(COOKIE_CONFIG.REFRESH_TOKEN_NAME, options);
};

/**
 * Extract the access token from the request.
 *
 * Priority: Authorization Bearer header (API clients) > cookie (browser).
 * Returns null if neither is present.
 */
export const extractAccessToken = (req: Request): string | null => {
  // 1. Authorization header (backward compat for API clients)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token.length > 0) {
      return token;
    }
  }

  // 2. Cookie fallback
  const cookies = req.cookies as Record<string, string> | undefined;
  const cookieToken = cookies?.[COOKIE_CONFIG.ACCESS_TOKEN_NAME];
  return cookieToken && cookieToken.length > 0 ? cookieToken : null;
};

/**
 * Extract the refresh token from the request.
 *
 * Priority: request body (API clients) > cookie (browser).
 * Returns null if neither is present.
 */
export const extractRefreshToken = (req: Request): string | null => {
  // 1. Request body (backward compat for API clients)
  const body = req.body as { readonly refreshToken?: string } | undefined;
  const bodyToken = body?.refreshToken;
  if (typeof bodyToken === "string" && bodyToken.trim().length > 0) {
    return bodyToken;
  }

  // 2. Cookie fallback
  const cookies = req.cookies as Record<string, string> | undefined;
  const cookieToken = cookies?.[COOKIE_CONFIG.REFRESH_TOKEN_NAME];
  return cookieToken && cookieToken.length > 0 ? cookieToken : null;
};

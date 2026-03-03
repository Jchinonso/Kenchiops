/**
 * Authenticated API Client
 *
 * Browser-side HTTP wrapper with cookie-based authentication.
 * Auth tokens are stored in httpOnly cookies (set by the API on OAuth callback).
 * All requests include `credentials: "include"` so the browser sends cookies.
 *
 * NOTE: This is a frontend browser module. It uses the browser's native
 * Fetch API (not @kenchi/shared httpClient, which is a Node.js utility).
 */

import { toast } from "sonner";

const API_URL = import.meta.env.VITE_API_URL ?? "";

/** Default request timeout in milliseconds (30 seconds). */
const REQUEST_TIMEOUT_MS = 30_000;

/** Truncate error messages to prevent internal details from leaking to the UI via toast. */
const truncateForToast = (message: string): string =>
  message.length > 200 ? `${message.slice(0, 200)}...` : message;

// Browser Fetch API reference — frontend uses native browser fetch,
// not @kenchi/shared httpClient (which is Node.js server-only)
const browserRequest = globalThis.fetch.bind(globalThis);

// ==================== Browser HTTP ====================

/**
 * Browser-native HTTP request with credentials and timeout.
 * The `credentials: "include"` flag ensures httpOnly cookies are sent
 * on every request, including cross-origin requests during development.
 * AbortController enforces a 30s timeout to prevent hanging requests.
 */
const httpRequest = (url: string, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  return browserRequest(url, {
    ...init,
    credentials: "include",
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));
};

// ==================== Token Refresh ====================

/**
 * Prevent concurrent refresh requests. When multiple 401s fire simultaneously,
 * only one refresh request is issued and others await the same promise.
 *
 * The refresh variable is read and assigned in the same synchronous tick
 * (before any await) to avoid race conditions between concurrent callers.
 */
// let: shared mutable state for single-flight refresh coordination
let activeRefresh: Promise<boolean> | null = null; // let: single-flight coordination for concurrent 401s

const doRefresh = async (): Promise<boolean> => {
  try {
    // No body needed — the refresh token is in the httpOnly cookie
    const response = await httpRequest(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    return response.ok;
  } catch {
    return false;
  }
};

const attemptTokenRefresh = (): Promise<boolean> => {
  if (activeRefresh) {
    return activeRefresh;
  }

  // Assign synchronously (same tick as the check above) to prevent races
  const refreshPromise = doRefresh();
  activeRefresh = refreshPromise;

  // Clear the single-flight lock after the refresh settles
  void refreshPromise.finally(() => {
    activeRefresh = null;
  });

  return refreshPromise;
};

// ==================== Request Builder ====================

interface ApiClientOptions {
  readonly method?: string;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  /** When true, a 401 that cannot be refreshed returns the response instead of redirecting to /login. */
  readonly backgroundRetry?: boolean;
}

const buildHeaders = (
  extraHeaders: Readonly<Record<string, string>>
): Readonly<Record<string, string>> => ({
  "Content-Type": "application/json",
  ...extraHeaders,
});

const buildInit = (
  method: string,
  headers: Readonly<Record<string, string>>,
  body: unknown | undefined
): RequestInit => ({
  method,
  headers: { ...headers },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

// ==================== API Client ====================

/**
 * Authenticated request wrapper for the browser.
 *
 * Relies on httpOnly cookies for authentication (sent automatically
 * via credentials: "include"). Handles 401 with token refresh
 * and redirects to /login on auth failure.
 */
export const apiClient = async (
  path: string,
  options: ApiClientOptions = {}
): Promise<Response> => {
  const { method = "GET", body, headers = {}, backgroundRetry = false } = options;
  const requestHeaders = buildHeaders(headers);
  const init = buildInit(method, requestHeaders, body);

  const response = await httpRequest(`${API_URL}${path}`, init);

  // Surface plan-limit, feature-gate, and downgrade-blocked errors to the user via toast
  if (response.status === 403 || response.status === 409) {
    try {
      const cloned = response.clone();
      const errorBody = (await cloned.json()) as {
        readonly error?: {
          readonly code?: string;
          readonly message?: string;
          readonly metadata?: { readonly code?: string; readonly reason?: string };
        };
      };
      const errorCode = errorBody.error?.code;
      const metadataCode = errorBody.error?.metadata?.code;
      const metadataReason = errorBody.error?.metadata?.reason;

      // Truncate API error messages before displaying in toast to prevent
      // internal details (stack traces, SQL, hostnames) from leaking to UI.
      const safeMessage = errorBody.error?.message
        ? truncateForToast(errorBody.error.message)
        : null;

      if (errorCode === "PLAN_LIMIT_EXCEEDED" || metadataCode === "PLAN_LIMIT_EXCEEDED") {
        toast.error(safeMessage ?? "You've reached your plan limit. Upgrade to continue.");
      } else if (
        errorCode === "FEATURE_NOT_AVAILABLE" ||
        metadataCode === "FEATURE_NOT_AVAILABLE"
      ) {
        toast.error(safeMessage ?? "This feature is not available on your current plan.");
      } else if (errorCode === "DOWNGRADE_BLOCKED" || metadataCode === "DOWNGRADE_BLOCKED") {
        toast.error(safeMessage ?? "Current usage exceeds the target plan's limits.");
      } else if (errorCode === "AUTHORIZATION_ERROR" && metadataReason === "access_revoked") {
        // Membership revoked or tenant blocked — force re-authentication.
        // Only redirects when the auth middleware explicitly marks the error
        // with reason: "access_revoked". Generic permission denials (e.g.,
        // requirePermission("billing") for a member role) must NOT redirect.
        toast.error(
          safeMessage ?? "Access denied. You may have been removed from this organization."
        );
        if (!window.location.pathname.startsWith("/login")) {
          window.location.assign("/login?error=access_revoked");
        }
        return response;
      }
    } catch {
      // Ignore parsing errors — non-JSON responses are handled elsewhere
    }
  }

  if (response.status !== 401) {
    return response;
  }

  const refreshed = await attemptTokenRefresh();

  if (!refreshed) {
    // Background calls (SSE handler, visibility handler) should never force a logout.
    // Return the 401 response and let the caller handle it gracefully.
    if (backgroundRetry) {
      return response;
    }

    // Redirect to login on auth failure — but only if we're not already
    // on the login page, to avoid an infinite redirect loop when
    // AuthProvider's refreshUser() calls /auth/me on mount.
    if (!window.location.pathname.startsWith("/login")) {
      window.location.assign("/login?error=session_expired");
    }
    return response;
  }

  // Retry with new cookies (sent automatically)
  const retryInit = buildInit(method, requestHeaders, body);
  return httpRequest(`${API_URL}${path}`, retryInit);
};

/**
 * Build the full login URL for an OAuth provider.
 *
 * Redirects to the API's OAuth login endpoint which handles
 * CSRF state generation and provider redirect.
 *
 * When API_URL is empty (Docker/production), uses window.location.origin
 * as the base so the browser navigates through the nginx proxy.
 */
export const getLoginUrl = (provider: string, instanceUrl?: string): string => {
  const base = API_URL || window.location.origin;
  const url = new URL(`${base}/auth/${provider}/login`);

  if (instanceUrl) {
    url.searchParams.set("instance_url", instanceUrl);
  }

  return url.toString();
};

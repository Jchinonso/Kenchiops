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
  const { method = "GET", body, headers = {} } = options;
  const requestHeaders = buildHeaders(headers);
  const init = buildInit(method, requestHeaders, body);

  const response = await httpRequest(`${API_URL}${path}`, init);

  // Surface plan-limit 403 and downgrade-blocked 409 errors to the user via toast
  if (response.status === 403 || response.status === 409) {
    try {
      const cloned = response.clone();
      const body = (await cloned.json()) as {
        readonly error?: { readonly code?: string; readonly message?: string };
      };
      if (body.error?.code === "PLAN_LIMIT_EXCEEDED") {
        toast.error(body.error.message ?? "You've reached your plan limit. Upgrade to continue.");
      } else if (body.error?.code === "DOWNGRADE_BLOCKED") {
        toast.error(body.error.message ?? "Current usage exceeds the target plan's limits.");
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

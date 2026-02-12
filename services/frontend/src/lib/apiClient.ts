/**
 * Authenticated API Client
 *
 * Browser-side HTTP wrapper with Bearer token injection and automatic
 * token refresh on 401. Tokens are stored in localStorage and cleared
 * on auth failure.
 *
 * NOTE: This is a frontend browser module. It uses the browser's native
 * Fetch API (not @kenchi/shared httpClient, which is a Node.js utility).
 */

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const TOKEN_KEYS = {
  ACCESS: "kenchi_access_token",
  REFRESH: "kenchi_refresh_token",
} as const;

// ==================== Token Helpers ====================

export const getAccessToken = (): string | null => localStorage.getItem(TOKEN_KEYS.ACCESS);

const getRefreshToken = (): string | null => localStorage.getItem(TOKEN_KEYS.REFRESH);

export const setTokens = (accessToken: string, refreshToken: string): void => {
  localStorage.setItem(TOKEN_KEYS.ACCESS, accessToken);
  localStorage.setItem(TOKEN_KEYS.REFRESH, refreshToken);
};

export const clearTokens = (): void => {
  localStorage.removeItem(TOKEN_KEYS.ACCESS);
  localStorage.removeItem(TOKEN_KEYS.REFRESH);
};

export const isAuthenticated = (): boolean => getAccessToken() !== null;

// ==================== Browser HTTP ====================

/**
 * Browser-native HTTP request. Isolated here so the rest of the module
 * calls this wrapper instead of the global directly.
 *
 * Frontend code uses the browser Fetch API -- @kenchi/shared httpClient
 * is a Node.js server utility and is not available in the browser.
 */
const httpRequest = (url: string, init?: RequestInit): Promise<Response> =>
  globalThis.fetch(url, init);

/** Navigate to a path using browser location. */
const redirectTo = (path: string): void => {
  window.location.assign(path);
};

// ==================== Token Refresh ====================

/**
 * Prevent concurrent refresh requests. When multiple 401s fire simultaneously,
 * only one refresh request is issued and others await the same promise.
 */
// let: shared mutable state for single-flight refresh coordination
let activeRefresh: Promise<boolean> | null = null; // let: single-flight coordination for concurrent 401s

const attemptTokenRefresh = async (): Promise<boolean> => {
  if (activeRefresh) {
    return activeRefresh;
  }

  const doRefresh = async (): Promise<boolean> => {
    const refreshToken = getRefreshToken();

    if (!refreshToken) {
      return false;
    }

    try {
      const response = await httpRequest(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        return false;
      }

      const data = (await response.json()) as {
        readonly access_token: string;
        readonly refresh_token: string;
        readonly expires_in: number;
      };

      setTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    }
  };

  activeRefresh = doRefresh();

  try {
    return await activeRefresh;
  } finally {
    activeRefresh = null;
  }
};

// ==================== Request Builder ====================

interface ApiClientOptions {
  readonly method?: string;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

const buildHeaders = (
  token: string | null,
  extraHeaders: Readonly<Record<string, string>>
): Readonly<Record<string, string>> => ({
  "Content-Type": "application/json",
  ...extraHeaders,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
 * Attaches Authorization header, handles 401 with token refresh,
 * and redirects to /login on auth failure.
 */
export const apiClient = async (
  path: string,
  options: ApiClientOptions = {}
): Promise<Response> => {
  const { method = "GET", body, headers = {} } = options;
  const requestHeaders = buildHeaders(getAccessToken(), headers);
  const init = buildInit(method, requestHeaders, body);

  const response = await httpRequest(`${API_URL}${path}`, init);

  if (response.status !== 401) {
    return response;
  }

  const refreshed = await attemptTokenRefresh();

  if (!refreshed) {
    clearTokens();
    redirectTo("/login");
    return response;
  }

  const retryHeaders = buildHeaders(getAccessToken(), headers);
  const retryInit = buildInit(method, retryHeaders, body);
  return httpRequest(`${API_URL}${path}`, retryInit);
};

/**
 * Build the full login URL for an OAuth provider.
 *
 * Redirects to the API's OAuth login endpoint which handles
 * CSRF state generation and provider redirect.
 */
export const getLoginUrl = (provider: string, instanceUrl?: string): string => {
  const url = new URL(`${API_URL}/auth/${provider}/login`);

  if (instanceUrl) {
    url.searchParams.set("instance_url", instanceUrl);
  }

  return url.toString();
};

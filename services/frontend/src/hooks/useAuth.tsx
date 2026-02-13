/**
 * Auth Context & Hook
 *
 * Provides authentication state (user, isAuthenticated, isLoading)
 * and auth actions (login, logout, refreshUser) via React Context.
 *
 * Authentication tokens are stored in httpOnly cookies (managed by the API).
 * The browser sends them automatically via `credentials: "include"`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiClient, getLoginUrl } from "@/lib/apiClient";

/**
 * SessionStorage key set during logout to prevent refreshUser from
 * re-authenticating on the next page load. Cleared on the first
 * refreshUser call after the flag is detected.
 */
const LOGGED_OUT_KEY = "kenchi_logged_out";

// ==================== Types ====================

interface AuthUser {
  readonly id: string;
  readonly email: string | null;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly role: string;
  readonly tenantId: string | null;
}

interface AuthContextValue {
  readonly user: AuthUser | null;
  readonly isAuthenticated: boolean;
  readonly isLoading: boolean;
  readonly login: (provider: string, instanceUrl?: string) => void;
  readonly logout: () => Promise<void>;
  readonly refreshUser: () => Promise<void>;
}

interface AuthProviderProps {
  readonly children: ReactNode;
}

// ==================== Context ====================

const AuthContext = createContext<AuthContextValue | null>(null);

// ==================== Provider ====================

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async (): Promise<void> => {
    // After an explicit logout, skip the API call entirely.
    // This prevents re-authentication from cookies that the browser
    // may not have fully cleared before the page reloaded.
    if (sessionStorage.getItem(LOGGED_OUT_KEY)) {
      sessionStorage.removeItem(LOGGED_OUT_KEY);
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      // Cookie is sent automatically via credentials: "include".
      // If no valid cookie exists, the API returns 401 and apiClient
      // handles the redirect to /login after a failed refresh attempt.
      const response = await apiClient("/auth/me");

      if (!response.ok) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      const data = (await response.json()) as { readonly data: AuthUser };
      setUser(data.data);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback((provider: string, instanceUrl?: string): void => {
    window.location.assign(getLoginUrl(provider, instanceUrl));
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      // Server reads the refresh token from the httpOnly cookie
      // and revokes the token family, then clears both cookies.
      await apiClient("/auth/logout", { method: "POST" });
    } catch {
      // Logout is best-effort; always redirect to login
    } finally {
      setUser(null);
      // Signal refreshUser to skip re-authentication on the next page load.
      // This prevents a race where cookies haven't been fully cleared by the
      // browser before the reload triggers a new /auth/me request.
      sessionStorage.setItem(LOGGED_OUT_KEY, "1");
      window.location.assign("/login");
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const isAuthenticated = user !== null;

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      login,
      logout,
      refreshUser,
    }),
    [user, isAuthenticated, isLoading, login, logout, refreshUser]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

// ==================== Hook ====================

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new TypeError("useAuth must be used within an AuthProvider");
  }

  return context;
};

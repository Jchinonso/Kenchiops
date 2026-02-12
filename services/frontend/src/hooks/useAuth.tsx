/**
 * Auth Context & Hook
 *
 * Provides authentication state (user, isAuthenticated, isLoading)
 * and auth actions (login, logout, refreshUser) via React Context.
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
import { apiClient, clearTokens, getLoginUrl, getAccessToken } from "@/lib/apiClient";

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
    const token = getAccessToken();

    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
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
      await apiClient("/auth/logout", {
        method: "POST",
        body: { refreshToken: localStorage.getItem("kenchi_refresh_token") },
      });
    } catch {
      // Logout is best-effort; always clear local state
    } finally {
      clearTokens();
      setUser(null);
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

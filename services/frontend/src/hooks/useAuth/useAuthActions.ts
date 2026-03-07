import { useState, useCallback } from "react";
import { toast } from "sonner";
import { apiClient, getLoginUrl } from "@/lib/apiClient";
import type { AuthUser, AuthMeResponse } from "./types";
import { LOGGED_OUT_KEY } from "./constants";
import { mapAuthMeToUser } from "./mappers";

interface AuthActions {
  readonly user: AuthUser | null;
  readonly isLoading: boolean;
  readonly isSwitchingOrg: boolean;
  readonly isAuthenticated: boolean;
  readonly login: (provider: string, instanceUrl?: string) => void;
  readonly logout: () => Promise<void>;
  readonly refreshUser: () => Promise<void>;
  readonly switchOrganization: (
    orgId: string
  ) => Promise<{ readonly hasProviderConnection: boolean }>;
}

/**
 * Manages auth state (user, isLoading, isSwitchingOrg) and
 * provides stable callbacks for login, logout, refreshUser,
 * and switchOrganization.
 */
export const useAuthActions = (): AuthActions => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitchingOrg, setIsSwitchingOrg] = useState(false);
  const isAuthenticated = user !== null;

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

      const data = (await response.json()) as AuthMeResponse;
      setUser(mapAuthMeToUser(data));
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

  const switchOrganization = useCallback(
    async (orgId: string): Promise<{ readonly hasProviderConnection: boolean }> => {
      setIsSwitchingOrg(true);
      try {
        const response = await apiClient("/api/v1/organizations/switch", {
          method: "POST",
          body: { organizationId: orgId },
        });

        if (!response.ok) {
          toast.error("Failed to switch organization. Please try again.");
          return { hasProviderConnection: false };
        }

        const body = (await response.json()) as {
          readonly data?: {
            readonly hasProviderConnection?: boolean;
          };
        };
        const hasProviderConnection = body.data?.hasProviderConnection ?? false;

        // Clear tenant-scoped localStorage to prevent cross-tenant data leaks.
        Object.keys(localStorage)
          .filter((key) => key.startsWith("kenchi_"))
          .forEach((key) => localStorage.removeItem(key));

        // Refresh user from /auth/me to confirm the new JWT cookie is active.
        // Without this, the caller navigates to /dashboard and fires API requests
        // before the browser has fully applied the new Set-Cookie header, causing
        // transient 401 errors that require a page refresh.
        await refreshUser();

        return { hasProviderConnection };
      } finally {
        setIsSwitchingOrg(false);
      }
    },
    [refreshUser]
  );

  return {
    user,
    isLoading,
    isSwitchingOrg,
    isAuthenticated,
    login,
    logout,
    refreshUser,
    switchOrganization,
  };
};

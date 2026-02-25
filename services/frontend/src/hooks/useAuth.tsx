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
import { toast } from "sonner";
import { apiClient, getLoginUrl } from "@/lib/apiClient";

/**
 * SessionStorage key set during logout to prevent refreshUser from
 * re-authenticating on the next page load. Cleared on the first
 * refreshUser call after the flag is detected.
 */
const LOGGED_OUT_KEY = "kenchi_logged_out";

/** Idle session timeout in milliseconds (30 minutes — SOC 2 compliance). */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Events that indicate user activity and reset the idle timer. */
const ACTIVITY_EVENTS: readonly string[] = [
  "mousemove",
  "keydown",
  "click",
  "scroll",
  "touchstart",
];

// ==================== Types ====================

interface AuthUserProvider {
  readonly provider: string;
  readonly username: string | null;
}

export interface AuthOrganization {
  readonly id: string;
  readonly orgName: string;
  readonly provider: string;
  readonly role: string;
  readonly isDefault: boolean;
  readonly isSelected: boolean;
}

export interface AuthUser {
  readonly id: string;
  readonly email: string | null;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly role: string;
  readonly tenantId: string | null;
  readonly providers?: readonly AuthUserProvider[];
  readonly createdAt?: string;
  readonly organizations: readonly AuthOrganization[];
}

interface AuthContextValue {
  readonly user: AuthUser | null;
  readonly isAuthenticated: boolean;
  readonly isLoading: boolean;
  readonly isSwitchingOrg: boolean;
  readonly login: (provider: string, instanceUrl?: string) => void;
  readonly logout: () => Promise<void>;
  readonly refreshUser: () => Promise<void>;
  readonly switchOrganization: (orgId: string) => Promise<void>;
}

interface AuthProviderProps {
  readonly children: ReactNode;
}

// ==================== Context ====================

const AuthContext = createContext<AuthContextValue | null>(null);

// ==================== Provider ====================

/**
 * Shape returned by the /auth/me endpoint.
 * The user object and organizations are siblings under `data`.
 */
interface AuthMeResponse {
  readonly data: {
    readonly user: {
      readonly id: string;
      readonly email: string | null;
      readonly displayName: string;
      readonly avatarUrl: string | null;
      readonly role: string;
      readonly tenantId: string | null;
      readonly providers?: readonly AuthUserProvider[];
      readonly createdAt?: string;
    };
    readonly organizations?: ReadonlyArray<{
      readonly id: string;
      readonly tenantId: string;
      readonly role: string;
      readonly isDefault: boolean;
      readonly orgName: string;
      readonly provider: string;
    }>;
  };
}

/**
 * Map the /auth/me response into our AuthUser shape,
 * computing `isSelected` by comparing each org's tenantId to the user's tenantId.
 */
const mapAuthMeToUser = (response: AuthMeResponse): AuthUser => {
  const { user: rawUser, organizations: rawOrgs } = response.data;
  const organizations: readonly AuthOrganization[] = (rawOrgs ?? []).map((org) => ({
    id: org.id,
    orgName: org.orgName,
    provider: org.provider,
    role: org.role,
    isDefault: org.isDefault,
    isSelected: org.tenantId === rawUser.tenantId,
  }));

  return {
    id: rawUser.id,
    email: rawUser.email,
    displayName: rawUser.displayName,
    avatarUrl: rawUser.avatarUrl,
    role: rawUser.role,
    tenantId: rawUser.tenantId,
    providers: rawUser.providers,
    createdAt: rawUser.createdAt,
    organizations,
  };
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitchingOrg, setIsSwitchingOrg] = useState(false);

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
    async (orgId: string): Promise<void> => {
      setIsSwitchingOrg(true);
      try {
        const response = await apiClient("/api/v1/organizations/switch", {
          method: "POST",
          body: { organizationId: orgId },
        });

        if (!response.ok) {
          toast.error("Failed to switch organization. Please try again.");
          return;
        }

        // Clear tenant-scoped localStorage to prevent cross-tenant data leaks.
        // Filter state (kenchi_filters_*) is the primary concern.
        Object.keys(localStorage)
          .filter((key) => key.startsWith("kenchi_filters_"))
          .forEach((key) => localStorage.removeItem(key));

        // The backend sets a new JWT cookie scoped to the switched org.
        // Reload user data so the UI (and all hooks depending on user/tenantId) refreshes.
        await refreshUser();
      } finally {
        setIsSwitchingOrg(false);
      }
    },
    [refreshUser]
  );

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Idle session timeout — auto-logout after 30 minutes of inactivity.
  useEffect(() => {
    if (user === null) {
      return;
    }

    const scheduleTimeout = (): ReturnType<typeof setTimeout> =>
      setTimeout(() => {
        toast.info("Session expired due to inactivity.");
        void logout();
      }, IDLE_TIMEOUT_MS);

    // let: timer ID reassigned on each user activity event to reset the countdown
    let timerId = scheduleTimeout();

    const resetTimer = () => {
      clearTimeout(timerId);
      timerId = scheduleTimeout();
    };

    ACTIVITY_EVENTS.forEach((event) =>
      document.addEventListener(event, resetTimer, { passive: true })
    );

    return () => {
      clearTimeout(timerId);
      ACTIVITY_EVENTS.forEach((event) => document.removeEventListener(event, resetTimer));
    };
  }, [user, logout]);

  const isAuthenticated = user !== null;

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      isSwitchingOrg,
      login,
      logout,
      refreshUser,
      switchOrganization,
    }),
    [
      user,
      isAuthenticated,
      isLoading,
      isSwitchingOrg,
      login,
      logout,
      refreshUser,
      switchOrganization,
    ]
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

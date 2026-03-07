/**
 * Auth Context Provider & Consumer Hook
 *
 * Thin composition layer that wires together the auth action hooks,
 * idle timeout, and tab visibility refresh into a single React Context.
 *
 * Authentication tokens are stored in httpOnly cookies (managed by the API).
 * The browser sends them automatically via `credentials: "include"`.
 */

import { useEffect, useMemo } from "react";
import type { AuthProviderProps, AuthContextValue } from "./types";
import { AuthContext } from "./AuthContext";
import { useAuthActions } from "./useAuthActions";
import { useIdleTimeout } from "./useIdleTimeout";
import { useTabVisibility } from "./useTabVisibility";

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const {
    user,
    isLoading,
    isSwitchingOrg,
    isAuthenticated,
    login,
    logout,
    refreshUser,
    switchOrganization,
  } = useAuthActions();

  // Fetch user on mount.
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // SOC 2 idle session timeout (30 min).
  useIdleTimeout(user, logout);

  // Re-discover orgs when browser tab regains focus.
  useTabVisibility(isAuthenticated, refreshUser);

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

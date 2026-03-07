/**
 * Permissions Hook
 *
 * Provides role-based permission checking derived from the current user's role.
 * Defines a static ROLE_PERMISSIONS map and exposes helpers to check whether
 * the authenticated user holds a given permission or any of a set of permissions.
 */

import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_PERMISSIONS, toRole } from "./constants";
import type { UsePermissionsResult, Permission } from "./types";

export const usePermissions = (): UsePermissionsResult => {
  const { user } = useAuth();
  // Use the role from the selected organization (matches the JWT's orgRole),
  // not the global user role. This ensures per-org permission scoping:
  // e.g., admin in org A but member in org B → see member UI in org B.
  const selectedOrg = user?.organizations?.find((org) => org.isSelected);
  const role = toRole(selectedOrg?.role ?? user?.role ?? "viewer");
  const permissions = ROLE_PERMISSIONS[role];

  const hasPermission = useMemo(
    () =>
      (permission: Permission): boolean =>
        permissions.has(permission),
    [permissions]
  );

  const hasAnyPermission = useMemo(
    () =>
      (...perms: readonly Permission[]): boolean =>
        perms.some((perm) => permissions.has(perm)),
    [permissions]
  );

  return useMemo(
    () => ({ role, hasPermission, hasAnyPermission }),
    [role, hasPermission, hasAnyPermission]
  );
};

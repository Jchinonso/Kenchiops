/**
 * Permissions Hook
 *
 * Provides role-based permission checking derived from the current user's role.
 * Defines a static ROLE_PERMISSIONS map and exposes helpers to check whether
 * the authenticated user holds a given permission or any of a set of permissions.
 */

import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";

// ==================== Types ====================

type Role = "owner" | "admin" | "member" | "viewer";

type Permission =
  | "team.manage"
  | "billing"
  | "settings"
  | "analyses.read"
  | "analyses.write"
  | "integrations.manage"
  | "members.invite"
  | "members.remove";

interface UsePermissionsResult {
  readonly role: Role;
  readonly hasPermission: (permission: Permission) => boolean;
  readonly hasAnyPermission: (...permissions: readonly Permission[]) => boolean;
}

// ==================== Permission Map ====================

const ROLE_PERMISSIONS: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  owner: new Set<Permission>([
    "team.manage",
    "billing",
    "settings",
    "analyses.read",
    "analyses.write",
    "integrations.manage",
    "members.invite",
    "members.remove",
  ]),
  admin: new Set<Permission>([
    "team.manage",
    "billing",
    "settings",
    "analyses.read",
    "analyses.write",
    "integrations.manage",
    "members.invite",
    "members.remove",
  ]),
  member: new Set<Permission>(["analyses.read", "analyses.write"]),
  viewer: new Set<Permission>(["analyses.read"]),
} as const;

const VALID_ROLES = new Set<string>(["owner", "admin", "member", "viewer"]);

const toRole = (raw: string): Role => (VALID_ROLES.has(raw) ? (raw as Role) : "viewer");

// ==================== Hook ====================

export const usePermissions = (): UsePermissionsResult => {
  const { user } = useAuth();
  const role = toRole(user?.role ?? "viewer");
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

  return { role, hasPermission, hasAnyPermission };
};

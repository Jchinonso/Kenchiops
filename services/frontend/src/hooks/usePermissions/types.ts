export type Role = "owner" | "admin" | "member" | "viewer";

export type Permission =
  | "team.manage"
  | "tenant.manage"
  | "billing"
  | "settings"
  | "analyses.read"
  | "analyses.write"
  | "integrations.manage"
  | "members.invite"
  | "members.remove";

export interface UsePermissionsResult {
  readonly role: Role;
  readonly hasPermission: (permission: Permission) => boolean;
  readonly hasAnyPermission: (...permissions: readonly Permission[]) => boolean;
}

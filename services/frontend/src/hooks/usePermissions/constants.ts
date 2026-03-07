import type { Role, Permission } from "./types";

export const ROLE_PERMISSIONS: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  owner: new Set<Permission>([
    "team.manage",
    "tenant.manage",
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

export const toRole = (raw: string): Role => (VALID_ROLES.has(raw) ? (raw as Role) : "viewer");

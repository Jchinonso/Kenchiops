const ROLE_BADGE_STYLES: Readonly<Record<string, string>> = {
  owner:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
  admin:
    "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-800",
  member:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800",
  viewer:
    "bg-zinc-50 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
};

export const getRoleBadgeStyle = (role: string): string =>
  ROLE_BADGE_STYLES[role] ?? ROLE_BADGE_STYLES.viewer;

export const ASSIGNABLE_ROLES = ["owner", "admin", "member", "viewer"] as const;

export const ROLE_WEIGHT: Readonly<Record<string, number>> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export const UPGRADE_THRESHOLD = 90;

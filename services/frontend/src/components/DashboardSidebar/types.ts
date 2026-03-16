export interface NavLeafItem {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly href: string;
  readonly comingSoon?: boolean;
}

export interface NavGroup {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly basePath: string;
  readonly children: readonly NavLeafItem[];
  readonly comingSoon?: boolean;
}

export type NavEntry = NavLeafItem | NavGroup;

export interface UserInfo {
  readonly displayName: string;
  readonly email: string;
  readonly avatarUrl?: string | null;
}

import type { ReactNode } from "react";

// ==================== Domain Types ====================

export interface AuthUserProvider {
  readonly provider: string;
  readonly username: string | null;
}

export interface AuthOrganization {
  readonly id: string;
  readonly tenantId: string;
  readonly orgName: string;
  readonly provider: string;
  readonly role: string;
  readonly isDefault: boolean;
  readonly isSelected: boolean;
  readonly tenantType: string;
}

export interface AuthUser {
  readonly id: string;
  readonly email: string | null;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly role: string;
  readonly tenantId: string | null;
  readonly tenantType: string;
  readonly providers?: readonly AuthUserProvider[];
  readonly createdAt?: string;
  readonly organizations: readonly AuthOrganization[];
  /** URL to GitHub settings where users can grant org access to the OAuth app. */
  readonly githubOrgAccessUrl?: string | null;
}

// ==================== Context Types ====================

export interface AuthContextValue {
  readonly user: AuthUser | null;
  readonly isAuthenticated: boolean;
  readonly isLoading: boolean;
  readonly isSwitchingOrg: boolean;
  readonly login: (provider: string, instanceUrl?: string) => void;
  readonly logout: () => Promise<void>;
  readonly refreshUser: () => Promise<void>;
  readonly switchOrganization: (
    orgId: string
  ) => Promise<{ readonly hasProviderConnection: boolean }>;
}

export interface AuthProviderProps {
  readonly children: ReactNode;
}

// ==================== API Response Types ====================

/**
 * Shape returned by the /auth/me endpoint.
 * The user object and organizations are siblings under `data`.
 */
export interface AuthMeResponse {
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
      readonly tenantType?: string;
    }>;
    readonly githubOrgAccessUrl?: string | null;
  };
}

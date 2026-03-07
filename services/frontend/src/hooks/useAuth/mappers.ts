import type { AuthMeResponse, AuthUser, AuthOrganization } from "./types";

/**
 * Map the /auth/me response into our AuthUser shape,
 * computing `isSelected` by comparing each org's tenantId to the user's tenantId.
 */
export const mapAuthMeToUser = (response: AuthMeResponse): AuthUser => {
  const { user: rawUser, organizations: rawOrgs, githubOrgAccessUrl } = response.data;
  const organizations: readonly AuthOrganization[] = (rawOrgs ?? []).map((org) => ({
    id: org.id,
    tenantId: org.tenantId,
    orgName: org.orgName,
    provider: org.provider,
    role: org.role,
    isDefault: org.isDefault,
    isSelected: org.tenantId === rawUser.tenantId,
    tenantType: org.tenantType ?? "organization",
  }));

  const selectedOrg = organizations.find((org) => org.isSelected);
  const tenantType = selectedOrg?.tenantType ?? "organization";

  return {
    id: rawUser.id,
    email: rawUser.email,
    displayName: rawUser.displayName,
    avatarUrl: rawUser.avatarUrl,
    role: rawUser.role,
    tenantId: rawUser.tenantId,
    tenantType,
    providers: rawUser.providers,
    createdAt: rawUser.createdAt,
    organizations,
    githubOrgAccessUrl,
  };
};

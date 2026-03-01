/**
 * Unit tests for services/authService.ts
 *
 * Tests the auth service factory and all its methods:
 * - findOrCreateUser: OAuth identity lookup, email linking, user creation
 * - autoLinkOrganizations: multi-org tenant auto-linking with provider scoping
 * - generateTokenPair: access + refresh token generation with DB storage
 * - refreshTokens: token rotation with reuse detection
 * - revokeUserTokens: family-based revocation
 *
 * Mocks all repository functions and JWT utilities at the @kenchi/shared boundary.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type {
  User,
  OAuthIdentity,
  OAuthProviderProfile,
  OAuthTokenResponse,
  RefreshToken,
  RequestContext,
  Tenant,
} from "@kenchi/shared";
import type { TokenMeta } from "../../services/authServiceTypes.js";

// ==================== Mock Functions ====================

// Repository mocks
const mockFindOAuthIdentity = jest.fn<(...args: unknown[]) => Promise<OAuthIdentity | null>>();
const mockFindUserById = jest.fn<(...args: unknown[]) => Promise<User | null>>();
const mockFindUserByEmail = jest.fn<(...args: unknown[]) => Promise<User | null>>();
const mockCreateUser = jest.fn<(...args: unknown[]) => Promise<User>>();
const mockUpdateLastLogin = jest.fn<(...args: unknown[]) => Promise<User>>();
const mockSwitchUserOrganization = jest.fn<(...args: unknown[]) => Promise<User | null>>();
const mockUpsertOAuthIdentity = jest.fn<(...args: unknown[]) => Promise<OAuthIdentity>>();
const mockCreateRefreshToken = jest.fn<(...args: unknown[]) => Promise<RefreshToken>>();
const mockFindRefreshTokenByHash = jest.fn<(...args: unknown[]) => Promise<RefreshToken | null>>();
const mockRevokeTokenFamily = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockReplaceRefreshToken = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockRotateRefreshTokenAtomically = jest.fn<(...args: unknown[]) => Promise<unknown>>();

// Multi-org mocks
const mockFindByOrgNameAndProvider = jest.fn<(...args: unknown[]) => Promise<Tenant | null>>();
const mockAddUserOrganization = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCreateFromGitHubLogin = jest.fn<(...args: unknown[]) => Promise<Tenant>>();
const mockCreateFromGitLabGroup = jest.fn<(...args: unknown[]) => Promise<Tenant>>();
const mockCreateFromBitbucketWorkspace = jest.fn<(...args: unknown[]) => Promise<Tenant>>();
const mockCreateFromAzureDevOpsAccount = jest.fn<(...args: unknown[]) => Promise<Tenant>>();

// Organization membership mocks
const mockFindOrganizationsByUser = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const mockCountOwnersByTenant = jest.fn<(...args: unknown[]) => Promise<number>>();
const mockRemoveMemberFromTenant = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockFindUserOrgRole = jest.fn<(...args: unknown[]) => Promise<string | null>>();
const mockLogAuditEvent = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockCheckPlanLimit =
  jest.fn<
    (...args: unknown[]) => Promise<{ allowed: boolean; currentUsage: number; limit: number }>
  >();
const mockCountTenantMembers = jest.fn<(...args: unknown[]) => Promise<number>>();
const mockResolveAutoLinkRole = jest.fn<(...args: unknown[]) => string>();

// JWT mocks
const mockGenerateAccessToken = jest.fn<(...args: unknown[]) => string>();
const mockGenerateRefreshToken = jest.fn<(...args: unknown[]) => string>();
const mockHashRefreshToken = jest.fn<(...args: unknown[]) => string>();

// Adapter mock
const mockGetUserOrganizations =
  jest.fn<(...args: unknown[]) => Promise<ReadonlyArray<{ login: string; role?: string }>>>();
const mockGetOAuthAdapter = jest.fn(() => ({
  exchangeCode: jest.fn(),
  getUserProfile: jest.fn(),
  getUserOrganizations: mockGetUserOrganizations,
}));

// ==================== Module Mocks ====================

jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
    // Repository functions
    findOAuthIdentity: (...args: unknown[]) => mockFindOAuthIdentity(...args),
    findUserById: (...args: unknown[]) => mockFindUserById(...args),
    findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
    createUser: (...args: unknown[]) => mockCreateUser(...args),
    updateLastLogin: (...args: unknown[]) => mockUpdateLastLogin(...args),
    switchUserOrganization: (...args: unknown[]) => mockSwitchUserOrganization(...args),
    upsertOAuthIdentity: (...args: unknown[]) => mockUpsertOAuthIdentity(...args),
    createRefreshToken: (...args: unknown[]) => mockCreateRefreshToken(...args),
    findRefreshTokenByHash: (...args: unknown[]) => mockFindRefreshTokenByHash(...args),
    revokeTokenFamily: (...args: unknown[]) => mockRevokeTokenFamily(...args),
    replaceRefreshToken: (...args: unknown[]) => mockReplaceRefreshToken(...args),
    rotateRefreshTokenAtomically: (...args: unknown[]) => mockRotateRefreshTokenAtomically(...args),
    // Multi-org functions
    findByOrgNameAndProvider: (...args: unknown[]) => mockFindByOrgNameAndProvider(...args),
    addUserOrganization: (...args: unknown[]) => mockAddUserOrganization(...args),
    createFromGitHubLogin: (...args: unknown[]) => mockCreateFromGitHubLogin(...args),
    createFromGitLabGroup: (...args: unknown[]) => mockCreateFromGitLabGroup(...args),
    createFromBitbucketWorkspace: (...args: unknown[]) => mockCreateFromBitbucketWorkspace(...args),
    createFromAzureDevOpsAccount: (...args: unknown[]) => mockCreateFromAzureDevOpsAccount(...args),
    // Organization membership
    findOrganizationsByUser: (...args: unknown[]) => mockFindOrganizationsByUser(...args),
    countOwnersByTenant: (...args: unknown[]) => mockCountOwnersByTenant(...args),
    removeMemberFromTenant: (...args: unknown[]) => mockRemoveMemberFromTenant(...args),
    findUserOrgRole: (...args: unknown[]) => mockFindUserOrgRole(...args),
    logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
    checkPlanLimit: (...args: unknown[]) => mockCheckPlanLimit(...args),
    countTenantMembers: (...args: unknown[]) => mockCountTenantMembers(...args),
    resolveAutoLinkRole: (...args: unknown[]) => mockResolveAutoLinkRole(...args),
    // JWT utilities
    generateAccessToken: (...args: unknown[]) => mockGenerateAccessToken(...args),
    generateRefreshToken: (...args: unknown[]) => mockGenerateRefreshToken(...args),
    hashRefreshToken: (...args: unknown[]) => mockHashRefreshToken(...args),
  };
});

jest.mock("../../adapters/oauthAdapterRegistry.js", () => ({
  getOAuthAdapter: (...args: unknown[]) => mockGetOAuthAdapter(...args),
}));

// Import after mock setup
import { createAuthService } from "../../services/authService.js";
import { AuthenticationError } from "@kenchi/shared";

// ==================== Test Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const createTestUser = (overrides: Partial<User> = {}): User => ({
  id: "usr_test-user-123",
  tenantId: "tenant-abc",
  email: "test@example.com",
  displayName: "Test User",
  avatarUrl: "https://example.com/avatar.png",
  role: "member",
  status: "active",
  lastLoginAt: null,
  createdAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date("2025-01-01T00:00:00Z"),
  ...overrides,
});

const createTestTenant = (overrides: Partial<Tenant> = {}): Tenant => ({
  id: "tnt_test-tenant",
  orgName: "test-org",
  provider: "github",
  status: "active",
  createdAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date("2025-01-01T00:00:00Z"),
  ...overrides,
});

const createTestOAuthIdentity = (overrides: Partial<OAuthIdentity> = {}): OAuthIdentity => ({
  id: "oid_test-identity-123",
  userId: "usr_test-user-123",
  provider: "github",
  providerUserId: "12345",
  providerUsername: "testuser",
  providerEmail: "test@example.com",
  providerAvatarUrl: "https://github.com/avatar.png",
  instanceUrl: null,
  accessToken: "gho_existing-token",
  refreshToken: null,
  tokenExpiresAt: null,
  scopes: ["read:user", "user:email"],
  rawProfile: { id: 12345, login: "testuser" },
  createdAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date("2025-01-01T00:00:00Z"),
  ...overrides,
});

const createTestProfile = (
  overrides: Partial<OAuthProviderProfile> = {}
): OAuthProviderProfile => ({
  providerUserId: "12345",
  username: "testuser",
  email: "test@example.com",
  emailVerified: true,
  displayName: "Test User",
  avatarUrl: "https://github.com/avatar.png",
  rawProfile: { id: 12345, login: "testuser" },
  ...overrides,
});

const createTestTokens = (overrides: Partial<OAuthTokenResponse> = {}): OAuthTokenResponse => ({
  accessToken: "gho_new-access-token",
  refreshToken: null,
  expiresIn: null,
  scope: "read:user user:email",
  tokenType: "bearer",
  ...overrides,
});

const createTestRefreshToken = (overrides: Partial<RefreshToken> = {}): RefreshToken => ({
  id: "rtk_test-refresh-123",
  userId: "usr_test-user-123",
  tokenHash: "hashed-refresh-token",
  familyId: "family-uuid-123",
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  revokedAt: null,
  replacedBy: null,
  userAgent: "Test/1.0",
  ipAddress: "127.0.0.1",
  createdAt: new Date("2025-01-01T00:00:00Z"),
  ...overrides,
});

const testTokenMeta: TokenMeta = {
  userAgent: "Test-Agent/1.0",
  ipAddress: "192.168.1.1",
};

// ==================== Tests ====================

describe("authService", () => {
  // let: service is rebuilt each test to ensure fresh mocks bind correctly
  let service: ReturnType<typeof createAuthService>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = createAuthService();

    // Default mock returns
    mockGenerateAccessToken.mockReturnValue("mock-access-token");
    mockGenerateRefreshToken.mockReturnValue("mock-raw-refresh-token");
    mockHashRefreshToken.mockReturnValue("mock-hashed-refresh-token");
    mockFindUserOrgRole.mockResolvedValue(null);
    mockFindOrganizationsByUser.mockResolvedValue([]);
    mockCheckPlanLimit.mockResolvedValue({ allowed: true, currentUsage: 0, limit: 10 });
    mockCountTenantMembers.mockResolvedValue(0);
    mockResolveAutoLinkRole.mockReturnValue("member");
  });

  // ==================================================================
  // findOrCreateUser
  // ==================================================================

  describe("findOrCreateUser", () => {
    it("should return existing user when OAuth identity is found", async () => {
      const existingIdentity = createTestOAuthIdentity();
      const existingUser = createTestUser();
      const profile = createTestProfile();
      const tokens = createTestTokens();

      mockFindOAuthIdentity.mockResolvedValue(existingIdentity);
      mockUpsertOAuthIdentity.mockResolvedValue(existingIdentity);
      mockFindUserById.mockResolvedValue(existingUser);
      mockUpdateLastLogin.mockResolvedValue(existingUser);

      const result = await service.findOrCreateUser("github", profile, tokens, null, testContext);

      expect(result.user).toEqual(existingUser);
      expect(result.isNew).toBe(false);
      expect(mockFindOAuthIdentity).toHaveBeenCalledWith("github", "12345", null);
      expect(mockUpsertOAuthIdentity).toHaveBeenCalled();
      expect(mockUpdateLastLogin).toHaveBeenCalledWith(existingUser.id);
    });

    it("should throw AuthenticationError when identity exists but user is not found", async () => {
      const existingIdentity = createTestOAuthIdentity();
      const profile = createTestProfile();
      const tokens = createTestTokens();

      mockFindOAuthIdentity.mockResolvedValue(existingIdentity);
      mockUpsertOAuthIdentity.mockResolvedValue(existingIdentity);
      mockFindUserById.mockResolvedValue(null);

      await expect(
        service.findOrCreateUser("github", profile, tokens, null, testContext)
      ).rejects.toThrow(AuthenticationError);

      // Reset for second assertion
      mockFindOAuthIdentity.mockResolvedValue(existingIdentity);
      mockUpsertOAuthIdentity.mockResolvedValue(existingIdentity);
      mockFindUserById.mockResolvedValue(null);

      await expect(
        service.findOrCreateUser("github", profile, tokens, null, testContext)
      ).rejects.toThrow("User associated with OAuth identity not found");
    });

    it("should link to existing user when email matches", async () => {
      const existingUser = createTestUser({ email: "shared@example.com" });
      const profile = createTestProfile({ email: "shared@example.com" });
      const tokens = createTestTokens();

      mockFindOAuthIdentity.mockResolvedValue(null);
      mockFindUserByEmail.mockResolvedValue(existingUser);
      mockUpsertOAuthIdentity.mockResolvedValue(createTestOAuthIdentity());
      mockUpdateLastLogin.mockResolvedValue(existingUser);

      const result = await service.findOrCreateUser("github", profile, tokens, null, testContext);

      expect(result.user).toEqual(existingUser);
      expect(result.isNew).toBe(false);
      expect(mockFindUserByEmail).toHaveBeenCalledWith("shared@example.com");
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it("should create a new user when no identity or email match exists", async () => {
      const newUser = createTestUser({ id: "usr_brand-new" });
      const profile = createTestProfile({ email: "new@example.com" });
      const tokens = createTestTokens();

      mockFindOAuthIdentity.mockResolvedValue(null);
      mockFindUserByEmail.mockResolvedValue(null);
      mockCreateUser.mockResolvedValue(newUser);
      mockUpsertOAuthIdentity.mockResolvedValue(createTestOAuthIdentity());
      mockUpdateLastLogin.mockResolvedValue(newUser);

      const result = await service.findOrCreateUser("github", profile, tokens, null, testContext);

      expect(result.user).toEqual(newUser);
      expect(result.isNew).toBe(true);
      expect(mockCreateUser).toHaveBeenCalledWith({
        email: "new@example.com",
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        tenantId: null,
      });
    });

    it("should skip email lookup when profile.email is null", async () => {
      const newUser = createTestUser({ email: null });
      const profile = createTestProfile({ email: null });
      const tokens = createTestTokens();

      mockFindOAuthIdentity.mockResolvedValue(null);
      mockCreateUser.mockResolvedValue(newUser);
      mockUpsertOAuthIdentity.mockResolvedValue(createTestOAuthIdentity());
      mockUpdateLastLogin.mockResolvedValue(newUser);

      const result = await service.findOrCreateUser("github", profile, tokens, null, testContext);

      expect(result.isNew).toBe(true);
      expect(mockFindUserByEmail).not.toHaveBeenCalled();
      expect(mockCreateUser).toHaveBeenCalled();
    });

    it("should pass instanceUrl to findOAuthIdentity and upsertOAuthIdentity", async () => {
      const existingIdentity = createTestOAuthIdentity({
        instanceUrl: "https://github.example.com",
      });
      const existingUser = createTestUser();
      const profile = createTestProfile();
      const tokens = createTestTokens();

      mockFindOAuthIdentity.mockResolvedValue(existingIdentity);
      mockUpsertOAuthIdentity.mockResolvedValue(existingIdentity);
      mockFindUserById.mockResolvedValue(existingUser);
      mockUpdateLastLogin.mockResolvedValue(existingUser);

      await service.findOrCreateUser(
        "github",
        profile,
        tokens,
        "https://github.example.com",
        testContext
      );

      expect(mockFindOAuthIdentity).toHaveBeenCalledWith(
        "github",
        profile.providerUserId,
        "https://github.example.com"
      );

      // Verify instanceUrl is passed through to upsert
      const upsertCall = mockUpsertOAuthIdentity.mock.calls[0]![0] as Record<string, unknown>;
      expect(upsertCall.instanceUrl).toBe("https://github.example.com");
    });

    it("should upsert OAuth identity tokens when identity exists (refresh token data)", async () => {
      const existingIdentity = createTestOAuthIdentity();
      const existingUser = createTestUser();
      const profile = createTestProfile();
      const tokens = createTestTokens({
        accessToken: "gho_updated-token",
        scope: "read:user,user:email,read:org",
      });

      mockFindOAuthIdentity.mockResolvedValue(existingIdentity);
      mockUpsertOAuthIdentity.mockResolvedValue(existingIdentity);
      mockFindUserById.mockResolvedValue(existingUser);
      mockUpdateLastLogin.mockResolvedValue(existingUser);

      await service.findOrCreateUser("github", profile, tokens, null, testContext);

      const upsertArg = mockUpsertOAuthIdentity.mock.calls[0]![0] as Record<string, unknown>;
      expect(upsertArg.accessToken).toBe("gho_updated-token");
      expect(upsertArg.scopes).toEqual(["read:user", "user:email", "read:org"]);
    });
  });

  // ==================================================================
  // autoLinkOrganizations
  // ==================================================================

  describe("autoLinkOrganizations", () => {
    it("should discover orgs for bitbucket (org-capable provider)", async () => {
      const bbTenant = createTestTenant({
        id: "tenant-bb",
        orgName: "bb-workspace",
        provider: "bitbucket",
      });
      mockGetUserOrganizations.mockResolvedValue([{ login: "bb-workspace", role: "owner" }]);
      mockFindByOrgNameAndProvider.mockResolvedValue(null);
      mockCreateFromBitbucketWorkspace.mockResolvedValue(bbTenant);
      mockAddUserOrganization.mockResolvedValue(undefined);
      mockSwitchUserOrganization.mockResolvedValue(null);

      await service.autoLinkOrganizations(
        { id: "usr_1", tenantId: null },
        "bitbucket",
        "access-token",
        null,
        "testuser",
        testContext
      );

      expect(mockGetOAuthAdapter).toHaveBeenCalledWith("bitbucket");
      expect(mockCreateFromBitbucketWorkspace).toHaveBeenCalledWith("bb-workspace");
      expect(mockAddUserOrganization).toHaveBeenCalled();
    });

    it("should discover orgs for azure_devops (org-capable provider)", async () => {
      const azTenant = createTestTenant({
        id: "tenant-az",
        orgName: "az-org",
        provider: "azure_devops",
      });
      mockGetUserOrganizations.mockResolvedValue([{ login: "az-org" }]);
      mockFindByOrgNameAndProvider.mockResolvedValue(null);
      mockCreateFromAzureDevOpsAccount.mockResolvedValue(azTenant);
      mockAddUserOrganization.mockResolvedValue(undefined);
      mockSwitchUserOrganization.mockResolvedValue(null);

      await service.autoLinkOrganizations(
        { id: "usr_1", tenantId: null },
        "azure_devops",
        "access-token",
        null,
        "testuser",
        testContext
      );

      expect(mockGetOAuthAdapter).toHaveBeenCalledWith("azure_devops");
      expect(mockCreateFromAzureDevOpsAccount).toHaveBeenCalledWith("az-org");
    });

    it("should still run when user already has a tenantId (discovers new orgs)", async () => {
      const existingTenant = createTestTenant({ id: "tenant-acme", orgName: "acme-corp" });
      mockGetUserOrganizations.mockResolvedValue([{ login: "acme-corp" }]);
      mockFindByOrgNameAndProvider.mockResolvedValue(existingTenant);
      mockAddUserOrganization.mockResolvedValue(undefined);
      mockFindUserOrgRole.mockResolvedValue("member");

      await service.autoLinkOrganizations(
        { id: "usr_1", tenantId: "tenant-acme" },
        "github",
        "access-token",
        null,
        "testuser",
        testContext
      );

      // Should still discover orgs even though user has a tenant
      expect(mockGetOAuthAdapter).toHaveBeenCalledWith("github");
      expect(mockFindByOrgNameAndProvider).toHaveBeenCalledWith("acme-corp", "github");
      expect(mockAddUserOrganization).toHaveBeenCalled();
      // Should NOT switch org since current tenant belongs to the same provider
      expect(mockSwitchUserOrganization).not.toHaveBeenCalled();
    });

    it("should switch tenant when user logs in with a different provider than their current tenant", async () => {
      const gitlabTenant = createTestTenant({
        id: "tenant-gl",
        orgName: "acme",
        provider: "gitlab",
      });
      mockGetUserOrganizations.mockResolvedValue([{ login: "acme" }]);
      mockFindByOrgNameAndProvider.mockResolvedValue(gitlabTenant);
      mockAddUserOrganization.mockResolvedValue(undefined);
      mockSwitchUserOrganization.mockResolvedValue(null);
      mockFindUserOrgRole.mockResolvedValue("member");

      // User currently has a GitHub tenant selected, but logs in with GitLab
      await service.autoLinkOrganizations(
        { id: "usr_1", tenantId: "tenant-gh-existing" },
        "gitlab",
        "access-token",
        null,
        "testuser",
        testContext
      );

      // Should switch to GitLab tenant since current tenant is from a different provider
      expect(mockSwitchUserOrganization).toHaveBeenCalledWith("usr_1", "tenant-gl");
    });

    it("should create provider-scoped tenant and add membership for each org", async () => {
      const tenant1 = createTestTenant({ id: "tenant-acme", orgName: "acme-corp" });
      const tenant2 = createTestTenant({ id: "tenant-other", orgName: "other-org" });

      mockGetUserOrganizations.mockResolvedValue([{ login: "acme-corp" }, { login: "other-org" }]);
      mockFindByOrgNameAndProvider.mockResolvedValueOnce(tenant1).mockResolvedValueOnce(null);
      mockCreateFromGitHubLogin.mockResolvedValue(tenant2);
      mockAddUserOrganization.mockResolvedValue(undefined);
      mockSwitchUserOrganization.mockResolvedValue(null);
      mockFindUserOrgRole.mockResolvedValue(null);
      // First call (pre-link) returns [], second call (post-link orphan check)
      // returns both memberships so they don't appear orphaned
      mockFindOrganizationsByUser.mockResolvedValueOnce([]).mockResolvedValueOnce([
        { tenantId: "tenant-acme", provider: "github" },
        { tenantId: "tenant-other", provider: "github" },
      ]);

      await service.autoLinkOrganizations(
        { id: "usr_1", tenantId: null },
        "github",
        "access-token",
        null,
        "testuser",
        testContext
      );

      // First org found existing tenant
      expect(mockFindByOrgNameAndProvider).toHaveBeenCalledWith("acme-corp", "github");
      // Second org not found, created new
      expect(mockCreateFromGitHubLogin).toHaveBeenCalledWith("other-org");
      // Both orgs got membership added
      expect(mockAddUserOrganization).toHaveBeenCalledTimes(2);
      // Existing tenant: resolveAutoLinkRole called for role assignment
      expect(mockAddUserOrganization).toHaveBeenCalledWith({
        userId: "usr_1",
        tenantId: "tenant-acme",
        role: "member",
      });
      // New tenant: first user gets admin (FLAW-01 fix — elevateToMinimumAdmin)
      expect(mockAddUserOrganization).toHaveBeenCalledWith({
        userId: "usr_1",
        tenantId: "tenant-other",
        role: "admin",
      });
    });

    it("should set first org as selected when user has no tenantId", async () => {
      const tenant = createTestTenant({ id: "tenant-first", orgName: "first-org" });
      mockGetUserOrganizations.mockResolvedValue([{ login: "first-org" }]);
      mockFindByOrgNameAndProvider.mockResolvedValue(tenant);
      mockAddUserOrganization.mockResolvedValue(undefined);
      mockSwitchUserOrganization.mockResolvedValue(null);
      mockFindUserOrgRole.mockResolvedValue("member");

      await service.autoLinkOrganizations(
        { id: "usr_1", tenantId: null },
        "github",
        "access-token",
        null,
        "testuser",
        testContext
      );

      expect(mockSwitchUserOrganization).toHaveBeenCalledWith("usr_1", "tenant-first");
    });

    it("should use personal account fallback when GitHub user has zero orgs", async () => {
      const personalTenant = createTestTenant({ id: "tenant-personal", orgName: "myuser" });
      mockGetUserOrganizations.mockResolvedValue([]);
      mockFindByOrgNameAndProvider.mockResolvedValue(null);
      mockCreateFromGitHubLogin.mockResolvedValue(personalTenant);
      mockAddUserOrganization.mockResolvedValue(undefined);
      mockSwitchUserOrganization.mockResolvedValue(null);

      await service.autoLinkOrganizations(
        { id: "usr_1", tenantId: null },
        "github",
        "access-token",
        null,
        "myuser",
        testContext
      );

      // Should use providerUsername as fallback org
      expect(mockFindByOrgNameAndProvider).toHaveBeenCalledWith("myuser", "github");
      expect(mockCreateFromGitHubLogin).toHaveBeenCalledWith("myuser");
      expect(mockAddUserOrganization).toHaveBeenCalledWith({
        userId: "usr_1",
        tenantId: "tenant-personal",
        role: "admin",
      });
    });

    it("should NOT use personal account fallback for GitLab (only GitHub)", async () => {
      mockGetUserOrganizations.mockResolvedValue([]);

      await service.autoLinkOrganizations(
        { id: "usr_1", tenantId: null },
        "gitlab",
        "access-token",
        null,
        "myuser",
        testContext
      );

      // No fallback for GitLab — zero orgs means nothing to link
      expect(mockFindByOrgNameAndProvider).not.toHaveBeenCalled();
      expect(mockSwitchUserOrganization).not.toHaveBeenCalled();
    });

    it("should work for gitlab provider using createFromGitLabGroup", async () => {
      const gitlabTenant = createTestTenant({
        id: "tenant-gitlab",
        orgName: "gitlab-org",
        provider: "gitlab",
      });
      mockGetUserOrganizations.mockResolvedValue([{ login: "gitlab-org" }]);
      mockFindByOrgNameAndProvider.mockResolvedValue(null);
      mockCreateFromGitLabGroup.mockResolvedValue(gitlabTenant);
      mockAddUserOrganization.mockResolvedValue(undefined);
      mockSwitchUserOrganization.mockResolvedValue(null);

      await service.autoLinkOrganizations(
        { id: "usr_1", tenantId: null },
        "gitlab",
        "access-token",
        null,
        "myuser",
        testContext
      );

      expect(mockGetOAuthAdapter).toHaveBeenCalledWith("gitlab");
      expect(mockFindByOrgNameAndProvider).toHaveBeenCalledWith("gitlab-org", "gitlab");
      expect(mockCreateFromGitLabGroup).toHaveBeenCalledWith({ gitlabGroupPath: "gitlab-org" });
      expect(mockAddUserOrganization).toHaveBeenCalledWith({
        userId: "usr_1",
        tenantId: "tenant-gitlab",
        role: "admin",
      });
    });

    it("should pass instanceUrl and context to getUserOrganizations", async () => {
      mockGetUserOrganizations.mockResolvedValue([]);

      await service.autoLinkOrganizations(
        { id: "usr_1", tenantId: null },
        "github",
        "my-access-token",
        "https://github.example.com",
        "testuser",
        testContext
      );

      expect(mockGetUserOrganizations).toHaveBeenCalledWith(
        "my-access-token",
        "https://github.example.com",
        testContext
      );
    });
  });

  // ==================================================================
  // processOrgMembership — plan limit enforcement (GAP-3)
  // ==================================================================

  describe("processOrgMembership plan limit enforcement", () => {
    // These tests exercise processOrgMembership through autoLinkOrganizations,
    // since processOrgMembership is an internal function.
    // The logic under test:
    //   const shouldCheckLimit = !isNew || (await countTenantMembers(tenant.id)) > 0;

    /**
     * Helper: sets up mocks for a single-org autoLinkOrganizations call.
     * The org will either map to a new or existing tenant based on `tenantExists`.
     */
    const setupSingleOrgScenario = (options: {
      readonly tenantExists: boolean;
      readonly tenantId: string;
      readonly orgLogin: string;
    }) => {
      const tenant = createTestTenant({
        id: options.tenantId,
        orgName: options.orgLogin,
      });

      mockGetUserOrganizations.mockResolvedValue([{ login: options.orgLogin }]);
      mockAddUserOrganization.mockResolvedValue(undefined);
      mockSwitchUserOrganization.mockResolvedValue(null);
      // First call (pre-link) returns [], second call (post-link orphan check)
      // returns the membership so it doesn't appear orphaned
      mockFindOrganizationsByUser
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ tenantId: options.tenantId, provider: "github" }]);

      if (options.tenantExists) {
        mockFindByOrgNameAndProvider.mockResolvedValue(tenant);
      } else {
        mockFindByOrgNameAndProvider.mockResolvedValue(null);
        mockCreateFromGitHubLogin.mockResolvedValue(tenant);
      }
    };

    it("should skip plan limit check for new tenant with 0 existing members (first user)", async () => {
      setupSingleOrgScenario({
        tenantExists: false,
        tenantId: "tenant-new",
        orgLogin: "new-org",
      });
      // New tenant, 0 members -> shouldCheckLimit = false
      mockCountTenantMembers.mockResolvedValue(0);
      mockFindUserOrgRole.mockResolvedValue(null);

      await service.autoLinkOrganizations(
        { id: "usr_1", tenantId: null },
        "github",
        "access-token",
        null,
        "testuser",
        testContext
      );

      // countTenantMembers IS called (to evaluate the conditional)
      expect(mockCountTenantMembers).toHaveBeenCalledWith("tenant-new");
      // But checkPlanLimit should NOT be called since shouldCheckLimit is false
      expect(mockCheckPlanLimit).not.toHaveBeenCalled();
      // Membership should be added (first user always allowed)
      expect(mockAddUserOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "usr_1",
          tenantId: "tenant-new",
        })
      );
    });

    it("should check plan limit for new tenant with 1+ existing members and skip membership when denied", async () => {
      setupSingleOrgScenario({
        tenantExists: false,
        tenantId: "tenant-new-full",
        orgLogin: "full-org",
      });
      // New tenant but 1 member already exists -> shouldCheckLimit = true
      mockCountTenantMembers.mockResolvedValue(1);
      mockFindUserOrgRole.mockResolvedValue(null);
      // Plan limit check denies: team is full
      mockCheckPlanLimit.mockResolvedValue({
        allowed: false,
        currentUsage: 5,
        limit: 5,
      });

      await service.autoLinkOrganizations(
        { id: "usr_2", tenantId: null },
        "github",
        "access-token",
        null,
        "testuser",
        testContext
      );

      // countTenantMembers called to evaluate the conditional
      expect(mockCountTenantMembers).toHaveBeenCalledWith("tenant-new-full");
      // checkPlanLimit should be called since shouldCheckLimit is true
      expect(mockCheckPlanLimit).toHaveBeenCalledWith("tenant-new-full", "max_team_members");
      // Membership should NOT be added because limit check denied
      expect(mockAddUserOrganization).not.toHaveBeenCalled();
    });

    it("should check plan limit for new tenant with 1+ existing members and add membership when allowed", async () => {
      setupSingleOrgScenario({
        tenantExists: false,
        tenantId: "tenant-new-ok",
        orgLogin: "ok-org",
      });
      // New tenant with 1 existing member -> shouldCheckLimit = true
      mockCountTenantMembers.mockResolvedValue(1);
      mockFindUserOrgRole.mockResolvedValue(null);
      // Plan limit check allows
      mockCheckPlanLimit.mockResolvedValue({
        allowed: true,
        currentUsage: 1,
        limit: 5,
      });

      await service.autoLinkOrganizations(
        { id: "usr_3", tenantId: null },
        "github",
        "access-token",
        null,
        "testuser",
        testContext
      );

      expect(mockCountTenantMembers).toHaveBeenCalledWith("tenant-new-ok");
      expect(mockCheckPlanLimit).toHaveBeenCalledWith("tenant-new-ok", "max_team_members");
      // Membership added because limit check passed
      expect(mockAddUserOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "usr_3",
          tenantId: "tenant-new-ok",
        })
      );
    });

    it("should always check plan limit for existing tenant (isNew=false)", async () => {
      setupSingleOrgScenario({
        tenantExists: true,
        tenantId: "tenant-existing",
        orgLogin: "existing-org",
      });
      mockFindUserOrgRole.mockResolvedValue(null);
      // Limit check allows
      mockCheckPlanLimit.mockResolvedValue({
        allowed: true,
        currentUsage: 3,
        limit: 10,
      });

      await service.autoLinkOrganizations(
        { id: "usr_4", tenantId: null },
        "github",
        "access-token",
        null,
        "testuser",
        testContext
      );

      // For existing tenants, shouldCheckLimit = true without checking countTenantMembers
      // (the !isNew short-circuit evaluates to true immediately)
      expect(mockCheckPlanLimit).toHaveBeenCalledWith("tenant-existing", "max_team_members");
      expect(mockAddUserOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "usr_4",
          tenantId: "tenant-existing",
        })
      );
    });

    it("should always check plan limit for existing tenant and skip membership when denied", async () => {
      setupSingleOrgScenario({
        tenantExists: true,
        tenantId: "tenant-full",
        orgLogin: "full-existing-org",
      });
      mockFindUserOrgRole.mockResolvedValue(null);
      // Limit check denies
      mockCheckPlanLimit.mockResolvedValue({
        allowed: false,
        currentUsage: 10,
        limit: 10,
      });

      await service.autoLinkOrganizations(
        { id: "usr_5", tenantId: null },
        "github",
        "access-token",
        null,
        "testuser",
        testContext
      );

      expect(mockCheckPlanLimit).toHaveBeenCalledWith("tenant-full", "max_team_members");
      // Membership should NOT be added because team is full
      expect(mockAddUserOrganization).not.toHaveBeenCalled();
    });

    it("should skip plan limit check when user already has a membership (existing member)", async () => {
      setupSingleOrgScenario({
        tenantExists: true,
        tenantId: "tenant-has-member",
        orgLogin: "member-org",
      });
      // User already has a role in this tenant
      mockFindUserOrgRole.mockResolvedValue("member");

      await service.autoLinkOrganizations(
        { id: "usr_6", tenantId: null },
        "github",
        "access-token",
        null,
        "testuser",
        testContext
      );

      // checkPlanLimit should NOT be called because existingMembership is truthy
      expect(mockCheckPlanLimit).not.toHaveBeenCalled();
      // But addUserOrganization IS called (upsert/idempotent)
      expect(mockAddUserOrganization).toHaveBeenCalled();
    });

    it("should fail-open when checkPlanLimit throws an error", async () => {
      setupSingleOrgScenario({
        tenantExists: true,
        tenantId: "tenant-limit-error",
        orgLogin: "error-org",
      });
      mockFindUserOrgRole.mockResolvedValue(null);
      // Plan limit check throws (e.g., database error)
      mockCheckPlanLimit.mockRejectedValue(new Error("Database connection failed"));

      await service.autoLinkOrganizations(
        { id: "usr_7", tenantId: null },
        "github",
        "access-token",
        null,
        "testuser",
        testContext
      );

      // Should still add membership (fail-open policy)
      expect(mockAddUserOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "usr_7",
          tenantId: "tenant-limit-error",
        })
      );
    });
  });

  // ==================================================================
  // generateTokenPair
  // ==================================================================

  describe("generateTokenPair", () => {
    it("should create access and refresh tokens and store the refresh hash", async () => {
      const user = createTestUser();
      const storedRefreshToken = createTestRefreshToken();
      mockCreateRefreshToken.mockResolvedValue(storedRefreshToken);

      const result = await service.generateTokenPair(user, testTokenMeta, testContext);

      expect(result.accessToken).toBe("mock-access-token");
      expect(result.refreshToken).toBe("mock-raw-refresh-token");
      expect(result.expiresIn).toBe(300); // JWT_CONFIG.ACCESS_TOKEN_EXPIRY_SECONDS

      expect(mockGenerateAccessToken).toHaveBeenCalled();
      expect(mockGenerateRefreshToken).toHaveBeenCalled();
      expect(mockHashRefreshToken).toHaveBeenCalledWith("mock-raw-refresh-token");
    });

    it("should store the token hash (not raw token) in the database", async () => {
      const user = createTestUser();
      mockCreateRefreshToken.mockResolvedValue(createTestRefreshToken());

      await service.generateTokenPair(user, testTokenMeta, testContext);

      const createCall = mockCreateRefreshToken.mock.calls[0]![0] as Record<string, unknown>;
      expect(createCall.tokenHash).toBe("mock-hashed-refresh-token");
      expect(createCall.userId).toBe(user.id);
      expect(createCall.userAgent).toBe(testTokenMeta.userAgent);
      expect(createCall.ipAddress).toBe(testTokenMeta.ipAddress);
    });

    it("should create a new familyId (UUID) for each token pair", async () => {
      const user = createTestUser();
      mockCreateRefreshToken.mockResolvedValue(createTestRefreshToken());

      await service.generateTokenPair(user, testTokenMeta, testContext);

      const createCall = mockCreateRefreshToken.mock.calls[0]![0] as Record<string, unknown>;
      // familyId should be a UUID string
      expect(typeof createCall.familyId).toBe("string");
      expect((createCall.familyId as string).length).toBeGreaterThan(0);
    });

    it("should return ACCESS_TOKEN_EXPIRY_SECONDS as expiresIn", async () => {
      const user = createTestUser();
      mockCreateRefreshToken.mockResolvedValue(createTestRefreshToken());

      const result = await service.generateTokenPair(user, testTokenMeta, testContext);

      expect(result.expiresIn).toBe(300);
    });

    it("should handle null userAgent and ipAddress in meta", async () => {
      const user = createTestUser();
      mockCreateRefreshToken.mockResolvedValue(createTestRefreshToken());

      const nullMeta: TokenMeta = { userAgent: null, ipAddress: null };

      await service.generateTokenPair(user, nullMeta, testContext);

      const createCall = mockCreateRefreshToken.mock.calls[0]![0] as Record<string, unknown>;
      expect(createCall.userAgent).toBeNull();
      expect(createCall.ipAddress).toBeNull();
    });
  });

  // ==================================================================
  // refreshTokens
  // ==================================================================

  describe("refreshTokens", () => {
    it("should rotate refresh token and return new token pair", async () => {
      const oldToken = createTestRefreshToken();
      const newToken = createTestRefreshToken({ id: "rtk_new-token" });
      const user = createTestUser();

      mockRotateRefreshTokenAtomically.mockResolvedValue({
        status: "rotated",
        oldToken,
        newToken,
      });
      mockFindUserById.mockResolvedValue(user);
      mockGenerateAccessToken.mockReturnValue("new-access-token");
      mockGenerateRefreshToken.mockReturnValue("new-raw-refresh-token");
      mockHashRefreshToken.mockReturnValue("new-hashed-token");

      const result = await service.refreshTokens(
        "old-raw-refresh-token",
        testTokenMeta,
        testContext
      );

      expect(result.accessToken).toBe("new-access-token");
      expect(result.refreshToken).toBe("new-raw-refresh-token");
      expect(result.expiresIn).toBe(300);
    });

    it("should call rotateRefreshTokenAtomically with hashed tokens and meta", async () => {
      const oldToken = createTestRefreshToken();
      const newToken = createTestRefreshToken({ id: "rtk_new" });
      const user = createTestUser();

      mockHashRefreshToken.mockReturnValueOnce("hashed-current").mockReturnValueOnce("hashed-new");
      mockGenerateRefreshToken.mockReturnValue("new-raw-token");
      mockRotateRefreshTokenAtomically.mockResolvedValue({
        status: "rotated",
        oldToken,
        newToken,
      });
      mockFindUserById.mockResolvedValue(user);

      const meta: TokenMeta = { userAgent: "Chrome/120", ipAddress: "10.0.0.1" };
      await service.refreshTokens("raw-token", meta, testContext);

      expect(mockRotateRefreshTokenAtomically).toHaveBeenCalledWith({
        tokenHash: "hashed-current",
        newTokenHash: "hashed-new",
        userAgent: "Chrome/120",
        ipAddress: "10.0.0.1",
      });
    });

    it("should throw AuthenticationError when refresh token is not found (invalid/expired)", async () => {
      mockRotateRefreshTokenAtomically.mockResolvedValue(null);

      await expect(
        service.refreshTokens("unknown-token", testTokenMeta, testContext)
      ).rejects.toThrow(AuthenticationError);

      mockRotateRefreshTokenAtomically.mockResolvedValue(null);

      await expect(
        service.refreshTokens("unknown-token", testTokenMeta, testContext)
      ).rejects.toThrow("Invalid or expired refresh token");
    });

    it("should throw AuthenticationError on reuse detection (atomic rotation handles family revocation)", async () => {
      const revokedToken = createTestRefreshToken({
        revokedAt: new Date("2025-01-15T00:00:00Z"),
        familyId: "compromised-family",
      });

      mockRotateRefreshTokenAtomically.mockResolvedValue({
        status: "reused",
        oldToken: revokedToken,
      });

      await expect(
        service.refreshTokens("reused-token", testTokenMeta, testContext)
      ).rejects.toThrow(AuthenticationError);
    });

    it("should throw AuthenticationError with correct message on reuse detection", async () => {
      const revokedToken = createTestRefreshToken({ revokedAt: new Date() });

      mockRotateRefreshTokenAtomically.mockResolvedValue({
        status: "reused",
        oldToken: revokedToken,
      });

      await expect(
        service.refreshTokens("reused-token", testTokenMeta, testContext)
      ).rejects.toThrow("Refresh token reuse detected");
    });

    it("should throw AuthenticationError when user is not found for the refresh token", async () => {
      const oldToken = createTestRefreshToken();
      const newToken = createTestRefreshToken({ id: "rtk_new" });

      mockRotateRefreshTokenAtomically.mockResolvedValue({
        status: "rotated",
        oldToken,
        newToken,
      });
      mockFindUserById.mockResolvedValue(null);

      await expect(service.refreshTokens("raw-token", testTokenMeta, testContext)).rejects.toThrow(
        "User not found for refresh token"
      );
    });

    it("should throw AuthenticationError when user account is suspended", async () => {
      const oldToken = createTestRefreshToken();
      const newToken = createTestRefreshToken({ id: "rtk_new" });
      const suspendedUser = createTestUser({ status: "suspended" });

      mockRotateRefreshTokenAtomically.mockResolvedValue({
        status: "rotated",
        oldToken,
        newToken,
      });
      mockFindUserById.mockResolvedValue(suspendedUser);

      await expect(service.refreshTokens("raw-token", testTokenMeta, testContext)).rejects.toThrow(
        "User account is not active"
      );
    });

    it("should throw AuthenticationError when user account is deleted", async () => {
      const oldToken = createTestRefreshToken();
      const newToken = createTestRefreshToken({ id: "rtk_new" });
      const deletedUser = createTestUser({ status: "deleted" });

      mockRotateRefreshTokenAtomically.mockResolvedValue({
        status: "rotated",
        oldToken,
        newToken,
      });
      mockFindUserById.mockResolvedValue(deletedUser);

      await expect(service.refreshTokens("raw-token", testTokenMeta, testContext)).rejects.toThrow(
        "User account is not active"
      );
    });

    it("should not call findUserById when reuse is detected (abort early)", async () => {
      const revokedToken = createTestRefreshToken({ revokedAt: new Date() });

      mockRotateRefreshTokenAtomically.mockResolvedValue({
        status: "reused",
        oldToken: revokedToken,
      });

      await expect(
        service.refreshTokens("reused-token", testTokenMeta, testContext)
      ).rejects.toThrow(AuthenticationError);

      expect(mockFindUserById).not.toHaveBeenCalled();
    });

    it("should pass meta (userAgent, ipAddress) to atomic rotation", async () => {
      const oldToken = createTestRefreshToken();
      const newToken = createTestRefreshToken({ id: "rtk_new" });
      const user = createTestUser();

      mockRotateRefreshTokenAtomically.mockResolvedValue({
        status: "rotated",
        oldToken,
        newToken,
      });
      mockFindUserById.mockResolvedValue(user);

      const meta: TokenMeta = {
        userAgent: "Chrome/120",
        ipAddress: "10.0.0.1",
      };

      await service.refreshTokens("raw-token", meta, testContext);

      const call = mockRotateRefreshTokenAtomically.mock.calls[0]![0] as Record<string, unknown>;
      expect(call.userAgent).toBe("Chrome/120");
      expect(call.ipAddress).toBe("10.0.0.1");
    });
  });

  // ==================================================================
  // revokeUserTokens
  // ==================================================================

  describe("revokeUserTokens", () => {
    it("should revoke the entire token family when token is found", async () => {
      const storedToken = createTestRefreshToken({ familyId: "family-to-revoke" });

      mockFindRefreshTokenByHash.mockResolvedValue(storedToken);
      mockRevokeTokenFamily.mockResolvedValue(undefined);

      await service.revokeUserTokens("raw-token-to-revoke", testContext);

      expect(mockRevokeTokenFamily).toHaveBeenCalledWith("family-to-revoke");
    });

    it("should silently succeed when token is not found (idempotent)", async () => {
      mockFindRefreshTokenByHash.mockResolvedValue(null);

      // Should not throw
      await service.revokeUserTokens("already-expired-token", testContext);

      expect(mockRevokeTokenFamily).not.toHaveBeenCalled();
    });

    it("should hash the raw token before looking it up", async () => {
      mockHashRefreshToken.mockReturnValue("expected-hash");
      mockFindRefreshTokenByHash.mockResolvedValue(null);

      await service.revokeUserTokens("my-raw-token", testContext);

      expect(mockHashRefreshToken).toHaveBeenCalledWith("my-raw-token");
      expect(mockFindRefreshTokenByHash).toHaveBeenCalledWith("expected-hash");
    });
  });

  // ==================================================================
  // Service Factory
  // ==================================================================

  describe("createAuthService (factory)", () => {
    it("should return an object with all expected methods", () => {
      const authService = createAuthService();

      expect(typeof authService.findOrCreateUser).toBe("function");
      expect(typeof authService.autoLinkOrganizations).toBe("function");
      expect(typeof authService.generateTokenPair).toBe("function");
      expect(typeof authService.refreshTokens).toBe("function");
      expect(typeof authService.revokeUserTokens).toBe("function");
    });

    it("should create independent instances", () => {
      const service1 = createAuthService();
      const service2 = createAuthService();

      expect(service1).not.toBe(service2);
      expect(service1.findOrCreateUser).not.toBe(service2.findOrCreateUser);
    });
  });
});

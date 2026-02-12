/**
 * Unit tests for services/authService.ts
 *
 * Tests the auth service factory and all its methods:
 * - findOrCreateUser: OAuth identity lookup, email linking, user creation
 * - autoLinkTenant: org-based tenant auto-linking
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
} from "@kenchi/shared";
import type { TokenMeta } from "../../services/authServiceTypes.js";

// ==================== Mock Functions ====================

// Repository mocks
const mockFindOAuthIdentity = jest.fn<(...args: unknown[]) => Promise<OAuthIdentity | null>>();
const mockFindUserById = jest.fn<(...args: unknown[]) => Promise<User | null>>();
const mockFindUserByEmail = jest.fn<(...args: unknown[]) => Promise<User | null>>();
const mockCreateUser = jest.fn<(...args: unknown[]) => Promise<User>>();
const mockUpdateLastLogin = jest.fn<(...args: unknown[]) => Promise<User>>();
const mockUpdateUserTenant = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockUpsertOAuthIdentity = jest.fn<(...args: unknown[]) => Promise<OAuthIdentity>>();
const mockCreateRefreshToken = jest.fn<(...args: unknown[]) => Promise<RefreshToken>>();
const mockFindRefreshTokenByHash = jest.fn<(...args: unknown[]) => Promise<RefreshToken | null>>();
const mockRevokeTokenFamily = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockReplaceRefreshToken = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockRotateRefreshTokenAtomically = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFindByGitHubOrg = jest.fn<(...args: unknown[]) => Promise<{ id: string } | null>>();

// JWT mocks
const mockGenerateAccessToken = jest.fn<(...args: unknown[]) => string>();
const mockGenerateRefreshToken = jest.fn<(...args: unknown[]) => string>();
const mockHashRefreshToken = jest.fn<(...args: unknown[]) => string>();

// Adapter mock
const mockGetUserOrganizations =
  jest.fn<(...args: unknown[]) => Promise<ReadonlyArray<{ login: string }>>>();
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
    updateUserTenant: (...args: unknown[]) => mockUpdateUserTenant(...args),
    upsertOAuthIdentity: (...args: unknown[]) => mockUpsertOAuthIdentity(...args),
    createRefreshToken: (...args: unknown[]) => mockCreateRefreshToken(...args),
    findRefreshTokenByHash: (...args: unknown[]) => mockFindRefreshTokenByHash(...args),
    revokeTokenFamily: (...args: unknown[]) => mockRevokeTokenFamily(...args),
    replaceRefreshToken: (...args: unknown[]) => mockReplaceRefreshToken(...args),
    rotateRefreshTokenAtomically: (...args: unknown[]) => mockRotateRefreshTokenAtomically(...args),
    findByGitHubOrg: (...args: unknown[]) => mockFindByGitHubOrg(...args),
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
  // autoLinkTenant
  // ==================================================================

  describe("autoLinkTenant", () => {
    it("should skip silently for non-org-capable providers (bitbucket)", async () => {
      await service.autoLinkTenant(
        { id: "usr_1", tenantId: null },
        "bitbucket",
        "access-token",
        null,
        testContext
      );

      expect(mockGetOAuthAdapter).not.toHaveBeenCalled();
      expect(mockFindByGitHubOrg).not.toHaveBeenCalled();
    });

    it("should skip silently for non-org-capable providers (azure_devops)", async () => {
      await service.autoLinkTenant(
        { id: "usr_1", tenantId: null },
        "azure_devops",
        "access-token",
        null,
        testContext
      );

      expect(mockGetOAuthAdapter).not.toHaveBeenCalled();
    });

    it("should skip silently when user already has a tenantId", async () => {
      await service.autoLinkTenant(
        { id: "usr_1", tenantId: "existing-tenant" },
        "github",
        "access-token",
        null,
        testContext
      );

      expect(mockGetOAuthAdapter).not.toHaveBeenCalled();
    });

    it("should link user to tenant when matching org is found", async () => {
      mockGetUserOrganizations.mockResolvedValue([{ login: "acme-corp" }, { login: "other-org" }]);
      mockFindByGitHubOrg.mockResolvedValueOnce({ id: "tenant-acme" });

      await service.autoLinkTenant(
        { id: "usr_1", tenantId: null },
        "github",
        "access-token",
        null,
        testContext
      );

      expect(mockUpdateUserTenant).toHaveBeenCalledWith("usr_1", "tenant-acme");
    });

    it("should stop at first matching org (early exit)", async () => {
      mockGetUserOrganizations.mockResolvedValue([{ login: "first-org" }, { login: "second-org" }]);
      mockFindByGitHubOrg.mockResolvedValueOnce({ id: "tenant-first" });

      await service.autoLinkTenant(
        { id: "usr_1", tenantId: null },
        "github",
        "access-token",
        null,
        testContext
      );

      // Should only look up the first org since it matched
      expect(mockFindByGitHubOrg).toHaveBeenCalledTimes(1);
      expect(mockFindByGitHubOrg).toHaveBeenCalledWith("first-org");
      expect(mockUpdateUserTenant).toHaveBeenCalledTimes(1);
    });

    it("should not link tenant when no matching org is found", async () => {
      mockGetUserOrganizations.mockResolvedValue([{ login: "unknown-org" }]);
      mockFindByGitHubOrg.mockResolvedValue(null);

      await service.autoLinkTenant(
        { id: "usr_1", tenantId: null },
        "github",
        "access-token",
        null,
        testContext
      );

      expect(mockUpdateUserTenant).not.toHaveBeenCalled();
    });

    it("should not link tenant when user has zero organizations", async () => {
      mockGetUserOrganizations.mockResolvedValue([]);

      await service.autoLinkTenant(
        { id: "usr_1", tenantId: null },
        "github",
        "access-token",
        null,
        testContext
      );

      expect(mockFindByGitHubOrg).not.toHaveBeenCalled();
      expect(mockUpdateUserTenant).not.toHaveBeenCalled();
    });

    it("should work for gitlab provider (org-capable)", async () => {
      mockGetUserOrganizations.mockResolvedValue([{ login: "gitlab-org" }]);
      mockFindByGitHubOrg.mockResolvedValue({ id: "tenant-gitlab" });

      await service.autoLinkTenant(
        { id: "usr_1", tenantId: null },
        "gitlab",
        "access-token",
        null,
        testContext
      );

      expect(mockGetOAuthAdapter).toHaveBeenCalledWith("gitlab");
      expect(mockUpdateUserTenant).toHaveBeenCalledWith("usr_1", "tenant-gitlab");
    });

    it("should pass instanceUrl and context to getUserOrganizations", async () => {
      mockGetUserOrganizations.mockResolvedValue([]);

      await service.autoLinkTenant(
        { id: "usr_1", tenantId: null },
        "github",
        "my-access-token",
        "https://github.example.com",
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
      expect(result.expiresIn).toBe(900); // JWT_CONFIG.ACCESS_TOKEN_EXPIRY_SECONDS

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

      expect(result.expiresIn).toBe(900);
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
      expect(result.expiresIn).toBe(900);
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
      expect(typeof authService.autoLinkTenant).toBe("function");
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

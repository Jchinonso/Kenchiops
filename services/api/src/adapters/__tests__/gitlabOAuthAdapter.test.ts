/**
 * Unit tests for adapters/gitlabOAuthAdapter.ts
 *
 * Tests the GitLab OAuth adapter implementing OAuthPort:
 * - exchangeCode: authorization code to token exchange
 * - getUserProfile: GitLab user profile fetch
 * - getUserOrganizations: GitLab group memberships with role detection
 *
 * Covers success paths, error classification (retryable vs non-retryable),
 * self-hosted URL resolution, missing credentials, and network errors.
 *
 * Mocks global.fetch and @kenchi/shared config at module level.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { RequestContext, OAuthTokenResponse, OAuthProviderProfile } from "@kenchi/shared";

// ==================== Mock Functions ====================

const mockFetch = jest.fn<typeof global.fetch>();

// ==================== Module Mocks ====================

jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    config: {
      GITLAB_OAUTH_CLIENT_ID: "test-gitlab-client-id",
      GITLAB_OAUTH_CLIENT_SECRET: "test-gitlab-client-secret",
      OAUTH_CALLBACK_BASE_URL: "http://localhost:3001",
    },
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  };
});

// Replace global.fetch with mock
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch as unknown as typeof global.fetch;
});

// Import after mock setup
import { gitlabOAuthAdapter } from "../gitlabOAuthAdapter.js";
import {
  ExternalServiceError,
  ValidationError,
  OAUTH_PROVIDER_URLS,
  SELF_HOSTED_URL_PATTERNS,
} from "@kenchi/shared";

// ==================== Test Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const createGitLabTokenResponse = (overrides: Record<string, unknown> = {}) => ({
  access_token: "glab-test-access-token",
  token_type: "Bearer",
  expires_in: 7200,
  refresh_token: "glab-test-refresh-token",
  scope: "read_user read_api",
  created_at: 1700000000,
  ...overrides,
});

const createGitLabUserProfile = (overrides: Record<string, unknown> = {}) => ({
  id: 12345,
  username: "gitlab-user",
  name: "GitLab User",
  email: "user@gitlab.com",
  avatar_url: "https://gitlab.com/uploads/avatar.png",
  state: "active",
  web_url: "https://gitlab.com/gitlab-user",
  confirmed_at: "2024-01-01T00:00:00.000Z",
  ...overrides,
});

const createGitLabGroups = () => [
  {
    id: 1,
    name: "Engineering",
    path: "engineering",
    full_path: "acme/engineering",
    web_url: "https://gitlab.com/groups/acme/engineering",
  },
  {
    id: 2,
    name: "Platform",
    path: "platform",
    full_path: "acme/platform",
    web_url: "https://gitlab.com/groups/acme/platform",
  },
];

const createFetchResponse = (data: unknown, status = 200, ok = true): Response =>
  ({
    ok,
    status,
    json: jest.fn<() => Promise<unknown>>().mockResolvedValue(data),
    headers: new Headers(),
  }) as unknown as Response;

// ==================== Tests ====================

describe("gitlabOAuthAdapter", () => {
  describe("exchangeCode", () => {
    it("should exchange authorization code for tokens on cloud instance", async () => {
      const tokenData = createGitLabTokenResponse();
      mockFetch.mockResolvedValueOnce(createFetchResponse(tokenData));

      const result = await gitlabOAuthAdapter.exchangeCode("test-code", null, testContext);

      expect(result).toEqual<OAuthTokenResponse>({
        accessToken: "glab-test-access-token",
        refreshToken: "glab-test-refresh-token",
        expiresIn: 7200,
        scope: "read_user read_api",
        tokenType: "Bearer",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        OAUTH_PROVIDER_URLS.gitlab.token,
        expect.objectContaining({
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: "test-gitlab-client-id",
            client_secret: "test-gitlab-client-secret",
            code: "test-code",
            grant_type: "authorization_code",
            redirect_uri: "http://localhost:3001/auth/gitlab/callback",
          }).toString(),
        })
      );
    });

    it("should use self-hosted URL when instanceUrl is provided", async () => {
      const tokenData = createGitLabTokenResponse();
      mockFetch.mockResolvedValueOnce(createFetchResponse(tokenData));
      const instanceUrl = "https://gitlab.acme.com";

      await gitlabOAuthAdapter.exchangeCode("test-code", instanceUrl, testContext);

      expect(mockFetch).toHaveBeenCalledWith(
        SELF_HOSTED_URL_PATTERNS.gitlab.token(instanceUrl),
        expect.objectContaining({ method: "POST" })
      );
    });

    it("should throw ValidationError when client credentials are missing", async () => {
      // Override config to remove credentials
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: Record<string, string | undefined>;
      };
      const originalId = config.GITLAB_OAUTH_CLIENT_ID;
      config.GITLAB_OAUTH_CLIENT_ID = undefined;

      await expect(gitlabOAuthAdapter.exchangeCode("test-code", null, testContext)).rejects.toThrow(
        ValidationError
      );

      // Restore
      config.GITLAB_OAUTH_CLIENT_ID = originalId;
    });

    it("should throw non-retryable ExternalServiceError when response contains error field", async () => {
      const errorData = createGitLabTokenResponse({
        error: "invalid_grant",
        error_description: "The authorization code has expired",
      });
      mockFetch.mockResolvedValueOnce(createFetchResponse(errorData));

      try {
        await gitlabOAuthAdapter.exchangeCode("expired-code", null, testContext);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.message).toContain("The authorization code has expired");
        expect(extError.retryable).toBe(false);
      }
    });

    it("should throw retryable ExternalServiceError on 500 status", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse({}, 500, false));

      try {
        await gitlabOAuthAdapter.exchangeCode("test-code", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(true);
      }
    });

    it("should throw retryable ExternalServiceError on 429 status", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse({}, 429, false));

      try {
        await gitlabOAuthAdapter.exchangeCode("test-code", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(true);
      }
    });

    it("should throw non-retryable ExternalServiceError on 401 status", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse({}, 401, false));

      try {
        await gitlabOAuthAdapter.exchangeCode("test-code", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(false);
      }
    });

    it("should throw retryable ExternalServiceError on network error", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

      try {
        await gitlabOAuthAdapter.exchangeCode("test-code", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(true);
      }
    });

    it("should use error field as message when error_description is absent", async () => {
      const errorData = createGitLabTokenResponse({
        error: "invalid_client",
        error_description: undefined,
      });
      mockFetch.mockResolvedValueOnce(createFetchResponse(errorData));

      try {
        await gitlabOAuthAdapter.exchangeCode("test-code", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.message).toContain("invalid_client");
      }
    });
  });

  describe("getUserProfile", () => {
    it("should fetch and map user profile correctly", async () => {
      const profileData = createGitLabUserProfile();
      mockFetch.mockResolvedValueOnce(createFetchResponse(profileData));

      const result = await gitlabOAuthAdapter.getUserProfile(
        "test-access-token",
        null,
        testContext
      );

      expect(result).toEqual<OAuthProviderProfile>({
        providerUserId: "12345",
        username: "gitlab-user",
        email: "user@gitlab.com",
        emailVerified: true,
        displayName: "GitLab User",
        avatarUrl: "https://gitlab.com/uploads/avatar.png",
        rawProfile: profileData,
      });
    });

    it("should send Bearer authorization header", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse(createGitLabUserProfile()));

      await gitlabOAuthAdapter.getUserProfile("my-token", null, testContext);

      expect(mockFetch).toHaveBeenCalledWith(
        OAUTH_PROVIDER_URLS.gitlab.userProfile,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer my-token",
          }),
        })
      );
    });

    it("should use self-hosted URL when instanceUrl is provided", async () => {
      const instanceUrl = "https://gitlab.enterprise.com";
      mockFetch.mockResolvedValueOnce(createFetchResponse(createGitLabUserProfile()));

      await gitlabOAuthAdapter.getUserProfile("token", instanceUrl, testContext);

      expect(mockFetch).toHaveBeenCalledWith(
        SELF_HOSTED_URL_PATTERNS.gitlab.userProfile(instanceUrl),
        expect.any(Object)
      );
    });

    it("should handle null email in profile", async () => {
      const profileData = createGitLabUserProfile({ email: null });
      mockFetch.mockResolvedValueOnce(createFetchResponse(profileData));

      const result = await gitlabOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.email).toBeNull();
    });

    it("should fall back to username when name is null", async () => {
      const profileData = createGitLabUserProfile({ name: null });
      mockFetch.mockResolvedValueOnce(createFetchResponse(profileData));

      const result = await gitlabOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.displayName).toBe("gitlab-user");
    });

    it("should handle null avatar_url", async () => {
      const profileData = createGitLabUserProfile({ avatar_url: null });
      mockFetch.mockResolvedValueOnce(createFetchResponse(profileData));

      const result = await gitlabOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.avatarUrl).toBeNull();
    });

    it("should throw retryable ExternalServiceError on 503 status", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse({}, 503, false));

      try {
        await gitlabOAuthAdapter.getUserProfile("token", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(true);
      }
    });

    it("should throw non-retryable ExternalServiceError on 403 status", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse({}, 403, false));

      try {
        await gitlabOAuthAdapter.getUserProfile("token", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(false);
      }
    });

    it("should throw retryable ExternalServiceError on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      try {
        await gitlabOAuthAdapter.getUserProfile("token", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(true);
      }
    });

    it("should convert numeric profile id to string", async () => {
      const profileData = createGitLabUserProfile({ id: 99999 });
      mockFetch.mockResolvedValueOnce(createFetchResponse(profileData));

      const result = await gitlabOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.providerUserId).toBe("99999");
      expect(typeof result.providerUserId).toBe("string");
    });
  });

  describe("getUserOrganizations", () => {
    it("should fetch and map groups to organizations with roles", async () => {
      const groups = createGitLabGroups();
      // First call: groups list (min_access_level=10)
      mockFetch.mockResolvedValueOnce(createFetchResponse(groups));
      // Second call: admin groups (min_access_level=40) — returns empty (no admins)
      mockFetch.mockResolvedValueOnce(createFetchResponse([]));

      const result = await gitlabOAuthAdapter.getUserOrganizations("test-token", null, testContext);

      expect(result).toEqual([
        { login: "engineering", role: "developer" },
        { login: "platform", role: "developer" },
      ]);
    });

    it("should request groups with min_access_level=10 query parameter", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse([]));
      // Admin groups call also returns empty
      mockFetch.mockResolvedValueOnce(createFetchResponse([]));

      await gitlabOAuthAdapter.getUserOrganizations("token", null, testContext);

      expect(mockFetch).toHaveBeenCalledWith(
        `${OAUTH_PROVIDER_URLS.gitlab.userGroups}?min_access_level=10`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer token",
          }),
        })
      );
    });

    it("should use self-hosted URL with min_access_level param", async () => {
      const instanceUrl = "https://gitlab.internal.com";
      mockFetch.mockResolvedValueOnce(createFetchResponse([]));
      mockFetch.mockResolvedValueOnce(createFetchResponse([]));

      await gitlabOAuthAdapter.getUserOrganizations("token", instanceUrl, testContext);

      const expectedUrl = `${SELF_HOSTED_URL_PATTERNS.gitlab.userGroups(instanceUrl)}?min_access_level=10`;
      expect(mockFetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
    });

    it("should return empty array when user has no groups", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse([]));
      mockFetch.mockResolvedValueOnce(createFetchResponse([]));

      const result = await gitlabOAuthAdapter.getUserOrganizations("token", null, testContext);

      expect(result).toEqual([]);
    });

    it("should map group.path to login with role (not group.name)", async () => {
      const groups = [
        {
          id: 1,
          name: "My Group Name With Spaces",
          path: "my-group-path",
          full_path: "org/my-group-path",
          web_url: "https://gitlab.com/groups/org/my-group-path",
        },
      ];
      mockFetch.mockResolvedValueOnce(createFetchResponse(groups));
      // Admin groups returns empty — no maintainer role
      mockFetch.mockResolvedValueOnce(createFetchResponse([]));

      const result = await gitlabOAuthAdapter.getUserOrganizations("token", null, testContext);

      expect(result).toEqual([{ login: "my-group-path", role: "developer" }]);
    });

    it("should assign maintainer role to admin groups", async () => {
      const groups = createGitLabGroups();
      // Admin groups call returns "engineering" group only
      const adminGroups = [
        {
          id: 1,
          name: "Engineering",
          path: "engineering",
          full_path: "acme/engineering",
          web_url: "",
        },
      ];
      mockFetch.mockResolvedValueOnce(createFetchResponse(groups));
      mockFetch.mockResolvedValueOnce(createFetchResponse(adminGroups));

      const result = await gitlabOAuthAdapter.getUserOrganizations("test-token", null, testContext);

      expect(result).toEqual([
        { login: "engineering", role: "maintainer" },
        { login: "platform", role: "developer" },
      ]);
    });

    it("should throw retryable ExternalServiceError on 500 status", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse({}, 500, false));

      try {
        await gitlabOAuthAdapter.getUserOrganizations("token", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(true);
      }
    });

    it("should throw non-retryable ExternalServiceError on 404 status", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse({}, 404, false));

      try {
        await gitlabOAuthAdapter.getUserOrganizations("token", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(false);
      }
    });

    it("should throw retryable ExternalServiceError on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

      try {
        await gitlabOAuthAdapter.getUserOrganizations("token", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(true);
      }
    });
  });
});

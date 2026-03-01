/**
 * Unit tests for adapters/githubOAuthAdapter.ts
 *
 * Tests the GitHub OAuth adapter implementing OAuthPort:
 * - exchangeCode: authorization code to token exchange
 * - getUserProfile: parallel profile + emails fetch with email resolution
 * - getUserOrganizations: GitHub organization memberships
 *
 * Covers success paths, error classification (retryable vs non-retryable),
 * self-hosted URL resolution, missing credentials, network errors,
 * and GitHub-specific behaviors (token auth header, null refresh/expiry,
 * email priority resolution via Promise.all parallel fetch).
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
      GITHUB_OAUTH_CLIENT_ID: "test-github-client-id",
      GITHUB_OAUTH_CLIENT_SECRET: "test-github-client-secret",
      OAUTH_CALLBACK_BASE_URL: "http://localhost:5173",
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
import { githubOAuthAdapter } from "../githubOAuthAdapter.js";
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

const createGitHubTokenResponse = (overrides: Record<string, unknown> = {}) => ({
  access_token: "ghp-test-access-token",
  token_type: "bearer",
  scope: "read:user,user:email,read:org",
  ...overrides,
});

const createGitHubUserProfile = (overrides: Record<string, unknown> = {}) => ({
  id: 12345,
  login: "github-user",
  name: "GitHub User",
  email: "user@github.com",
  avatar_url: "https://avatars.githubusercontent.com/u/12345",
  ...overrides,
});

const createGitHubUserEmails = () => [
  { email: "primary@github.com", primary: true, verified: true },
  { email: "secondary@github.com", primary: false, verified: true },
  { email: "unverified@github.com", primary: false, verified: false },
];

const createGitHubOrgs = () => [{ login: "acme-corp" }, { login: "open-source-org" }];

const createFetchResponse = (data: unknown, status = 200, ok = true): Response =>
  ({
    ok,
    status,
    json: jest.fn<() => Promise<unknown>>().mockResolvedValue(data),
    headers: new Headers(),
  }) as unknown as Response;

// ==================== Tests ====================

describe("githubOAuthAdapter", () => {
  describe("exchangeCode", () => {
    it("should exchange authorization code for tokens on cloud instance", async () => {
      const tokenData = createGitHubTokenResponse();
      mockFetch.mockResolvedValueOnce(createFetchResponse(tokenData));

      const result = await githubOAuthAdapter.exchangeCode("test-code", null, testContext);

      expect(result).toEqual<OAuthTokenResponse>({
        accessToken: "ghp-test-access-token",
        refreshToken: null,
        expiresIn: null,
        scope: "read:user,user:email,read:org",
        tokenType: "bearer",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        OAUTH_PROVIDER_URLS.github.token,
        expect.objectContaining({
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: "test-github-client-id",
            client_secret: "test-github-client-secret",
            code: "test-code",
            redirect_uri: "http://localhost:5173/auth/github/callback",
          }),
        })
      );
    });

    it("should include redirect_uri but NOT grant_type in the request body", async () => {
      const tokenData = createGitHubTokenResponse();
      mockFetch.mockResolvedValueOnce(createFetchResponse(tokenData));

      await githubOAuthAdapter.exchangeCode("test-code", null, testContext);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse((fetchCall[1] as RequestInit).body as string) as Record<
        string,
        unknown
      >;

      expect(body).not.toHaveProperty("grant_type");
      expect(body).toHaveProperty("redirect_uri", "http://localhost:5173/auth/github/callback");
      expect(Object.keys(body)).toEqual(["client_id", "client_secret", "code", "redirect_uri"]);
    });

    it("should always return refreshToken as null and expiresIn as null", async () => {
      const tokenData = createGitHubTokenResponse();
      mockFetch.mockResolvedValueOnce(createFetchResponse(tokenData));

      const result = await githubOAuthAdapter.exchangeCode("test-code", null, testContext);

      expect(result.refreshToken).toBeNull();
      expect(result.expiresIn).toBeNull();
    });

    it("should use self-hosted URL when instanceUrl is provided", async () => {
      const tokenData = createGitHubTokenResponse();
      mockFetch.mockResolvedValueOnce(createFetchResponse(tokenData));
      const instanceUrl = "https://github.acme.com";

      await githubOAuthAdapter.exchangeCode("test-code", instanceUrl, testContext);

      expect(mockFetch).toHaveBeenCalledWith(
        SELF_HOSTED_URL_PATTERNS.github.token(instanceUrl),
        expect.objectContaining({ method: "POST" })
      );
    });

    it("should throw ValidationError when client credentials are missing", async () => {
      // Override config to remove credentials
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: Record<string, string | undefined>;
      };
      const originalId = config.GITHUB_OAUTH_CLIENT_ID;
      config.GITHUB_OAUTH_CLIENT_ID = undefined;

      await expect(githubOAuthAdapter.exchangeCode("test-code", null, testContext)).rejects.toThrow(
        ValidationError
      );

      // Restore
      config.GITHUB_OAUTH_CLIENT_ID = originalId;
    });

    it("should throw non-retryable ExternalServiceError when response contains error field", async () => {
      const errorData = createGitHubTokenResponse({
        error: "bad_verification_code",
        error_description: "The code passed is incorrect or expired",
      });
      mockFetch.mockResolvedValueOnce(createFetchResponse(errorData));

      try {
        await githubOAuthAdapter.exchangeCode("expired-code", null, testContext);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.message).toContain("The code passed is incorrect or expired");
        expect(extError.retryable).toBe(false);
      }
    });

    it("should use error field as message when error_description is absent", async () => {
      const errorData = createGitHubTokenResponse({
        error: "bad_verification_code",
        error_description: undefined,
      });
      mockFetch.mockResolvedValueOnce(createFetchResponse(errorData));

      try {
        await githubOAuthAdapter.exchangeCode("test-code", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.message).toContain("bad_verification_code");
      }
    });

    it("should throw retryable ExternalServiceError on 500 status", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse({}, 500, false));

      try {
        await githubOAuthAdapter.exchangeCode("test-code", null, testContext);
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
        await githubOAuthAdapter.exchangeCode("test-code", null, testContext);
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
        await githubOAuthAdapter.exchangeCode("test-code", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(false);
      }
    });

    it("should throw non-retryable ExternalServiceError on 400 status", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse({}, 400, false));

      try {
        await githubOAuthAdapter.exchangeCode("test-code", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(false);
      }
    });

    it("should throw non-retryable ExternalServiceError on 403 status", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse({}, 403, false));

      try {
        await githubOAuthAdapter.exchangeCode("test-code", null, testContext);
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
        await githubOAuthAdapter.exchangeCode("test-code", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(true);
      }
    });
  });

  describe("getUserProfile", () => {
    it("should fetch profile and emails in parallel and map correctly", async () => {
      const profileData = createGitHubUserProfile();
      const emailsData = createGitHubUserEmails();
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(profileData))
        .mockResolvedValueOnce(createFetchResponse(emailsData));

      const result = await githubOAuthAdapter.getUserProfile(
        "test-access-token",
        null,
        testContext
      );

      expect(result).toEqual<OAuthProviderProfile>({
        providerUserId: "12345",
        username: "github-user",
        email: "primary@github.com",
        emailVerified: true,
        displayName: "GitHub User",
        avatarUrl: "https://avatars.githubusercontent.com/u/12345",
        rawProfile: profileData,
      });

      // Verify both fetch calls were made (parallel via Promise.all)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should make parallel requests to profile and emails endpoints", async () => {
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(createGitHubUserProfile()))
        .mockResolvedValueOnce(createFetchResponse(createGitHubUserEmails()));

      await githubOAuthAdapter.getUserProfile("my-token", null, testContext);

      expect(mockFetch).toHaveBeenCalledWith(
        OAUTH_PROVIDER_URLS.github.userProfile,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "token my-token",
          }),
        })
      );

      expect(mockFetch).toHaveBeenCalledWith(
        OAUTH_PROVIDER_URLS.github.userEmails,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "token my-token",
          }),
        })
      );
    });

    it("should send 'token' authorization header, NOT 'Bearer'", async () => {
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(createGitHubUserProfile()))
        .mockResolvedValueOnce(createFetchResponse(createGitHubUserEmails()));

      await githubOAuthAdapter.getUserProfile("my-access-token", null, testContext);

      const firstCallHeaders = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<
        string,
        string
      >;
      const secondCallHeaders = (mockFetch.mock.calls[1][1] as RequestInit).headers as Record<
        string,
        string
      >;

      expect(firstCallHeaders.Authorization).toBe("token my-access-token");
      expect(secondCallHeaders.Authorization).toBe("token my-access-token");
      expect(firstCallHeaders.Authorization).not.toMatch(/^Bearer /);
    });

    it("should resolve email priority: primary verified email first", async () => {
      const emails = [
        { email: "secondary@example.com", primary: false, verified: true },
        { email: "primary@example.com", primary: true, verified: true },
        { email: "unverified@example.com", primary: false, verified: false },
      ];
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(createGitHubUserProfile()))
        .mockResolvedValueOnce(createFetchResponse(emails));

      const result = await githubOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.email).toBe("primary@example.com");
    });

    it("should fall back to any verified email when no primary verified exists", async () => {
      const emails = [
        { email: "only-verified@example.com", primary: false, verified: true },
        { email: "primary-unverified@example.com", primary: true, verified: false },
      ];
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(createGitHubUserProfile()))
        .mockResolvedValueOnce(createFetchResponse(emails));

      const result = await githubOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.email).toBe("only-verified@example.com");
    });

    it("should fall back to profile.email when no verified emails exist", async () => {
      const emails = [{ email: "unverified@example.com", primary: false, verified: false }];
      const profileData = createGitHubUserProfile({ email: "profile@github.com" });
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(profileData))
        .mockResolvedValueOnce(createFetchResponse(emails));

      const result = await githubOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.email).toBe("profile@github.com");
    });

    it("should return null email when no verified emails and profile.email is null", async () => {
      const emails = [{ email: "unverified@example.com", primary: false, verified: false }];
      const profileData = createGitHubUserProfile({ email: null });
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(profileData))
        .mockResolvedValueOnce(createFetchResponse(emails));

      const result = await githubOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.email).toBeNull();
    });

    it("should return null email when emails array is empty and profile.email is null", async () => {
      const profileData = createGitHubUserProfile({ email: null });
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(profileData))
        .mockResolvedValueOnce(createFetchResponse([]));

      const result = await githubOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.email).toBeNull();
    });

    it("should use profile.email when emails array is empty and profile.email exists", async () => {
      const profileData = createGitHubUserProfile({ email: "fallback@github.com" });
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(profileData))
        .mockResolvedValueOnce(createFetchResponse([]));

      const result = await githubOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.email).toBe("fallback@github.com");
    });

    it("should convert numeric profile id to string", async () => {
      const profileData = createGitHubUserProfile({ id: 99999 });
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(profileData))
        .mockResolvedValueOnce(createFetchResponse(createGitHubUserEmails()));

      const result = await githubOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.providerUserId).toBe("99999");
      expect(typeof result.providerUserId).toBe("string");
    });

    it("should use profile.name for displayName when available", async () => {
      const profileData = createGitHubUserProfile({ name: "John Doe", login: "johndoe" });
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(profileData))
        .mockResolvedValueOnce(createFetchResponse(createGitHubUserEmails()));

      const result = await githubOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.displayName).toBe("John Doe");
    });

    it("should fall back to profile.login for displayName when name is null", async () => {
      const profileData = createGitHubUserProfile({ name: null, login: "ghost-user" });
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(profileData))
        .mockResolvedValueOnce(createFetchResponse(createGitHubUserEmails()));

      const result = await githubOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.displayName).toBe("ghost-user");
    });

    it("should use self-hosted URLs when instanceUrl is provided", async () => {
      const instanceUrl = "https://github.enterprise.com";
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(createGitHubUserProfile()))
        .mockResolvedValueOnce(createFetchResponse(createGitHubUserEmails()));

      await githubOAuthAdapter.getUserProfile("token", instanceUrl, testContext);

      expect(mockFetch).toHaveBeenCalledWith(
        SELF_HOSTED_URL_PATTERNS.github.userProfile(instanceUrl),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        SELF_HOSTED_URL_PATTERNS.github.userEmails(instanceUrl),
        expect.any(Object)
      );
    });

    it("should throw retryable ExternalServiceError when profile response is 503", async () => {
      mockFetch
        .mockResolvedValueOnce(createFetchResponse({}, 503, false))
        .mockResolvedValueOnce(createFetchResponse(createGitHubUserEmails()));

      try {
        await githubOAuthAdapter.getUserProfile("token", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(true);
      }
    });

    it("should throw non-retryable ExternalServiceError when profile response is 403", async () => {
      mockFetch
        .mockResolvedValueOnce(createFetchResponse({}, 403, false))
        .mockResolvedValueOnce(createFetchResponse(createGitHubUserEmails()));

      try {
        await githubOAuthAdapter.getUserProfile("token", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(false);
      }
    });

    it("should throw ExternalServiceError when emails response is not ok", async () => {
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(createGitHubUserProfile()))
        .mockResolvedValueOnce(createFetchResponse({}, 401, false));

      try {
        await githubOAuthAdapter.getUserProfile("token", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.message).toContain("emails");
        expect(extError.retryable).toBe(false);
      }
    });

    it("should throw retryable ExternalServiceError on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      try {
        await githubOAuthAdapter.getUserProfile("token", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(true);
      }
    });
  });

  describe("getUserOrganizations", () => {
    it("should fetch and map organizations correctly", async () => {
      const orgs = createGitHubOrgs();
      mockFetch.mockResolvedValueOnce(createFetchResponse(orgs));

      const result = await githubOAuthAdapter.getUserOrganizations("test-token", null, testContext);

      expect(result).toEqual([{ login: "acme-corp" }, { login: "open-source-org" }]);
    });

    it("should send 'token' authorization header", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse([]));

      await githubOAuthAdapter.getUserOrganizations("my-token", null, testContext);

      expect(mockFetch).toHaveBeenCalledWith(
        `${OAUTH_PROVIDER_URLS.github.userOrgs}?per_page=100`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "token my-token",
          }),
        })
      );
    });

    it("should use self-hosted URL when instanceUrl is provided", async () => {
      const instanceUrl = "https://github.internal.com";
      mockFetch.mockResolvedValueOnce(createFetchResponse([]));

      await githubOAuthAdapter.getUserOrganizations("token", instanceUrl, testContext);

      expect(mockFetch).toHaveBeenCalledWith(
        `${SELF_HOSTED_URL_PATTERNS.github.userOrgs(instanceUrl)}?per_page=100`,
        expect.any(Object)
      );
    });

    it("should return empty array when user has no organizations", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse([]));

      const result = await githubOAuthAdapter.getUserOrganizations("token", null, testContext);

      expect(result).toEqual([]);
    });

    it("should map org.login to login field", async () => {
      const orgs = [
        { login: "org-with-dashes", id: 1, description: "Some org" },
        { login: "another_org", id: 2, description: null },
      ];
      mockFetch.mockResolvedValueOnce(createFetchResponse(orgs));

      const result = await githubOAuthAdapter.getUserOrganizations("token", null, testContext);

      expect(result).toEqual([{ login: "org-with-dashes" }, { login: "another_org" }]);
    });

    it("should throw retryable ExternalServiceError on 500 status", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse({}, 500, false));

      try {
        await githubOAuthAdapter.getUserOrganizations("token", null, testContext);
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
        await githubOAuthAdapter.getUserOrganizations("token", null, testContext);
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
        await githubOAuthAdapter.getUserOrganizations("token", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(false);
      }
    });

    it("should throw non-retryable ExternalServiceError on 404 status", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse({}, 404, false));

      try {
        await githubOAuthAdapter.getUserOrganizations("token", null, testContext);
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
        await githubOAuthAdapter.getUserOrganizations("token", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(true);
      }
    });
  });
});

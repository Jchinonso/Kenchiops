/**
 * Unit tests for adapters/azureDevOpsOAuthAdapter.ts
 *
 * Tests the Azure DevOps OAuth adapter implementing OAuthPort:
 * - exchangeCode: JWT bearer assertion grant type, self-hosted rejection
 * - getUserProfile: profile fetch via shared fetchProfile, self-hosted rejection
 * - getUserOrganizations: profile fetch + accounts fetch, self-hosted rejection
 *
 * Covers success paths, error classification (retryable vs non-retryable),
 * self-hosted rejection (throws ValidationError), missing credentials,
 * scope from constant, avatarUrl always null, and network errors.
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
      AZURE_DEVOPS_OAUTH_CLIENT_ID: "test-az-client-id",
      AZURE_DEVOPS_OAUTH_CLIENT_SECRET: "test-az-client-secret",
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
import { azureDevOpsOAuthAdapter } from "../azureDevOpsOAuthAdapter.js";
import { ExternalServiceError, ValidationError, OAUTH_PROVIDER_URLS } from "@kenchi/shared";

// ==================== Test Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const createAzureTokenResponse = (overrides: Record<string, unknown> = {}) => ({
  access_token: "az-test-access-token",
  token_type: "Bearer",
  expires_in: 3599,
  refresh_token: "az-test-refresh-token",
  ...overrides,
});

const createAzureUserProfile = (overrides: Record<string, unknown> = {}) => ({
  id: "azure-user-id-12345",
  displayName: "Azure User",
  emailAddress: "user@azure.com",
  publicAlias: "azureuser",
  ...overrides,
});

const createAzureAccountsResponse = (
  accounts: ReadonlyArray<{
    readonly accountId: string;
    readonly accountName: string;
    readonly accountUri: string;
  }> = [
    {
      accountId: "acc-1",
      accountName: "my-org",
      accountUri: "https://dev.azure.com/my-org",
    },
    {
      accountId: "acc-2",
      accountName: "other-org",
      accountUri: "https://dev.azure.com/other-org",
    },
  ]
) => ({
  count: accounts.length,
  value: accounts,
});

const createFetchResponse = (data: unknown, status = 200, ok = true): Response =>
  ({
    ok,
    status,
    json: jest.fn<() => Promise<unknown>>().mockResolvedValue(data),
    headers: new Headers(),
  }) as unknown as Response;

// ==================== Tests ====================

describe("azureDevOpsOAuthAdapter", () => {
  describe("exchangeCode", () => {
    it("should exchange authorization code for tokens", async () => {
      const tokenData = createAzureTokenResponse();
      mockFetch.mockResolvedValueOnce(createFetchResponse(tokenData));

      const result = await azureDevOpsOAuthAdapter.exchangeCode("test-code", null, testContext);

      const expectedScope = OAUTH_PROVIDER_URLS.azure_devops.scopes.join(" ");

      expect(result).toEqual<OAuthTokenResponse>({
        accessToken: "az-test-access-token",
        refreshToken: "az-test-refresh-token",
        expiresIn: 3599,
        scope: expectedScope,
        tokenType: "Bearer",
      });
    });

    it("should use JWT bearer assertion grant type parameters", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse(createAzureTokenResponse()));

      await azureDevOpsOAuthAdapter.exchangeCode("my-auth-code", null, testContext);

      const callArgs = mockFetch.mock.calls[0];
      const requestInit = callArgs?.[1] as RequestInit | undefined;
      const body = requestInit?.body as string;

      // Verify JWT bearer assertion parameters
      expect(body).toContain(
        "client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer"
      );
      expect(body).toContain("client_assertion=test-az-client-secret");
      expect(body).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
      expect(body).toContain("assertion=my-auth-code");
      expect(body).toContain(
        "redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fauth%2Fazure_devops%2Fcallback"
      );
    });

    it("should use URL-encoded body with correct content type", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse(createAzureTokenResponse()));

      await azureDevOpsOAuthAdapter.exchangeCode("test-code", null, testContext);

      expect(mockFetch).toHaveBeenCalledWith(
        OAUTH_PROVIDER_URLS.azure_devops.token,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/x-www-form-urlencoded",
          }),
        })
      );
    });

    it("should derive scope from OAUTH_PROVIDER_URLS constant (not from response)", async () => {
      const tokenData = createAzureTokenResponse();
      mockFetch.mockResolvedValueOnce(createFetchResponse(tokenData));

      const result = await azureDevOpsOAuthAdapter.exchangeCode("test-code", null, testContext);

      expect(result.scope).toBe(OAUTH_PROVIDER_URLS.azure_devops.scopes.join(" "));
    });

    it("should throw ValidationError when instanceUrl is provided (self-hosted)", async () => {
      await expect(
        azureDevOpsOAuthAdapter.exchangeCode(
          "test-code",
          "https://devops.internal.com",
          testContext
        )
      ).rejects.toThrow(ValidationError);

      // fetch should NOT be called
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should throw ValidationError when client credentials are missing", async () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: Record<string, string | undefined>;
      };
      const originalId = config.AZURE_DEVOPS_OAUTH_CLIENT_ID;
      config.AZURE_DEVOPS_OAUTH_CLIENT_ID = undefined;

      await expect(
        azureDevOpsOAuthAdapter.exchangeCode("test-code", null, testContext)
      ).rejects.toThrow(ValidationError);

      config.AZURE_DEVOPS_OAUTH_CLIENT_ID = originalId;
    });

    it("should throw non-retryable ExternalServiceError when response contains error field", async () => {
      const errorData = createAzureTokenResponse({
        error: "invalid_grant",
        error_description: "The authorization code has expired",
      });
      mockFetch.mockResolvedValueOnce(createFetchResponse(errorData));

      try {
        await azureDevOpsOAuthAdapter.exchangeCode("test-code", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.message).toContain("The authorization code has expired");
        expect(extError.retryable).toBe(false);
      }
    });

    it("should use error code as message when error_description is absent", async () => {
      const errorData = createAzureTokenResponse({
        error: "server_error",
        error_description: undefined,
      });
      mockFetch.mockResolvedValueOnce(createFetchResponse(errorData));

      try {
        await azureDevOpsOAuthAdapter.exchangeCode("test-code", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.message).toContain("server_error");
      }
    });

    it("should throw retryable ExternalServiceError on 500 status", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse({}, 500, false));

      try {
        await azureDevOpsOAuthAdapter.exchangeCode("test-code", null, testContext);
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
        await azureDevOpsOAuthAdapter.exchangeCode("test-code", null, testContext);
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
        await azureDevOpsOAuthAdapter.exchangeCode("test-code", null, testContext);
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
        await azureDevOpsOAuthAdapter.exchangeCode("test-code", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(true);
      }
    });
  });

  describe("getUserProfile", () => {
    it("should fetch and map user profile correctly", async () => {
      const profileData = createAzureUserProfile();
      mockFetch.mockResolvedValueOnce(createFetchResponse(profileData));

      const result = await azureDevOpsOAuthAdapter.getUserProfile("test-token", null, testContext);

      expect(result).toEqual<OAuthProviderProfile>({
        providerUserId: "azure-user-id-12345",
        username: "azureuser",
        email: "user@azure.com",
        emailVerified: true,
        displayName: "Azure User",
        avatarUrl: null,
        rawProfile: profileData,
      });
    });

    it("should always return null for avatarUrl", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse(createAzureUserProfile()));

      const result = await azureDevOpsOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.avatarUrl).toBeNull();
    });

    it("should use publicAlias as username", async () => {
      const profileData = createAzureUserProfile({ publicAlias: "my-alias" });
      mockFetch.mockResolvedValueOnce(createFetchResponse(profileData));

      const result = await azureDevOpsOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.username).toBe("my-alias");
    });

    it("should handle null emailAddress", async () => {
      const profileData = createAzureUserProfile({ emailAddress: null });
      mockFetch.mockResolvedValueOnce(createFetchResponse(profileData));

      const result = await azureDevOpsOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.email).toBeNull();
    });

    it("should call profile endpoint with api-version query parameter", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse(createAzureUserProfile()));

      await azureDevOpsOAuthAdapter.getUserProfile("my-token", null, testContext);

      const expectedUrl = `${OAUTH_PROVIDER_URLS.azure_devops.userProfile}?api-version=6.0`;
      expect(mockFetch).toHaveBeenCalledWith(
        expectedUrl,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer my-token",
          }),
        })
      );
    });

    it("should throw ValidationError when instanceUrl is provided (self-hosted)", async () => {
      await expect(
        azureDevOpsOAuthAdapter.getUserProfile("token", "https://devops.internal.com", testContext)
      ).rejects.toThrow(ValidationError);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should throw retryable ExternalServiceError on 503 status", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse({}, 503, false));

      try {
        await azureDevOpsOAuthAdapter.getUserProfile("token", null, testContext);
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
        await azureDevOpsOAuthAdapter.getUserProfile("token", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(false);
      }
    });

    it("should throw retryable ExternalServiceError on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNRESET"));

      try {
        await azureDevOpsOAuthAdapter.getUserProfile("token", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(true);
      }
    });

    it("should use id directly as providerUserId (string, not converted from number)", async () => {
      const profileData = createAzureUserProfile({ id: "guid-format-id" });
      mockFetch.mockResolvedValueOnce(createFetchResponse(profileData));

      const result = await azureDevOpsOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.providerUserId).toBe("guid-format-id");
    });
  });

  describe("getUserOrganizations", () => {
    it("should fetch profile then accounts and map to organizations", async () => {
      const profileData = createAzureUserProfile();
      const accountsData = createAzureAccountsResponse();

      // First call: fetchProfile, Second call: accounts
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(profileData))
        .mockResolvedValueOnce(createFetchResponse(accountsData));

      const result = await azureDevOpsOAuthAdapter.getUserOrganizations(
        "test-token",
        null,
        testContext
      );

      expect(result).toEqual([{ login: "my-org" }, { login: "other-org" }]);
    });

    it("should use profile.id as memberId in accounts URL", async () => {
      const profileData = createAzureUserProfile({ id: "member-id-999" });
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(profileData))
        .mockResolvedValueOnce(createFetchResponse(createAzureAccountsResponse()));

      await azureDevOpsOAuthAdapter.getUserOrganizations("my-token", null, testContext);

      // Second call should be to accounts endpoint with memberId
      const accountsCallUrl = mockFetch.mock.calls[1]?.[0];
      expect(accountsCallUrl).toBe(
        `${OAUTH_PROVIDER_URLS.azure_devops.userAccounts}?memberId=member-id-999&api-version=6.0`
      );
    });

    it("should map accountName to login (not accountId)", async () => {
      const accounts = createAzureAccountsResponse([
        {
          accountId: "id-123",
          accountName: "correct-name",
          accountUri: "https://dev.azure.com/correct-name",
        },
      ]);
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(createAzureUserProfile()))
        .mockResolvedValueOnce(createFetchResponse(accounts));

      const result = await azureDevOpsOAuthAdapter.getUserOrganizations("token", null, testContext);

      expect(result).toEqual([{ login: "correct-name" }]);
    });

    it("should return empty array when user has no accounts", async () => {
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(createAzureUserProfile()))
        .mockResolvedValueOnce(createFetchResponse(createAzureAccountsResponse([])));

      const result = await azureDevOpsOAuthAdapter.getUserOrganizations("token", null, testContext);

      expect(result).toEqual([]);
    });

    it("should throw ValidationError when instanceUrl is provided (self-hosted)", async () => {
      await expect(
        azureDevOpsOAuthAdapter.getUserOrganizations(
          "token",
          "https://devops.internal.com",
          testContext
        )
      ).rejects.toThrow(ValidationError);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should throw ExternalServiceError when profile fetch fails", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse({}, 500, false));

      try {
        await azureDevOpsOAuthAdapter.getUserOrganizations("token", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(true);
      }
    });

    it("should throw ExternalServiceError when accounts fetch fails", async () => {
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(createAzureUserProfile()))
        .mockResolvedValueOnce(createFetchResponse({}, 401, false));

      try {
        await azureDevOpsOAuthAdapter.getUserOrganizations("token", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(false);
      }
    });

    it("should throw retryable ExternalServiceError on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Timeout"));

      try {
        await azureDevOpsOAuthAdapter.getUserOrganizations("token", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(true);
      }
    });

    it("should make exactly 2 fetch calls (profile + accounts)", async () => {
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(createAzureUserProfile()))
        .mockResolvedValueOnce(createFetchResponse(createAzureAccountsResponse()));

      await azureDevOpsOAuthAdapter.getUserOrganizations("token", null, testContext);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should pass Bearer auth to both profile and accounts calls", async () => {
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(createAzureUserProfile()))
        .mockResolvedValueOnce(createFetchResponse(createAzureAccountsResponse()));

      await azureDevOpsOAuthAdapter.getUserOrganizations("my-bearer-token", null, testContext);

      // Both calls should have Bearer auth
      for (const call of mockFetch.mock.calls) {
        const requestInit = call[1] as RequestInit | undefined;
        const headers = requestInit?.headers as Record<string, string>;
        expect(headers.Authorization).toBe("Bearer my-bearer-token");
      }
    });
  });
});

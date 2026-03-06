/**
 * Unit tests for adapters/bitbucketOAuthAdapter.ts
 *
 * Tests the Bitbucket OAuth adapter implementing OAuthPort:
 * - exchangeCode: authorization code to token exchange (Basic auth, URL-encoded)
 * - getUserProfile: parallel profile + emails fetch, email resolution priority
 * - getUserOrganizations: workspace permissions, self-hosted returns empty
 *
 * Covers success paths, error classification (retryable vs non-retryable),
 * Basic auth header encoding, UUID brace stripping, email resolution priority
 * (primary confirmed > any confirmed > null), and self-hosted workspace handling.
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ActualExternalServiceError = (actual as any).ExternalServiceError;

  // Thin resilientFetch wrapper that delegates to global.fetch so existing
  // mockFetch setup continues to work after the fetch -> resilientClient migration.
  // Throws ExternalServiceError on non-ok responses, matching real resilientFetch behavior.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrapFetch = async (url: string, method: string, body?: any, options?: any) => {
    const headers = options?.headers ?? {};
    const fetchBody = options?.rawBody ?? (body ? JSON.stringify(body) : undefined);
    // let: response may be undefined on network error
    let response;
    try {
      response = await global.fetch(url, { method, headers, body: fetchBody });
    } catch (networkError) {
      throw new ActualExternalServiceError(
        "bitbucket",
        networkError instanceof Error ? networkError.message : String(networkError),
        { retryable: true }
      );
    }
    if (!response.ok) {
      const status = response.status ?? 500;
      const retryable = status >= 500 || status === 429;
      throw new ActualExternalServiceError("bitbucket", `HTTP ${String(status)}`, {
        retryable,
        metadata: { statusCode: status },
      });
    }
    const data = await response.json();
    return { data, status: response.status ?? 200, retryCount: 0, duration: 100 };
  };

  return {
    ...actual,
    config: {
      BITBUCKET_OAUTH_CLIENT_ID: "test-bb-client-id",
      BITBUCKET_OAUTH_CLIENT_SECRET: "test-bb-client-secret",
      OAUTH_CALLBACK_BASE_URL: "http://localhost:3001",
    },
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resilientFetch: jest.fn((...args: any[]) => wrapFetch(...args)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resilientGet: jest.fn((url: string, options?: any) =>
      wrapFetch(url, "GET", undefined, options)
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resilientPost: jest.fn((url: string, body?: any, options?: any) =>
      wrapFetch(url, "POST", body, options)
    ),
  };
});

// Replace global.fetch with mock
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch as unknown as typeof global.fetch;
});

// Import after mock setup
import { bitbucketOAuthAdapter } from "../bitbucketOAuthAdapter.js";
import { ExternalServiceError, ValidationError, OAUTH_PROVIDER_URLS } from "@kenchi/shared";

// ==================== Test Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const createBitbucketTokenResponse = (overrides: Record<string, unknown> = {}) => ({
  access_token: "bb-test-access-token",
  token_type: "bearer",
  expires_in: 7200,
  refresh_token: "bb-test-refresh-token",
  scopes: "account email",
  ...overrides,
});

const createBitbucketUserProfile = (overrides: Record<string, unknown> = {}) => ({
  uuid: "{12345-abcde-67890}",
  username: "bb-user",
  display_name: "Bitbucket User",
  links: {
    avatar: {
      href: "https://bitbucket.org/account/bb-user/avatar",
    },
  },
  ...overrides,
});

const createBitbucketEmailsResponse = (
  emails: ReadonlyArray<{
    readonly email: string;
    readonly is_primary: boolean;
    readonly is_confirmed: boolean;
  }> = [
    { email: "primary@bitbucket.com", is_primary: true, is_confirmed: true },
    { email: "secondary@bitbucket.com", is_primary: false, is_confirmed: true },
  ]
) => ({
  values: emails,
});

/**
 * Creates a workspace permissions response matching the
 * /2.0/user/permissions/workspaces endpoint format.
 */
const createBitbucketWorkspacePermissionsResponse = (
  entries: ReadonlyArray<{
    readonly permission: string;
    readonly workspace: {
      readonly uuid: string;
      readonly slug: string;
      readonly name: string;
    };
  }> = [
    { permission: "owner", workspace: { uuid: "{ws-1}", slug: "acme-corp", name: "Acme Corp" } },
    {
      permission: "collaborator",
      workspace: { uuid: "{ws-2}", slug: "dev-team", name: "Dev Team" },
    },
  ]
) => ({
  values: entries,
});

const createFetchResponse = (data: unknown, status = 200, ok = true): Response =>
  ({
    ok,
    status,
    json: jest.fn<() => Promise<unknown>>().mockResolvedValue(data),
    headers: new Headers(),
  }) as unknown as Response;

// ==================== Tests ====================

describe("bitbucketOAuthAdapter", () => {
  describe("exchangeCode", () => {
    it("should exchange authorization code for tokens", async () => {
      const tokenData = createBitbucketTokenResponse();
      mockFetch.mockResolvedValueOnce(createFetchResponse(tokenData));

      const result = await bitbucketOAuthAdapter.exchangeCode("test-code", null, testContext);

      expect(result).toEqual<OAuthTokenResponse>({
        accessToken: "bb-test-access-token",
        refreshToken: "bb-test-refresh-token",
        expiresIn: 7200,
        scope: "account email",
        tokenType: "bearer",
      });
    });

    it("should use Basic auth header with base64-encoded credentials", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse(createBitbucketTokenResponse()));

      await bitbucketOAuthAdapter.exchangeCode("test-code", null, testContext);

      const expectedBasic = Buffer.from("test-bb-client-id:test-bb-client-secret").toString(
        "base64"
      );

      expect(mockFetch).toHaveBeenCalledWith(
        OAUTH_PROVIDER_URLS.bitbucket.token,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: `Basic ${expectedBasic}`,
            "Content-Type": "application/x-www-form-urlencoded",
          }),
        })
      );
    });

    it("should send URL-encoded body (not JSON)", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse(createBitbucketTokenResponse()));

      await bitbucketOAuthAdapter.exchangeCode("my-auth-code", null, testContext);

      const callArgs = mockFetch.mock.calls[0];
      const requestInit = callArgs?.[1] as RequestInit | undefined;
      const body = requestInit?.body as string;

      // URLSearchParams.toString() produces key=value&key=value format
      expect(body).toContain("grant_type=authorization_code");
      expect(body).toContain("code=my-auth-code");
      // Should NOT be JSON
      expect(body).not.toContain("{");
    });

    it("should ignore instanceUrl parameter (cloud-only for token exchange)", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse(createBitbucketTokenResponse()));

      await bitbucketOAuthAdapter.exchangeCode(
        "test-code",
        "https://bitbucket.enterprise.com",
        testContext
      );

      // Should still use cloud URL
      expect(mockFetch).toHaveBeenCalledWith(
        OAUTH_PROVIDER_URLS.bitbucket.token,
        expect.any(Object)
      );
    });

    it("should throw ValidationError when client credentials are missing", async () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: Record<string, string | undefined>;
      };
      const originalId = config.BITBUCKET_OAUTH_CLIENT_ID;
      config.BITBUCKET_OAUTH_CLIENT_ID = undefined;

      await expect(
        bitbucketOAuthAdapter.exchangeCode("test-code", null, testContext)
      ).rejects.toThrow(ValidationError);

      config.BITBUCKET_OAUTH_CLIENT_ID = originalId;
    });

    it("should throw ValidationError when only client secret is missing", async () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: Record<string, string | undefined>;
      };
      const originalSecret = config.BITBUCKET_OAUTH_CLIENT_SECRET;
      config.BITBUCKET_OAUTH_CLIENT_SECRET = "";

      await expect(
        bitbucketOAuthAdapter.exchangeCode("test-code", null, testContext)
      ).rejects.toThrow(ValidationError);

      config.BITBUCKET_OAUTH_CLIENT_SECRET = originalSecret;
    });

    it("should throw non-retryable ExternalServiceError when response contains error field", async () => {
      const errorData = createBitbucketTokenResponse({
        error: "invalid_grant",
        error_description: "The code is expired",
      });
      mockFetch.mockResolvedValueOnce(createFetchResponse(errorData));

      try {
        await bitbucketOAuthAdapter.exchangeCode("expired-code", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.message).toContain("The code is expired");
        expect(extError.retryable).toBe(false);
      }
    });

    it("should throw retryable ExternalServiceError on 502 status", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse({}, 502, false));

      try {
        await bitbucketOAuthAdapter.exchangeCode("test-code", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(true);
      }
    });

    it("should throw non-retryable ExternalServiceError on 400 status", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse({}, 400, false));

      try {
        await bitbucketOAuthAdapter.exchangeCode("test-code", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(false);
      }
    });

    it("should throw retryable ExternalServiceError on network error", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      try {
        await bitbucketOAuthAdapter.exchangeCode("test-code", null, testContext);
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
      const profileData = createBitbucketUserProfile();
      const emailsData = createBitbucketEmailsResponse();

      mockFetch
        .mockResolvedValueOnce(createFetchResponse(profileData))
        .mockResolvedValueOnce(createFetchResponse(emailsData));

      const result = await bitbucketOAuthAdapter.getUserProfile("test-token", null, testContext);

      expect(result).toEqual<OAuthProviderProfile>({
        providerUserId: "12345-abcde-67890",
        username: "bb-user",
        email: "primary@bitbucket.com",
        emailVerified: true,
        displayName: "Bitbucket User",
        avatarUrl: "https://bitbucket.org/account/bb-user/avatar",
        rawProfile: profileData,
      });

      // Should make 2 parallel fetch calls (profile + emails)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should fetch profile and emails endpoints with correct URLs", async () => {
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(createBitbucketUserProfile()))
        .mockResolvedValueOnce(createFetchResponse(createBitbucketEmailsResponse()));

      await bitbucketOAuthAdapter.getUserProfile("my-token", null, testContext);

      expect(mockFetch).toHaveBeenCalledWith(
        OAUTH_PROVIDER_URLS.bitbucket.userProfile,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer my-token",
          }),
        })
      );
      expect(mockFetch).toHaveBeenCalledWith(
        OAUTH_PROVIDER_URLS.bitbucket.userEmails,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer my-token",
          }),
        })
      );
    });

    it("should strip curly braces from UUID", async () => {
      const profileData = createBitbucketUserProfile({
        uuid: "{aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee}",
      });
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(profileData))
        .mockResolvedValueOnce(createFetchResponse(createBitbucketEmailsResponse()));

      const result = await bitbucketOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.providerUserId).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    });

    it("should resolve primary confirmed email first", async () => {
      const emails = createBitbucketEmailsResponse([
        { email: "secondary@test.com", is_primary: false, is_confirmed: true },
        { email: "primary@test.com", is_primary: true, is_confirmed: true },
      ]);
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(createBitbucketUserProfile()))
        .mockResolvedValueOnce(createFetchResponse(emails));

      const result = await bitbucketOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.email).toBe("primary@test.com");
    });

    it("should resolve any confirmed email when no primary confirmed exists", async () => {
      const emails = createBitbucketEmailsResponse([
        { email: "unconfirmed@test.com", is_primary: true, is_confirmed: false },
        { email: "confirmed@test.com", is_primary: false, is_confirmed: true },
      ]);
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(createBitbucketUserProfile()))
        .mockResolvedValueOnce(createFetchResponse(emails));

      const result = await bitbucketOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.email).toBe("confirmed@test.com");
    });

    it("should return null email when no confirmed emails exist", async () => {
      const emails = createBitbucketEmailsResponse([
        { email: "unconfirmed1@test.com", is_primary: true, is_confirmed: false },
        { email: "unconfirmed2@test.com", is_primary: false, is_confirmed: false },
      ]);
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(createBitbucketUserProfile()))
        .mockResolvedValueOnce(createFetchResponse(emails));

      const result = await bitbucketOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.email).toBeNull();
    });

    it("should return null email when emails list is empty", async () => {
      const emails = createBitbucketEmailsResponse([]);
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(createBitbucketUserProfile()))
        .mockResolvedValueOnce(createFetchResponse(emails));

      const result = await bitbucketOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.email).toBeNull();
    });

    it("should use display_name for displayName", async () => {
      const profileData = createBitbucketUserProfile({
        display_name: "Custom Display Name",
      });
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(profileData))
        .mockResolvedValueOnce(createFetchResponse(createBitbucketEmailsResponse()));

      const result = await bitbucketOAuthAdapter.getUserProfile("token", null, testContext);

      expect(result.displayName).toBe("Custom Display Name");
    });

    it("should throw ExternalServiceError when profile response is not ok", async () => {
      mockFetch
        .mockResolvedValueOnce(createFetchResponse({}, 401, false))
        .mockResolvedValueOnce(createFetchResponse(createBitbucketEmailsResponse()));

      try {
        await bitbucketOAuthAdapter.getUserProfile("token", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(false);
      }
    });

    it("should throw ExternalServiceError when emails response is not ok", async () => {
      mockFetch
        .mockResolvedValueOnce(createFetchResponse(createBitbucketUserProfile()))
        .mockResolvedValueOnce(createFetchResponse({}, 500, false));

      try {
        await bitbucketOAuthAdapter.getUserProfile("token", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(true);
      }
    });

    it("should throw retryable ExternalServiceError on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection reset"));

      try {
        await bitbucketOAuthAdapter.getUserProfile("token", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(true);
      }
    });
  });

  describe("getUserOrganizations", () => {
    it("should fetch and map workspace permissions to organizations with roles", async () => {
      const permissionsData = createBitbucketWorkspacePermissionsResponse();
      mockFetch.mockResolvedValueOnce(createFetchResponse(permissionsData));

      const result = await bitbucketOAuthAdapter.getUserOrganizations(
        "test-token",
        null,
        testContext
      );

      expect(result).toEqual([
        { login: "acme-corp", role: "owner" },
        { login: "dev-team", role: "collaborator" },
      ]);
    });

    it("should map workspace.slug to login (not workspace.name)", async () => {
      const permissions = createBitbucketWorkspacePermissionsResponse([
        {
          permission: "member",
          workspace: {
            uuid: "{ws-1}",
            slug: "my-workspace-slug",
            name: "My Workspace Display Name",
          },
        },
      ]);
      mockFetch.mockResolvedValueOnce(createFetchResponse(permissions));

      const result = await bitbucketOAuthAdapter.getUserOrganizations("token", null, testContext);

      expect(result).toEqual([{ login: "my-workspace-slug", role: "member" }]);
    });

    it("should call correct workspace permissions URL with Bearer auth", async () => {
      mockFetch.mockResolvedValueOnce(
        createFetchResponse(createBitbucketWorkspacePermissionsResponse([]))
      );

      await bitbucketOAuthAdapter.getUserOrganizations("my-token", null, testContext);

      // The adapter uses a hardcoded permissions URL, not the old OAUTH_PROVIDER_URLS.bitbucket.userWorkspaces
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.bitbucket.org/2.0/user/permissions/workspaces",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer my-token",
          }),
        })
      );
    });

    it("should return empty array when user has no workspaces", async () => {
      mockFetch.mockResolvedValueOnce(
        createFetchResponse(createBitbucketWorkspacePermissionsResponse([]))
      );

      const result = await bitbucketOAuthAdapter.getUserOrganizations("token", null, testContext);

      expect(result).toEqual([]);
    });

    it("should return empty array for self-hosted instanceUrl without calling fetch", async () => {
      const result = await bitbucketOAuthAdapter.getUserOrganizations(
        "token",
        "https://bitbucket.enterprise.com",
        testContext
      );

      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should throw retryable ExternalServiceError on 500 status", async () => {
      mockFetch.mockResolvedValueOnce(createFetchResponse({}, 500, false));

      try {
        await bitbucketOAuthAdapter.getUserOrganizations("token", null, testContext);
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
        await bitbucketOAuthAdapter.getUserOrganizations("token", null, testContext);
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
        await bitbucketOAuthAdapter.getUserOrganizations("token", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(false);
      }
    });

    it("should throw retryable ExternalServiceError on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("DNS resolution failed"));

      try {
        await bitbucketOAuthAdapter.getUserOrganizations("token", null, testContext);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const extError = error as ExternalServiceError;
        expect(extError.retryable).toBe(true);
      }
    });
  });
});

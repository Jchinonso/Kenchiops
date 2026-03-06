/**
 * Unit tests for OAuth Routes
 *
 * Updated for provider-neutral tenant model.
 * - Tenant no longer has provider-specific fields
 * - linkSlackWorkspace and createFromSlackInstall still exist
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import request from "supertest";
import express, { type Express } from "express";

// Helper to create a provider-neutral mock tenant
const createMockTenant = (overrides = {}) => ({
  id: "tenant-123",
  status: "pending_github" as const,
  orgName: "test-org",
  createdAt: new Date(),
  updatedAt: new Date(),
  ragMonthlyBudgetUsd: 0,
  ragPreferredTier: "STANDARD" as const,
  ragAllowPremium: false,
  ragDegradeOnBudgetWarning: true,
  ...overrides,
});

// Mock dependencies
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
    config: {
      SLACK_CLIENT_ID: "test-client-id",
      SLACK_CLIENT_SECRET: "test-client-secret",
      SLACK_REDIRECT_URI: "https://example.com/slack/oauth/callback",
    },
    findByOrgName: jest.fn(),
    linkSlackWorkspace: jest.fn(),
    createFromSlackInstall: jest.fn(),
    getErrorMessage: jest.fn((error: unknown) =>
      error instanceof Error ? error.message : String(error)
    ),
    createOAuthStateStore: jest.fn(() => {
      const store = new Map<string, { createdAt: number; tenantId?: string }>();
      return {
        set: jest.fn(async (key: string, value: { createdAt: number; tenantId?: string }) => {
          store.set(key, value);
        }),
        get: jest.fn(async (key: string) => store.get(key) ?? null),
        delete: jest.fn(async (key: string) => {
          store.delete(key);
        }),
      };
    }),
    asyncHandler: jest.fn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fn: any) => (req: any, res: any, next: any) => {
        Promise.resolve(fn(req, res, next)).catch(next);
      }
    ),
    resilientFetch: jest.fn(),
  };
});

// Mock crypto module - keep actual crypto for createHash (used by express/etag)
jest.mock("crypto", () => {
  const actualCrypto = jest.requireActual("crypto") as typeof import("crypto");
  return {
    ...actualCrypto,
    randomBytes: jest.fn(() => ({
      toString: jest.fn(() => "random-state-token"),
    })),
  };
});

// Import after mocks
import { oauthRoutes } from "../routes/oauthRoutes.js";
import {
  findByOrgName,
  linkSlackWorkspace,
  createFromSlackInstall,
  resilientFetch,
} from "@kenchi/shared";

const mockResilientFetch = resilientFetch as jest.MockedFunction<typeof resilientFetch>;

const mockFindByGitHubOrg = findByOrgName as jest.MockedFunction<typeof findByOrgName>;
const mockLinkSlackWorkspace = linkSlackWorkspace as jest.MockedFunction<typeof linkSlackWorkspace>;
const mockCreateFromSlackInstall = createFromSlackInstall as jest.MockedFunction<
  typeof createFromSlackInstall
>;

// Helper to create mock Slack OAuth response
const createMockSlackResponse = (overrides = {}) => ({
  ok: true,
  access_token: "xoxb-test-token",
  token_type: "bot",
  scope: "chat:write,channels:read",
  bot_user_id: "U123456",
  app_id: "A123456",
  team: {
    id: "T123456",
    name: "Test Team",
  },
  authed_user: {
    id: "U789012",
  },
  ...overrides,
});

// Helper to wrap data in resilientFetch response shape
const createResilientResponse = <T>(data: T) => ({
  data,
  status: 200,
  retryCount: 0,
  duration: 100,
});

describe("OAuth Routes", () => {
  let app: Express;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use(oauthRoutes);

    // Reset mock implementations
    mockResilientFetch.mockResolvedValue(createResilientResponse(createMockSlackResponse()));

    mockFindByGitHubOrg.mockResolvedValue(null);
    mockLinkSlackWorkspace.mockResolvedValue(createMockTenant());
    mockCreateFromSlackInstall.mockResolvedValue(
      createMockTenant({
        id: "tenant-new",
        orgName: "",
      })
    );
  });

  describe("GET /slack/install", () => {
    it("should redirect to Slack OAuth authorization URL", async () => {
      const response = await request(app).get("/slack/install");

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain("https://slack.com/oauth/v2/authorize");
      expect(response.headers.location).toContain("client_id=test-client-id");
      expect(response.headers.location).toContain("state=random-state-token");
    });

    it("should include OAuth scopes in redirect URL", async () => {
      const response = await request(app).get("/slack/install");

      expect(response.headers.location).toContain("scope=");
      expect(response.headers.location).toContain("chat%3Awrite");
      expect(response.headers.location).toContain("channels%3Aread");
    });

    it("should include redirect URI in authorization URL", async () => {
      const response = await request(app).get("/slack/install");

      expect(response.headers.location).toContain(
        "redirect_uri=https%3A%2F%2Fexample.com%2Fslack%2Foauth%2Fcallback"
      );
    });

    it("should handle tenant_id query parameter", async () => {
      const response = await request(app).get("/slack/install?tenant_id=tenant-123");

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain("state=random-state-token");
    });

    it("should return error when SLACK_CLIENT_ID not configured", async () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: { SLACK_CLIENT_ID?: string };
      };
      const originalClientId = config.SLACK_CLIENT_ID;
      config.SLACK_CLIENT_ID = undefined;

      const response = await request(app).get("/slack/install");

      expect(response.status).toBe(500);
      expect(response.body.error).toContain("Slack OAuth not configured");

      config.SLACK_CLIENT_ID = originalClientId;
    });

    it("should return 500 when SLACK_REDIRECT_URI not configured (VULN-504)", async () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: { SLACK_REDIRECT_URI?: string };
      };
      const originalRedirectUri = config.SLACK_REDIRECT_URI;
      config.SLACK_REDIRECT_URI = undefined;

      const response = await request(app).get("/slack/install");

      // VULN-504: No Host header fallback — redirect URI must be explicitly configured
      expect(response.status).toBe(500);
      expect(response.body.error).toContain("Slack OAuth redirect URI not configured");

      config.SLACK_REDIRECT_URI = originalRedirectUri;
    });

    it("should generate unique state tokens", async () => {
      const crypto = jest.requireMock("crypto") as {
        randomBytes: jest.Mock;
      };
      crypto.randomBytes
        .mockReturnValueOnce({
          toString: jest.fn(() => "state-1"),
        })
        .mockReturnValueOnce({
          toString: jest.fn(() => "state-2"),
        });

      const response1 = await request(app).get("/slack/install");
      const response2 = await request(app).get("/slack/install");

      expect(response1.headers.location).toContain("state=state-1");
      expect(response2.headers.location).toContain("state=state-2");
    });

    it("should handle empty tenant_id parameter", async () => {
      const response = await request(app).get("/slack/install?tenant_id=");

      expect(response.status).toBe(302);
    });

    it("should handle non-string tenant_id parameter", async () => {
      const response = await request(app).get("/slack/install?tenant_id=123");

      expect(response.status).toBe(302);
    });
  });

  describe("GET /slack/oauth/callback", () => {
    let state: string;

    beforeEach(() => {
      return request(app)
        .get("/slack/install")
        .then(() => {
          state = "random-state-token";
        });
    });

    it("should exchange code for tokens successfully", async () => {
      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(200);
      expect(response.text).toContain("Test Team");
      expect(mockResilientFetch).toHaveBeenCalledWith(
        expect.stringContaining("https://slack.com/api/oauth.v2.access"),
        "POST",
        undefined,
        { timeout: 10_000, maxRetries: 2 }
      );
    });

    it("should create new tenant when no existing tenant found", async () => {
      mockFindByGitHubOrg.mockResolvedValue(null);

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(200);
      expect(mockCreateFromSlackInstall).toHaveBeenCalledWith({
        slackWorkspaceId: "T123456",
        slackTeamName: "Test Team",
        slackBotToken: "xoxb-test-token",
        slackBotUserId: "U123456",
      });
    });

    it("should link to existing tenant when GitHub org matches", async () => {
      mockFindByGitHubOrg.mockResolvedValue(
        createMockTenant({
          id: "tenant-existing",
          status: "active",
          orgName: "Test Team",
        })
      );

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(200);
      expect(mockLinkSlackWorkspace).toHaveBeenCalledWith({
        tenantId: "tenant-existing",
        slackWorkspaceId: "T123456",
        slackTeamName: "Test Team",
        slackBotToken: "xoxb-test-token",
        slackBotUserId: "U123456",
      });
    });

    it("should show GitHub App installation link for new tenant", async () => {
      mockCreateFromSlackInstall.mockResolvedValue(
        createMockTenant({
          id: "tenant-new",
          status: "pending_github",
          orgName: "",
        })
      );

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(200);
      expect(response.text).toContain("Almost There!");
      expect(response.text).toContain("Install GitHub App");
    });

    it("should show success message for active tenant", async () => {
      mockResilientFetch.mockResolvedValue(createResilientResponse(createMockSlackResponse()));

      mockFindByGitHubOrg.mockResolvedValue(
        createMockTenant({
          status: "active",
        })
      );

      mockLinkSlackWorkspace.mockResolvedValue(
        createMockTenant({
          status: "active",
        })
      );

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(200);
      expect(response.text).toContain("<html>");
    });

    it("should handle OAuth denial", async () => {
      const response = await request(app).get(
        `/slack/oauth/callback?error=access_denied&state=${state}`
      );

      expect(response.status).toBe(400);
      expect(response.text).toContain("Installation Failed");
      expect(response.text).toContain("access_denied");
    });

    it("should reject invalid state parameter", async () => {
      const response = await request(app).get(
        "/slack/oauth/callback?code=test-code&state=invalid-state"
      );

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Invalid or expired state");
    });

    it("should reject missing code parameter", async () => {
      const response = await request(app).get(`/slack/oauth/callback?state=${state}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Invalid callback parameters");
    });

    it("should reject missing state parameter", async () => {
      const response = await request(app).get("/slack/oauth/callback?code=test-code");

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Invalid callback parameters");
    });

    it("should handle token exchange failure", async () => {
      mockResilientFetch.mockResolvedValue(
        createResilientResponse({
          ok: false,
          error: "invalid_code",
        })
      );

      const response = await request(app).get(
        `/slack/oauth/callback?code=invalid-code&state=${state}`
      );

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Slack OAuth failed");
      expect(response.body.error).toContain("invalid_code");
    });

    it("should handle network errors during token exchange", async () => {
      mockResilientFetch.mockRejectedValue(new Error("Network error"));

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(500);
      expect(response.body.error).toContain("Failed to complete OAuth flow");
    });

    it("should handle missing SLACK_CLIENT_SECRET", async () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: { SLACK_CLIENT_SECRET?: string };
      };
      const originalSecret = config.SLACK_CLIENT_SECRET;
      config.SLACK_CLIENT_SECRET = undefined;

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(500);
      expect(response.body.error).toContain("Slack OAuth not configured");

      config.SLACK_CLIENT_SECRET = originalSecret;
    });

    it("should handle tenant linking errors", async () => {
      mockCreateFromSlackInstall.mockRejectedValue(new Error("Database error"));

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(500);
      expect(response.body.error).toContain("Failed to complete OAuth flow");
    });

    it("should consume state token after use", async () => {
      const response1 = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );
      expect(response1.status).toBe(200);

      const response2 = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );
      expect(response2.status).toBe(400);
      expect(response2.body.error).toContain("Invalid or expired state");
    });

    it("should handle malformed Slack API response", async () => {
      mockResilientFetch.mockResolvedValue(createResilientResponse({}));

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(400);
    });

    it("should handle invalid JSON in Slack response", async () => {
      mockResilientFetch.mockRejectedValue(new Error("Invalid JSON"));

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(500);
    });

    it("should include all OAuth scopes in token request", async () => {
      await request(app).get(`/slack/oauth/callback?code=test-code&state=${state}`);

      expect(mockResilientFetch).toHaveBeenCalledWith(
        expect.stringContaining("code=test-code"),
        "POST",
        undefined,
        { timeout: 10_000, maxRetries: 2 }
      );
    });

    it("should handle special characters in team name", async () => {
      mockResilientFetch.mockResolvedValue(
        createResilientResponse(
          createMockSlackResponse({
            team: {
              id: "T123456",
              name: "Team & Co. <script>",
            },
          })
        )
      );
      mockFindByGitHubOrg.mockResolvedValue(createMockTenant());

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(200);
      expect(response.text).toContain("<html>");
    });

    it("should handle pending status correctly", async () => {
      mockLinkSlackWorkspace.mockResolvedValue(
        createMockTenant({
          status: "pending_github",
        })
      );

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(200);
      expect(response.text).toContain("pending");
    });

    it("should handle tenant_id in OAuth state", async () => {
      await request(app).get("/slack/install?tenant_id=tenant-existing");
      const stateWithTenant = "random-state-token";

      mockLinkSlackWorkspace.mockResolvedValue(
        createMockTenant({
          id: "tenant-existing",
          status: "active",
        })
      );

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${stateWithTenant}`
      );

      expect(response.status).toBe(200);
      expect(mockLinkSlackWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-existing",
        })
      );
    });

    it("should handle unicode characters in team name", async () => {
      mockResilientFetch.mockResolvedValue(
        createResilientResponse(
          createMockSlackResponse({
            team: {
              id: "T123456",
              name: "チーム 🚀",
            },
          })
        )
      );

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(200);
    });

    it("should handle suspended tenant status", async () => {
      mockResilientFetch.mockResolvedValue(createResilientResponse(createMockSlackResponse()));
      mockFindByGitHubOrg.mockResolvedValue(createMockTenant({ status: "suspended" as const }));
      mockLinkSlackWorkspace.mockResolvedValue(
        createMockTenant({
          status: "suspended" as const,
        })
      );

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(200);
      expect(response.text).toContain("<html>");
    });

    it("should handle deleted tenant status", async () => {
      mockResilientFetch.mockResolvedValue(createResilientResponse(createMockSlackResponse()));
      mockFindByGitHubOrg.mockResolvedValue(createMockTenant({ status: "deleted" as const }));
      mockLinkSlackWorkspace.mockResolvedValue(
        createMockTenant({
          status: "deleted" as const,
        })
      );

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(200);
      expect(response.text).toContain("<html>");
    });
  });

  // VULN-505: /slack/oauth/status now only returns { configured: boolean }
  // to avoid exposing which specific credentials are present or absent.
  describe("GET /slack/oauth/status (VULN-505 hardened)", () => {
    it("should return configured=true when all credentials present", async () => {
      const response = await request(app).get("/slack/oauth/status");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ configured: true });
    });

    it("should not expose individual credential presence", async () => {
      const response = await request(app).get("/slack/oauth/status");

      // VULN-505: These properties must NOT be in the response
      expect(response.body).not.toHaveProperty("hasClientId");
      expect(response.body).not.toHaveProperty("hasClientSecret");
      expect(response.body).not.toHaveProperty("hasRedirectUri");
      expect(response.body).not.toHaveProperty("multiTenantMode");
    });

    it("should return configured=false when client ID missing", async () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: { SLACK_CLIENT_ID?: string };
      };
      const originalClientId = config.SLACK_CLIENT_ID;
      config.SLACK_CLIENT_ID = undefined;

      const response = await request(app).get("/slack/oauth/status");

      expect(response.body).toEqual({ configured: false });

      config.SLACK_CLIENT_ID = originalClientId;
    });

    it("should return configured=false when client secret missing", async () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: { SLACK_CLIENT_SECRET?: string };
      };
      const originalSecret = config.SLACK_CLIENT_SECRET;
      config.SLACK_CLIENT_SECRET = undefined;

      const response = await request(app).get("/slack/oauth/status");

      expect(response.body).toEqual({ configured: false });

      config.SLACK_CLIENT_SECRET = originalSecret;
    });

    it("should return configured=false when redirect URI missing", async () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: { SLACK_REDIRECT_URI?: string };
      };
      const originalRedirectUri = config.SLACK_REDIRECT_URI;
      config.SLACK_REDIRECT_URI = undefined;

      const response = await request(app).get("/slack/oauth/status");

      expect(response.body).toEqual({ configured: false });

      config.SLACK_REDIRECT_URI = originalRedirectUri;
    });
  });

  describe("tenant linking strategies", () => {
    let state: string;

    beforeEach(() => {
      return request(app)
        .get("/slack/install")
        .then(() => {
          state = "random-state-token";
        });
    });

    it("should use existing tenant ID strategy when available", async () => {
      await request(app).get("/slack/install?tenant_id=tenant-456");
      const stateWithTenant = "random-state-token";

      mockLinkSlackWorkspace.mockResolvedValue(
        createMockTenant({
          id: "tenant-456",
          status: "active",
          orgName: "existing-org",
        })
      );

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${stateWithTenant}`
      );

      expect(response.status).toBe(200);
      expect(mockLinkSlackWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-456",
        })
      );
    });

    it("should use matching GitHub org strategy", async () => {
      mockFindByGitHubOrg.mockResolvedValue(
        createMockTenant({
          id: "tenant-github",
          status: "active",
          orgName: "Test Team",
        })
      );

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(200);
      expect(mockFindByGitHubOrg).toHaveBeenCalledWith("Test Team");
      expect(mockLinkSlackWorkspace).toHaveBeenCalled();
      expect(mockCreateFromSlackInstall).not.toHaveBeenCalled();
    });

    it("should fall back to create new tenant strategy", async () => {
      mockFindByGitHubOrg.mockResolvedValue(null);

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(200);
      expect(mockCreateFromSlackInstall).toHaveBeenCalled();
      expect(mockLinkSlackWorkspace).not.toHaveBeenCalled();
    });
  });

  describe("HTML response formatting", () => {
    let state: string;

    beforeEach(() => {
      return request(app)
        .get("/slack/install")
        .then(() => {
          state = "random-state-token";
        });
    });

    it("should return valid HTML for success response", async () => {
      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.text).toContain("<html>");
      expect(response.text).toContain("</html>");
      expect(response.text).toContain("<title>");
    });

    it("should include CSS styling in HTML response", async () => {
      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.text).toContain("<style>");
      expect(response.text).toContain("</style>");
    });

    it("should handle HTML entities in team name", async () => {
      mockResilientFetch.mockResolvedValue(
        createResilientResponse(
          createMockSlackResponse({
            team: {
              id: "T123456",
              name: "<script>alert('xss')</script>",
            },
          })
        )
      );
      mockFindByGitHubOrg.mockResolvedValue(createMockTenant());

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(200);
      expect(response.text).toContain("<html>");
    });

    it("should include GitHub App installation link for new tenants", async () => {
      mockCreateFromSlackInstall.mockResolvedValue(
        createMockTenant({
          id: "tenant-new",
          status: "pending_github",
          orgName: "",
        })
      );

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.text).toContain("github.com/apps/kenchi-devops/installations/new");
    });

    it("should not include GitHub App link for existing tenants", async () => {
      mockResilientFetch.mockResolvedValue(createResilientResponse(createMockSlackResponse()));

      mockFindByGitHubOrg.mockResolvedValue(
        createMockTenant({
          status: "active",
        })
      );

      mockLinkSlackWorkspace.mockResolvedValue(
        createMockTenant({
          status: "active",
        })
      );

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(200);
    });

    it("should return HTML error page for OAuth denial", async () => {
      const response = await request(app).get(
        `/slack/oauth/callback?error=access_denied&state=${state}`
      );

      expect(response.text).toContain("<html>");
      expect(response.text).toContain("Installation Failed");
      expect(response.text).toContain("Try again");
    });
  });

  describe("edge cases", () => {
    it("should handle very long code parameter", async () => {
      await request(app).get("/slack/install");
      const state = "random-state-token";
      const longCode = "a".repeat(1000);

      mockResilientFetch.mockResolvedValue(createResilientResponse(createMockSlackResponse()));
      mockFindByGitHubOrg.mockResolvedValue(createMockTenant());

      const response = await request(app).get(
        `/slack/oauth/callback?code=${longCode}&state=${state}`
      );

      expect(response.status).toBe(200);
    });

    it("should handle case-sensitive state token", async () => {
      await request(app).get("/slack/install");
      const state = "random-state-token";

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state.toUpperCase()}`
      );

      expect(response.status).toBe(400);
    });

    it("should handle timeout during token exchange", async () => {
      await request(app).get("/slack/install");
      const state = "random-state-token";

      mockResilientFetch.mockRejectedValue(new Error("Timeout"));

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(500);
    });

    it("should handle missing team information in Slack response", async () => {
      await request(app).get("/slack/install");
      const state = "random-state-token";

      mockResilientFetch.mockResolvedValue(
        createResilientResponse({
          ok: true,
          access_token: "xoxb-test-token",
          token_type: "bot",
          scope: "chat:write",
          bot_user_id: "U123456",
          app_id: "A123456",
          team: {},
          authed_user: {
            id: "U789012",
          },
        })
      );

      mockFindByGitHubOrg.mockResolvedValue(createMockTenant());

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(200);
    });
  });
});

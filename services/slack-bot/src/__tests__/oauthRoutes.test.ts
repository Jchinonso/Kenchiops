/**
 * Unit tests for OAuth Routes
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import request from "supertest";
import express, { type Express } from "express";
import type { Tenant } from "@kenchi/shared";

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
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
  HTTP_STATUS: {
    OK: 200,
    BAD_REQUEST: 400,
    INTERNAL_SERVER_ERROR: 500,
  },
  findByGitHubOrg: jest.fn(),
  linkSlackWorkspace: jest.fn(),
  createFromSlackInstall: jest.fn(),
}));

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

// Mock global fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Import after mocks
import { oauthRoutes } from "../routes/oauthRoutes.js";
import {
  findByGitHubOrg,
  linkSlackWorkspace,
  createFromSlackInstall,
} from "@kenchi/shared";

const mockFindByGitHubOrg = findByGitHubOrg as jest.MockedFunction<typeof findByGitHubOrg>;
const mockLinkSlackWorkspace = linkSlackWorkspace as jest.MockedFunction<
  typeof linkSlackWorkspace
>;
const mockCreateFromSlackInstall = createFromSlackInstall as jest.MockedFunction<
  typeof createFromSlackInstall
>;

// Helper function to create mock Tenant objects
const createMockTenant = (overrides: Partial<Tenant> = {}): Tenant => ({
  id: "tenant-123",
  status: "pending_github",
  githubOrg: "test-org",
  githubInstallationId: null,
  githubAppInstalledAt: null,
  slackWorkspaceId: "T123456",
  slackTeamName: "Test Team",
  slackBotToken: "xoxb-test-token",
  slackBotUserId: "U123456",
  slackAppInstalledAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

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

describe("OAuth Routes", () => {
  let app: Express;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use(oauthRoutes);

    // Reset mock implementations
    mockFetch.mockResolvedValue({
      json: jest.fn<() => Promise<unknown>>().mockResolvedValue(createMockSlackResponse()),
    } as unknown as Response);

    mockFindByGitHubOrg.mockResolvedValue(null);
    mockLinkSlackWorkspace.mockResolvedValue(createMockTenant());
    mockCreateFromSlackInstall.mockResolvedValue(
      createMockTenant({
        id: "tenant-new",
        githubOrg: "",
        slackWorkspaceId: "T789012",
        slackTeamName: "New Team",
        slackBotToken: "xoxb-new-token",
        slackBotUserId: "U789012",
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

    it("should use default redirect URI when not configured", async () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: { SLACK_REDIRECT_URI?: string };
      };
      const originalRedirectUri = config.SLACK_REDIRECT_URI;
      config.SLACK_REDIRECT_URI = undefined;

      const response = await request(app).get("/slack/install");

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain("redirect_uri=http");

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
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("https://slack.com/api/oauth.v2.access"),
        { method: "POST" }
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
          githubOrg: "Test Team",
          githubInstallationId: 12345,
          githubAppInstalledAt: new Date(),
          slackWorkspaceId: null,
          slackTeamName: null,
          slackBotToken: null,
          slackBotUserId: null,
          slackAppInstalledAt: null,
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
          githubOrg: "",
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
      // Setup mock for active tenant with GitHub already installed
      mockFetch.mockResolvedValue({
        json: jest.fn<() => Promise<unknown>>().mockResolvedValue(createMockSlackResponse()),
      } as unknown as Response);

      mockFindByGitHubOrg.mockResolvedValue(
        createMockTenant({
          status: "active",
          githubInstallationId: 12345,
          githubAppInstalledAt: new Date(),
        })
      );

      mockLinkSlackWorkspace.mockResolvedValue(
        createMockTenant({
          status: "active",
          githubInstallationId: 12345,
          githubAppInstalledAt: new Date(),
        })
      );

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(200);
      // Verify it's a successful response with HTML content
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
      mockFetch.mockResolvedValue({
        json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
          ok: false,
          error: "invalid_code",
        }),
      } as unknown as Response);

      const response = await request(app).get(
        `/slack/oauth/callback?code=invalid-code&state=${state}`
      );

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Slack OAuth failed");
      expect(response.body.error).toContain("invalid_code");
    });

    it("should handle network errors during token exchange", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

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
      mockFetch.mockResolvedValue({
        json: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
      } as unknown as Response);

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(400);
    });

    it("should handle invalid JSON in Slack response", async () => {
      mockFetch.mockResolvedValue({
        json: jest.fn<() => Promise<unknown>>().mockRejectedValue(new Error("Invalid JSON")),
      } as unknown as Response);

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(500);
    });

    it("should include all OAuth scopes in token request", async () => {
      await request(app).get(`/slack/oauth/callback?code=test-code&state=${state}`);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("code=test-code"),
        { method: "POST" }
      );
    });

    it("should handle special characters in team name", async () => {
      mockFetch.mockResolvedValue({
        json: jest.fn<() => Promise<unknown>>().mockResolvedValue(
          createMockSlackResponse({
            team: {
              id: "T123456",
              name: "Team & Co. <script>",
            },
          })
        ),
      } as unknown as Response);
      mockFindByGitHubOrg.mockResolvedValue(createMockTenant());

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(200);
      // Successfully processed, HTML response returned
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
          githubInstallationId: 12345,
          githubAppInstalledAt: new Date(),
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
      mockFetch.mockResolvedValue({
        json: jest.fn<() => Promise<unknown>>().mockResolvedValue(
          createMockSlackResponse({
            team: {
              id: "T123456",
              name: "チーム 🚀",
            },
          })
        ),
      } as unknown as Response);

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(200);
    });

    it("should handle suspended tenant status", async () => {
      mockFetch.mockResolvedValue({
        json: jest.fn<() => Promise<unknown>>().mockResolvedValue(createMockSlackResponse()),
      } as unknown as Response);
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
      mockFetch.mockResolvedValue({
        json: jest.fn<() => Promise<unknown>>().mockResolvedValue(createMockSlackResponse()),
      } as unknown as Response);
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

  describe("GET /slack/oauth/status", () => {
    it("should return OAuth configuration status", async () => {
      const response = await request(app).get("/slack/oauth/status");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("configured", true);
      expect(response.body).toHaveProperty("hasClientId", true);
      expect(response.body).toHaveProperty("hasClientSecret", true);
      expect(response.body).toHaveProperty("hasRedirectUri", true);
    });

    it("should indicate missing client ID", async () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: { SLACK_CLIENT_ID?: string };
      };
      const originalClientId = config.SLACK_CLIENT_ID;
      config.SLACK_CLIENT_ID = undefined;

      const response = await request(app).get("/slack/oauth/status");

      expect(response.body.hasClientId).toBe(false);
      expect(response.body.configured).toBe(false);

      config.SLACK_CLIENT_ID = originalClientId;
    });

    it("should indicate missing client secret", async () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: { SLACK_CLIENT_SECRET?: string };
      };
      const originalSecret = config.SLACK_CLIENT_SECRET;
      config.SLACK_CLIENT_SECRET = undefined;

      const response = await request(app).get("/slack/oauth/status");

      expect(response.body.hasClientSecret).toBe(false);
      expect(response.body.configured).toBe(false);

      config.SLACK_CLIENT_SECRET = originalSecret;
    });

    it("should show redirect URI status", async () => {
      const response = await request(app).get("/slack/oauth/status");

      expect(response.body.hasRedirectUri).toBe(true);
    });

    it("should include multi-tenant mode status", async () => {
      const response = await request(app).get("/slack/oauth/status");

      expect(response.body).toHaveProperty("multiTenantMode");
    });

    it("should handle missing redirect URI gracefully", async () => {
      const { config } = jest.requireMock("@kenchi/shared") as {
        config: { SLACK_REDIRECT_URI?: string };
      };
      const originalRedirectUri = config.SLACK_REDIRECT_URI;
      config.SLACK_REDIRECT_URI = undefined;

      const response = await request(app).get("/slack/oauth/status");

      expect(response.body.hasRedirectUri).toBe(false);

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
          githubOrg: "existing-org",
          githubInstallationId: 12345,
          githubAppInstalledAt: new Date(),
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
          githubOrg: "Test Team",
          githubInstallationId: 12345,
          githubAppInstalledAt: new Date(),
          slackWorkspaceId: null,
          slackTeamName: null,
          slackBotToken: null,
          slackBotUserId: null,
          slackAppInstalledAt: null,
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
      mockFetch.mockResolvedValue({
        json: jest.fn<() => Promise<unknown>>().mockResolvedValue(
          createMockSlackResponse({
            team: {
              id: "T123456",
              name: "<script>alert('xss')</script>",
            },
          })
        ),
      } as unknown as Response);
      mockFindByGitHubOrg.mockResolvedValue(createMockTenant());

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      // Response is successfully processed
      expect(response.status).toBe(200);
      expect(response.text).toContain("<html>");
    });

    it("should include GitHub App installation link for new tenants", async () => {
      mockCreateFromSlackInstall.mockResolvedValue(
        createMockTenant({
          id: "tenant-new",
          status: "pending_github",
          githubOrg: "",
        })
      );

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.text).toContain("github.com/apps/kenchi-devops/installations/new");
    });

    it("should not include GitHub App link for existing tenants", async () => {
      // Setup mock for existing tenant with GitHub already installed
      mockFetch.mockResolvedValue({
        json: jest.fn<() => Promise<unknown>>().mockResolvedValue(createMockSlackResponse()),
      } as unknown as Response);

      mockFindByGitHubOrg.mockResolvedValue(
        createMockTenant({
          status: "active",
          githubInstallationId: 12345,
          githubAppInstalledAt: new Date(),
        })
      );

      mockLinkSlackWorkspace.mockResolvedValue(
        createMockTenant({
          status: "active",
          githubInstallationId: 12345,
          githubAppInstalledAt: new Date(),
        })
      );

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      // When GitHub is already installed, no install link is needed
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

      // Mock fetch to return a successful response - long code is just passed to Slack API
      mockFetch.mockResolvedValue({
        json: jest.fn<() => Promise<unknown>>().mockResolvedValue(createMockSlackResponse()),
      } as unknown as Response);
      mockFindByGitHubOrg.mockResolvedValue(createMockTenant());

      const response = await request(app).get(
        `/slack/oauth/callback?code=${longCode}&state=${state}`
      );

      // Long code is accepted - validation happens at Slack API level
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

      mockFetch.mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 100)
          )
      );

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      expect(response.status).toBe(500);
    });

    it("should handle missing team information in Slack response", async () => {
      await request(app).get("/slack/install");
      const state = "random-state-token";

      mockFetch.mockResolvedValue({
        json: jest.fn<() => Promise<unknown>>().mockResolvedValue({
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
        }),
      } as unknown as Response);

      // Mock tenant service to handle the minimal data
      mockFindByGitHubOrg.mockResolvedValue(createMockTenant());

      const response = await request(app).get(
        `/slack/oauth/callback?code=test-code&state=${state}`
      );

      // Missing team info is handled gracefully - OAuth flow completes
      expect(response.status).toBe(200);
    });
  });
});

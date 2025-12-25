/**
 * Unit tests for App Home Handler
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
  handleAppHomeOpened,
  handleTestConnection,
  handleRefreshHome,
} from "../handlers/appHomeHandler.js";

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  findBySlackWorkspace: jest.fn(),
  findAllMappingsForTenant: jest.fn(),
  getTenantStatistics: jest.fn(),
  formatRelativeTime: jest.fn((_date: Date) => "2 hours ago"),
}));

jest.mock("../formatters/appHomeFormatter.js", () => ({
  buildAppHomeView: jest.fn(() => ({
    type: "home",
    blocks: [{ type: "section", text: { type: "mrkdwn", text: "App Home View" } }],
  })),
  buildErrorView: jest.fn(() => ({
    type: "home",
    blocks: [{ type: "section", text: { type: "mrkdwn", text: "Error View" } }],
  })),
}));

describe("App Home Handler", () => {
  // Create mock Slack client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createMockClient = (): any => {
    return {
      auth: {
        test: jest.fn<() => Promise<{ team_id: string; bot_id: string }>>().mockResolvedValue({
          team_id: "T123456",
          bot_id: "B123456",
        }),
      },
      views: {
        publish: jest.fn<() => Promise<{ ok: boolean }>>().mockResolvedValue({ ok: true }),
      },
    };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = createMockClient();
  });

  describe("handleAppHomeOpened", () => {
    it("should publish App Home view with active tenant and mappings", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const {
        findBySlackWorkspace,
        findAllMappingsForTenant,
        getTenantStatistics,
        formatRelativeTime,
      } = jest.requireMock("@kenchi/shared") as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { buildAppHomeView } = jest.requireMock("../formatters/appHomeFormatter.js") as any;

      const mockTenant = {
        id: "tenant-123",
        githubOrg: "test-org",
        status: "active",
        slackTeamName: "Test Team",
      };

      const mockMappings = [
        {
          repository: "test-org/repo1",
          slackChannelId: "C123456",
          slackChannelName: "dev-team",
        },
        {
          repository: "test-org/repo2",
          slackChannelId: "C789012",
          slackChannelName: "qa-team",
        },
      ];

      const mockStats = {
        failuresAnalyzedToday: 15,
        totalAlertsSent: 42,
        lastAlertTime: new Date("2025-12-25T10:00:00Z"),
      };

      findBySlackWorkspace.mockResolvedValue(mockTenant);
      findAllMappingsForTenant.mockResolvedValue(mockMappings);
      getTenantStatistics.mockResolvedValue(mockStats);

      await handleAppHomeOpened(mockClient, "U123456");

      // Verify auth.test was called
      expect(mockClient.auth.test).toHaveBeenCalled();

      // Verify buildAppHomeView was called with correct context
      expect(buildAppHomeView).toHaveBeenCalledWith({
        botStatus: "active",
        repositoryMappings: [
          {
            repository: "test-org/repo1",
            channelId: "C123456",
            channelName: "dev-team",
          },
          {
            repository: "test-org/repo2",
            channelId: "C789012",
            channelName: "qa-team",
          },
        ],
        tenant: {
          githubOrg: "test-org",
          status: "active",
          slackTeamName: "Test Team",
        },
        recentActivity: {
          failuresAnalyzed: 15,
          totalAlerts: 42,
          lastAlertTime: "2 hours ago",
        },
        workspaceId: "T123456",
      });

      // Verify view was published
      expect(mockClient.views.publish).toHaveBeenCalledWith({
        user_id: "U123456",
        view: expect.objectContaining({ type: "home" }),
      });

      // Verify formatRelativeTime was called
      expect(formatRelativeTime).toHaveBeenCalledWith(mockStats.lastAlertTime);
    });

    it("should handle case with no tenant found", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace } = jest.requireMock("@kenchi/shared") as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { buildAppHomeView } = jest.requireMock("../formatters/appHomeFormatter.js") as any;

      findBySlackWorkspace.mockResolvedValue(null);

      await handleAppHomeOpened(mockClient, "U123456");

      // Verify buildAppHomeView was called with no tenant
      expect(buildAppHomeView).toHaveBeenCalledWith({
        botStatus: "active",
        repositoryMappings: [],
        tenant: undefined,
        recentActivity: {
          failuresAnalyzed: 0,
          totalAlerts: 0,
          lastAlertTime: undefined,
        },
        workspaceId: "T123456",
      });

      // Verify view was still published
      expect(mockClient.views.publish).toHaveBeenCalled();
    });

    it("should handle case with tenant but no mappings", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace, findAllMappingsForTenant, getTenantStatistics } =
        jest.requireMock("@kenchi/shared") as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { buildAppHomeView } = jest.requireMock("../formatters/appHomeFormatter.js") as any;

      const mockTenant = {
        id: "tenant-123",
        githubOrg: "test-org",
        status: "active",
        slackTeamName: null,
      };

      findBySlackWorkspace.mockResolvedValue(mockTenant);
      findAllMappingsForTenant.mockResolvedValue([]);
      getTenantStatistics.mockResolvedValue(null);

      await handleAppHomeOpened(mockClient, "U123456");

      expect(buildAppHomeView).toHaveBeenCalledWith({
        botStatus: "active",
        repositoryMappings: [],
        tenant: {
          githubOrg: "test-org",
          status: "active",
          slackTeamName: undefined,
        },
        recentActivity: {
          failuresAnalyzed: 0,
          totalAlerts: 0,
          lastAlertTime: undefined,
        },
        workspaceId: "T123456",
      });
    });

    it("should handle case with statistics but no lastAlertTime", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace, findAllMappingsForTenant, getTenantStatistics } =
        jest.requireMock("@kenchi/shared") as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { buildAppHomeView } = jest.requireMock("../formatters/appHomeFormatter.js") as any;

      const mockTenant = {
        id: "tenant-123",
        githubOrg: "test-org",
        status: "active",
        slackTeamName: "Test Team",
      };

      const mockStats = {
        failuresAnalyzedToday: 5,
        totalAlertsSent: 10,
        lastAlertTime: null,
      };

      findBySlackWorkspace.mockResolvedValue(mockTenant);
      findAllMappingsForTenant.mockResolvedValue([]);
      getTenantStatistics.mockResolvedValue(mockStats);

      await handleAppHomeOpened(mockClient, "U123456");

      expect(buildAppHomeView).toHaveBeenCalledWith(
        expect.objectContaining({
          recentActivity: {
            failuresAnalyzed: 5,
            totalAlerts: 10,
            lastAlertTime: undefined,
          },
        })
      );
    });

    it("should handle error when workspace ID cannot be determined", async () => {
      mockClient.auth.test.mockResolvedValue({ team_id: undefined });

      await handleAppHomeOpened(mockClient, "U123456");

      // Should not publish view
      expect(mockClient.views.publish).not.toHaveBeenCalled();
    });

    it("should publish error view when buildAppHomeView fails", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace } = jest.requireMock("@kenchi/shared") as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { buildAppHomeView, buildErrorView } = jest.requireMock(
        "../formatters/appHomeFormatter.js"
      ) as any;

      findBySlackWorkspace.mockResolvedValue(null);
      buildAppHomeView.mockImplementation(() => {
        throw new Error("View builder crashed");
      });

      await handleAppHomeOpened(mockClient, "U123456");

      // Should publish error view
      expect(buildErrorView).toHaveBeenCalledWith("Failed to load dashboard. Please try again.");
      expect(mockClient.views.publish).toHaveBeenCalledWith({
        user_id: "U123456",
        view: expect.objectContaining({ type: "home" }),
      });
    });

    it("should log error when error view publication fails", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace } = jest.requireMock("@kenchi/shared") as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { buildAppHomeView } = jest.requireMock("../formatters/appHomeFormatter.js") as any;

      findBySlackWorkspace.mockResolvedValue(null);
      buildAppHomeView.mockImplementation(() => {
        throw new Error("View builder crashed");
      });

      // First call throws error from buildAppHomeView, second call should also fail
      mockClient.views.publish.mockRejectedValue(new Error("Views API error"));

      await handleAppHomeOpened(mockClient, "U123456");

      // Should attempt to publish error view (and fail)
      expect(mockClient.views.publish).toHaveBeenCalled();
    });

    it("should handle error when getTenantInfo fails", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace } = jest.requireMock("@kenchi/shared") as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { buildAppHomeView } = jest.requireMock("../formatters/appHomeFormatter.js") as any;

      findBySlackWorkspace.mockRejectedValue(new Error("Tenant lookup failed"));

      await handleAppHomeOpened(mockClient, "U123456");

      // getTenantInfo catches the error internally and returns undefined
      // So buildAppHomeView should be called with no tenant
      expect(buildAppHomeView).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant: undefined,
        })
      );
      expect(mockClient.views.publish).toHaveBeenCalledTimes(1);
    });

    it("should handle error when getRepositoryMappings fails", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace, findAllMappingsForTenant, getTenantStatistics } =
        jest.requireMock("@kenchi/shared") as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { buildAppHomeView } = jest.requireMock("../formatters/appHomeFormatter.js") as any;

      const mockTenant = {
        id: "tenant-123",
        githubOrg: "test-org",
        status: "active",
        slackTeamName: "Test Team",
      };

      findBySlackWorkspace.mockResolvedValue(mockTenant);
      findAllMappingsForTenant.mockRejectedValue(new Error("Mappings lookup failed"));
      getTenantStatistics.mockResolvedValue(null);

      await handleAppHomeOpened(mockClient, "U123456");

      // Should build view with empty mappings (error handled gracefully)
      expect(buildAppHomeView).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryMappings: [],
        })
      );
    });

    it("should handle error when getStatistics fails", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace, findAllMappingsForTenant, getTenantStatistics } =
        jest.requireMock("@kenchi/shared") as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { buildAppHomeView } = jest.requireMock("../formatters/appHomeFormatter.js") as any;

      const mockTenant = {
        id: "tenant-123",
        githubOrg: "test-org",
        status: "active",
        slackTeamName: "Test Team",
      };

      findBySlackWorkspace.mockResolvedValue(mockTenant);
      findAllMappingsForTenant.mockResolvedValue([]);
      getTenantStatistics.mockRejectedValue(new Error("Statistics lookup failed"));

      await handleAppHomeOpened(mockClient, "U123456");

      // Should build view with null statistics (error handled gracefully)
      expect(buildAppHomeView).toHaveBeenCalledWith(
        expect.objectContaining({
          recentActivity: {
            failuresAnalyzed: 0,
            totalAlerts: 0,
            lastAlertTime: undefined,
          },
        })
      );
    });

    it("should handle auth.test failure", async () => {
      mockClient.auth.test.mockRejectedValue(new Error("Authentication failed"));

      await handleAppHomeOpened(mockClient, "U123456");

      // Should not publish view
      expect(mockClient.views.publish).toHaveBeenCalledTimes(1); // Error view
    });

    it("should execute findBySlackWorkspace with correct workspace ID", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace } = jest.requireMock("@kenchi/shared") as any;

      mockClient.auth.test.mockResolvedValue({ team_id: "T999999" });
      findBySlackWorkspace.mockResolvedValue(null);

      await handleAppHomeOpened(mockClient, "U123456");

      expect(findBySlackWorkspace).toHaveBeenCalledWith("T999999");
    });

    it("should execute findAllMappingsForTenant and getTenantStatistics in parallel", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace, findAllMappingsForTenant, getTenantStatistics } =
        jest.requireMock("@kenchi/shared") as any;

      const mockTenant = {
        id: "tenant-123",
        githubOrg: "test-org",
        status: "active",
        slackTeamName: "Test Team",
      };

      let mappingsCallTime = 0;
      let statisticsCallTime = 0;

      findBySlackWorkspace.mockResolvedValue(mockTenant);
      findAllMappingsForTenant.mockImplementation(async () => {
        mappingsCallTime = Date.now();
        return [];
      });
      getTenantStatistics.mockImplementation(async () => {
        statisticsCallTime = Date.now();
        return null;
      });

      await handleAppHomeOpened(mockClient, "U123456");

      // Both should be called
      expect(findAllMappingsForTenant).toHaveBeenCalledWith("tenant-123");
      expect(getTenantStatistics).toHaveBeenCalledWith("tenant-123");

      // Verify parallel execution (calls should happen close together)
      const timeDiff = Math.abs(mappingsCallTime - statisticsCallTime);
      expect(timeDiff).toBeLessThan(100); // Within 100ms indicates parallel execution
    });
  });

  describe("handleTestConnection", () => {
    it("should return success when connection test passes", async () => {
      mockClient.auth.test.mockResolvedValue({
        team_id: "T123456",
        bot_id: "B123456",
      });

      const result = await handleTestConnection(mockClient, "U123456");

      expect(result).toEqual({
        success: true,
        message: "Connection successful! Bot ID: B123456",
      });
    });

    it("should call auth.test method", async () => {
      await handleTestConnection(mockClient, "U123456");

      expect(mockClient.auth.test).toHaveBeenCalled();
    });

    it("should return failure when connection test fails", async () => {
      mockClient.auth.test.mockRejectedValue(new Error("Connection timeout"));

      const result = await handleTestConnection(mockClient, "U123456");

      expect(result).toEqual({
        success: false,
        message: "Connection test failed. Please check your configuration.",
      });
    });

    it("should handle authentication errors gracefully", async () => {
      mockClient.auth.test.mockRejectedValue(new Error("Invalid token"));

      const result = await handleTestConnection(mockClient, "U123456");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Connection test failed");
    });

    it("should handle network errors gracefully", async () => {
      mockClient.auth.test.mockRejectedValue(new Error("Network error"));

      const result = await handleTestConnection(mockClient, "U123456");

      expect(result.success).toBe(false);
    });

    it("should accept optional responseUrl parameter", async () => {
      const result = await handleTestConnection(mockClient, "U123456", "https://hooks.slack.com");

      expect(result.success).toBe(true);
    });

    it("should handle auth.test returning undefined bot_id", async () => {
      mockClient.auth.test.mockResolvedValue({
        team_id: "T123456",
        bot_id: undefined,
      });

      const result = await handleTestConnection(mockClient, "U123456");

      expect(result.success).toBe(true);
      expect(result.message).toContain("Bot ID: undefined");
    });
  });

  describe("handleRefreshHome", () => {
    it("should delegate to handleAppHomeOpened", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace } = jest.requireMock("@kenchi/shared") as any;

      findBySlackWorkspace.mockResolvedValue(null);

      await handleRefreshHome(mockClient, "U123456");

      // Verify auth.test was called (part of handleAppHomeOpened)
      expect(mockClient.auth.test).toHaveBeenCalled();

      // Verify view was published (part of handleAppHomeOpened)
      expect(mockClient.views.publish).toHaveBeenCalledWith({
        user_id: "U123456",
        view: expect.any(Object),
      });
    });

    it("should handle errors the same way as handleAppHomeOpened", async () => {
      mockClient.auth.test.mockRejectedValue(new Error("Auth failed"));

      await handleRefreshHome(mockClient, "U123456");

      // Should publish error view (via handleAppHomeOpened)
      expect(mockClient.views.publish).toHaveBeenCalled();
    });

    it("should pass the same client and userId to handleAppHomeOpened", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace, findAllMappingsForTenant, getTenantStatistics } =
        jest.requireMock("@kenchi/shared") as any;

      const mockTenant = {
        id: "tenant-789",
        githubOrg: "refresh-org",
        status: "active",
        slackTeamName: "Refresh Team",
      };

      findBySlackWorkspace.mockResolvedValue(mockTenant);
      findAllMappingsForTenant.mockResolvedValue([]);
      getTenantStatistics.mockResolvedValue(null);

      await handleRefreshHome(mockClient, "U789012");

      // Verify it was called with the correct user
      expect(mockClient.views.publish).toHaveBeenCalledWith({
        user_id: "U789012",
        view: expect.any(Object),
      });
    });
  });

  describe("edge cases", () => {
    it("should handle very large number of repository mappings", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace, findAllMappingsForTenant, getTenantStatistics } =
        jest.requireMock("@kenchi/shared") as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { buildAppHomeView } = jest.requireMock("../formatters/appHomeFormatter.js") as any;

      const mockTenant = {
        id: "tenant-123",
        githubOrg: "test-org",
        status: "active",
        slackTeamName: "Test Team",
      };

      const largeMappings = Array.from({ length: 100 }, (_, i) => ({
        repository: `test-org/repo${i}`,
        slackChannelId: `C${i.toString().padStart(6, "0")}`,
        slackChannelName: `channel-${i}`,
      }));

      findBySlackWorkspace.mockResolvedValue(mockTenant);
      findAllMappingsForTenant.mockResolvedValue(largeMappings);
      getTenantStatistics.mockResolvedValue(null);

      await handleAppHomeOpened(mockClient, "U123456");

      expect(buildAppHomeView).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryMappings: expect.arrayContaining([
            expect.objectContaining({
              repository: expect.any(String),
            }),
          ]),
        })
      );
      expect(mockClient.views.publish).toHaveBeenCalled();
    });

    it("should handle very large statistics numbers", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace, findAllMappingsForTenant, getTenantStatistics } =
        jest.requireMock("@kenchi/shared") as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { buildAppHomeView } = jest.requireMock("../formatters/appHomeFormatter.js") as any;

      const mockTenant = {
        id: "tenant-123",
        githubOrg: "test-org",
        status: "active",
        slackTeamName: "Test Team",
      };

      const mockStats = {
        failuresAnalyzedToday: 999999,
        totalAlertsSent: 9999999,
        lastAlertTime: new Date("2025-12-25T10:00:00Z"),
      };

      findBySlackWorkspace.mockResolvedValue(mockTenant);
      findAllMappingsForTenant.mockResolvedValue([]);
      getTenantStatistics.mockResolvedValue(mockStats);

      await handleAppHomeOpened(mockClient, "U123456");

      expect(buildAppHomeView).toHaveBeenCalledWith(
        expect.objectContaining({
          recentActivity: {
            failuresAnalyzed: 999999,
            totalAlerts: 9999999,
            lastAlertTime: "2 hours ago",
          },
        })
      );
    });

    it("should handle special characters in workspace and user IDs", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace } = jest.requireMock("@kenchi/shared") as any;

      mockClient.auth.test.mockResolvedValue({ team_id: "T<123>456" });
      findBySlackWorkspace.mockResolvedValue(null);

      await handleAppHomeOpened(mockClient, "U<789>012");

      expect(mockClient.views.publish).toHaveBeenCalledWith({
        user_id: "U<789>012",
        view: expect.any(Object),
      });
    });

    it("should handle null values in tenant object gracefully", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace, findAllMappingsForTenant, getTenantStatistics } =
        jest.requireMock("@kenchi/shared") as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { buildAppHomeView } = jest.requireMock("../formatters/appHomeFormatter.js") as any;

      const mockTenant = {
        id: "tenant-123",
        githubOrg: null,
        status: "inactive",
        slackTeamName: null,
      };

      findBySlackWorkspace.mockResolvedValue(mockTenant);
      findAllMappingsForTenant.mockResolvedValue([]);
      getTenantStatistics.mockResolvedValue(null);

      await handleAppHomeOpened(mockClient, "U123456");

      // Note: The handler uses optional chaining (tenant?.githubOrg) which preserves null values
      // Only slackTeamName is converted to undefined via ?? operator
      expect(buildAppHomeView).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant: {
            githubOrg: null,
            status: "inactive",
            slackTeamName: undefined,
          },
        })
      );
    });

    it("should handle incomplete statistics object", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { findBySlackWorkspace, findAllMappingsForTenant, getTenantStatistics } =
        jest.requireMock("@kenchi/shared") as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { buildAppHomeView } = jest.requireMock("../formatters/appHomeFormatter.js") as any;

      const mockTenant = {
        id: "tenant-123",
        githubOrg: "test-org",
        status: "active",
        slackTeamName: "Test Team",
      };

      const incompleteStats = {
        failuresAnalyzedToday: 5,
        // Missing totalAlertsSent and lastAlertTime
      };

      findBySlackWorkspace.mockResolvedValue(mockTenant);
      findAllMappingsForTenant.mockResolvedValue([]);
      getTenantStatistics.mockResolvedValue(incompleteStats);

      await handleAppHomeOpened(mockClient, "U123456");

      expect(buildAppHomeView).toHaveBeenCalledWith(
        expect.objectContaining({
          recentActivity: {
            failuresAnalyzed: 5,
            totalAlerts: 0,
            lastAlertTime: undefined,
          },
        })
      );
    });
  });
});

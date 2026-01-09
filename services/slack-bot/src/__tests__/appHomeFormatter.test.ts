/**
 * Unit tests for App Home Formatter
 */

import { describe, it, expect } from "@jest/globals";
import {
  buildAppHomeView,
  buildLoadingView,
  buildErrorView,
  type AppHomeContext,
  type RepositoryMappingDisplay,
} from "../formatters/appHomeFormatter.js";

describe("App Home Formatter", () => {
  // Test fixtures
  const createMockContext = (overrides: Partial<AppHomeContext> = {}): AppHomeContext => ({
    botStatus: "active",
    repositoryMappings: [],
    workspaceId: "T123456",
    ...overrides,
  });

  const createMockMapping = (
    overrides: Partial<RepositoryMappingDisplay> = {}
  ): RepositoryMappingDisplay => ({
    repository: "owner/repo",
    channelId: "C123456",
    channelName: "general",
    ...overrides,
  });

  describe("buildAppHomeView", () => {
    it("should return a home view type", () => {
      const context = createMockContext();
      const view = buildAppHomeView(context);

      expect(view.type).toBe("home");
    });

    it("should include blocks array", () => {
      const context = createMockContext();
      const view = buildAppHomeView(context);

      expect(Array.isArray(view.blocks)).toBe(true);
      expect(view.blocks.length).toBeGreaterThan(0);
    });

    it("should include branded header", () => {
      const context = createMockContext();
      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("Kenchi DevOps Assistant");
    });

    it("should show active bot status", () => {
      const context = createMockContext({ botStatus: "active" });
      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("Connected & Running");
    });

    it("should show inactive bot status", () => {
      const context = createMockContext({ botStatus: "inactive" });
      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("Disconnected");
    });

    it("should show GitHub connection when tenant exists", () => {
      const context = createMockContext({
        tenant: {
          githubOrg: "myorg",
          status: "active",
        },
      });
      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("myorg");
      expect(content).toContain("Connected to");
    });

    it("should show not connected when no tenant", () => {
      const context = createMockContext({
        tenant: undefined,
      });
      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("Not connected");
    });

    it("should show not connected when tenant is inactive", () => {
      const context = createMockContext({
        tenant: {
          githubOrg: "myorg",
          status: "inactive",
        },
      });
      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("Not connected");
    });

    it("should show empty state when no repositories configured", () => {
      const context = createMockContext({
        repositoryMappings: [],
      });
      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("No repositories configured yet");
    });

    it("should list single repository mapping", () => {
      const mapping = createMockMapping({ repository: "owner/repo" });
      const context = createMockContext({
        repositoryMappings: [mapping],
      });
      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("owner/repo");
      expect(content).toContain("C123456");
    });

    it("should list multiple repository mappings", () => {
      const mappings = [
        createMockMapping({ repository: "owner/repo1", channelId: "C111111" }),
        createMockMapping({ repository: "owner/repo2", channelId: "C222222" }),
        createMockMapping({ repository: "owner/repo3", channelId: "C333333" }),
      ];
      const context = createMockContext({
        repositoryMappings: mappings,
      });
      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("owner/repo1");
      expect(content).toContain("owner/repo2");
      expect(content).toContain("owner/repo3");
      expect(content).toContain("3 repositories configured");
    });

    it("should show singular repository text for one repo", () => {
      const mapping = createMockMapping();
      const context = createMockContext({
        repositoryMappings: [mapping],
      });
      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("1 repository configured");
    });

    it("should show recent activity statistics when provided", () => {
      const context = createMockContext({
        recentActivity: {
          failuresAnalyzed: 42,
          totalAlerts: 100,
        },
      });
      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("42 today");
      expect(content).toContain("100 total");
    });

    it("should show zero statistics when no activity", () => {
      const context = createMockContext({
        recentActivity: undefined,
      });
      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("0 today");
      expect(content).toContain("0 total");
    });

    it("should show last alert time when available", () => {
      const context = createMockContext({
        recentActivity: {
          failuresAnalyzed: 5,
          lastAlertTime: "2 hours ago",
        },
      });
      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("2 hours ago");
    });

    it("should show no alerts sent yet when no last alert time", () => {
      const context = createMockContext({
        recentActivity: {
          failuresAnalyzed: 0,
        },
      });
      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("No alerts sent yet");
    });

    it("should include features section", () => {
      const context = createMockContext();
      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("What I Can Do");
      expect(content).toContain("Analyze CI Failures");
      expect(content).toContain("Smart Notifications");
    });

    it("should include refresh button in quick actions", () => {
      const context = createMockContext();
      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("Refresh");
      expect(content).toContain("refresh_home");
    });

    it("should include test connection button", () => {
      const context = createMockContext();
      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("Test Connection");
      expect(content).toContain("test_connection");
    });

    it("should include GitHub connect button when not connected", () => {
      const context = createMockContext({
        tenant: undefined,
        workspaceId: "T123456",
      });
      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("Connect GitHub");
      expect(content).toContain("connect_github");
      expect(content).toContain("T123456");
    });

    it("should not include GitHub connect button when already connected", () => {
      const context = createMockContext({
        tenant: {
          githubOrg: "myorg",
          status: "active",
        },
      });
      const view = buildAppHomeView(context);

      // Should not have connect button
      const actionBlocks = view.blocks.filter((block) => block.type === "actions");
      const hasConnectButton = actionBlocks.some((block) =>
        JSON.stringify(block).includes("Connect GitHub")
      );
      expect(hasConnectButton).toBe(false);
    });

    it("should include commands reference section", () => {
      const context = createMockContext();
      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("Available Commands");
      expect(content).toContain("/kenchi configure");
      expect(content).toContain("/kenchi unconfigure");
      expect(content).toContain("/kenchi status");
    });

    it("should include resources section with documentation link", () => {
      const context = createMockContext();
      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("Resources");
      expect(content).toContain("Documentation");
      expect(content).toContain("Get Support");
    });

    it("should include footer with workspace ID", () => {
      const context = createMockContext({ workspaceId: "T999999" });
      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("T999999");
    });

    it("should include tenant name in footer when available", () => {
      const context = createMockContext({
        tenant: {
          slackTeamName: "Acme Corp",
          status: "active",
        },
      });
      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("Acme Corp");
    });

    it("should include dividers between sections", () => {
      const context = createMockContext();
      const view = buildAppHomeView(context);

      const dividers = view.blocks.filter((block) => block.type === "divider");
      expect(dividers.length).toBeGreaterThan(3);
    });

    it("should handle missing channel name in repository mapping", () => {
      const mapping = createMockMapping({ channelName: null });
      const context = createMockContext({
        repositoryMappings: [mapping],
      });
      const view = buildAppHomeView(context);

      // Should not throw
      expect(view.blocks.length).toBeGreaterThan(0);
    });

    it("should handle bot version info when available", () => {
      const context = createMockContext({
        botInfo: {
          version: "1.0.0",
          uptime: "3 days",
        },
      });
      const view = buildAppHomeView(context);

      // Should not throw - version info is optional
      expect(view.blocks.length).toBeGreaterThan(0);
    });

    it("should handle success rate in recent activity", () => {
      const context = createMockContext({
        recentActivity: {
          failuresAnalyzed: 10,
          successRate: 0.95,
        },
      });
      const view = buildAppHomeView(context);

      // Should not throw - success rate is optional
      expect(view.blocks.length).toBeGreaterThan(0);
    });
  });

  describe("buildLoadingView", () => {
    it("should return a home view type", () => {
      const view = buildLoadingView();

      expect(view.type).toBe("home");
    });

    it("should include loading message", () => {
      const view = buildLoadingView();
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("Loading your dashboard");
    });

    it("should include loading emoji", () => {
      const view = buildLoadingView();
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("hourglass");
    });

    it("should have at least one block", () => {
      const view = buildLoadingView();

      expect(view.blocks.length).toBeGreaterThan(0);
    });
  });

  describe("buildErrorView", () => {
    it("should return a home view type", () => {
      const view = buildErrorView("Test error message");

      expect(view.type).toBe("home");
    });

    it("should include error message", () => {
      const errorMessage = "Something went wrong with the API";
      const view = buildErrorView(errorMessage);
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("Something went wrong with the API");
    });

    it("should include warning emoji", () => {
      const view = buildErrorView("Error occurred");
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("warning");
    });

    it("should include branded header", () => {
      const view = buildErrorView("Error occurred");
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("Kenchi DevOps Assistant");
    });

    it("should include refresh button", () => {
      const view = buildErrorView("Error occurred");
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("Refresh");
      expect(content).toContain("refresh_home");
    });

    it("should handle empty error message", () => {
      const view = buildErrorView("");

      // Should still render view
      expect(view.blocks.length).toBeGreaterThan(0);
    });

    it("should handle very long error message", () => {
      const longError = "A".repeat(1000);
      const view = buildErrorView(longError);

      expect(view.blocks.length).toBeGreaterThan(0);
    });

    it("should handle special characters in error message", () => {
      const view = buildErrorView("Error: <script>alert('xss')</script>");
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("Error:");
    });

    it("should handle unicode in error message", () => {
      const view = buildErrorView("エラー: 問題が発生しました 🔥");
      const content = JSON.stringify(view.blocks);

      expect(content).toContain("エラー");
    });

    it("should have divider between header and content", () => {
      const view = buildErrorView("Error message");

      const dividers = view.blocks.filter((block) => block.type === "divider");
      expect(dividers.length).toBeGreaterThan(0);
    });
  });

  describe("edge cases and error handling", () => {
    it("should handle context with all optional fields missing", () => {
      const minimalContext: AppHomeContext = {
        botStatus: "active",
        repositoryMappings: [],
        workspaceId: "T123456",
      };

      const view = buildAppHomeView(minimalContext);
      expect(view.blocks.length).toBeGreaterThan(0);
    });

    it("should handle empty workspace ID", () => {
      const context = createMockContext({ workspaceId: "" });
      const view = buildAppHomeView(context);

      expect(view.blocks.length).toBeGreaterThan(0);
    });

    it("should handle very large number of repository mappings", () => {
      const mappings = Array.from({ length: 100 }, (_, i) =>
        createMockMapping({
          repository: `owner/repo${i}`,
          channelId: `C${i.toString().padStart(6, "0")}`,
        })
      );
      const context = createMockContext({
        repositoryMappings: mappings,
      });

      const view = buildAppHomeView(context);
      expect(view.blocks.length).toBeGreaterThan(0);
    });

    it("should handle repository name with special characters", () => {
      const mapping = createMockMapping({
        repository: "org-name/repo.name-with-dots",
      });
      const context = createMockContext({
        repositoryMappings: [mapping],
      });

      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);
      expect(content).toContain("org-name/repo.name-with-dots");
    });

    it("should handle negative statistics gracefully", () => {
      const context = createMockContext({
        recentActivity: {
          failuresAnalyzed: -1,
          totalAlerts: -5,
        },
      });

      const view = buildAppHomeView(context);
      // Should render without errors
      expect(view.blocks.length).toBeGreaterThan(0);
    });

    it("should handle very large statistics numbers", () => {
      const context = createMockContext({
        recentActivity: {
          failuresAnalyzed: 999999,
          totalAlerts: 1000000,
        },
      });

      const view = buildAppHomeView(context);
      const content = JSON.stringify(view.blocks);
      expect(content).toContain("999999");
      expect(content).toContain("1000000");
    });
  });
});

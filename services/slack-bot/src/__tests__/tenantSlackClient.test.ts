/**
 * Unit tests for Tenant Slack Client
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
  getSlackClientForTenant,
  getCachedWorkspaceId,
  invalidateTenantClient,
  clearAllCachedClients,
  getCacheStats,
  isMultiTenantEnabled,
} from "../services/tenantSlackClient.js";

// Type for mock logger
interface MockLogger {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
}

// Type for mocked module - using jest.Mock for compatibility
interface MockedSharedModule {
  createLogger: jest.Mock;
  mockLogger: MockLogger;
  findTenantByGitHubInstallation: jest.Mock;
  findSlackConnection: jest.Mock;
  NotFoundError: typeof Error;
  config: {
    NODE_ENV: string;
    MULTI_TENANT_MODE: boolean | null | undefined | string | number;
  };
  SLACK_CLIENT_CACHE: {
    TTL_MS: number;
    CLEANUP_INTERVAL_MS: number;
  };
}

interface MockedWebApiModule {
  WebClient: jest.Mock;
  LogLevel: {
    DEBUG: string;
    INFO: string;
    WARN: string;
    ERROR: string;
  };
}

// ==================== Mock Helpers ====================
// These helpers work around jest.Mock typing limitations in @jest/globals
// by providing properly typed wrappers for mock methods

interface MockMethods {
  mockResolvedValue: (value: unknown) => MockMethods;
  mockResolvedValueOnce: (value: unknown) => MockMethods;
  mockReturnValue: (value: unknown) => MockMethods;
  mockReturnValueOnce: (value: unknown) => MockMethods;
  mockRejectedValue: (value: unknown) => MockMethods;
  mockImplementation: (fn: (...args: unknown[]) => unknown) => MockMethods;
}

const asMock = (mock: jest.Mock): MockMethods => mock as unknown as MockMethods;

// Mock WebClient from @slack/web-api
jest.mock("@slack/web-api", () => ({
  WebClient: jest.fn(),
  LogLevel: {
    DEBUG: "DEBUG",
    INFO: "INFO",
    WARN: "WARN",
    ERROR: "ERROR",
  },
}));

// Mock dependencies from @kenchi/shared
// Create a single mock logger instance that's shared across all calls
jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  return {
    ...actual,
    createLogger: jest.fn(() => mockLogger),
    mockLogger, // Export for direct test access
    findTenantByGitHubInstallation: jest.fn(),
    findSlackConnection: jest.fn(),
    config: {
      NODE_ENV: "test",
      MULTI_TENANT_MODE: false,
    },
    SLACK_CLIENT_CACHE: {
      TTL_MS: 5 * 60 * 1000,
      CLEANUP_INTERVAL_MS: 60 * 1000,
    },
  };
});

describe("Tenant Slack Client", () => {
  // Get typed mocks
  const getMockedShared = (): MockedSharedModule =>
    jest.requireMock("@kenchi/shared") as MockedSharedModule;
  const getMockedWebApi = (): MockedWebApiModule =>
    jest.requireMock("@slack/web-api") as MockedWebApiModule;

  beforeEach(() => {
    jest.clearAllMocks();
    clearAllCachedClients();

    // Reset config
    const { config } = getMockedShared();
    config.NODE_ENV = "test";
    config.MULTI_TENANT_MODE = false;
  });

  // Helper to mock the two-step lookup pattern
  const mockTenantAndConnection = (
    shared: MockedSharedModule,
    installationId: number,
    token: string,
    workspaceId: string
  ): void => {
    asMock(shared.findTenantByGitHubInstallation).mockResolvedValue({
      id: `tenant-for-${installationId}`,
    });
    asMock(shared.findSlackConnection).mockResolvedValue({
      id: `prc_slack_${installationId}`,
      accessToken: token,
      externalOrgId: workspaceId,
    });
  };

  describe("getSlackClientForTenant", () => {
    it("should create new client and cache it on first call", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      mockTenantAndConnection(shared, 12345, "xoxb-test-token-123", "T123456");

      const mockClientInstance = { chat: { postMessage: jest.fn() } };
      asMock(WebClient).mockReturnValue(mockClientInstance);

      const result = await getSlackClientForTenant(12345);

      expect(shared.findTenantByGitHubInstallation).toHaveBeenCalledWith(12345);
      expect(shared.findSlackConnection).toHaveBeenCalledWith("tenant-for-12345");
      expect(WebClient).toHaveBeenCalledWith("xoxb-test-token-123", {
        logLevel: "ERROR",
      });
      expect(result).toBe(mockClientInstance);

      const { mockLogger } = shared;
      expect(mockLogger.info).toHaveBeenCalledWith("Created new Slack client for tenant", {
        installationId: 12345,
        workspaceId: "T123456",
      });
    });

    it("should return cached client if not expired", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      mockTenantAndConnection(shared, 12345, "xoxb-test-token-123", "T123456");

      const mockClientInstance = { chat: { postMessage: jest.fn() } };
      asMock(WebClient).mockReturnValue(mockClientInstance);

      // First call creates and caches
      const result1 = await getSlackClientForTenant(12345);
      expect(WebClient).toHaveBeenCalledTimes(1);

      // Second call should return cached client
      const result2 = await getSlackClientForTenant(12345);
      expect(WebClient).toHaveBeenCalledTimes(1); // Not called again
      expect(shared.findTenantByGitHubInstallation).toHaveBeenCalledTimes(1); // Not called again
      expect(result1).toBe(result2);

      const { mockLogger } = shared;
      expect(mockLogger.debug).toHaveBeenCalledWith("Using cached Slack client", {
        installationId: 12345,
      });
    });

    it("should create new client if cache expired", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      mockTenantAndConnection(shared, 12345, "xoxb-test-token-123", "T123456");

      const mockClientInstance1 = { chat: { postMessage: jest.fn() } };
      const mockClientInstance2 = { chat: { update: jest.fn() } };
      asMock(WebClient)
        .mockReturnValueOnce(mockClientInstance1)
        .mockReturnValueOnce(mockClientInstance2);

      // First call creates and caches
      const result1 = await getSlackClientForTenant(12345);
      expect(result1).toBe(mockClientInstance1);

      // Mock Date.now to simulate cache expiration (5 minutes + 1ms)
      const originalDateNow = Date.now;
      const startTime = Date.now();
      Date.now = jest.fn(() => startTime + 5 * 60 * 1000 + 1);

      try {
        // Second call after expiration should create new client
        const result2 = await getSlackClientForTenant(12345);
        expect(WebClient).toHaveBeenCalledTimes(2);
        expect(shared.findTenantByGitHubInstallation).toHaveBeenCalledTimes(2);
        expect(result2).toBe(mockClientInstance2);
      } finally {
        Date.now = originalDateNow;
      }
    });

    it("should throw NotFoundError if no tenant found", async () => {
      const shared = getMockedShared();

      asMock(shared.findTenantByGitHubInstallation).mockResolvedValue(null);

      await expect(getSlackClientForTenant(99999)).rejects.toThrow(shared.NotFoundError);
    });

    it("should throw NotFoundError if no Slack connection found", async () => {
      const shared = getMockedShared();

      asMock(shared.findTenantByGitHubInstallation).mockResolvedValue({ id: "tenant-99999" });
      asMock(shared.findSlackConnection).mockResolvedValue(null);

      await expect(getSlackClientForTenant(99999)).rejects.toThrow(
        "No Slack credentials found for installation 99999"
      );
      await expect(getSlackClientForTenant(99999)).rejects.toThrow(
        "Ensure the tenant has completed Slack OAuth"
      );
    });

    it("should log info when creating new client", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      mockTenantAndConnection(shared, 67890, "xoxb-test-token-456", "T789012");
      asMock(WebClient).mockReturnValue({ chat: {} });

      await getSlackClientForTenant(67890);

      const { mockLogger } = shared;
      expect(mockLogger.info).toHaveBeenCalledWith("Created new Slack client for tenant", {
        installationId: 67890,
        workspaceId: "T789012",
      });
    });

    it("should use DEBUG log level in development environment", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      shared.config.NODE_ENV = "development";
      mockTenantAndConnection(shared, 11111, "xoxb-test-token-dev", "T111111");
      asMock(WebClient).mockReturnValue({ chat: {} });

      await getSlackClientForTenant(11111);

      expect(WebClient).toHaveBeenCalledWith("xoxb-test-token-dev", {
        logLevel: "DEBUG",
      });
    });

    it("should use ERROR log level in production environment", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      shared.config.NODE_ENV = "production";
      mockTenantAndConnection(shared, 22222, "xoxb-test-token-prod", "T222222");
      asMock(WebClient).mockReturnValue({ chat: {} });

      await getSlackClientForTenant(22222);

      expect(WebClient).toHaveBeenCalledWith("xoxb-test-token-prod", {
        logLevel: "ERROR",
      });
    });

    it("should use ERROR log level for unknown environment", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      shared.config.NODE_ENV = "staging";
      mockTenantAndConnection(shared, 33333, "xoxb-test-token-staging", "T333333");
      asMock(WebClient).mockReturnValue({ chat: {} });

      await getSlackClientForTenant(33333);

      expect(WebClient).toHaveBeenCalledWith("xoxb-test-token-staging", {
        logLevel: "ERROR",
      });
    });

    it("should cache different clients for different installation IDs", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      asMock(shared.findTenantByGitHubInstallation)
        .mockResolvedValueOnce({ id: "tenant-for-11111" })
        .mockResolvedValueOnce({ id: "tenant-for-22222" });
      asMock(shared.findSlackConnection)
        .mockResolvedValueOnce({
          id: "prc1",
          accessToken: "xoxb-token-1",
          externalOrgId: "T111111",
        })
        .mockResolvedValueOnce({
          id: "prc2",
          accessToken: "xoxb-token-2",
          externalOrgId: "T222222",
        });

      const mockClient1 = { id: "client1" };
      const mockClient2 = { id: "client2" };
      asMock(WebClient).mockReturnValueOnce(mockClient1).mockReturnValueOnce(mockClient2);

      const result1 = await getSlackClientForTenant(11111);
      const result2 = await getSlackClientForTenant(22222);

      expect(result1).toBe(mockClient1);
      expect(result2).toBe(mockClient2);
      expect(WebClient).toHaveBeenCalledTimes(2);

      const stats = getCacheStats();
      expect(stats.size).toBe(2);
      expect(stats.installationIds).toContain(11111);
      expect(stats.installationIds).toContain(22222);
    });

    it("should handle connection with undefined externalOrgId gracefully", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      asMock(shared.findTenantByGitHubInstallation).mockResolvedValue({ id: "tenant-44444" });
      asMock(shared.findSlackConnection).mockResolvedValue({
        id: "prc_slack_44444",
        accessToken: "xoxb-test-token",
        externalOrgId: undefined,
      });
      asMock(WebClient).mockReturnValue({ chat: {} });

      const result = await getSlackClientForTenant(44444);

      expect(result).toBeDefined();
      expect(WebClient).toHaveBeenCalledWith("xoxb-test-token", expect.any(Object));
    });
  });

  describe("getCachedWorkspaceId", () => {
    it("should return workspace ID from cache", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      mockTenantAndConnection(shared, 55555, "xoxb-test-token", "T555555");
      asMock(WebClient).mockReturnValue({ chat: {} });

      await getSlackClientForTenant(55555);

      const workspaceId = getCachedWorkspaceId(55555);
      expect(workspaceId).toBe("T555555");
    });

    it("should return null if installation not cached", () => {
      const workspaceId = getCachedWorkspaceId(99999);
      expect(workspaceId).toBeNull();
    });

    it("should return null after cache is cleared", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      mockTenantAndConnection(shared, 66666, "xoxb-test-token", "T666666");
      asMock(WebClient).mockReturnValue({ chat: {} });

      await getSlackClientForTenant(66666);
      expect(getCachedWorkspaceId(66666)).toBe("T666666");

      clearAllCachedClients();
      expect(getCachedWorkspaceId(66666)).toBeNull();
    });

    it("should return null after specific client is invalidated", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      mockTenantAndConnection(shared, 77777, "xoxb-test-token", "T777777");
      asMock(WebClient).mockReturnValue({ chat: {} });

      await getSlackClientForTenant(77777);
      expect(getCachedWorkspaceId(77777)).toBe("T777777");

      invalidateTenantClient(77777);
      expect(getCachedWorkspaceId(77777)).toBeNull();
    });
  });

  describe("invalidateTenantClient", () => {
    it("should remove client from cache", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      mockTenantAndConnection(shared, 88888, "xoxb-test-token", "T888888");
      asMock(WebClient).mockReturnValue({ chat: {} });

      await getSlackClientForTenant(88888);
      expect(getCacheStats().size).toBe(1);

      invalidateTenantClient(88888);
      expect(getCacheStats().size).toBe(0);
    });

    it("should log info when client is invalidated", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      mockTenantAndConnection(shared, 99999, "xoxb-test-token", "T999999");
      asMock(WebClient).mockReturnValue({ chat: {} });

      await getSlackClientForTenant(99999);

      // Get fresh logger instance to check calls
      jest.clearAllMocks();
      invalidateTenantClient(99999);

      const { mockLogger } = getMockedShared();
      expect(mockLogger.info).toHaveBeenCalledWith("Invalidated cached Slack client", {
        installationId: 99999,
      });
    });

    it("should do nothing if client not cached", () => {
      const { mockLogger } = getMockedShared();

      // Clear any calls from beforeEach
      mockLogger.info.mockClear();

      invalidateTenantClient(11111);

      // Should not log when invalidating non-existent client
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it("should not affect other cached clients", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      asMock(shared.findTenantByGitHubInstallation)
        .mockResolvedValueOnce({ id: "tenant-for-11111" })
        .mockResolvedValueOnce({ id: "tenant-for-22222" });
      asMock(shared.findSlackConnection)
        .mockResolvedValueOnce({
          id: "prc1",
          accessToken: "xoxb-token-1",
          externalOrgId: "T111111",
        })
        .mockResolvedValueOnce({
          id: "prc2",
          accessToken: "xoxb-token-2",
          externalOrgId: "T222222",
        });
      asMock(WebClient).mockReturnValue({ chat: {} });

      await getSlackClientForTenant(11111);
      await getSlackClientForTenant(22222);
      expect(getCacheStats().size).toBe(2);

      invalidateTenantClient(11111);
      expect(getCacheStats().size).toBe(1);
      expect(getCachedWorkspaceId(11111)).toBeNull();
      expect(getCachedWorkspaceId(22222)).toBe("T222222");
    });

    it("should force new client creation after invalidation", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      mockTenantAndConnection(shared, 33333, "xoxb-test-token", "T333333");

      const mockClient1 = { id: "client1" };
      const mockClient2 = { id: "client2" };
      asMock(WebClient).mockReturnValueOnce(mockClient1).mockReturnValueOnce(mockClient2);

      const result1 = await getSlackClientForTenant(33333);
      expect(result1).toBe(mockClient1);
      expect(WebClient).toHaveBeenCalledTimes(1);

      invalidateTenantClient(33333);

      const result2 = await getSlackClientForTenant(33333);
      expect(result2).toBe(mockClient2);
      expect(WebClient).toHaveBeenCalledTimes(2);
    });
  });

  describe("clearAllCachedClients", () => {
    it("should clear all cached clients", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      asMock(shared.findTenantByGitHubInstallation)
        .mockResolvedValueOnce({ id: "tenant-for-11111" })
        .mockResolvedValueOnce({ id: "tenant-for-22222" })
        .mockResolvedValueOnce({ id: "tenant-for-33333" });
      asMock(shared.findSlackConnection)
        .mockResolvedValueOnce({
          id: "prc1",
          accessToken: "xoxb-token-1",
          externalOrgId: "T111111",
        })
        .mockResolvedValueOnce({
          id: "prc2",
          accessToken: "xoxb-token-2",
          externalOrgId: "T222222",
        })
        .mockResolvedValueOnce({
          id: "prc3",
          accessToken: "xoxb-token-3",
          externalOrgId: "T333333",
        });
      asMock(WebClient).mockReturnValue({ chat: {} });

      await getSlackClientForTenant(11111);
      await getSlackClientForTenant(22222);
      await getSlackClientForTenant(33333);
      expect(getCacheStats().size).toBe(3);

      clearAllCachedClients();
      expect(getCacheStats().size).toBe(0);
    });

    it("should log info with count when clearing cache", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      asMock(shared.findTenantByGitHubInstallation)
        .mockResolvedValueOnce({ id: "tenant-for-11111" })
        .mockResolvedValueOnce({ id: "tenant-for-22222" });
      asMock(shared.findSlackConnection)
        .mockResolvedValueOnce({
          id: "prc1",
          accessToken: "xoxb-token-1",
          externalOrgId: "T111111",
        })
        .mockResolvedValueOnce({
          id: "prc2",
          accessToken: "xoxb-token-2",
          externalOrgId: "T222222",
        });
      asMock(WebClient).mockReturnValue({ chat: {} });

      await getSlackClientForTenant(11111);
      await getSlackClientForTenant(22222);

      jest.clearAllMocks();
      clearAllCachedClients();

      const { mockLogger } = shared;
      expect(mockLogger.info).toHaveBeenCalledWith("Cleared all cached Slack clients", {
        count: 2,
      });
    });

    it("should handle clearing empty cache", () => {
      getMockedShared();

      clearAllCachedClients();

      const { mockLogger } = getMockedShared();
      expect(mockLogger.info).toHaveBeenCalledWith("Cleared all cached Slack clients", {
        count: 0,
      });
    });

    it("should allow new clients to be cached after clearing", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      mockTenantAndConnection(shared, 44444, "xoxb-test-token", "T444444");
      asMock(WebClient).mockReturnValue({ chat: {} });

      await getSlackClientForTenant(44444);
      expect(getCacheStats().size).toBe(1);

      clearAllCachedClients();
      expect(getCacheStats().size).toBe(0);

      await getSlackClientForTenant(44444);
      expect(getCacheStats().size).toBe(1);
    });
  });

  describe("getCacheStats", () => {
    it("should return correct size and installation IDs", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      asMock(shared.findTenantByGitHubInstallation)
        .mockResolvedValueOnce({ id: "tenant-for-11111" })
        .mockResolvedValueOnce({ id: "tenant-for-22222" });
      asMock(shared.findSlackConnection)
        .mockResolvedValueOnce({
          id: "prc1",
          accessToken: "xoxb-token-1",
          externalOrgId: "T111111",
        })
        .mockResolvedValueOnce({
          id: "prc2",
          accessToken: "xoxb-token-2",
          externalOrgId: "T222222",
        });
      asMock(WebClient).mockReturnValue({ chat: {} });

      await getSlackClientForTenant(11111);
      await getSlackClientForTenant(22222);

      const stats = getCacheStats();
      expect(stats.size).toBe(2);
      expect(stats.installationIds).toHaveLength(2);
      expect(stats.installationIds).toContain(11111);
      expect(stats.installationIds).toContain(22222);
    });

    it("should return empty stats for empty cache", () => {
      const stats = getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.installationIds).toHaveLength(0);
    });

    it("should return readonly arrays", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      mockTenantAndConnection(shared, 55555, "xoxb-test-token", "T555555");
      asMock(WebClient).mockReturnValue({ chat: {} });

      await getSlackClientForTenant(55555);

      const stats = getCacheStats();
      expect(Array.isArray(stats.installationIds)).toBe(true);
    });

    it("should reflect changes after invalidation", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      asMock(shared.findTenantByGitHubInstallation)
        .mockResolvedValueOnce({ id: "tenant-for-11111" })
        .mockResolvedValueOnce({ id: "tenant-for-22222" });
      asMock(shared.findSlackConnection)
        .mockResolvedValueOnce({
          id: "prc1",
          accessToken: "xoxb-token-1",
          externalOrgId: "T111111",
        })
        .mockResolvedValueOnce({
          id: "prc2",
          accessToken: "xoxb-token-2",
          externalOrgId: "T222222",
        });
      asMock(WebClient).mockReturnValue({ chat: {} });

      await getSlackClientForTenant(11111);
      await getSlackClientForTenant(22222);
      expect(getCacheStats().size).toBe(2);

      invalidateTenantClient(11111);
      const stats = getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.installationIds).toContain(22222);
      expect(stats.installationIds).not.toContain(11111);
    });
  });

  describe("isMultiTenantEnabled", () => {
    it("should return true when MULTI_TENANT_MODE is true", () => {
      const { config } = getMockedShared();
      config.MULTI_TENANT_MODE = true;
      expect(isMultiTenantEnabled()).toBe(true);
    });

    it("should return false when MULTI_TENANT_MODE is false", () => {
      const { config } = getMockedShared();
      config.MULTI_TENANT_MODE = false;
      expect(isMultiTenantEnabled()).toBe(false);
    });

    it("should return false when MULTI_TENANT_MODE is undefined", () => {
      const { config } = getMockedShared();
      config.MULTI_TENANT_MODE = undefined;
      expect(isMultiTenantEnabled()).toBe(false);
    });

    it("should return false when MULTI_TENANT_MODE is null", () => {
      const { config } = getMockedShared();
      config.MULTI_TENANT_MODE = null;
      expect(isMultiTenantEnabled()).toBe(false);
    });

    it("should handle truthy values correctly", () => {
      const { config } = getMockedShared();

      config.MULTI_TENANT_MODE = "true";
      expect(isMultiTenantEnabled()).toBe(false);

      config.MULTI_TENANT_MODE = 1;
      expect(isMultiTenantEnabled()).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle concurrent requests for same installation", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      mockTenantAndConnection(shared, 77777, "xoxb-test-token", "T777777");
      asMock(WebClient).mockReturnValue({ chat: {} });

      const [result1, result2, result3] = await Promise.all([
        getSlackClientForTenant(77777),
        getSlackClientForTenant(77777),
        getSlackClientForTenant(77777),
      ]);

      // All should return clients
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result3).toBeDefined();

      // Should only have one cached entry
      expect(getCacheStats().size).toBe(1);
    });

    it("should handle concurrent requests for different installations", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      asMock(shared.findTenantByGitHubInstallation)
        .mockResolvedValueOnce({ id: "tenant-for-11111" })
        .mockResolvedValueOnce({ id: "tenant-for-22222" })
        .mockResolvedValueOnce({ id: "tenant-for-33333" });
      asMock(shared.findSlackConnection)
        .mockResolvedValueOnce({
          id: "prc1",
          accessToken: "xoxb-token-1",
          externalOrgId: "T111111",
        })
        .mockResolvedValueOnce({
          id: "prc2",
          accessToken: "xoxb-token-2",
          externalOrgId: "T222222",
        })
        .mockResolvedValueOnce({
          id: "prc3",
          accessToken: "xoxb-token-3",
          externalOrgId: "T333333",
        });
      asMock(WebClient).mockReturnValue({ chat: {} });

      const [result1, result2, result3] = await Promise.all([
        getSlackClientForTenant(11111),
        getSlackClientForTenant(22222),
        getSlackClientForTenant(33333),
      ]);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result3).toBeDefined();
      expect(getCacheStats().size).toBe(3);
    });

    it("should handle very large installation ID", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      const largeId = 9999999999;
      mockTenantAndConnection(shared, largeId, "xoxb-test-token", "T888888");
      asMock(WebClient).mockReturnValue({ chat: {} });

      const result = await getSlackClientForTenant(largeId);
      expect(result).toBeDefined();
      expect(getCachedWorkspaceId(largeId)).toBe("T888888");
    });

    it("should handle negative installation ID", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      mockTenantAndConnection(shared, -1, "xoxb-test-token", "T999999");
      asMock(WebClient).mockReturnValue({ chat: {} });

      const result = await getSlackClientForTenant(-1);
      expect(result).toBeDefined();
    });

    it("should handle zero installation ID", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      mockTenantAndConnection(shared, 0, "xoxb-test-token", "T000000");
      asMock(WebClient).mockReturnValue({ chat: {} });

      const result = await getSlackClientForTenant(0);
      expect(result).toBeDefined();
    });

    it("should handle error when findTenantByGitHubInstallation throws", async () => {
      const shared = getMockedShared();

      asMock(shared.findTenantByGitHubInstallation).mockRejectedValue(new Error("Database error"));

      await expect(getSlackClientForTenant(12345)).rejects.toThrow("Database error");
    });

    it("should handle WebClient constructor throwing error", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      mockTenantAndConnection(shared, 12345, "xoxb-test-token", "T123456");
      asMock(WebClient).mockImplementation(() => {
        throw new Error("WebClient initialization failed");
      });

      await expect(getSlackClientForTenant(12345)).rejects.toThrow(
        "WebClient initialization failed"
      );
    });

    it("should handle empty token in connection", async () => {
      const shared = getMockedShared();

      asMock(shared.findTenantByGitHubInstallation).mockResolvedValue({ id: "tenant-12345" });
      asMock(shared.findSlackConnection).mockResolvedValue({
        id: "prc_slack",
        accessToken: null,
        externalOrgId: "T123456",
      });

      // Implementation throws NotFoundError when accessToken is null/empty
      await expect(getSlackClientForTenant(12345)).rejects.toThrow();
    });

    it("should handle empty workspace ID in connection", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      mockTenantAndConnection(shared, 12345, "xoxb-test-token", "");
      asMock(WebClient).mockReturnValue({ chat: {} });

      await getSlackClientForTenant(12345);
      expect(getCachedWorkspaceId(12345)).toBe("");
    });

    it("should handle very long token", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      const longToken = "xoxb-" + "a".repeat(1000);
      mockTenantAndConnection(shared, 12345, longToken, "T123456");
      asMock(WebClient).mockReturnValue({ chat: {} });

      const result = await getSlackClientForTenant(12345);
      expect(result).toBeDefined();
      expect(WebClient).toHaveBeenCalledWith(longToken, expect.any(Object));
    });

    it("should handle special characters in workspace ID", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      mockTenantAndConnection(shared, 12345, "xoxb-test-token", "T<>?/\\!@#");
      asMock(WebClient).mockReturnValue({ chat: {} });

      await getSlackClientForTenant(12345);
      expect(getCachedWorkspaceId(12345)).toBe("T<>?/\\!@#");
    });

    it("should handle multiple cache clears in sequence", () => {
      clearAllCachedClients();
      clearAllCachedClients();
      clearAllCachedClients();
      expect(getCacheStats().size).toBe(0);
    });

    it("should handle invalidating same client multiple times", async () => {
      const shared = getMockedShared();
      const { WebClient } = getMockedWebApi();

      mockTenantAndConnection(shared, 12345, "xoxb-test-token", "T123456");
      asMock(WebClient).mockReturnValue({ chat: {} });

      await getSlackClientForTenant(12345);
      invalidateTenantClient(12345);
      invalidateTenantClient(12345);
      invalidateTenantClient(12345);
      expect(getCacheStats().size).toBe(0);
    });
  });
});

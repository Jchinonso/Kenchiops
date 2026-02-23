/**
 * Unit tests for database/tenant module.
 *
 * Tests tenant CRUD operations, status management, and audit logging.
 * Updated for provider-neutral tenant model (no provider-specific fields on Tenant).
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { CreateTenantFromGitHub } from "../../core/types.js";

// Mock query and transaction functions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockQuery = jest.fn<(...args: any[]) => Promise<any>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockTransaction = jest.fn<(fn: any) => Promise<any>>();

// Mock database client
jest.mock("../../database/client/client.js", () => ({
  query: mockQuery,
  transaction: mockTransaction,
}));

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock("../../core/logger.js", () => ({
  createLogger: jest.fn(() => mockLogger),
}));

describe("Tenant Service", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tenantService: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    tenantService = await import("../../database/tenant/index.js");
  });

  const mockTenantRow = {
    id: "tenant-123",
    org_name: "test-org",
    status: "active" as const,
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-02"),
    rag_monthly_budget_usd: 0,
    rag_preferred_tier: "STANDARD",
    rag_allow_premium: false,
    rag_degrade_on_budget_warning: true,
  };

  describe("findByOrgName", () => {
    it("should find tenant by organization name", async () => {
      mockQuery.mockResolvedValue({
        rows: [mockTenantRow],
        rowCount: 1,
      });

      const result = await tenantService.findByOrgName("test-org");

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("LOWER(org_name) = LOWER($1)"),
        ["test-org", "deleted"]
      );
      expect(result).toMatchObject({
        orgName: "test-org",
      });
    });

    it("should be case-insensitive", async () => {
      mockQuery.mockResolvedValue({
        rows: [mockTenantRow],
        rowCount: 1,
      });

      await tenantService.findByOrgName("TEST-ORG");

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ["TEST-ORG", "deleted"]);
    });

    it("should return null when organization not found", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await tenantService.findByOrgName("non-existent");

      expect(result).toBeNull();
    });
  });

  describe("findById", () => {
    it("should find tenant by ID", async () => {
      mockQuery.mockResolvedValue({
        rows: [mockTenantRow],
        rowCount: 1,
      });

      const result = await tenantService.findById("tenant-123");

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("WHERE id = $1"), [
        "tenant-123",
      ]);
      expect(result).toMatchObject({
        id: "tenant-123",
      });
    });

    it("should return null when tenant not found", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await tenantService.findById("non-existent");

      expect(result).toBeNull();
    });

    it("should not exclude deleted tenants", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ ...mockTenantRow, status: "deleted" }],
        rowCount: 1,
      });

      const result = await tenantService.findById("tenant-123");

      expect(result).toBeTruthy();
    });
  });

  describe("getActiveTenants", () => {
    it("should return all active tenants", async () => {
      const activeTenants = [mockTenantRow, { ...mockTenantRow, id: "tenant-456" }];

      mockQuery.mockResolvedValue({
        rows: activeTenants,
        rowCount: 2,
      });

      const result = await tenantService.getActiveTenants();

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("status = $1"), ["active"]);
      expect(result).toHaveLength(2);
    });

    it("should return empty array when no active tenants", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await tenantService.getActiveTenants();

      expect(result).toEqual([]);
    });

    it("should order by created_at DESC", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await tenantService.getActiveTenants();

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("ORDER BY created_at DESC"), [
        "active",
      ]);
    });
  });

  describe("createFromGitHubInstall", () => {
    it("should create new tenant when organization does not exist", async () => {
      const data: CreateTenantFromGitHub = {
        orgName: "new-org",
        githubInstallationId: 54321,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockClientQuery = jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Check existing
        .mockResolvedValueOnce({ rows: [mockTenantRow], rowCount: 1 }) // Insert
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // Audit log
      const mockClient = { query: mockClientQuery };

      mockTransaction.mockImplementation(async (fn) => fn(mockClient));

      const result = await tenantService.createFromGitHubInstall(data);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO tenants"),
        expect.arrayContaining(["new-org"])
      );
      expect(result).toMatchObject({
        orgName: expect.any(String),
      });
    });

    it("should log audit event for GitHub installation", async () => {
      const data: CreateTenantFromGitHub = {
        orgName: "new-org",
        githubInstallationId: 54321,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockClientQuery = jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [mockTenantRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const mockClient = { query: mockClientQuery };

      mockTransaction.mockImplementation(async (fn) => fn(mockClient));

      await tenantService.createFromGitHubInstall(data);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("tenant_audit_log"),
        expect.arrayContaining([expect.any(String), "github_installed", "system"])
      );
    });
  });

  describe("activate", () => {
    it("should activate tenant", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockClientQuery = jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValueOnce({ rows: [mockTenantRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const mockClient = { query: mockClientQuery };

      mockTransaction.mockImplementation(async (fn) => fn(mockClient));

      const result = await tenantService.activate("tenant-123");

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE tenants SET status = $1"),
        ["active", "tenant-123"]
      );
      expect(result).toBeTruthy();
    });

    it("should throw NotFoundError when tenant not found", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockClientQuery = jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValue({ rows: [], rowCount: 0 });
      const mockClient = { query: mockClientQuery };

      mockTransaction.mockImplementation(async (fn) => fn(mockClient));

      await expect(tenantService.activate("non-existent")).rejects.toThrow("Tenant not found");
    });

    it("should log activation audit event", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockClientQuery = jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValueOnce({ rows: [mockTenantRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const mockClient = { query: mockClientQuery };

      mockTransaction.mockImplementation(async (fn) => fn(mockClient));

      await tenantService.activate("tenant-123");

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(["tenant-123", "activated", "system"])
      );
    });
  });

  describe("suspend", () => {
    it("should suspend tenant with reason", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockClientQuery = jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValueOnce({ rows: [mockTenantRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const mockClient = { query: mockClientQuery };

      mockTransaction.mockImplementation(async (fn) => fn(mockClient));

      const result = await tenantService.suspend("tenant-123", "Payment overdue");

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE tenants SET status = $1"),
        ["suspended", "tenant-123"]
      );
      expect(result).toBeTruthy();
    });

    it("should use default reason when not provided", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockClientQuery = jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValueOnce({ rows: [mockTenantRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const mockClient = { query: mockClientQuery };

      mockTransaction.mockImplementation(async (fn) => fn(mockClient));

      await tenantService.suspend("tenant-123");

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          "tenant-123",
          "suspended",
          "system",
          expect.stringContaining("No reason"),
        ])
      );
    });
  });

  describe("deleteTenant", () => {
    it("should soft delete tenant", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockClientQuery = jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValueOnce({ rows: [mockTenantRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const mockClient = { query: mockClientQuery };

      mockTransaction.mockImplementation(async (fn) => fn(mockClient));

      await tenantService.deleteTenant("tenant-123");

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE tenants SET status = $1"),
        ["deleted", "tenant-123"]
      );
    });
  });

  describe("handleGitHubUninstall", () => {
    it("should handle GitHub App uninstallation", async () => {
      // Mock findTenantByGitHubInstallation (called via the providerConnection lookup)
      mockQuery.mockResolvedValue({
        rows: [mockTenantRow],
        rowCount: 1,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockClientQuery = jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const mockClient = { query: mockClientQuery };

      mockTransaction.mockImplementation(async (fn) => fn(mockClient));

      await tenantService.handleGitHubUninstall(12345);

      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE tenants"), [
        "deleted",
        "tenant-123",
      ]);
    });

    it("should log warning when tenant not found", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await tenantService.handleGitHubUninstall(99999);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ installationId: 99999 })
      );
    });
  });

  describe("logAuditEvent", () => {
    it("should log audit event with metadata", async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await tenantService.logAuditEvent("tenant-123", "ci_failure_processed", {
        repository: "owner/repo",
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          "tenant-123",
          "ci_failure_processed",
          "system",
          expect.stringContaining("repository"),
        ])
      );
    });

    it("should use custom actor when provided", async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await tenantService.logAuditEvent(
        "tenant-123",
        "slack_message_sent",
        { channel: "C123456" },
        "U123456"
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(["tenant-123", "slack_message_sent", "U123456"])
      );
    });
  });

  describe("getAuditLog", () => {
    it("should retrieve audit log entries", async () => {
      const mockAuditRow = {
        id: "audit-1",
        tenant_id: "tenant-123",
        action: "activated",
        actor: "system",
        metadata: {},
        created_at: new Date("2024-01-01"),
      };

      mockQuery.mockResolvedValue({
        rows: [mockAuditRow],
        rowCount: 1,
      });

      const result = await tenantService.getAuditLog("tenant-123");

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("tenant_audit_log"), [
        "tenant-123",
        100,
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        tenantId: "tenant-123",
        action: "activated",
      });
    });

    it("should respect custom limit", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await tenantService.getAuditLog("tenant-123", 50);

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ["tenant-123", 50]);
    });

    it("should return empty array when no audit entries", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await tenantService.getAuditLog("tenant-123");

      expect(result).toEqual([]);
    });
  });

  describe("getTenantStatistics", () => {
    it("should retrieve tenant statistics", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: "5" }], rowCount: 1 }) // analyses today
        .mockResolvedValueOnce({ rows: [{ count: "42" }], rowCount: 1 }) // alerts total
        .mockResolvedValueOnce({
          rows: [{ created_at: new Date("2024-01-15") }],
          rowCount: 1,
        }); // last alert

      const result = await tenantService.getTenantStatistics("tenant-123");

      expect(result).toEqual({
        failuresAnalyzedToday: 5,
        totalAlertsSent: 42,
        lastAlertTime: expect.any(Date),
      });
    });

    it("should handle null last alert time", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: "0" }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: "0" }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await tenantService.getTenantStatistics("tenant-123");

      expect(result.lastAlertTime).toBeNull();
    });
  });
});

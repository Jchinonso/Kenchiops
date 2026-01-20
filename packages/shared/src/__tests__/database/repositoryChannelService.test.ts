/**
 * Unit tests for database/repositoryChannelService.ts
 *
 * Tests repository-channel mapping CRUD operations.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { CreateRepositoryChannelMapping } from "../../core/types.js";

// Mock query function
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockQuery = jest.fn<() => Promise<any>>();

// Mock database client
jest.mock("../../database/client/client.js", () => ({
  query: mockQuery,
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

describe("Repository Channel Service", () => {
  let repoChannelService: typeof import("../../database/repositoryChannel/service.js");

  beforeEach(async () => {
    jest.clearAllMocks();
    repoChannelService = await import("../../database/repositoryChannel/service.js");
  });

  const mockMappingRow = {
    id: "mapping-123",
    tenant_id: "tenant-123",
    repository: "owner/repo",
    slack_channel_id: "C123456",
    slack_channel_name: "engineering",
    created_by: "U123456",
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
  };

  describe("findChannelForRepository", () => {
    it("should find channel mapping for repository", async () => {
      mockQuery.mockResolvedValue({
        rows: [mockMappingRow],
        rowCount: 1,
      });

      const result = await repoChannelService.findChannelForRepository("tenant-123", "owner/repo");

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("repository_channel_mappings"),
        ["tenant-123", "owner/repo"]
      );
      expect(result).toMatchObject({
        repository: "owner/repo",
        slackChannelId: "C123456",
      });
    });

    it("should return null when mapping not found", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await repoChannelService.findChannelForRepository(
        "tenant-123",
        "owner/unknown"
      );

      expect(result).toBeNull();
    });

    it("should include tenant_id and repository in query", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await repoChannelService.findChannelForRepository("tenant-123", "owner/repo");

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("WHERE tenant_id = $1 AND repository = $2"),
        ["tenant-123", "owner/repo"]
      );
    });
  });

  describe("findMappingsForChannel", () => {
    it("should find all mappings for a channel", async () => {
      const mappings = [
        mockMappingRow,
        { ...mockMappingRow, id: "mapping-456", repository: "owner/other-repo" },
      ];

      mockQuery.mockResolvedValue({
        rows: mappings,
        rowCount: 2,
      });

      const result = await repoChannelService.findMappingsForChannel("tenant-123", "C123456");

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("slack_channel_id = $2"), [
        "tenant-123",
        "C123456",
      ]);
      expect(result).toHaveLength(2);
    });

    it("should return empty array when no mappings found", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await repoChannelService.findMappingsForChannel("tenant-123", "C999999");

      expect(result).toEqual([]);
    });

    it("should order results by repository name", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await repoChannelService.findMappingsForChannel("tenant-123", "C123456");

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY repository"),
        expect.any(Array)
      );
    });
  });

  describe("findAllMappingsForTenant", () => {
    it("should find all mappings for a tenant", async () => {
      const mappings = [
        mockMappingRow,
        { ...mockMappingRow, id: "mapping-456", repository: "owner/other-repo" },
        {
          ...mockMappingRow,
          id: "mapping-789",
          repository: "owner/third-repo",
          slack_channel_id: "C789012",
        },
      ];

      mockQuery.mockResolvedValue({
        rows: mappings,
        rowCount: 3,
      });

      const result = await repoChannelService.findAllMappingsForTenant("tenant-123");

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("WHERE tenant_id = $1"), [
        "tenant-123",
      ]);
      expect(result).toHaveLength(3);
    });

    it("should return empty array when tenant has no mappings", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await repoChannelService.findAllMappingsForTenant("tenant-123");

      expect(result).toEqual([]);
    });

    it("should order results by repository name", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await repoChannelService.findAllMappingsForTenant("tenant-123");

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("ORDER BY repository"), [
        "tenant-123",
      ]);
    });
  });

  describe("getMappedRepositories", () => {
    it("should return Set of mapped repository names", async () => {
      const repos = [
        { repository: "owner/repo1" },
        { repository: "owner/repo2" },
        { repository: "owner/repo3" },
      ];

      mockQuery.mockResolvedValue({
        rows: repos,
        rowCount: 3,
      });

      const result = await repoChannelService.getMappedRepositories("tenant-123");

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(3);
      expect(result.has("owner/repo1")).toBe(true);
      expect(result.has("owner/repo2")).toBe(true);
      expect(result.has("owner/repo3")).toBe(true);
    });

    it("should return empty Set when no mappings exist", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await repoChannelService.getMappedRepositories("tenant-123");

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });

    it("should only select repository column", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await repoChannelService.getMappedRepositories("tenant-123");

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("SELECT repository FROM"), [
        "tenant-123",
      ]);
    });
  });

  describe("createMapping", () => {
    it("should create new repository-channel mapping", async () => {
      const data: CreateRepositoryChannelMapping = {
        tenantId: "tenant-123",
        repository: "owner/new-repo",
        slackChannelId: "C123456",
        slackChannelName: "engineering",
        createdBy: "U123456",
      };

      mockQuery.mockResolvedValue({
        rows: [mockMappingRow],
        rowCount: 1,
      });

      const result = await repoChannelService.createMapping(data);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO repository_channel_mappings"),
        ["tenant-123", "owner/new-repo", "C123456", "engineering", "U123456"]
      );
      expect(result).toMatchObject({
        repository: "owner/repo",
        slackChannelId: "C123456",
      });
    });

    it("should use UPSERT to replace existing mapping", async () => {
      const data: CreateRepositoryChannelMapping = {
        tenantId: "tenant-123",
        repository: "owner/repo",
        slackChannelId: "C789012",
        slackChannelName: "devops",
      };

      mockQuery.mockResolvedValue({
        rows: [{ ...mockMappingRow, slack_channel_id: "C789012" }],
        rowCount: 1,
      });

      await repoChannelService.createMapping(data);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("ON CONFLICT (tenant_id, repository)"),
        expect.any(Array)
      );
    });

    it("should handle null channel name", async () => {
      const data: CreateRepositoryChannelMapping = {
        tenantId: "tenant-123",
        repository: "owner/repo",
        slackChannelId: "C123456",
      };

      mockQuery.mockResolvedValue({
        rows: [{ ...mockMappingRow, slack_channel_name: null }],
        rowCount: 1,
      });

      const result = await repoChannelService.createMapping(data);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(["tenant-123", "owner/repo", "C123456", null])
      );
      expect(result).toBeTruthy();
    });

    it("should handle null createdBy", async () => {
      const data: CreateRepositoryChannelMapping = {
        tenantId: "tenant-123",
        repository: "owner/repo",
        slackChannelId: "C123456",
        slackChannelName: "engineering",
      };

      mockQuery.mockResolvedValue({
        rows: [{ ...mockMappingRow, created_by: null }],
        rowCount: 1,
      });

      await repoChannelService.createMapping(data);

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([null]));
    });

    it("should log mapping creation", async () => {
      const data: CreateRepositoryChannelMapping = {
        tenantId: "tenant-123",
        repository: "owner/repo",
        slackChannelId: "C123456",
        slackChannelName: "engineering",
      };

      mockQuery.mockResolvedValue({
        rows: [mockMappingRow],
        rowCount: 1,
      });

      await repoChannelService.createMapping(data);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          tenantId: "tenant-123",
          repository: "owner/repo",
          channelId: "C123456",
        })
      );
    });
  });

  describe("deleteMapping", () => {
    it("should delete mapping and return true", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 1,
      });

      const result = await repoChannelService.deleteMapping("tenant-123", "owner/repo");

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM repository_channel_mappings"),
        ["tenant-123", "owner/repo"]
      );
      expect(result).toBe(true);
    });

    it("should return false when mapping not found", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await repoChannelService.deleteMapping("tenant-123", "owner/unknown");

      expect(result).toBe(false);
    });

    it("should handle null rowCount", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: null,
      });

      const result = await repoChannelService.deleteMapping("tenant-123", "owner/repo");

      expect(result).toBe(false);
    });

    it("should log deletion when successful", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 1,
      });

      await repoChannelService.deleteMapping("tenant-123", "owner/repo");

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          tenantId: "tenant-123",
          repository: "owner/repo",
        })
      );
    });

    it("should not log when mapping not found", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await repoChannelService.deleteMapping("tenant-123", "owner/unknown");

      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  describe("deleteMappingsForChannel", () => {
    it("should delete all mappings for channel", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 3,
      });

      const result = await repoChannelService.deleteMappingsForChannel("tenant-123", "C123456");

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM repository_channel_mappings"),
        ["tenant-123", "C123456"]
      );
      expect(result).toBe(3);
    });

    it("should return 0 when no mappings found", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await repoChannelService.deleteMappingsForChannel("tenant-123", "C999999");

      expect(result).toBe(0);
    });

    it("should handle null rowCount", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: null,
      });

      const result = await repoChannelService.deleteMappingsForChannel("tenant-123", "C123456");

      expect(result).toBe(0);
    });

    it("should log deletion when mappings deleted", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 5,
      });

      await repoChannelService.deleteMappingsForChannel("tenant-123", "C123456");

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          tenantId: "tenant-123",
          channelId: "C123456",
          deletedCount: 5,
        })
      );
    });

    it("should not log when no mappings deleted", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await repoChannelService.deleteMappingsForChannel("tenant-123", "C123456");

      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  describe("isMapped", () => {
    it("should return true when repository is mapped", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ count: "1" }],
        rowCount: 1,
      });

      const result = await repoChannelService.isMapped("tenant-123", "owner/repo");

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("SELECT COUNT(*) as count"), [
        "tenant-123",
        "owner/repo",
      ]);
      expect(result).toBe(true);
    });

    it("should return false when repository is not mapped", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ count: "0" }],
        rowCount: 1,
      });

      const result = await repoChannelService.isMapped("tenant-123", "owner/unknown");

      expect(result).toBe(false);
    });

    it("should handle empty result", async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await repoChannelService.isMapped("tenant-123", "owner/repo");

      expect(result).toBe(false);
    });

    it("should use COUNT query for efficiency", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ count: "1" }],
        rowCount: 1,
      });

      await repoChannelService.isMapped("tenant-123", "owner/repo");

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("COUNT(*)"), [
        "tenant-123",
        "owner/repo",
      ]);
    });
  });

  describe("Edge Cases", () => {
    it("should handle repository names with special characters", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ ...mockMappingRow, repository: "owner/repo-with-dashes" }],
        rowCount: 1,
      });

      const result = await repoChannelService.findChannelForRepository(
        "tenant-123",
        "owner/repo-with-dashes"
      );

      expect(result).toBeTruthy();
      expect(result?.repository).toBe("owner/repo-with-dashes");
    });

    it("should handle multiple mappings with same channel", async () => {
      const mappings = [
        { ...mockMappingRow, repository: "owner/repo1" },
        { ...mockMappingRow, id: "mapping-456", repository: "owner/repo2" },
        { ...mockMappingRow, id: "mapping-789", repository: "owner/repo3" },
      ];

      mockQuery.mockResolvedValue({
        rows: mappings,
        rowCount: 3,
      });

      const result = await repoChannelService.findMappingsForChannel("tenant-123", "C123456");

      expect(result).toHaveLength(3);
    });

    it("should handle tenant with many mappings", async () => {
      const manyMappings = Array.from({ length: 50 }, (_, i) => ({
        ...mockMappingRow,
        id: `mapping-${i}`,
        repository: `owner/repo-${i}`,
      }));

      mockQuery.mockResolvedValue({
        rows: manyMappings,
        rowCount: 50,
      });

      const result = await repoChannelService.findAllMappingsForTenant("tenant-123");

      expect(result).toHaveLength(50);
    });

    it("should handle mapping with minimal data", async () => {
      const minimalMapping = {
        ...mockMappingRow,
        slack_channel_name: null,
        created_by: null,
      };

      mockQuery.mockResolvedValue({
        rows: [minimalMapping],
        rowCount: 1,
      });

      const result = await repoChannelService.findChannelForRepository("tenant-123", "owner/repo");

      expect(result).toBeTruthy();
      expect(result?.slackChannelName).toBeNull();
      expect(result?.createdBy).toBeNull();
    });
  });

  describe("Data Transformation", () => {
    it("should correctly transform database row to entity", async () => {
      mockQuery.mockResolvedValue({
        rows: [mockMappingRow],
        rowCount: 1,
      });

      const result = await repoChannelService.findChannelForRepository("tenant-123", "owner/repo");

      expect(result).toMatchObject({
        id: mockMappingRow.id,
        tenantId: mockMappingRow.tenant_id,
        repository: mockMappingRow.repository,
        slackChannelId: mockMappingRow.slack_channel_id,
        slackChannelName: mockMappingRow.slack_channel_name,
        createdBy: mockMappingRow.created_by,
        createdAt: mockMappingRow.created_at,
        updatedAt: mockMappingRow.updated_at,
      });
    });

    it("should transform multiple rows correctly", async () => {
      const rows = [
        mockMappingRow,
        { ...mockMappingRow, id: "mapping-456", repository: "owner/other" },
      ];

      mockQuery.mockResolvedValue({
        rows,
        rowCount: 2,
      });

      const result = await repoChannelService.findMappingsForChannel("tenant-123", "C123456");

      expect(result[0]).toMatchObject({
        id: "mapping-123",
        repository: "owner/repo",
      });
      expect(result[1]).toMatchObject({
        id: "mapping-456",
        repository: "owner/other",
      });
    });

    it("should preserve Date objects in transformation", async () => {
      mockQuery.mockResolvedValue({
        rows: [mockMappingRow],
        rowCount: 1,
      });

      const result = await repoChannelService.findChannelForRepository("tenant-123", "owner/repo");

      expect(result?.createdAt).toBeInstanceOf(Date);
      expect(result?.updatedAt).toBeInstanceOf(Date);
    });
  });
});

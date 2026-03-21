/**
 * Unit tests for RAG Purge Routes
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import request from "supertest";
import express, { type Express, type Request, type Response, type NextFunction } from "express";

// Mock functions
const mockPurgeTenantRAGData = jest.fn();
const mockPurgePRDiffChunks = jest.fn();
const mockPurgeKnowledgeDocChunks = jest.fn();
const mockDeleteKnowledgeDocById = jest.fn();
const mockDeleteKnowledgeDocsByIds = jest.fn();

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  SERVICE_NAMES: { API: "api" },
  HTTP_STATUS: {
    OK: 200,
    BAD_REQUEST: 400,
    INTERNAL_SERVER_ERROR: 500,
  },
  API_ROUTES: {
    RAG_PURGE_TENANT: "/tenant/:tenantId",
    RAG_PURGE_PR: "/pr/:repository/:prNumber",
    RAG_PURGE_DOC: "/doc/:parentId",
    RAG_DELETE_DOC_SINGLE: "/doc/single/:id",
    RAG_BULK_DELETE_DOCS: "/doc/bulk-delete",
  },
  purgeTenantRAGData: mockPurgeTenantRAGData,
  purgePRDiffChunks: mockPurgePRDiffChunks,
  purgeKnowledgeDocChunks: mockPurgeKnowledgeDocChunks,
  deleteKnowledgeDocById: mockDeleteKnowledgeDocById,
  deleteKnowledgeDocsByIds: mockDeleteKnowledgeDocsByIds,
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- mock error for test validation
  ValidationError: Object.assign(
    class extends Error {
      constructor(m: string) {
        super(m);
        this.name = "ValidationError";
      }
    },
    { __mock: true }
  ),
  DASHBOARD_PAGINATION: { MAX_BATCH_SIZE: 100 },
  asyncHandler:
    (fn: (req: unknown, res: unknown, next: unknown) => Promise<unknown>) =>
    async (req: unknown, res: unknown, next: unknown) => {
      try {
        await fn(req, res, next);
      } catch (error) {
        (next as (err: unknown) => void)(error);
      }
    },
  requireTenantMatch: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  rateLimitByCategory: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireTenantId: (req: Request) => {
    const tenantId = (req as unknown as { context?: { tenantId?: string } }).context?.tenantId;
    if (!tenantId) {
      throw new Error("tenantId is required");
    }
    return tenantId;
  },
  requireRole:
    (..._roles: string[]) =>
    (_req: unknown, _res: unknown, next: () => void) =>
      next(),
}));

/**
 * Middleware that simulates auth context injection for tests.
 * Routes use req.context.tenantId via requireTenantId() so we must provide it.
 */
const injectTestContext = (req: Request, _res: Response, next: NextFunction): void => {
  Object.assign(req, {
    context: {
      requestId: "test-request-id",
      tenantId: "default-tenant",
    },
  });
  next();
};

describe("RAG Purge Routes", () => {
  // let: app is reassigned in beforeEach for module isolation
  let app: Express;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default mock implementations
    mockPurgeTenantRAGData.mockResolvedValue({
      success: true,
      deletedCount: 100,
      errors: [],
    });

    mockPurgePRDiffChunks.mockResolvedValue({
      success: true,
      deletedCount: 25,
      errors: [],
    });

    mockPurgeKnowledgeDocChunks.mockResolvedValue({
      success: true,
      deletedCount: 5,
      errors: [],
    });

    mockDeleteKnowledgeDocsByIds.mockResolvedValue(3);

    const { ragPurgeRoutes } = await import("../../routes/rag/purgeRoutes.js");
    app = express();
    app.use(express.json());
    app.use(injectTestContext);
    app.use(ragPurgeRoutes);
  });

  describe("DELETE /tenant/:tenantId", () => {
    it("should purge all tenant RAG data", async () => {
      const response = await request(app).delete("/tenant/tenant-123");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.tenantId).toBe("tenant-123");
      expect(response.body.data.deletedCount).toBe(100);
    });

    it("should call purge function with tenant ID", async () => {
      await request(app).delete("/tenant/tenant-456");

      expect(mockPurgeTenantRAGData).toHaveBeenCalledWith("tenant-456");
    });

    it("should return errors when purge partially fails", async () => {
      mockPurgeTenantRAGData.mockResolvedValue({
        success: false,
        deletedCount: 80,
        errors: ["Failed to delete some documents"],
      });

      const response = await request(app).delete("/tenant/tenant-123");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.data.errors).toHaveLength(1);
    });

    it("should handle non-existent tenant", async () => {
      mockPurgeTenantRAGData.mockResolvedValue({
        success: true,
        deletedCount: 0,
        errors: [],
      });

      const response = await request(app).delete("/tenant/non-existent");

      expect(response.status).toBe(200);
      expect(response.body.data.deletedCount).toBe(0);
    });
  });

  describe("DELETE /pr/:repository/:prNumber", () => {
    it("should purge PR diff chunks", async () => {
      const response = await request(app).delete("/pr/owner%2Frepo/123");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.repository).toBe("owner/repo");
      expect(response.body.data.prNumber).toBe(123);
      expect(response.body.data.deletedCount).toBe(25);
    });

    it("should call purge function with correct parameters including tenantId", async () => {
      await request(app).delete("/pr/org%2Fproject/456");

      expect(mockPurgePRDiffChunks).toHaveBeenCalledWith("org/project", 456, "default-tenant");
    });

    it("should handle URL-encoded repository names", async () => {
      await request(app).delete("/pr/my-org%2Fmy-repo/789");

      expect(mockPurgePRDiffChunks).toHaveBeenCalledWith("my-org/my-repo", 789, "default-tenant");
    });

    it("should return error for invalid PR number", async () => {
      const response = await request(app).delete("/pr/owner%2Frepo/invalid");

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("prNumber must be a valid number");
    });

    it("should handle non-existent PR", async () => {
      mockPurgePRDiffChunks.mockResolvedValue({
        success: true,
        deletedCount: 0,
        errors: [],
      });

      const response = await request(app).delete("/pr/owner%2Frepo/99999");

      expect(response.status).toBe(200);
      expect(response.body.data.deletedCount).toBe(0);
    });

    it("should return errors when purge fails", async () => {
      mockPurgePRDiffChunks.mockResolvedValue({
        success: false,
        deletedCount: 10,
        errors: ["Database timeout"],
      });

      const response = await request(app).delete("/pr/owner%2Frepo/123");

      expect(response.body.success).toBe(false);
      expect(response.body.data.errors).toContain("Database timeout");
    });
  });

  describe("DELETE /doc/:parentId", () => {
    it("should purge knowledge document chunks", async () => {
      const response = await request(app).delete("/doc/doc-123");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.parentId).toBe("doc-123");
      expect(response.body.data.deletedCount).toBe(5);
    });

    it("should call purge function with parent ID and tenantId", async () => {
      await request(app).delete("/doc/doc-456");

      expect(mockPurgeKnowledgeDocChunks).toHaveBeenCalledWith("doc-456", "default-tenant");
    });

    it("should handle UUID-style parent IDs", async () => {
      const uuid = "550e8400-e29b-41d4-a716-446655440000";
      await request(app).delete(`/doc/${uuid}`);

      expect(mockPurgeKnowledgeDocChunks).toHaveBeenCalledWith(uuid, "default-tenant");
    });

    it("should handle non-existent document", async () => {
      mockPurgeKnowledgeDocChunks.mockResolvedValue({
        success: true,
        deletedCount: 0,
        errors: [],
      });

      const response = await request(app).delete("/doc/non-existent");

      expect(response.status).toBe(200);
      expect(response.body.data.deletedCount).toBe(0);
    });

    it("should return errors when purge fails", async () => {
      mockPurgeKnowledgeDocChunks.mockResolvedValue({
        success: false,
        deletedCount: 3,
        errors: ["Vector store error", "Index update failed"],
      });

      const response = await request(app).delete("/doc/doc-123");

      expect(response.body.success).toBe(false);
      expect(response.body.data.errors).toHaveLength(2);
    });
  });

  describe("POST /doc/bulk-delete", () => {
    it("should bulk delete documents by IDs", async () => {
      mockDeleteKnowledgeDocsByIds.mockResolvedValue(3);

      const response = await request(app)
        .post("/doc/bulk-delete")
        .send({ ids: ["id-1", "id-2", "id-3"] });

      expect(response.status).toBe(200);
      expect(response.body.data.deletedCount).toBe(3);
      expect(mockDeleteKnowledgeDocsByIds).toHaveBeenCalledWith(
        ["id-1", "id-2", "id-3"],
        "default-tenant"
      );
    });

    it("should return 500 for empty ids array", async () => {
      const response = await request(app).post("/doc/bulk-delete").send({ ids: [] });

      expect(response.status).toBe(500);
    });

    it("should return 500 for missing ids field", async () => {
      const response = await request(app).post("/doc/bulk-delete").send({});

      expect(response.status).toBe(500);
    });

    it("should return 500 for non-string ids", async () => {
      const response = await request(app)
        .post("/doc/bulk-delete")
        .send({ ids: [123, 456] });

      expect(response.status).toBe(500);
    });

    it("should handle partial deletes", async () => {
      mockDeleteKnowledgeDocsByIds.mockResolvedValue(1);

      const response = await request(app)
        .post("/doc/bulk-delete")
        .send({ ids: ["id-1", "id-missing"] });

      expect(response.status).toBe(200);
      expect(response.body.data.deletedCount).toBe(1);
    });
  });

  describe("error handling", () => {
    it("should handle tenant purge errors", async () => {
      mockPurgeTenantRAGData.mockRejectedValue(new Error("Purge failed"));

      const response = await request(app).delete("/tenant/tenant-123");

      expect(response.status).toBe(500);
    });

    it("should handle PR purge errors", async () => {
      mockPurgePRDiffChunks.mockRejectedValue(new Error("Database error"));

      const response = await request(app).delete("/pr/owner%2Frepo/123");

      expect(response.status).toBe(500);
    });

    it("should handle doc purge errors", async () => {
      mockPurgeKnowledgeDocChunks.mockRejectedValue(new Error("Vector store unavailable"));

      const response = await request(app).delete("/doc/doc-123");

      expect(response.status).toBe(500);
    });
  });

  describe("concurrent purge operations", () => {
    it("should handle concurrent tenant purges", async () => {
      const requests = [
        request(app).delete("/tenant/tenant-1"),
        request(app).delete("/tenant/tenant-2"),
        request(app).delete("/tenant/tenant-3"),
      ];

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    it("should handle concurrent PR purges", async () => {
      const requests = [
        request(app).delete("/pr/owner%2Frepo/1"),
        request(app).delete("/pr/owner%2Frepo/2"),
        request(app).delete("/pr/owner%2Frepo/3"),
      ];

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe("edge cases", () => {
    it("should handle tenant ID with special characters", async () => {
      await request(app).delete("/tenant/tenant-123-abc");

      expect(mockPurgeTenantRAGData).toHaveBeenCalledWith("tenant-123-abc");
    });

    it("should handle repository with dots", async () => {
      await request(app).delete("/pr/owner%2Frepo.name/123");

      expect(mockPurgePRDiffChunks).toHaveBeenCalledWith("owner/repo.name", 123, "default-tenant");
    });

    it("should handle very large PR numbers", async () => {
      await request(app).delete("/pr/owner%2Frepo/999999999");

      expect(mockPurgePRDiffChunks).toHaveBeenCalledWith("owner/repo", 999999999, "default-tenant");
    });

    it("should handle parent ID with underscores", async () => {
      await request(app).delete("/doc/doc_parent_123_abc");

      expect(mockPurgeKnowledgeDocChunks).toHaveBeenCalledWith(
        "doc_parent_123_abc",
        "default-tenant"
      );
    });
  });
});

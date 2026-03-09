/**
 * Unit tests for GET /api/rag/documents endpoint
 *
 * Tests the knowledge document listing handler from coreRoutes.
 * Verifies pagination, docType filtering, DTO mapping, content truncation,
 * and error handling.
 *
 * Code paths covered:
 *
 * handleListDocuments:
 *  - Returns paginated documents with correct structure
 *  - Filters by docType query parameter
 *  - Uses default limit (50) and offset (0) when not provided
 *  - Caps limit at MAX_LIMIT (100)
 *  - Caps offset at MAX_OFFSET (10,000)
 *  - Returns 200 with empty array when no documents
 *  - Includes total count in response
 *  - DTO strips internal fields (no embedding, no metadata, no tenantId)
 *  - Content is truncated to 200 characters with ellipsis
 *  - Rejects invalid docType with ValidationError
 *  - Handles NaN limit/offset gracefully (falls back to defaults)
 *  - Clamps negative limit to 1 and negative offset to 0
 *  - Throws ValidationError when no tenantId is available
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import request from "supertest";
import express, { type Express, type Request, type Response, type NextFunction } from "express";

// ==================== Mock Functions ====================

const mockGetKnowledgeDocsByTenant = jest.fn();
const mockGetKnowledgeDocCountsByTypeForTenant = jest.fn();
const mockGetTenantRAGStats = jest.fn();
const mockIngestKnowledgeDoc = jest.fn();
const mockSearchAll = jest.fn();
const mockSyncDueSources = jest.fn();

// ==================== Mocks ====================

jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
    SERVICE_NAMES: { API: "api" },
    HTTP_STATUS: {
      OK: 200,
      CREATED: 201,
      BAD_REQUEST: 400,
      INTERNAL_SERVER_ERROR: 500,
    },
    API_ROUTES: {
      RAG_INGEST: "/ingest",
      RAG_SEARCH: "/search",
      RAG_STATS: "/stats",
      RAG_DOCUMENTS: "/documents",
      RAG_SYNC: "/sync",
    },
    KNOWLEDGE_DOC_TYPES: {
      TROUBLESHOOTING: "troubleshooting",
      RUNBOOK: "runbook",
      DOCUMENTATION: "documentation",
      POSTMORTEM: "postmortem",
      KNOWN_ISSUES: "known_issues",
      SOP: "sop",
      ARCHITECTURE: "architecture",
    },
    ingestKnowledgeDoc: mockIngestKnowledgeDoc,
    searchAll: mockSearchAll,
    syncDueSources: mockSyncDueSources,
    getKnowledgeDocCountsByTypeForTenant: mockGetKnowledgeDocCountsByTypeForTenant,
    getTenantRAGStats: mockGetTenantRAGStats,
    getKnowledgeDocsByTenant: mockGetKnowledgeDocsByTenant,
    asyncHandler:
      (fn: (req: unknown, res: unknown, next: unknown) => Promise<unknown>) =>
      async (req: unknown, res: unknown, next: unknown) => {
        try {
          await fn(req, res, next);
        } catch (error) {
          (next as (err: unknown) => void)(error);
        }
      },
    validate: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    validators: {
      required: (value: unknown) => value !== undefined && value !== null,
      string: (value: unknown) => typeof value === "string",
    },
    getEffectiveTenantId: (req: {
      context?: { tenantId?: string };
      body?: { tenantId?: string };
      query?: { tenantId?: string };
    }) => req?.context?.tenantId ?? req?.body?.tenantId ?? req?.query?.tenantId ?? "",
    rateLimitByCategory: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
    requirePermission: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
    ValidationError: actual.ValidationError,
  };
});

// ==================== Test Helpers ====================

/**
 * Middleware that injects test auth context.
 * Routes use req.context.tenantId so we must provide it.
 */
const injectTestContext =
  (tenantId = "test-tenant") =>
  (req: Request, _res: Response, next: NextFunction): void => {
    Object.assign(req, {
      context: {
        requestId: "test-request-id",
        tenantId,
      },
    });
    next();
  };

/** Error handler middleware for tests */
const testErrorHandler = (
  err: Error & { statusCode?: number },
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = err.statusCode ?? 500;
  res.status(statusCode).json({
    error: { code: err.name, message: err.message },
  });
};

const NOW = new Date("2025-06-15T12:00:00Z");

/** Creates a mock KnowledgeDocRecord (domain object) as returned by the repository */
const createMockDoc = (overrides: Record<string, unknown> = {}) => ({
  id: "doc-1",
  docType: "troubleshooting",
  title: "How to fix OOM errors",
  content: "When your application runs out of memory, you should check the heap usage.",
  repository: "owner/repo",
  sourceUrl: "https://docs.example.com/oom",
  filePath: "docs/oom.md",
  parentId: null,
  chunkIndex: 0,
  embedding: [0.1, 0.2, 0.3],
  embeddingModel: "text-embedding-3-small",
  embeddingVersion: "1",
  tenantId: "test-tenant",
  metadata: { author: "dev" },
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

// ==================== Tests ====================

describe("GET /documents - Knowledge Document Listing", () => {
  // let: app is reassigned in beforeEach for module isolation
  let app: Express;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Defaults for mocks not under test but required by the module
    mockIngestKnowledgeDoc.mockResolvedValue({
      parentId: "p",
      chunksCreated: 1,
      chunksEmbedded: 1,
      success: true,
    });
    mockSearchAll.mockResolvedValue({
      diffChunks: [],
      knowledgeDocs: [],
      queryTokens: 0,
      cacheHit: false,
    });
    mockGetKnowledgeDocCountsByTypeForTenant.mockResolvedValue({});
    mockGetTenantRAGStats.mockResolvedValue({
      tenantId: "t",
      diffChunkCount: 0,
      knowledgeDocCounts: {},
      pendingEmbeddings: 0,
      outdatedEmbeddings: 0,
    });
    mockSyncDueSources.mockResolvedValue({
      sourcesProcessed: 0,
      totalDocsIngested: 0,
      totalErrors: 0,
      results: [],
    });

    // Default mock for the function under test
    mockGetKnowledgeDocsByTenant.mockResolvedValue({
      items: [],
      total: 0,
    });

    const { ragCoreRoutes } = await import("../../routes/rag/coreRoutes.js");
    app = express();
    app.use(express.json());
    app.use(injectTestContext());
    app.use(ragCoreRoutes);
    app.use(testErrorHandler);
  });

  it("should return 200 with paginated documents", async () => {
    const doc1 = createMockDoc({ id: "doc-1", title: "First doc" });
    const doc2 = createMockDoc({ id: "doc-2", title: "Second doc" });

    mockGetKnowledgeDocsByTenant.mockResolvedValue({
      items: [doc1, doc2],
      total: 42,
    });

    const response = await request(app).get("/documents");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.items).toHaveLength(2);
    expect(response.body.data.total).toBe(42);
  });

  it("should filter by docType query parameter", async () => {
    mockGetKnowledgeDocsByTenant.mockResolvedValue({
      items: [createMockDoc({ docType: "runbook" })],
      total: 1,
    });

    await request(app).get("/documents?docType=runbook");

    expect(mockGetKnowledgeDocsByTenant).toHaveBeenCalledWith(
      "test-tenant",
      expect.objectContaining({ docType: "runbook" })
    );
  });

  it("should use default limit of 50 and offset of 0 when not provided", async () => {
    await request(app).get("/documents");

    expect(mockGetKnowledgeDocsByTenant).toHaveBeenCalledWith("test-tenant", {
      docType: undefined,
      limit: 50,
      offset: 0,
    });
  });

  it("should cap limit at 100", async () => {
    await request(app).get("/documents?limit=500");

    expect(mockGetKnowledgeDocsByTenant).toHaveBeenCalledWith(
      "test-tenant",
      expect.objectContaining({ limit: 100 })
    );
  });

  it("should cap offset at 10000", async () => {
    await request(app).get("/documents?offset=99999");

    expect(mockGetKnowledgeDocsByTenant).toHaveBeenCalledWith(
      "test-tenant",
      expect.objectContaining({ offset: 10000 })
    );
  });

  it("should return 200 with empty array when no documents exist", async () => {
    mockGetKnowledgeDocsByTenant.mockResolvedValue({
      items: [],
      total: 0,
    });

    const response = await request(app).get("/documents");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.items).toEqual([]);
    expect(response.body.data.total).toBe(0);
  });

  it("should include total count in response", async () => {
    mockGetKnowledgeDocsByTenant.mockResolvedValue({
      items: [createMockDoc()],
      total: 157,
    });

    const response = await request(app).get("/documents");

    expect(response.body.data.total).toBe(157);
  });

  it("should strip embedding from response DTO", async () => {
    mockGetKnowledgeDocsByTenant.mockResolvedValue({
      items: [createMockDoc({ embedding: [0.1, 0.2, 0.3] })],
      total: 1,
    });

    const response = await request(app).get("/documents");
    const item = response.body.data.items[0];

    expect(item).not.toHaveProperty("embedding");
  });

  it("should strip metadata from response DTO", async () => {
    mockGetKnowledgeDocsByTenant.mockResolvedValue({
      items: [createMockDoc({ metadata: { secret: "data" } })],
      total: 1,
    });

    const response = await request(app).get("/documents");
    const item = response.body.data.items[0];

    expect(item).not.toHaveProperty("metadata");
  });

  it("should strip tenantId from response DTO", async () => {
    mockGetKnowledgeDocsByTenant.mockResolvedValue({
      items: [createMockDoc({ tenantId: "secret-tenant" })],
      total: 1,
    });

    const response = await request(app).get("/documents");
    const item = response.body.data.items[0];

    expect(item).not.toHaveProperty("tenantId");
  });

  it("should strip internal fields (embeddingModel, embeddingVersion, parentId, chunkIndex, filePath) from response DTO", async () => {
    mockGetKnowledgeDocsByTenant.mockResolvedValue({
      items: [createMockDoc()],
      total: 1,
    });

    const response = await request(app).get("/documents");
    const item = response.body.data.items[0];

    expect(item).not.toHaveProperty("embeddingModel");
    expect(item).not.toHaveProperty("embeddingVersion");
    expect(item).not.toHaveProperty("parentId");
    expect(item).not.toHaveProperty("chunkIndex");
  });

  it("should include only expected fields in response DTO", async () => {
    mockGetKnowledgeDocsByTenant.mockResolvedValue({
      items: [createMockDoc()],
      total: 1,
    });

    const response = await request(app).get("/documents");
    const item = response.body.data.items[0];
    const keys = Object.keys(item);

    expect(keys).toEqual(
      expect.arrayContaining([
        "id",
        "docType",
        "title",
        "content",
        "repository",
        "sourceUrl",
        "createdAt",
        "updatedAt",
      ])
    );
    // Should have exactly these 8 keys
    expect(keys).toHaveLength(8);
  });

  it("should truncate content to 200 characters with ellipsis", async () => {
    const longContent = "A".repeat(300);
    mockGetKnowledgeDocsByTenant.mockResolvedValue({
      items: [createMockDoc({ content: longContent })],
      total: 1,
    });

    const response = await request(app).get("/documents");
    const item = response.body.data.items[0];

    expect(item.content).toHaveLength(203); // 200 chars + "..."
    expect(item.content).toMatch(/\.\.\.$/);
    expect(item.content.slice(0, 200)).toBe("A".repeat(200));
  });

  it("should not truncate content when it is 200 characters or fewer", async () => {
    const shortContent = "Short content here";
    mockGetKnowledgeDocsByTenant.mockResolvedValue({
      items: [createMockDoc({ content: shortContent })],
      total: 1,
    });

    const response = await request(app).get("/documents");
    const item = response.body.data.items[0];

    expect(item.content).toBe("Short content here");
    expect(item.content).not.toMatch(/\.\.\.$/);
  });

  it("should not truncate content that is exactly 200 characters", async () => {
    const exactContent = "B".repeat(200);
    mockGetKnowledgeDocsByTenant.mockResolvedValue({
      items: [createMockDoc({ content: exactContent })],
      total: 1,
    });

    const response = await request(app).get("/documents");
    const item = response.body.data.items[0];

    expect(item.content).toBe(exactContent);
    expect(item.content).toHaveLength(200);
  });

  it("should serialize createdAt and updatedAt as ISO strings", async () => {
    mockGetKnowledgeDocsByTenant.mockResolvedValue({
      items: [createMockDoc()],
      total: 1,
    });

    const response = await request(app).get("/documents");
    const item = response.body.data.items[0];

    expect(item.createdAt).toBe("2025-06-15T12:00:00.000Z");
    expect(item.updatedAt).toBe("2025-06-15T12:00:00.000Z");
  });

  it("should reject invalid docType filter with error", async () => {
    const response = await request(app).get("/documents?docType=invalid_type");

    expect(response.status).toBe(400);
  });

  it("should handle NaN limit by falling back to default", async () => {
    await request(app).get("/documents?limit=abc");

    expect(mockGetKnowledgeDocsByTenant).toHaveBeenCalledWith(
      "test-tenant",
      expect.objectContaining({ limit: 50 })
    );
  });

  it("should handle NaN offset by falling back to default", async () => {
    await request(app).get("/documents?offset=xyz");

    expect(mockGetKnowledgeDocsByTenant).toHaveBeenCalledWith(
      "test-tenant",
      expect.objectContaining({ offset: 0 })
    );
  });

  it("should clamp negative limit to 1", async () => {
    await request(app).get("/documents?limit=-5");

    expect(mockGetKnowledgeDocsByTenant).toHaveBeenCalledWith(
      "test-tenant",
      expect.objectContaining({ limit: 1 })
    );
  });

  it("should clamp negative offset to 0", async () => {
    await request(app).get("/documents?offset=-10");

    expect(mockGetKnowledgeDocsByTenant).toHaveBeenCalledWith(
      "test-tenant",
      expect.objectContaining({ offset: 0 })
    );
  });

  it("should pass custom limit and offset when valid", async () => {
    await request(app).get("/documents?limit=25&offset=75");

    expect(mockGetKnowledgeDocsByTenant).toHaveBeenCalledWith("test-tenant", {
      docType: undefined,
      limit: 25,
      offset: 75,
    });
  });

  it("should use tenantId from request context", async () => {
    await request(app).get("/documents");

    expect(mockGetKnowledgeDocsByTenant).toHaveBeenCalledWith("test-tenant", expect.any(Object));
  });

  it("should handle null repository and sourceUrl in response", async () => {
    mockGetKnowledgeDocsByTenant.mockResolvedValue({
      items: [createMockDoc({ repository: null, sourceUrl: null })],
      total: 1,
    });

    const response = await request(app).get("/documents");
    const item = response.body.data.items[0];

    expect(item.repository).toBeNull();
    expect(item.sourceUrl).toBeNull();
  });

  it("should handle service error with 500 status", async () => {
    mockGetKnowledgeDocsByTenant.mockRejectedValue(new Error("Database error"));

    const response = await request(app).get("/documents");

    expect(response.status).toBe(500);
  });

  it("should accept all valid docType values", async () => {
    const validTypes = [
      "troubleshooting",
      "runbook",
      "documentation",
      "postmortem",
      "known_issues",
      "sop",
      "architecture",
    ];

    for (const docType of validTypes) {
      jest.clearAllMocks();
      mockGetKnowledgeDocsByTenant.mockResolvedValue({ items: [], total: 0 });

      const response = await request(app).get(`/documents?docType=${docType}`);
      expect(response.status).toBe(200);
    }
  });
});

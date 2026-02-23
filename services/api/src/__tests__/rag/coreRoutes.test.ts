/**
 * Unit tests for RAG Core Routes
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import request from "supertest";
import express, { type Express } from "express";

// Mock functions
const mockIngestKnowledgeDoc = jest.fn();
const mockSearchAll = jest.fn();
const mockSyncDueSources = jest.fn();
const mockGetKnowledgeDocCountsByType = jest.fn();
const mockGetTenantRAGStats = jest.fn();

// Mock dependencies — pull error classes from actual to avoid duplication checker flags
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
    getKnowledgeDocCountsByType: mockGetKnowledgeDocCountsByType,
    getTenantRAGStats: mockGetTenantRAGStats,
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
    getEffectiveTenantId: (req: { body?: { tenantId?: string }; query?: { tenantId?: string } }) =>
      req?.body?.tenantId ?? req?.query?.tenantId ?? "default",
    ValidationError: actual.ValidationError,
  };
});

describe("RAG Core Routes", () => {
  let app: Express;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default mock implementations
    mockIngestKnowledgeDoc.mockResolvedValue({
      parentId: "doc-123",
      chunksCreated: 5,
      chunksEmbedded: 5,
      success: true,
    });

    mockSearchAll.mockResolvedValue({
      diffChunks: [
        {
          item: {
            id: "chunk-1",
            repository: "owner/repo",
            filePath: "src/index.ts",
            content: "function example() {}",
          },
          similarity: 0.95,
        },
      ],
      knowledgeDocs: [
        {
          item: {
            id: "doc-1",
            docType: "troubleshooting",
            title: "How to fix X",
            content: "Fix content",
          },
          similarity: 0.9,
        },
      ],
      queryTokens: 100,
      cacheHit: false,
    });

    mockGetKnowledgeDocCountsByType.mockResolvedValue({
      troubleshooting: 10,
      runbook: 5,
      documentation: 20,
    });

    mockGetTenantRAGStats.mockResolvedValue({
      tenantId: "tenant-1",
      diffChunkCount: 100,
      knowledgeDocCounts: { troubleshooting: 5, runbook: 3 },
      pendingEmbeddings: 0,
      outdatedEmbeddings: 2,
    });

    mockSyncDueSources.mockResolvedValue({
      sourcesProcessed: 2,
      totalDocsIngested: 10,
      totalErrors: 0,
      results: [],
    });

    const { ragCoreRoutes } = await import("../../routes/rag/coreRoutes.js");
    app = express();
    app.use(express.json());
    app.use(ragCoreRoutes);
  });

  describe("POST /ingest", () => {
    it("should ingest a document successfully", async () => {
      const response = await request(app).post("/ingest").send({
        docType: "troubleshooting",
        title: "How to fix database connections",
        content: "This guide explains how to fix database connections...",
      });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.documentId).toBe("doc-123");
      expect(response.body.data.chunksCreated).toBe(5);
    });

    it("should include optional parameters in ingestion", async () => {
      await request(app)
        .post("/ingest")
        .send({
          docType: "runbook",
          title: "Deployment Runbook",
          content: "Steps for deployment...",
          tenantId: "tenant-1",
          repository: "owner/repo",
          sourceUrl: "https://example.com/doc",
          metadata: { author: "developer" },
        });

      expect(mockIngestKnowledgeDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          docType: "runbook",
          title: "Deployment Runbook",
          tenantId: "tenant-1",
          repository: "owner/repo",
          sourceUrl: "https://example.com/doc",
          metadata: { author: "developer" },
        })
      );
    });

    it("should handle ingestion errors", async () => {
      mockIngestKnowledgeDoc.mockRejectedValue(new Error("Ingestion failed"));

      const response = await request(app).post("/ingest").send({
        docType: "documentation",
        title: "Test Doc",
        content: "Test content",
      });

      expect(response.status).toBe(500);
    });
  });

  describe("POST /search", () => {
    it("should search documents successfully", async () => {
      const response = await request(app).post("/search").send({
        query: "how to fix database connection issues",
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.diffChunks).toHaveLength(1);
      expect(response.body.data.knowledgeDocs).toHaveLength(1);
      expect(response.body.data.queryTokens).toBe(100);
    });

    it("should include optional search parameters", async () => {
      await request(app).post("/search").send({
        query: "deployment guide",
        tenantId: "tenant-1",
        repository: "owner/repo",
        topK: 10,
        minSimilarity: 0.7,
      });

      expect(mockSearchAll).toHaveBeenCalledWith({
        queryText: "deployment guide",
        tenantId: "tenant-1",
        repository: "owner/repo",
        topK: 10,
        minSimilarity: 0.7,
      });
    });

    it("should return cache hit status", async () => {
      mockSearchAll.mockResolvedValue({
        diffChunks: [],
        knowledgeDocs: [],
        queryTokens: 50,
        cacheHit: true,
      });

      const response = await request(app).post("/search").send({
        query: "cached query",
      });

      expect(response.status).toBe(200);
      expect(response.body.data.cacheHit).toBe(true);
    });

    it("should map search results correctly", async () => {
      const response = await request(app).post("/search").send({
        query: "test query",
      });

      const diffChunk = response.body.data.diffChunks[0];
      expect(diffChunk).toHaveProperty("id");
      expect(diffChunk).toHaveProperty("repository");
      expect(diffChunk).toHaveProperty("filePath");
      expect(diffChunk).toHaveProperty("content");
      expect(diffChunk).toHaveProperty("similarity");

      const knowledgeDoc = response.body.data.knowledgeDocs[0];
      expect(knowledgeDoc).toHaveProperty("id");
      expect(knowledgeDoc).toHaveProperty("docType");
      expect(knowledgeDoc).toHaveProperty("title");
      expect(knowledgeDoc).toHaveProperty("content");
      expect(knowledgeDoc).toHaveProperty("similarity");
    });
  });

  describe("GET /stats", () => {
    it("should return RAG statistics", async () => {
      const response = await request(app).get("/stats");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalDocuments).toBe(35); // 10 + 5 + 20
      expect(response.body.data.documentsByType).toBeDefined();
    });

    it("should include tenant stats when tenantId provided", async () => {
      const response = await request(app).get("/stats?tenantId=tenant-1");

      expect(response.status).toBe(200);
      expect(response.body.data.tenantStats).toBeDefined();
      expect(response.body.data.tenantStats.tenantId).toBe("tenant-1");
      expect(response.body.data.tenantStats.diffChunkCount).toBe(100);
    });

    it("should return null tenant stats when no tenantId", async () => {
      const response = await request(app).get("/stats");

      expect(response.status).toBe(200);
      expect(response.body.data.tenantStats).toBeNull();
    });

    it("should calculate total documents correctly", async () => {
      mockGetKnowledgeDocCountsByType.mockResolvedValue({
        troubleshooting: 100,
        runbook: 50,
        documentation: 200,
        postmortem: 25,
      });

      const response = await request(app).get("/stats");

      expect(response.body.data.totalDocuments).toBe(375);
    });
  });

  describe("POST /sync", () => {
    it("should sync external sources successfully", async () => {
      const response = await request(app).post("/sync").send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.sourcesProcessed).toBe(2);
      expect(response.body.data.totalDocsIngested).toBe(10);
    });

    it("should pass sync options", async () => {
      await request(app).post("/sync").send({
        maxDocsPerSource: 20,
        minCredibility: 0.8,
        limit: 5,
      });

      expect(mockSyncDueSources).toHaveBeenCalledWith(
        { maxDocsPerSource: 20, minCredibility: 0.8 },
        5
      );
    });

    it("should include sync results", async () => {
      mockSyncDueSources.mockResolvedValue({
        sourcesProcessed: 3,
        totalDocsIngested: 15,
        totalErrors: 1,
        results: [
          { sourceId: "src-1", docsIngested: 10, errors: [] },
          { sourceId: "src-2", docsIngested: 5, errors: ["Connection timeout"] },
        ],
      });

      const response = await request(app).post("/sync").send({});

      expect(response.body.data.sourcesProcessed).toBe(3);
      expect(response.body.data.totalErrors).toBe(1);
      expect(response.body.data.results).toHaveLength(2);
    });
  });
});

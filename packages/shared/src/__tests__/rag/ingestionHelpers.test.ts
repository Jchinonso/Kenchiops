/**
 * Unit tests for RAG Ingestion Helpers
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Mock dependencies before importing
jest.mock("../../core/logger.js", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock("../../core/errors.js", () => ({
  getErrorMessage: jest.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  ),
}));

jest.mock("../../security/index.js", () => ({
  redactSecrets: jest.fn((text: string) => text.replace(/SECRET_\w+/gi, "[REDACTED]")),
}));

jest.mock("../../llm/providers/openai/embedding.js", () => ({
  getEmbeddingClient: jest.fn(() => ({
    generateBatchEmbeddings: jest.fn(),
  })),
}));

jest.mock("../../database/index.js", () => ({
  updateDiffChunkEmbedding: jest.fn(),
  getDiffChunksWithoutEmbeddings: jest.fn(),
  updateKnowledgeDocEmbedding: jest.fn(),
  getKnowledgeDocsWithoutEmbeddings: jest.fn(),
}));

jest.mock("../../rag/costControls.js", () => ({
  selectEmbeddingTier: jest.fn(),
  recordEmbeddingCost: jest.fn(),
}));

// Import after mocks
import {
  redactContent,
  mapDiffChunksToInputs,
  mapKnowledgeChunksToInputs,
  embedPendingDiffChunks,
  embedPendingKnowledgeDocs,
  INGESTION_DEFAULTS,
} from "../../rag/ingestionHelpers.js";
import { getEmbeddingClient } from "../../llm/providers/openai/embedding.js";
import {
  getDiffChunksWithoutEmbeddings,
  updateDiffChunkEmbedding,
  getKnowledgeDocsWithoutEmbeddings,
  updateKnowledgeDocEmbedding,
} from "../../database/index.js";
import { selectEmbeddingTier } from "../../rag/costControls.js";

const mockGetEmbeddingClient = getEmbeddingClient as jest.MockedFunction<typeof getEmbeddingClient>;
const mockGetDiffChunks = getDiffChunksWithoutEmbeddings as jest.MockedFunction<
  typeof getDiffChunksWithoutEmbeddings
>;
const mockUpdateDiffChunk = updateDiffChunkEmbedding as jest.MockedFunction<
  typeof updateDiffChunkEmbedding
>;
const mockGetKnowledgeDocs = getKnowledgeDocsWithoutEmbeddings as jest.MockedFunction<
  typeof getKnowledgeDocsWithoutEmbeddings
>;
const mockUpdateKnowledgeDoc = updateKnowledgeDocEmbedding as jest.MockedFunction<
  typeof updateKnowledgeDocEmbedding
>;
const mockSelectTier = selectEmbeddingTier as jest.MockedFunction<typeof selectEmbeddingTier>;

describe("RAG Ingestion Helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("INGESTION_DEFAULTS", () => {
    it("should have expected batch size", () => {
      expect(INGESTION_DEFAULTS.BATCH_SIZE).toBe(50);
    });
  });

  describe("redactContent", () => {
    it("should redact secrets from content", () => {
      const content = "API key: SECRET_abc123 and token: SECRET_xyz789";
      const redacted = redactContent(content);

      expect(redacted).toContain("[REDACTED]");
      expect(redacted).not.toContain("SECRET_abc123");
      expect(redacted).not.toContain("SECRET_xyz789");
    });

    it("should preserve non-secret content", () => {
      const content = "Normal content without secrets";
      const redacted = redactContent(content);

      expect(redacted).toBe(content);
    });

    it("should handle empty string", () => {
      expect(redactContent("")).toBe("");
    });
  });

  describe("mapDiffChunksToInputs", () => {
    it("should map chunks to database input format", () => {
      const chunks = [
        {
          content: "diff content 1",
          metadata: { chunkIndex: 0, startOffset: 0, endOffset: 10 },
        },
        {
          content: "diff content 2",
          metadata: { chunkIndex: 1, startOffset: 11, endOffset: 20 },
        },
      ];

      const result = mapDiffChunksToInputs(chunks, {
        filePath: "src/file.ts",
        repository: "owner/repo",
        prNumber: 123,
        commitSha: "abc123",
        hunkHeader: "@@ -1,5 +1,5 @@",
        tenantId: "tenant-1",
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        repository: "owner/repo",
        prNumber: 123,
        commitSha: "abc123",
        filePath: "src/file.ts",
        hunkHeader: "@@ -1,5 +1,5 @@",
        content: "diff content 1",
        chunkIndex: 0,
        startLine: 0,
        endLine: 10,
        tenantId: "tenant-1",
      });
    });

    it("should redact secrets in chunk content", () => {
      const chunks = [
        {
          content: "const key = SECRET_password123;",
          metadata: { chunkIndex: 0, startOffset: 0, endOffset: 30 },
        },
      ];

      const result = mapDiffChunksToInputs(chunks, {
        filePath: "file.ts",
        repository: "repo",
        prNumber: 1,
        commitSha: "sha",
      });

      expect(result[0].content).toContain("[REDACTED]");
      expect(result[0].content).not.toContain("SECRET_password123");
    });

    it("should handle optional parameters", () => {
      const chunks = [
        {
          content: "content",
          metadata: { chunkIndex: 0, startOffset: 0, endOffset: 7 },
        },
      ];

      const result = mapDiffChunksToInputs(chunks, {
        filePath: "file.ts",
        repository: "repo",
        prNumber: 1,
        commitSha: "sha",
        // No hunkHeader, no tenantId
      });

      expect(result[0].hunkHeader).toBeUndefined();
      expect(result[0].tenantId).toBeUndefined();
    });
  });

  describe("mapKnowledgeChunksToInputs", () => {
    it("should map knowledge chunks to database input format", () => {
      const chunks = [
        { content: "Knowledge content 1", metadata: { chunkIndex: 0 } },
        { content: "Knowledge content 2", metadata: { chunkIndex: 1 } },
      ];

      const result = mapKnowledgeChunksToInputs(chunks, {
        docType: "troubleshooting",
        title: "Fix Connection Issues",
        parentId: "parent-123",
        repository: "owner/repo",
        sourceUrl: "https://docs.example.com",
        filePath: "docs/fix.md",
        tenantId: "tenant-1",
        metadata: { author: "developer" },
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        repository: "owner/repo",
        parentId: "parent-123",
        docType: "troubleshooting",
        title: "Fix Connection Issues",
        content: "Knowledge content 1",
        sourceUrl: "https://docs.example.com",
        filePath: "docs/fix.md",
        chunkIndex: 0,
        tenantId: "tenant-1",
        metadata: {
          author: "developer",
          originalTitle: "Fix Connection Issues",
        },
      });
    });

    it("should handle null parentId", () => {
      const chunks = [{ content: "content", metadata: { chunkIndex: 0 } }];

      const result = mapKnowledgeChunksToInputs(chunks, {
        docType: "runbook",
        title: "Title",
        parentId: null,
      });

      expect(result[0].parentId).toBeUndefined();
    });

    it("should redact secrets in knowledge content", () => {
      const chunks = [{ content: "Use SECRET_apikey for auth", metadata: { chunkIndex: 0 } }];

      const result = mapKnowledgeChunksToInputs(chunks, {
        docType: "documentation",
        title: "Auth Guide",
        parentId: null,
      });

      expect(result[0].content).toContain("[REDACTED]");
    });

    it("should preserve original title in metadata", () => {
      const chunks = [{ content: "content", metadata: { chunkIndex: 0 } }];

      const result = mapKnowledgeChunksToInputs(chunks, {
        docType: "runbook",
        title: "Original Title",
        parentId: null,
        metadata: { customField: "value" },
      });

      expect(result[0].metadata).toEqual({
        customField: "value",
        originalTitle: "Original Title",
      });
    });
  });

  describe("embedPendingDiffChunks", () => {
    const mockEmbeddingClient = {
      generateBatchEmbeddings: jest.fn(),
    };

    beforeEach(() => {
      mockGetEmbeddingClient.mockReturnValue(mockEmbeddingClient as any);
      mockSelectTier.mockResolvedValue({
        selectedTier: "STANDARD",
        model: "text-embedding-3-small",
        dimension: 1536,
        reason: "Using preferred tier",
        budgetStatus: {
          status: "ok",
          currentSpendUsd: 10,
          budgetUsd: 100,
          percentUsed: 10,
          remainingUsd: 90,
        },
      });
    });

    it("should return early when no chunks pending", async () => {
      mockGetDiffChunks.mockResolvedValue([]);

      const result = await embedPendingDiffChunks(mockEmbeddingClient as any, 50);

      expect(result).toEqual({ embedded: 0, errors: [] });
      expect(mockEmbeddingClient.generateBatchEmbeddings).not.toHaveBeenCalled();
    });

    it("should embed pending diff chunks successfully", async () => {
      mockGetDiffChunks.mockResolvedValue([
        { id: "chunk-1", content: "diff content 1" },
        { id: "chunk-2", content: "diff content 2" },
      ] as any);

      mockEmbeddingClient.generateBatchEmbeddings.mockResolvedValue({
        embeddings: [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
        model: "text-embedding-3-small",
        tier: "STANDARD",
        totalTokens: 100,
      });

      mockUpdateDiffChunk.mockResolvedValue(undefined);

      const result = await embedPendingDiffChunks(mockEmbeddingClient as any, 50, "tenant-1");

      expect(result.embedded).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(mockUpdateDiffChunk).toHaveBeenCalledTimes(2);
    });

    it("should collect errors for failed updates", async () => {
      mockGetDiffChunks.mockResolvedValue([
        { id: "chunk-1", content: "content 1" },
        { id: "chunk-2", content: "content 2" },
      ] as any);

      mockEmbeddingClient.generateBatchEmbeddings.mockResolvedValue({
        embeddings: [[0.1], [0.2]],
        model: "model",
        tier: "STANDARD",
        totalTokens: 50,
      });

      mockUpdateDiffChunk
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("DB error"));

      const result = await embedPendingDiffChunks(mockEmbeddingClient as any, 50);

      expect(result.embedded).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("chunk-2");
      expect(result.errors[0]).toContain("DB error");
    });

    it("should handle batch embedding failure", async () => {
      mockGetDiffChunks.mockResolvedValue([{ id: "chunk-1", content: "content" }] as any);

      mockEmbeddingClient.generateBatchEmbeddings.mockRejectedValue(new Error("API error"));

      const result = await embedPendingDiffChunks(mockEmbeddingClient as any, 50);

      expect(result.embedded).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Batch embedding failed");
    });

    it("should use budget-aware tier selection when tenantId provided", async () => {
      mockGetDiffChunks.mockResolvedValue([{ id: "chunk-1", content: "content" }] as any);

      mockEmbeddingClient.generateBatchEmbeddings.mockResolvedValue({
        embeddings: [[0.1]],
        model: "model",
        tier: "LIGHT",
        totalTokens: 25,
      });

      await embedPendingDiffChunks(mockEmbeddingClient as any, 50, "tenant-123");

      expect(mockSelectTier).toHaveBeenCalledWith("tenant-123", expect.any(Number));
    });
  });

  describe("embedPendingKnowledgeDocs", () => {
    const mockEmbeddingClient = {
      generateBatchEmbeddings: jest.fn(),
    };

    beforeEach(() => {
      mockGetEmbeddingClient.mockReturnValue(mockEmbeddingClient as any);
      mockSelectTier.mockResolvedValue({
        selectedTier: "STANDARD",
        model: "text-embedding-3-small",
        dimension: 1536,
        reason: "Using preferred tier",
        budgetStatus: {
          status: "ok",
          currentSpendUsd: 10,
          budgetUsd: 100,
          percentUsed: 10,
          remainingUsd: 90,
        },
      });
    });

    it("should return early when no docs pending", async () => {
      mockGetKnowledgeDocs.mockResolvedValue([]);

      const result = await embedPendingKnowledgeDocs(mockEmbeddingClient as any, 50);

      expect(result).toEqual({ embedded: 0, errors: [] });
    });

    it("should embed pending knowledge docs successfully", async () => {
      mockGetKnowledgeDocs.mockResolvedValue([
        { id: "doc-1", content: "knowledge content 1" },
        { id: "doc-2", content: "knowledge content 2" },
      ] as any);

      mockEmbeddingClient.generateBatchEmbeddings.mockResolvedValue({
        embeddings: [
          [0.5, 0.6],
          [0.7, 0.8],
        ],
        model: "text-embedding-3-small",
        tier: "STANDARD",
        totalTokens: 150,
      });

      mockUpdateKnowledgeDoc.mockResolvedValue(undefined);

      const result = await embedPendingKnowledgeDocs(mockEmbeddingClient as any, 50, "tenant-1");

      expect(result.embedded).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(mockUpdateKnowledgeDoc).toHaveBeenCalledTimes(2);
    });

    it("should collect errors for failed doc updates", async () => {
      mockGetKnowledgeDocs.mockResolvedValue([{ id: "doc-1", content: "content 1" }] as any);

      mockEmbeddingClient.generateBatchEmbeddings.mockResolvedValue({
        embeddings: [[0.1]],
        model: "model",
        tier: "STANDARD",
        totalTokens: 50,
      });

      mockUpdateKnowledgeDoc.mockRejectedValue(new Error("Update failed"));

      const result = await embedPendingKnowledgeDocs(mockEmbeddingClient as any, 50);

      expect(result.embedded).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("doc-1");
    });

    it("should handle batch embedding failure for knowledge docs", async () => {
      mockGetKnowledgeDocs.mockResolvedValue([{ id: "doc-1", content: "content" }] as any);

      mockEmbeddingClient.generateBatchEmbeddings.mockRejectedValue(
        new Error("Embedding API down")
      );

      const result = await embedPendingKnowledgeDocs(mockEmbeddingClient as any, 50);

      expect(result.embedded).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Batch embedding failed for knowledge docs");
    });
  });
});

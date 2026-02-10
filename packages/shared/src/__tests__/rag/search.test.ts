import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type {
  SearchQuery,
  DiffSearchQuery,
  KnowledgeSearchQuery,
  EventQueryContext,
} from "../../rag/search.js";

// Mock dependencies
jest.mock("../../cache/cacheClient.js", () => ({
  cacheGet: jest.fn().mockResolvedValue({ hit: false, data: null }),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDeletePattern: jest.fn().mockResolvedValue(5),
}));

jest.mock("../../rag/costControls.js", () => ({
  clearCacheForTenant: jest.fn().mockReturnValue(3),
  getCachedEmbedding: jest.fn().mockReturnValue(null),
  cacheEmbedding: jest.fn(),
  selectEmbeddingTier: jest.fn().mockResolvedValue({
    selectedTier: "STANDARD",
    model: "text-embedding-3-small",
    dimension: 1536,
    reason: "Default tier selection",
    budgetStatus: {
      status: "ok",
      currentSpendUsd: 10,
      budgetUsd: 100,
      percentUsed: 10,
      remainingUsd: 90,
    },
  }),
  recordQueryCost: jest.fn().mockResolvedValue(undefined),
}));

const mockEmbeddingClient = {
  generateEmbedding: jest.fn().mockResolvedValue({
    embedding: Array.from({ length: 1536 }, () => Math.random()),
    tokenCount: 100,
    model: "text-embedding-3-small",
  }),
};

jest.mock("../../llm/providers/llmProvider/embedding.js", () => ({
  EmbeddingClient: jest.fn().mockImplementation(() => mockEmbeddingClient),
  getEmbeddingClient: jest.fn().mockReturnValue(mockEmbeddingClient),
}));

jest.mock("../../database/index.js", () => ({
  searchSimilarDiffChunks: jest.fn().mockResolvedValue([]),
  searchSimilarKnowledgeDocs: jest.fn().mockResolvedValue([]),
  recordCost: jest.fn().mockResolvedValue(undefined),
  batchIncrementKnowledgeDocHitCounts: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../database/costTracking/repository.js", () => ({
  recordCost: jest.fn().mockResolvedValue(undefined),
  getBudgetStatus: jest.fn().mockResolvedValue({
    status: "ok",
    currentSpendUsd: 10,
    budgetUsd: 100,
    percentUsed: 10,
    remainingUsd: 90,
  }),
}));

jest.mock("../../database/tenant/ragConfig.js", () => ({
  getRAGBudgetConfig: jest.fn().mockResolvedValue(null),
  updateRAGBudgetConfig: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../security/index.js", () => ({
  redactSecrets: jest.fn((text: string) => text),
}));

// Import after mocks
import {
  searchDiffChunks,
  searchKnowledgeDocs,
  searchAll,
  searchFromEventContext,
  clearEmbeddingCache,
} from "../../rag/search.js";
import { cacheGet, cacheSet } from "../../cache/cacheClient.js";
import { EmbeddingClient } from "../../llm/providers/llmProvider/embedding.js";
import { searchSimilarDiffChunks, searchSimilarKnowledgeDocs } from "../../database/index.js";
import { redactSecrets } from "../../security/index.js";

describe("RAG Search Module", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("searchDiffChunks", () => {
    it("should return empty results for short queries", async () => {
      const query: DiffSearchQuery = {
        queryText: "short", // Less than 10 chars after trim
      };

      const result = await searchDiffChunks(query);

      expect(result.results).toHaveLength(0);
      expect(result.cacheHit).toBe(false);
    });

    it("should call embedding client for valid queries", async () => {
      const mockEmbedding = Array.from({ length: 1536 }, () => 0.1);
      (EmbeddingClient as jest.MockedClass<typeof EmbeddingClient>).mockImplementation(
        () =>
          ({
            generateEmbedding: jest.fn().mockResolvedValue({
              embedding: mockEmbedding,
              tokenCount: 50,
              model: "text-embedding-3-small",
            }),
          }) as unknown as EmbeddingClient
      );

      const query: DiffSearchQuery = {
        queryText: "This is a valid search query for testing",
        repository: "test/repo",
      };

      await searchDiffChunks(query);

      expect(searchSimilarDiffChunks).toHaveBeenCalled();
    });

    it("should use cached embedding when available", async () => {
      const cachedEmbedding = Array.from({ length: 1536 }, () => 0.5);
      (cacheGet as jest.Mock).mockResolvedValueOnce({
        hit: true,
        data: {
          embedding: cachedEmbedding,
          tier: "STANDARD",
        },
      });

      const query: DiffSearchQuery = {
        queryText: "This query should use cached embedding",
      };

      const result = await searchDiffChunks(query);

      expect(result.cacheHit).toBe(true);
    });

    it("should cache new embeddings", async () => {
      (cacheGet as jest.Mock).mockResolvedValue({ hit: false, data: null });

      const query: DiffSearchQuery = {
        queryText: "This query should cache the embedding",
      };

      await searchDiffChunks(query);

      expect(cacheSet).toHaveBeenCalled();
    });

    it("should pass filters to database query", async () => {
      const query: DiffSearchQuery = {
        queryText: "Search with filters applied",
        repository: "test/repo",
        prNumber: 123,
        filePath: "src/test.ts",
        tenantId: "tenant-1",
      };

      await searchDiffChunks(query);

      expect(searchSimilarDiffChunks).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          repository: "test/repo",
          prNumber: 123,
          filePath: "src/test.ts",
          tenantId: "tenant-1",
        })
      );
    });

    it("should redact secrets from query text", async () => {
      const query: DiffSearchQuery = {
        queryText: "Search with SECRET_KEY=abc123 in query",
      };

      await searchDiffChunks(query);

      expect(redactSecrets).toHaveBeenCalled();
    });
  });

  describe("searchKnowledgeDocs", () => {
    it("should return empty results for short queries", async () => {
      const query: KnowledgeSearchQuery = {
        queryText: "tiny",
      };

      const result = await searchKnowledgeDocs(query);

      expect(result.results).toHaveLength(0);
      expect(result.cacheHit).toBe(false);
    });

    it("should call database search with correct filters", async () => {
      const query: KnowledgeSearchQuery = {
        queryText: "Search for runbook documentation",
        docType: "runbook",
        tenantId: "tenant-1",
      };

      await searchKnowledgeDocs(query);

      expect(searchSimilarKnowledgeDocs).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          docType: "runbook",
          tenantId: "tenant-1",
        })
      );
    });

    it("should use topK parameter for limit", async () => {
      const query: KnowledgeSearchQuery = {
        queryText: "Search with custom topK value",
        topK: 5,
        enableReranking: false, // Disable reranking to test exact topK behavior
      };

      await searchKnowledgeDocs(query);

      expect(searchSimilarKnowledgeDocs).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          limit: 5,
        })
      );
    });
  });

  describe("searchAll", () => {
    it("should return empty results for short queries", async () => {
      const query: SearchQuery = {
        queryText: "tiny",
      };

      const result = await searchAll(query);

      expect(result.diffChunks).toHaveLength(0);
      expect(result.knowledgeDocs).toHaveLength(0);
    });

    it("should search both diff chunks and knowledge docs", async () => {
      const query: SearchQuery = {
        queryText: "Combined search across all sources",
        repository: "test/repo",
      };

      await searchAll(query);

      expect(searchSimilarDiffChunks).toHaveBeenCalled();
      expect(searchSimilarKnowledgeDocs).toHaveBeenCalled();
    });

    it("should return combined results with query tokens", async () => {
      const query: SearchQuery = {
        queryText: "Search query for combined results",
      };

      const result = await searchAll(query);

      expect(result).toHaveProperty("diffChunks");
      expect(result).toHaveProperty("knowledgeDocs");
      expect(result).toHaveProperty("queryTokens");
      expect(result).toHaveProperty("cacheHit");
    });

    it("should use single embedding for both searches", async () => {
      const mockGenerateEmbedding = jest.fn().mockResolvedValue({
        embedding: Array.from({ length: 1536 }, () => 0.1),
        tokenCount: 50,
        model: "text-embedding-3-small",
      });

      (EmbeddingClient as jest.MockedClass<typeof EmbeddingClient>).mockImplementation(
        () =>
          ({
            generateEmbedding: mockGenerateEmbedding,
          }) as unknown as EmbeddingClient
      );

      const query: SearchQuery = {
        queryText: "Search should only generate one embedding",
      };

      await searchAll(query);

      // Embedding should only be generated once (or use cache)
      // Both searches should use the same embedding
      expect(searchSimilarDiffChunks).toHaveBeenCalledTimes(1);
      expect(searchSimilarKnowledgeDocs).toHaveBeenCalledTimes(1);
    });
  });

  describe("searchFromEventContext", () => {
    it("should build query from event context", async () => {
      const context: EventQueryContext = {
        eventType: "ci_failure",
        repository: "test/repo",
        errorMessage: "TypeScript compilation failed",
        failureSummary: "Build error in authentication module",
      };

      await searchFromEventContext(context);

      // Should have called the search functions
      expect(searchSimilarDiffChunks).toHaveBeenCalled();
      expect(searchSimilarKnowledgeDocs).toHaveBeenCalled();
    });

    it("should include affected files in query", async () => {
      const context: EventQueryContext = {
        eventType: "ci_failure",
        repository: "test/repo",
        affectedFiles: ["src/auth.ts", "src/user.ts"],
      };

      // The redactSecrets mock will be called with the built query
      await searchFromEventContext(context);

      // Query should be built from context
      expect(redactSecrets).toHaveBeenCalledWith(expect.stringContaining("src/auth.ts"));
    });

    it("should include test names in query", async () => {
      const context: EventQueryContext = {
        eventType: "test_failure",
        repository: "test/repo",
        testNames: ["should authenticate user", "should validate token"],
      };

      await searchFromEventContext(context);

      expect(redactSecrets).toHaveBeenCalledWith(expect.stringContaining("authenticate user"));
    });

    it("should pass tenant ID to search", async () => {
      const context: EventQueryContext = {
        eventType: "ci_failure",
        repository: "test/repo",
      };

      await searchFromEventContext(context, "tenant-123");

      expect(searchSimilarDiffChunks).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          tenantId: "tenant-123",
        })
      );
    });
  });

  describe("clearEmbeddingCache", () => {
    it("should clear both Redis and in-memory cache for tenant", async () => {
      const result = await clearEmbeddingCache("tenant-1");

      expect(result).toEqual({
        redisCleared: 5,
        memoryCleared: 3,
      });
    });
  });

  describe("query validation", () => {
    it("should handle queries with only whitespace", async () => {
      const query: SearchQuery = {
        queryText: "           ", // Only spaces
      };

      const result = await searchAll(query);

      expect(result.diffChunks).toHaveLength(0);
      expect(result.knowledgeDocs).toHaveLength(0);
    });

    it("should trim query text before validation", async () => {
      const query: SearchQuery = {
        queryText: "   Valid query with leading and trailing spaces   ",
      };

      await searchAll(query);

      // Should pass validation after trimming
      expect(searchSimilarDiffChunks).toHaveBeenCalled();
    });
  });

  describe("similarity thresholds", () => {
    it("should use custom minSimilarity when provided", async () => {
      const query: DiffSearchQuery = {
        queryText: "Search with custom similarity threshold",
        minSimilarity: 0.9,
      };

      await searchDiffChunks(query);

      expect(searchSimilarDiffChunks).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          minSimilarity: 0.9,
        })
      );
    });

    it("should use default thresholds when not specified", async () => {
      const query: DiffSearchQuery = {
        queryText: "Search with default similarity threshold",
      };

      await searchDiffChunks(query);

      // Default threshold for diff chunks is 0.70
      expect(searchSimilarDiffChunks).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          minSimilarity: expect.any(Number),
        })
      );
    });
  });
});

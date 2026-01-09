/**
 * Unit tests for RAG Search Helpers
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
  buildQueryFromContext,
  validateQuery,
  buildEmbeddingCacheKey,
  normalizeQueryText,
  toRerankableResult,
  fromRerankedResult,
  SEARCH_CONSTANTS,
  type EventQueryContext,
} from "../../rag/searchHelpers.js";

// Mock dependencies
jest.mock("../../core/logger.js", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock("../../security/index.js", () => ({
  redactSecrets: jest.fn((text: string) => text.replace(/secret_\w+/g, "[REDACTED]")),
}));

jest.mock("../../rag/chunking.js", () => ({
  estimateTokenCount: jest.fn((text: string) => Math.ceil(text.length / 4)),
}));

jest.mock("../../cache/cacheClient.js", () => ({
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
}));

jest.mock("../../openaiClient/embedding.js", () => ({
  getEmbeddingClient: jest.fn(),
}));

jest.mock("../../database/index.js", () => ({
  recordCost: jest.fn(),
  batchIncrementKnowledgeDocHitCounts: jest.fn(),
}));

jest.mock("../../rag/metrics.js", () => ({
  recordEmbeddingOperation: jest.fn(),
}));

jest.mock("../../rag/costControls.js", () => ({
  selectEmbeddingTier: jest.fn(),
  getCachedEmbedding: jest.fn(),
  cacheEmbedding: jest.fn(),
  recordQueryCost: jest.fn(),
}));

describe("RAG Search Helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("SEARCH_CONSTANTS", () => {
    it("should have expected default values", () => {
      expect(SEARCH_CONSTANTS.MAX_QUERY_TOKENS).toBe(2000);
      expect(SEARCH_CONSTANTS.EMBEDDING_CACHE_TTL_SECONDS).toBe(3600);
      expect(SEARCH_CONSTANTS.MIN_QUERY_LENGTH).toBe(10);
      expect(SEARCH_CONSTANTS.CACHE_KEY_PREFIX).toBe("rag:embedding:");
    });
  });

  describe("buildQueryFromContext", () => {
    it("should build basic query with event type and repository", () => {
      const context: EventQueryContext = {
        eventType: "CI_FAILURE",
        repository: "owner/repo",
      };

      const query = buildQueryFromContext(context);

      expect(query).toContain("Event: CI_FAILURE");
      expect(query).toContain("Repository: owner/repo");
    });

    it("should include error message when provided", () => {
      const context: EventQueryContext = {
        eventType: "CI_FAILURE",
        repository: "owner/repo",
        errorMessage: "TypeError: Cannot read property 'foo' of undefined",
      };

      const query = buildQueryFromContext(context);

      expect(query).toContain("Error: TypeError: Cannot read property 'foo' of undefined");
    });

    it("should include failure summary when provided", () => {
      const context: EventQueryContext = {
        eventType: "CI_FAILURE",
        repository: "owner/repo",
        failureSummary: "Build failed due to TypeScript errors",
      };

      const query = buildQueryFromContext(context);

      expect(query).toContain("Summary: Build failed due to TypeScript errors");
    });

    it("should include affected files limited to 10", () => {
      const context: EventQueryContext = {
        eventType: "CI_FAILURE",
        repository: "owner/repo",
        affectedFiles: Array.from({ length: 15 }, (_, i) => `file${i}.ts`),
      };

      const query = buildQueryFromContext(context);

      expect(query).toContain("Files:");
      expect(query).toContain("file0.ts");
      expect(query).toContain("file9.ts");
      expect(query).not.toContain("file10.ts");
    });

    it("should include test names limited to 5", () => {
      const context: EventQueryContext = {
        eventType: "CI_FAILURE",
        repository: "owner/repo",
        testNames: Array.from({ length: 10 }, (_, i) => `test${i}`),
      };

      const query = buildQueryFromContext(context);

      expect(query).toContain("Tests:");
      expect(query).toContain("test0");
      expect(query).toContain("test4");
      expect(query).not.toContain("test5");
    });

    it("should handle empty arrays gracefully", () => {
      const context: EventQueryContext = {
        eventType: "CI_FAILURE",
        repository: "owner/repo",
        affectedFiles: [],
        testNames: [],
      };

      const query = buildQueryFromContext(context);

      expect(query).not.toContain("Files:");
      expect(query).not.toContain("Tests:");
    });

    it("should build complete query with all fields", () => {
      const context: EventQueryContext = {
        eventType: "CI_FAILURE",
        repository: "kenchiops/kenchi",
        errorMessage: "Connection refused",
        failureSummary: "Database connection failed",
        affectedFiles: ["src/db.ts", "src/index.ts"],
        testNames: ["should connect", "should query"],
      };

      const query = buildQueryFromContext(context);

      expect(query).toContain("Event: CI_FAILURE");
      expect(query).toContain("Repository: kenchiops/kenchi");
      expect(query).toContain("Error: Connection refused");
      expect(query).toContain("Summary: Database connection failed");
      expect(query).toContain("Files: src/db.ts, src/index.ts");
      expect(query).toContain("Tests: should connect, should query");
    });
  });

  describe("validateQuery", () => {
    it("should return true for query meeting minimum length", () => {
      expect(validateQuery("This is a valid query")).toBe(true);
    });

    it("should return false for query below minimum length", () => {
      expect(validateQuery("short")).toBe(false);
    });

    it("should return false for empty query", () => {
      expect(validateQuery("")).toBe(false);
    });

    it("should trim whitespace before validation", () => {
      expect(validateQuery("   short   ")).toBe(false);
      expect(validateQuery("   valid query text   ")).toBe(true);
    });

    it("should return true for exactly minimum length", () => {
      const exactLengthQuery = "a".repeat(SEARCH_CONSTANTS.MIN_QUERY_LENGTH);
      expect(validateQuery(exactLengthQuery)).toBe(true);
    });

    it("should return false for one less than minimum length", () => {
      const shortQuery = "a".repeat(SEARCH_CONSTANTS.MIN_QUERY_LENGTH - 1);
      expect(validateQuery(shortQuery)).toBe(false);
    });
  });

  describe("buildEmbeddingCacheKey", () => {
    it("should generate cache key with global prefix when no tenant", () => {
      const key = buildEmbeddingCacheKey("test query");

      expect(key).toMatch(/^rag:embedding:global:[a-f0-9]+$/);
    });

    it("should generate cache key with tenant prefix when provided", () => {
      const key = buildEmbeddingCacheKey("test query", "tenant-123");

      expect(key).toMatch(/^rag:embedding:tenant-123:[a-f0-9]+$/);
    });

    it("should generate same key for same input", () => {
      const key1 = buildEmbeddingCacheKey("identical query", "tenant-1");
      const key2 = buildEmbeddingCacheKey("identical query", "tenant-1");

      expect(key1).toBe(key2);
    });

    it("should generate different keys for different queries", () => {
      const key1 = buildEmbeddingCacheKey("query one", "tenant-1");
      const key2 = buildEmbeddingCacheKey("query two", "tenant-1");

      expect(key1).not.toBe(key2);
    });

    it("should generate different keys for different tenants", () => {
      const key1 = buildEmbeddingCacheKey("same query", "tenant-1");
      const key2 = buildEmbeddingCacheKey("same query", "tenant-2");

      expect(key1).not.toBe(key2);
    });
  });

  describe("normalizeQueryText", () => {
    it("should redact secrets in query text", () => {
      const text = "Error with secret_abc123 token";
      const normalized = normalizeQueryText(text);

      expect(normalized).toContain("[REDACTED]");
      expect(normalized).not.toContain("secret_abc123");
    });

    it("should truncate text exceeding max tokens", () => {
      // Create text that would exceed MAX_QUERY_TOKENS
      const longText = "a".repeat(SEARCH_CONSTANTS.MAX_QUERY_TOKENS * 4 + 100);
      const normalized = normalizeQueryText(longText);

      expect(normalized.length).toBeLessThanOrEqual(SEARCH_CONSTANTS.MAX_QUERY_TOKENS * 4);
    });

    it("should not truncate text within token limit", () => {
      const shortText = "This is a short query";
      const normalized = normalizeQueryText(shortText);

      expect(normalized).toBe(shortText);
    });

    it("should handle empty string", () => {
      expect(normalizeQueryText("")).toBe("");
    });
  });

  describe("toRerankableResult", () => {
    it("should convert VectorSearchResult to RerankableResult format", () => {
      const mockResult = {
        item: {
          id: "doc-123",
          docType: "troubleshooting",
          content: "How to fix database connection issues",
          repository: "owner/repo",
          createdAt: new Date("2024-01-01"),
          metadata: {
            workflow: "build",
            errorSignature: "ECONNREFUSED",
            language: "typescript",
            hitCount: 5,
            helpfulRate: 0.8,
            negativeFeedbackCount: 1,
          },
        },
        similarity: 0.95,
      };

      const rerankable = toRerankableResult(mockResult as any);

      expect(rerankable.id).toBe("doc-123");
      expect(rerankable.similarity).toBe(0.95);
      expect(rerankable.docType).toBe("troubleshooting");
      expect(rerankable.content).toBe("How to fix database connection issues");
      expect(rerankable.createdAt).toBe("2024-01-01T00:00:00.000Z");
      expect(rerankable.metadata.repository).toBe("owner/repo");
      expect(rerankable.metadata.workflow).toBe("build");
      expect(rerankable.metadata.errorSignature).toBe("ECONNREFUSED");
      expect(rerankable.metadata.hitCount).toBe(5);
      expect(rerankable.metadata.helpfulRate).toBe(0.8);
    });

    it("should handle missing optional metadata fields", () => {
      const mockResult = {
        item: {
          id: "doc-456",
          docType: "runbook",
          content: "Deployment guide",
          repository: null,
          createdAt: new Date("2024-02-01"),
          metadata: {},
        },
        similarity: 0.75,
      };

      const rerankable = toRerankableResult(mockResult as any);

      expect(rerankable.id).toBe("doc-456");
      expect(rerankable.metadata.repository).toBeUndefined();
      expect(rerankable.metadata.workflow).toBeUndefined();
      expect(rerankable.metadata.errorSignature).toBeUndefined();
    });
  });

  describe("fromRerankedResult", () => {
    const originalResults = [
      {
        item: {
          id: "doc-1",
          docType: "troubleshooting",
          content: "Content 1",
          repository: "repo1",
          createdAt: new Date(),
          metadata: {},
        },
        similarity: 0.9,
      },
      {
        item: {
          id: "doc-2",
          docType: "runbook",
          content: "Content 2",
          repository: "repo2",
          createdAt: new Date(),
          metadata: {},
        },
        similarity: 0.8,
      },
    ];

    it("should convert reranked result back to VectorSearchResult", () => {
      const reranked = {
        result: { id: "doc-1", similarity: 0.9, docType: "troubleshooting", content: "Content 1" },
        finalScore: 0.95,
        boosts: {},
        penalties: {},
      };

      const result = fromRerankedResult(reranked as any, originalResults as any);

      expect(result.item.id).toBe("doc-1");
      expect(result.similarity).toBe(0.95); // Uses finalScore
      expect(result.item.content).toBe("Content 1");
    });

    it("should throw NotFoundError when result not in original list", () => {
      const reranked = {
        result: { id: "doc-nonexistent", similarity: 0.5 },
        finalScore: 0.6,
      };

      expect(() => fromRerankedResult(reranked as any, originalResults as any)).toThrow(
        "Reranked result not found in original results"
      );
    });
  });
});

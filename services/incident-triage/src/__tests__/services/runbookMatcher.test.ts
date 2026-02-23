/**
 * Runbook Matcher Tests
 *
 * Tests for the runbook matcher service with mocked ports.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockCreateLogger = jest.fn(() => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock("@kenchi/shared", () => ({
  ...jest.requireActual("@kenchi/shared"),
  createLogger: (...args: unknown[]) => mockCreateLogger(...args),
}));

import { createRunbookMatcher } from "../../services/runbookMatcher.js";
import type { EmbeddingPort, KnowledgeSearchPort } from "../../types/runbookTypes.js";
import type { RequestContext } from "@kenchi/shared";

// ==================== Test Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-request-id",
  tenantId: "test-tenant",
};

const createMockEmbeddingPort = (): { generate: jest.Mock } => ({
  generate: jest.fn(),
});

const createMockSearchPort = (): { searchRunbooks: jest.Mock } => ({
  searchRunbooks: jest.fn(),
});

// ==================== Tests ====================

describe("createRunbookMatcher", () => {
  // let: mock references change per test in beforeEach
  let mockEmbeddingPort: ReturnType<typeof createMockEmbeddingPort>;
  let mockSearchPort: ReturnType<typeof createMockSearchPort>;

  beforeEach(() => {
    mockEmbeddingPort = createMockEmbeddingPort();
    mockSearchPort = createMockSearchPort();
    jest.clearAllMocks();
  });

  describe("matchRunbooks", () => {
    it("should return empty results for empty alert text", async () => {
      const matcher = createRunbookMatcher(
        mockEmbeddingPort as unknown as EmbeddingPort,
        mockSearchPort as unknown as KnowledgeSearchPort
      );

      const result = await matcher.matchRunbooks("", "tenant-1", testContext);

      expect(result.matches).toHaveLength(0);
      expect(result.embedding).toEqual([]);
      expect(result.embeddingTokenCount).toBe(0);
      expect(mockEmbeddingPort.generate).not.toHaveBeenCalled();
    });

    it("should return empty results for whitespace-only alert text", async () => {
      const matcher = createRunbookMatcher(
        mockEmbeddingPort as unknown as EmbeddingPort,
        mockSearchPort as unknown as KnowledgeSearchPort
      );

      const result = await matcher.matchRunbooks("   ", "tenant-1", testContext);

      expect(result.matches).toHaveLength(0);
      expect(mockEmbeddingPort.generate).not.toHaveBeenCalled();
    });

    it("should generate embedding and search for matches", async () => {
      const testEmbedding = [0.1, 0.2, 0.3];
      mockEmbeddingPort.generate.mockResolvedValueOnce({
        embedding: testEmbedding,
        tokenCount: 10,
      });
      mockSearchPort.searchRunbooks.mockResolvedValueOnce([
        {
          id: "doc-1",
          title: "CPU Troubleshooting",
          content: "Steps to fix CPU issues",
          sourceUrl: "https://docs.example.com/cpu",
          similarity: 0.89,
        },
      ]);

      const matcher = createRunbookMatcher(
        mockEmbeddingPort as unknown as EmbeddingPort,
        mockSearchPort as unknown as KnowledgeSearchPort
      );

      const result = await matcher.matchRunbooks(
        "High CPU on payments-api",
        "tenant-1",
        testContext
      );

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].docId).toBe("doc-1");
      expect(result.matches[0].title).toBe("CPU Troubleshooting");
      expect(result.matches[0].similarity).toBe(0.89);
      expect(result.matches[0].sourceUrl).toBe("https://docs.example.com/cpu");
      expect(result.embedding).toEqual(testEmbedding);
      expect(result.embeddingTokenCount).toBe(10);
    });

    it("should pass trimmed text to embedding port", async () => {
      mockEmbeddingPort.generate.mockResolvedValueOnce({
        embedding: [0.1],
        tokenCount: 5,
      });
      mockSearchPort.searchRunbooks.mockResolvedValueOnce([]);

      const matcher = createRunbookMatcher(
        mockEmbeddingPort as unknown as EmbeddingPort,
        mockSearchPort as unknown as KnowledgeSearchPort
      );

      await matcher.matchRunbooks("  alert text with spaces  ", "tenant-1", testContext);

      expect(mockEmbeddingPort.generate).toHaveBeenCalledWith("tenant-1", "alert text with spaces");
    });

    it("should return empty matches when no search results", async () => {
      mockEmbeddingPort.generate.mockResolvedValueOnce({
        embedding: [0.1, 0.2],
        tokenCount: 5,
      });
      mockSearchPort.searchRunbooks.mockResolvedValueOnce([]);

      const matcher = createRunbookMatcher(
        mockEmbeddingPort as unknown as EmbeddingPort,
        mockSearchPort as unknown as KnowledgeSearchPort
      );

      const result = await matcher.matchRunbooks("some alert", "tenant-1", testContext);

      expect(result.matches).toHaveLength(0);
      expect(result.embedding).toEqual([0.1, 0.2]);
    });

    it("should map knowledge search results to RunbookMatch domain objects", async () => {
      mockEmbeddingPort.generate.mockResolvedValueOnce({
        embedding: [0.1],
        tokenCount: 3,
      });
      mockSearchPort.searchRunbooks.mockResolvedValueOnce([
        {
          id: "doc-123",
          title: "Memory Leak Runbook",
          content: "Detailed steps...",
          sourceUrl: null,
          similarity: 0.75,
        },
      ]);

      const matcher = createRunbookMatcher(
        mockEmbeddingPort as unknown as EmbeddingPort,
        mockSearchPort as unknown as KnowledgeSearchPort
      );

      const result = await matcher.matchRunbooks("memory leak detected", "tenant-1", testContext);

      expect(result.matches[0]).toEqual({
        docId: "doc-123",
        title: "Memory Leak Runbook",
        similarity: 0.75,
        content: "Detailed steps...",
        sourceUrl: null,
      });
    });

    it("should measure and return durationMs", async () => {
      mockEmbeddingPort.generate.mockResolvedValueOnce({
        embedding: [0.1],
        tokenCount: 1,
      });
      mockSearchPort.searchRunbooks.mockResolvedValueOnce([]);

      const matcher = createRunbookMatcher(
        mockEmbeddingPort as unknown as EmbeddingPort,
        mockSearchPort as unknown as KnowledgeSearchPort
      );

      const result = await matcher.matchRunbooks("test", "tenant-1", testContext);

      expect(typeof result.durationMs).toBe("number");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should propagate embedding port errors", async () => {
      mockEmbeddingPort.generate.mockRejectedValueOnce(new Error("Embedding API failed"));

      const matcher = createRunbookMatcher(
        mockEmbeddingPort as unknown as EmbeddingPort,
        mockSearchPort as unknown as KnowledgeSearchPort
      );

      await expect(matcher.matchRunbooks("test alert", "tenant-1", testContext)).rejects.toThrow(
        "Embedding API failed"
      );
    });

    it("should propagate search port errors", async () => {
      mockEmbeddingPort.generate.mockResolvedValueOnce({
        embedding: [0.1],
        tokenCount: 1,
      });
      mockSearchPort.searchRunbooks.mockRejectedValueOnce(new Error("Search failed"));

      const matcher = createRunbookMatcher(
        mockEmbeddingPort as unknown as EmbeddingPort,
        mockSearchPort as unknown as KnowledgeSearchPort
      );

      await expect(matcher.matchRunbooks("test alert", "tenant-1", testContext)).rejects.toThrow(
        "Search failed"
      );
    });
  });
});

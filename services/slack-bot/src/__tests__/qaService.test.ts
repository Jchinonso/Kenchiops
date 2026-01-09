/**
 * Unit tests for Q&A Service.
 * Tests RAG-powered question answering functionality.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { shouldTriggerQA, performQASearch, generateQueryId } from "../services/qaService.js";

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  getErrorMessage: jest.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  ),
  searchAll: jest.fn(),
  QA_CONFIG: {
    MIN_QUERY_LENGTH: 10,
    MAX_RESULTS_TO_SHOW: 3,
    MIN_SIMILARITY_THRESHOLD: 0.65,
    MAX_SNIPPET_LENGTH: 500,
    SEARCH_TOP_K: 10,
    TRUNCATION_WORD_BOUNDARY_RATIO: 0.7,
    MAX_EXTRACTED_TITLE_LENGTH: 100,
  },
  isQuestionLike: jest.fn((text: string) => {
    const patterns = [
      /^(how|what|why|when|where|who|which|can|does|is|are|should|would|could)\s/i,
      /\?$/,
      /^(explain|describe|show|tell|help|find)\s/i,
    ];
    return patterns.some((pattern) => pattern.test(text.trim()));
  }),
  QA_MESSAGES: {
    NO_RESULTS: "I couldn't find any relevant information in our knowledge base for that question.",
    QUERY_TOO_SHORT: "Please provide a more detailed question (at least 10 characters).",
    SEARCHING: "Searching our knowledge base...",
    SEARCH_ERROR: "Sorry, I encountered an error while searching. Please try again.",
  },
}));

describe("Q&A Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("shouldTriggerQA", () => {
    it("should return true for questions starting with 'how'", () => {
      expect(shouldTriggerQA("how do I restart the service?")).toBe(true);
    });

    it("should return true for questions starting with 'what'", () => {
      expect(shouldTriggerQA("what caused the outage last week?")).toBe(true);
    });

    it("should return true for questions starting with 'why'", () => {
      expect(shouldTriggerQA("why is the build failing?")).toBe(true);
    });

    it("should return true for questions starting with 'when'", () => {
      expect(shouldTriggerQA("when should I run migrations?")).toBe(true);
    });

    it("should return true for questions starting with 'where'", () => {
      expect(shouldTriggerQA("where are the config files?")).toBe(true);
    });

    it("should return true for questions starting with 'who'", () => {
      expect(shouldTriggerQA("who owns the payment service?")).toBe(true);
    });

    it("should return true for questions starting with 'which'", () => {
      expect(shouldTriggerQA("which database should I use?")).toBe(true);
    });

    it("should return true for questions ending with '?'", () => {
      expect(shouldTriggerQA("restart the caching service?")).toBe(true);
    });

    it("should return true for questions starting with 'can'", () => {
      expect(shouldTriggerQA("can you explain the deploy process?")).toBe(true);
    });

    it("should return true for questions starting with 'does'", () => {
      expect(shouldTriggerQA("does the API support pagination?")).toBe(true);
    });

    it("should return true for questions starting with 'is'", () => {
      expect(shouldTriggerQA("is the staging server running?")).toBe(true);
    });

    it("should return true for questions starting with 'are'", () => {
      expect(shouldTriggerQA("are there any rate limits?")).toBe(true);
    });

    it("should return true for questions starting with 'explain'", () => {
      expect(shouldTriggerQA("explain the authentication flow")).toBe(true);
    });

    it("should return true for questions starting with 'describe'", () => {
      expect(shouldTriggerQA("describe the database schema")).toBe(true);
    });

    it("should return true for questions starting with 'show'", () => {
      expect(shouldTriggerQA("show me how to deploy")).toBe(true);
    });

    it("should return true for questions starting with 'help'", () => {
      expect(shouldTriggerQA("help with the build process")).toBe(true);
    });

    it("should return true for questions starting with 'find'", () => {
      expect(shouldTriggerQA("find the error in logs")).toBe(true);
    });

    it("should return false for queries shorter than minimum length", () => {
      expect(shouldTriggerQA("how?")).toBe(false);
    });

    it("should return false for non-question statements", () => {
      expect(shouldTriggerQA("this is just a statement about builds")).toBe(false);
    });

    it("should handle queries with leading whitespace", () => {
      expect(shouldTriggerQA("   how do I restart the service?")).toBe(true);
    });

    it("should handle queries with trailing whitespace", () => {
      expect(shouldTriggerQA("how do I restart the service?   ")).toBe(true);
    });

    it("should handle empty query", () => {
      expect(shouldTriggerQA("")).toBe(false);
    });

    it("should handle whitespace-only query", () => {
      expect(shouldTriggerQA("     ")).toBe(false);
    });

    it("should be case-insensitive for question words", () => {
      expect(shouldTriggerQA("HOW DO I RESTART THE SERVICE?")).toBe(true);
      expect(shouldTriggerQA("What is the deploy process?")).toBe(true);
    });

    it("should return false for queries at exactly minimum length without question pattern", () => {
      expect(shouldTriggerQA("abcdefghij")).toBe(false); // 10 chars, no pattern
    });

    it("should handle unicode characters in query", () => {
      expect(shouldTriggerQA("how do I handle 日本語 data?")).toBe(true);
    });

    it("should handle special characters in query", () => {
      expect(shouldTriggerQA("how do I fix the @#$% error?")).toBe(true);
    });
  });

  describe("performQASearch", () => {
    it("should return query too short error for short queries", async () => {
      const result = await performQASearch("short");

      expect(result.success).toBe(false);
      expect(result.error).toContain("10 characters");
      expect(result.results).toHaveLength(0);
    });

    it("should call searchAll with correct parameters", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { searchAll } = jest.requireMock("@kenchi/shared") as any;
      searchAll.mockResolvedValueOnce({
        knowledgeDocs: [],
        diffChunks: [],
        cacheHit: false,
      });

      await performQASearch("how do I restart the service?", "tenant-123", "owner/repo");

      expect(searchAll).toHaveBeenCalledWith({
        queryText: "how do I restart the service?",
        tenantId: "tenant-123",
        repository: "owner/repo",
        topK: 10,
        enableReranking: true,
      });
    });

    it("should return success with empty results when no matches found", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { searchAll } = jest.requireMock("@kenchi/shared") as any;
      searchAll.mockResolvedValueOnce({
        knowledgeDocs: [],
        diffChunks: [],
        cacheHit: false,
      });

      const result = await performQASearch("how do I restart the service?");

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
      expect(result.totalFound).toBe(0);
      expect(result.error).toBeUndefined();
    });

    it("should return formatted knowledge doc results", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { searchAll } = jest.requireMock("@kenchi/shared") as any;
      searchAll.mockResolvedValueOnce({
        knowledgeDocs: [
          {
            item: {
              id: "doc-1",
              title: "Service Restart Guide",
              content: "Step 1: Stop the service\nStep 2: Start the service",
              docType: "runbook",
              sourceUrl: "https://docs.example.com/restart",
            },
            similarity: 0.85,
          },
        ],
        diffChunks: [],
        cacheHit: false,
      });

      const result = await performQASearch("how do I restart the service?");

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toEqual(
        expect.objectContaining({
          id: "doc-1",
          title: "Service Restart Guide",
          docType: "runbook",
          sourceType: "knowledge",
          similarity: 0.85,
          sourceUrl: "https://docs.example.com/restart",
        })
      );
    });

    it("should return formatted diff chunk results", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { searchAll } = jest.requireMock("@kenchi/shared") as any;
      searchAll.mockResolvedValueOnce({
        knowledgeDocs: [],
        diffChunks: [
          {
            item: {
              id: "diff-1",
              prNumber: 123,
              filePath: "src/services/cache.ts",
              content: "Fixed cache restart logic",
              repository: "owner/repo",
            },
            similarity: 0.75,
          },
        ],
        cacheHit: false,
      });

      const result = await performQASearch("how do I restart the cache?");

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toEqual(
        expect.objectContaining({
          id: "diff-1",
          title: "PR #123: src/services/cache.ts",
          docType: "pr_diff",
          sourceType: "diff",
          similarity: 0.75,
          sourceUrl: "https://github.com/owner/repo/pull/123",
        })
      );
    });

    it("should combine and sort results by similarity", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { searchAll } = jest.requireMock("@kenchi/shared") as any;
      searchAll.mockResolvedValueOnce({
        knowledgeDocs: [
          {
            item: {
              id: "doc-1",
              title: "Low similarity doc",
              content: "Content",
              docType: "runbook",
            },
            similarity: 0.7,
          },
          {
            item: {
              id: "doc-2",
              title: "High similarity doc",
              content: "Content",
              docType: "runbook",
            },
            similarity: 0.95,
          },
        ],
        diffChunks: [
          {
            item: {
              id: "diff-1",
              prNumber: 1,
              filePath: "file.ts",
              content: "Content",
              repository: "owner/repo",
            },
            similarity: 0.8,
          },
        ],
        cacheHit: false,
      });

      const result = await performQASearch("how do I fix the issue?");

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3);
      // Should be sorted by similarity descending
      expect(result.results[0].similarity).toBe(0.95);
      expect(result.results[1].similarity).toBe(0.8);
      expect(result.results[2].similarity).toBe(0.7);
    });

    it("should filter out results below similarity threshold", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { searchAll } = jest.requireMock("@kenchi/shared") as any;
      searchAll.mockResolvedValueOnce({
        knowledgeDocs: [
          {
            item: {
              id: "doc-1",
              title: "Above threshold",
              content: "Content",
              docType: "runbook",
            },
            similarity: 0.85,
          },
          {
            item: {
              id: "doc-2",
              title: "Below threshold",
              content: "Content",
              docType: "runbook",
            },
            similarity: 0.5, // Below 0.65 threshold
          },
        ],
        diffChunks: [],
        cacheHit: false,
      });

      const result = await performQASearch("what is the process?");

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].id).toBe("doc-1");
    });

    it("should limit results to max configured amount", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { searchAll } = jest.requireMock("@kenchi/shared") as any;
      searchAll.mockResolvedValueOnce({
        knowledgeDocs: Array.from({ length: 10 }, (_, index) => ({
          item: {
            id: `doc-${index}`,
            title: `Document ${index}`,
            content: "Content",
            docType: "runbook",
          },
          similarity: 0.9 - index * 0.01,
        })),
        diffChunks: [],
        cacheHit: false,
      });

      const result = await performQASearch("how do I configure everything?");

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3); // MAX_RESULTS_TO_SHOW
    });

    it("should include cacheHit status in response", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { searchAll } = jest.requireMock("@kenchi/shared") as any;
      searchAll.mockResolvedValueOnce({
        knowledgeDocs: [],
        diffChunks: [],
        cacheHit: true,
      });

      const result = await performQASearch("how do I debug the cache?");

      expect(result.cacheHit).toBe(true);
    });

    it("should handle search errors gracefully", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { searchAll } = jest.requireMock("@kenchi/shared") as any;
      searchAll.mockRejectedValueOnce(new Error("Database connection failed"));

      const result = await performQASearch("how do I fix the database?");

      expect(result.success).toBe(false);
      expect(result.error).toContain("error");
      expect(result.results).toHaveLength(0);
    });

    it("should extract title from first line when no title provided", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { searchAll } = jest.requireMock("@kenchi/shared") as any;
      searchAll.mockResolvedValueOnce({
        knowledgeDocs: [
          {
            item: {
              id: "doc-1",
              title: undefined,
              content: "# Important Guide\nThis is the content...",
              docType: "runbook",
            },
            similarity: 0.85,
          },
        ],
        diffChunks: [],
        cacheHit: false,
      });

      const result = await performQASearch("how do I follow the guide?");

      expect(result.results[0].title).toBe("Important Guide");
    });

    it("should use doc type as fallback title", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { searchAll } = jest.requireMock("@kenchi/shared") as any;
      searchAll.mockResolvedValueOnce({
        knowledgeDocs: [
          {
            item: {
              id: "doc-1",
              title: undefined,
              content: "", // Empty content
              docType: "postmortem",
            },
            similarity: 0.85,
          },
        ],
        diffChunks: [],
        cacheHit: false,
      });

      const result = await performQASearch("what was the incident?");

      expect(result.results[0].title).toBe("postmortem document");
    });

    it("should build GitHub URL from repository and filePath", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { searchAll } = jest.requireMock("@kenchi/shared") as any;
      searchAll.mockResolvedValueOnce({
        knowledgeDocs: [
          {
            item: {
              id: "doc-1",
              title: "Test Doc",
              content: "Content",
              docType: "runbook",
              sourceUrl: undefined,
              repository: "owner/repo",
              filePath: "docs/readme.md",
            },
            similarity: 0.85,
          },
        ],
        diffChunks: [],
        cacheHit: false,
      });

      const result = await performQASearch("how do I use the readme?");

      expect(result.results[0].sourceUrl).toBe(
        "https://github.com/owner/repo/blob/main/docs/readme.md"
      );
    });

    it("should truncate long snippets", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { searchAll } = jest.requireMock("@kenchi/shared") as any;
      const longContent = "This is a ".repeat(100); // Long content
      searchAll.mockResolvedValueOnce({
        knowledgeDocs: [
          {
            item: {
              id: "doc-1",
              title: "Long Doc",
              content: longContent,
              docType: "runbook",
            },
            similarity: 0.85,
          },
        ],
        diffChunks: [],
        cacheHit: false,
      });

      const result = await performQASearch("how do I handle long content?");

      expect(result.results[0].snippet.length).toBeLessThanOrEqual(503); // 500 + "..."
      expect(result.results[0].snippet.endsWith("...")).toBe(true);
    });

    it("should trim query before processing", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { searchAll } = jest.requireMock("@kenchi/shared") as any;
      searchAll.mockResolvedValueOnce({
        knowledgeDocs: [],
        diffChunks: [],
        cacheHit: false,
      });

      const result = await performQASearch("   how do I restart?   ");

      expect(result.query).toBe("how do I restart?");
    });

    it("should return totalFound count from all sources", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { searchAll } = jest.requireMock("@kenchi/shared") as any;
      searchAll.mockResolvedValueOnce({
        knowledgeDocs: Array.from({ length: 5 }, (_, index) => ({
          item: {
            id: `doc-${index}`,
            title: `Doc ${index}`,
            content: "Content",
            docType: "runbook",
          },
          similarity: 0.7,
        })),
        diffChunks: Array.from({ length: 3 }, (_, index) => ({
          item: {
            id: `diff-${index}`,
            prNumber: index,
            filePath: "file.ts",
            content: "Content",
            repository: "owner/repo",
          },
          similarity: 0.7,
        })),
        cacheHit: false,
      });

      const result = await performQASearch("how do I find all documents?");

      expect(result.totalFound).toBe(8); // 5 + 3
    });

    it("should handle diff chunks without repository", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { searchAll } = jest.requireMock("@kenchi/shared") as any;
      searchAll.mockResolvedValueOnce({
        knowledgeDocs: [],
        diffChunks: [
          {
            item: {
              id: "diff-1",
              prNumber: 123,
              filePath: "src/file.ts",
              content: "Content",
              repository: undefined,
            },
            similarity: 0.85,
          },
        ],
        cacheHit: false,
      });

      const result = await performQASearch("how do I handle this case?");

      expect(result.results[0].sourceUrl).toBeUndefined();
    });
  });

  describe("generateQueryId", () => {
    it("should generate ID with user prefix", () => {
      const queryId = generateQueryId("how do I restart?", "U123456");

      expect(queryId).toContain("U123456");
    });

    it("should generate ID with qa prefix", () => {
      const queryId = generateQueryId("how do I restart?", "U123456");

      expect(queryId.startsWith("qa_")).toBe(true);
    });

    it("should include timestamp in ID", () => {
      const before = Date.now();
      const queryId = generateQueryId("how do I restart?", "U123456");
      const after = Date.now();

      // Extract timestamp from ID
      const parts = queryId.split("_");
      const timestamp = parseInt(parts[2], 10);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it("should include query hash in ID", () => {
      const queryId = generateQueryId("how do I restart?", "U123456");

      expect(queryId).toContain("how_do_I_restart");
    });

    it("should truncate long queries in ID", () => {
      const longQuery = "how do I restart the service after a failure in production environment?";
      const queryId = generateQueryId(longQuery, "U123456");

      // Query hash should only contain first 20 chars
      expect(queryId).toContain("how_do_I_restart_the");
      expect(queryId).not.toContain("production");
    });

    it("should replace spaces with underscores", () => {
      const queryId = generateQueryId("how do I restart?", "U123456");

      // Should not contain spaces in the hash portion
      const hashPart = queryId.split("_").slice(3).join("_");
      expect(hashPart).not.toContain(" ");
    });

    it("should generate unique IDs for different timestamps", async () => {
      const queryId1 = generateQueryId("how do I restart?", "U123456");
      await new Promise((resolve) => setTimeout(resolve, 5));
      const queryId2 = generateQueryId("how do I restart?", "U123456");

      expect(queryId1).not.toBe(queryId2);
    });

    it("should generate different IDs for different users", () => {
      const queryId1 = generateQueryId("how do I restart?", "U111111");
      const queryId2 = generateQueryId("how do I restart?", "U222222");

      expect(queryId1).not.toBe(queryId2);
    });

    it("should handle empty query", () => {
      const queryId = generateQueryId("", "U123456");

      expect(queryId).toContain("qa_");
      expect(queryId).toContain("U123456");
    });

    it("should handle special characters in query", () => {
      const queryId = generateQueryId("how do I fix @#$%?", "U123456");

      expect(queryId.startsWith("qa_")).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle concurrent searches", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { searchAll } = jest.requireMock("@kenchi/shared") as any;
      searchAll.mockResolvedValue({
        knowledgeDocs: [],
        diffChunks: [],
        cacheHit: false,
      });

      const results = await Promise.all([
        performQASearch("how do I restart service A?"),
        performQASearch("how do I restart service B?"),
        performQASearch("how do I restart service C?"),
      ]);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });
    });

    it("should handle very long query text", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { searchAll } = jest.requireMock("@kenchi/shared") as any;
      searchAll.mockResolvedValueOnce({
        knowledgeDocs: [],
        diffChunks: [],
        cacheHit: false,
      });

      const longQuery = "how do I " + "a".repeat(2000);
      const result = await performQASearch(longQuery);

      expect(result.success).toBe(true);
    });

    it("should handle unicode in search results", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { searchAll } = jest.requireMock("@kenchi/shared") as any;
      searchAll.mockResolvedValueOnce({
        knowledgeDocs: [
          {
            item: {
              id: "doc-1",
              title: "日本語ドキュメント",
              content: "これはテストです。🎉",
              docType: "runbook",
            },
            similarity: 0.85,
          },
        ],
        diffChunks: [],
        cacheHit: false,
      });

      const result = await performQASearch("how do I handle unicode?");

      expect(result.success).toBe(true);
      expect(result.results[0].title).toBe("日本語ドキュメント");
    });

    it("should handle results at exact similarity threshold", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { searchAll } = jest.requireMock("@kenchi/shared") as any;
      searchAll.mockResolvedValueOnce({
        knowledgeDocs: [
          {
            item: {
              id: "doc-1",
              title: "Threshold Doc",
              content: "Content",
              docType: "runbook",
            },
            similarity: 0.65, // Exactly at threshold
          },
        ],
        diffChunks: [],
        cacheHit: false,
      });

      const result = await performQASearch("is this at threshold?");

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
    });

    it("should handle results just below similarity threshold", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { searchAll } = jest.requireMock("@kenchi/shared") as any;
      searchAll.mockResolvedValueOnce({
        knowledgeDocs: [
          {
            item: {
              id: "doc-1",
              title: "Below Threshold Doc",
              content: "Content",
              docType: "runbook",
            },
            similarity: 0.64999, // Just below threshold
          },
        ],
        diffChunks: [],
        cacheHit: false,
      });

      const result = await performQASearch("is this below threshold?");

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
    });

    it("should handle query at exact minimum length", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { searchAll } = jest.requireMock("@kenchi/shared") as any;
      searchAll.mockResolvedValueOnce({
        knowledgeDocs: [],
        diffChunks: [],
        cacheHit: false,
      });

      // Exactly 10 characters
      const result = await performQASearch("how is it?");

      expect(result.success).toBe(true);
    });

    it("should handle query just below minimum length", async () => {
      // 9 characters
      const result = await performQASearch("how is i?");

      expect(result.success).toBe(false);
      expect(result.error).toContain("10 characters");
    });
  });
});

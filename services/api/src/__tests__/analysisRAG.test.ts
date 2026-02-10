/**
 * Unit tests for Analysis RAG Integration
 *
 * Tests RAG knowledge retrieval, error summary extraction,
 * document type mapping, and graceful degradation.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// ==================== Mock Setup ====================

const mockSearchFromEventContext = jest.fn();

jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual("@kenchi/shared") as Record<string, unknown>;
  return {
    ...actual,
    searchFromEventContext: (...args: unknown[]) => mockSearchFromEventContext(...args),
    createLogger: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
  };
});

// Import after mock setup
import { retrieveRelevantKnowledge } from "../services/analysisRAG.js";
import type { RequestContext } from "@kenchi/shared";

// ==================== Test Helpers ====================

const testContext: RequestContext = {
  requestId: "test-req-123",
  tenantId: "test-tenant",
};

const createMockRAGResult = (overrides: Record<string, unknown> = {}) => ({
  diffChunks: [],
  knowledgeDocs: [],
  queryTokens: 10,
  cacheHit: false,
  ...overrides,
});

const createMockKnowledgeDocResult = (overrides: Record<string, unknown> = {}) => ({
  item: {
    id: "doc_123",
    docType: "runbook",
    title: "Debugging CI Failures",
    content: "Step 1: Check the logs. Step 2: Review recent changes.",
    sourceUrl: "https://docs.example.com/runbook",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-06-01T00:00:00Z"),
    metadata: { tags: ["ci", "debugging"] },
    ...((overrides.item ?? {}) as Record<string, unknown>),
  },
  similarity: 0.92,
  ...(overrides.similarity === undefined ? {} : { similarity: overrides.similarity }),
});

// ==================== Tests ====================

describe("Analysis RAG Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== retrieveRelevantKnowledge ====================

  describe("retrieveRelevantKnowledge", () => {
    it("should successfully retrieve and map knowledge documents", async () => {
      const ragResult = createMockRAGResult({
        knowledgeDocs: [createMockKnowledgeDocResult()],
      });
      mockSearchFromEventContext.mockResolvedValue(ragResult);

      const result = await retrieveRelevantKnowledge(
        "test-repo",
        "Error: Build failed",
        "tenant-1",
        testContext
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("doc_123");
      expect(result[0].type).toBe("runbook");
      expect(result[0].title).toBe("Debugging CI Failures");
      expect(result[0].similarity).toBe(0.92);
      expect(result[0].url).toBe("https://docs.example.com/runbook");
    });

    it("should call searchFromEventContext with correct query context", async () => {
      mockSearchFromEventContext.mockResolvedValue(createMockRAGResult());

      await retrieveRelevantKnowledge(
        "my-org/my-repo",
        "Error: test failed",
        "tenant-1",
        testContext
      );

      expect(mockSearchFromEventContext).toHaveBeenCalledWith(
        {
          eventType: "ci_failure",
          repository: "my-org/my-repo",
          errorMessage: expect.any(String),
        },
        "tenant-1",
        testContext
      );
    });

    it("should truncate error summary to 500 characters for RAG query", async () => {
      const longLog = "A".repeat(1000);
      mockSearchFromEventContext.mockResolvedValue(createMockRAGResult());

      await retrieveRelevantKnowledge("test-repo", longLog, undefined, testContext);

      const callArgs = mockSearchFromEventContext.mock.calls[0] as unknown[];
      const queryContext = callArgs[0] as { errorMessage: string };
      expect(queryContext.errorMessage).toHaveLength(500);
    });

    it("should not truncate error summary when under 500 characters", async () => {
      const shortLog = "Error: Build failed with exit code 1";
      mockSearchFromEventContext.mockResolvedValue(createMockRAGResult());

      await retrieveRelevantKnowledge("test-repo", shortLog, undefined, testContext);

      const callArgs = mockSearchFromEventContext.mock.calls[0] as unknown[];
      const queryContext = callArgs[0] as { errorMessage: string };
      expect(queryContext.errorMessage).toBe(shortLog);
    });

    it("should return empty array when search fails (graceful degradation)", async () => {
      mockSearchFromEventContext.mockRejectedValue(new Error("Connection timeout"));

      const result = await retrieveRelevantKnowledge(
        "test-repo",
        "Error: Build failed",
        undefined,
        testContext
      );

      expect(result).toEqual([]);
    });

    it("should return empty array when no documents found", async () => {
      mockSearchFromEventContext.mockResolvedValue(createMockRAGResult());

      const result = await retrieveRelevantKnowledge(
        "test-repo",
        "Error: Build failed",
        undefined,
        testContext
      );

      expect(result).toEqual([]);
    });

    it("should map runbook doc type correctly", async () => {
      const ragResult = createMockRAGResult({
        knowledgeDocs: [createMockKnowledgeDocResult({ item: { docType: "runbook" } })],
      });
      mockSearchFromEventContext.mockResolvedValue(ragResult);

      const result = await retrieveRelevantKnowledge("test-repo", "error", undefined, testContext);

      expect(result[0].type).toBe("runbook");
    });

    it("should map postmortem doc type to past_incident", async () => {
      const ragResult = createMockRAGResult({
        knowledgeDocs: [createMockKnowledgeDocResult({ item: { docType: "postmortem" } })],
      });
      mockSearchFromEventContext.mockResolvedValue(ragResult);

      const result = await retrieveRelevantKnowledge("test-repo", "error", undefined, testContext);

      expect(result[0].type).toBe("past_incident");
    });

    it("should map known_issues doc type to past_incident", async () => {
      const ragResult = createMockRAGResult({
        knowledgeDocs: [createMockKnowledgeDocResult({ item: { docType: "known_issues" } })],
      });
      mockSearchFromEventContext.mockResolvedValue(ragResult);

      const result = await retrieveRelevantKnowledge("test-repo", "error", undefined, testContext);

      expect(result[0].type).toBe("past_incident");
    });

    it("should map documentation doc type correctly", async () => {
      const ragResult = createMockRAGResult({
        knowledgeDocs: [createMockKnowledgeDocResult({ item: { docType: "documentation" } })],
      });
      mockSearchFromEventContext.mockResolvedValue(ragResult);

      const result = await retrieveRelevantKnowledge("test-repo", "error", undefined, testContext);

      expect(result[0].type).toBe("documentation");
    });

    it("should default unknown doc types to documentation", async () => {
      const ragResult = createMockRAGResult({
        knowledgeDocs: [createMockKnowledgeDocResult({ item: { docType: "unknown_type" } })],
      });
      mockSearchFromEventContext.mockResolvedValue(ragResult);

      const result = await retrieveRelevantKnowledge("test-repo", "error", undefined, testContext);

      expect(result[0].type).toBe("documentation");
    });

    it("should truncate long excerpts to 200 characters with ellipsis", async () => {
      const longContent = "A".repeat(300);
      const ragResult = createMockRAGResult({
        knowledgeDocs: [createMockKnowledgeDocResult({ item: { content: longContent } })],
      });
      mockSearchFromEventContext.mockResolvedValue(ragResult);

      const result = await retrieveRelevantKnowledge("test-repo", "error", undefined, testContext);

      expect(result[0].excerpt).toHaveLength(203); // 200 + "..."
      expect(result[0].excerpt!.endsWith("...")).toBe(true);
    });

    it("should not add ellipsis for short excerpts", async () => {
      const shortContent = "Short content";
      const ragResult = createMockRAGResult({
        knowledgeDocs: [createMockKnowledgeDocResult({ item: { content: shortContent } })],
      });
      mockSearchFromEventContext.mockResolvedValue(ragResult);

      const result = await retrieveRelevantKnowledge("test-repo", "error", undefined, testContext);

      expect(result[0].excerpt).toBe("Short content");
    });

    it("should extract tags from metadata when present", async () => {
      const ragResult = createMockRAGResult({
        knowledgeDocs: [
          createMockKnowledgeDocResult({
            item: { metadata: { tags: ["ci", "debugging", "deploy"] } },
          }),
        ],
      });
      mockSearchFromEventContext.mockResolvedValue(ragResult);

      const result = await retrieveRelevantKnowledge("test-repo", "error", undefined, testContext);

      expect(result[0].metadata?.tags).toEqual(["ci", "debugging", "deploy"]);
    });

    it("should return empty tags when metadata is null", async () => {
      const ragResult = createMockRAGResult({
        knowledgeDocs: [createMockKnowledgeDocResult({ item: { metadata: null } })],
      });
      mockSearchFromEventContext.mockResolvedValue(ragResult);

      const result = await retrieveRelevantKnowledge("test-repo", "error", undefined, testContext);

      expect(result[0].metadata?.tags).toEqual([]);
    });

    it("should return empty tags when tags are not string array", async () => {
      const ragResult = createMockRAGResult({
        knowledgeDocs: [createMockKnowledgeDocResult({ item: { metadata: { tags: [1, 2, 3] } } })],
      });
      mockSearchFromEventContext.mockResolvedValue(ragResult);

      const result = await retrieveRelevantKnowledge("test-repo", "error", undefined, testContext);

      expect(result[0].metadata?.tags).toEqual([]);
    });

    it("should handle sourceUrl being null", async () => {
      const ragResult = createMockRAGResult({
        knowledgeDocs: [createMockKnowledgeDocResult({ item: { sourceUrl: null } })],
      });
      mockSearchFromEventContext.mockResolvedValue(ragResult);

      const result = await retrieveRelevantKnowledge("test-repo", "error", undefined, testContext);

      expect(result[0].url).toBeUndefined();
    });

    it("should include ISO timestamps in metadata", async () => {
      const createdAt = new Date("2024-01-15T10:00:00Z");
      const updatedAt = new Date("2024-06-15T12:00:00Z");
      const ragResult = createMockRAGResult({
        knowledgeDocs: [createMockKnowledgeDocResult({ item: { createdAt, updatedAt } })],
      });
      mockSearchFromEventContext.mockResolvedValue(ragResult);

      const result = await retrieveRelevantKnowledge("test-repo", "error", undefined, testContext);

      expect(result[0].metadata?.createdAt).toBe("2024-01-15T10:00:00.000Z");
      expect(result[0].metadata?.updatedAt).toBe("2024-06-15T12:00:00.000Z");
    });

    it("should handle multiple knowledge documents", async () => {
      const ragResult = createMockRAGResult({
        knowledgeDocs: [
          createMockKnowledgeDocResult({ item: { id: "doc_1", title: "Doc 1" } }),
          createMockKnowledgeDocResult({ item: { id: "doc_2", title: "Doc 2" } }),
          createMockKnowledgeDocResult({ item: { id: "doc_3", title: "Doc 3" } }),
        ],
      });
      mockSearchFromEventContext.mockResolvedValue(ragResult);

      const result = await retrieveRelevantKnowledge("test-repo", "error", undefined, testContext);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe("doc_1");
      expect(result[1].id).toBe("doc_2");
      expect(result[2].id).toBe("doc_3");
    });

    it("should pass tenantId to searchFromEventContext", async () => {
      mockSearchFromEventContext.mockResolvedValue(createMockRAGResult());

      await retrieveRelevantKnowledge("test-repo", "error", "my-tenant", testContext);

      expect(mockSearchFromEventContext).toHaveBeenCalledWith(
        expect.any(Object),
        "my-tenant",
        testContext
      );
    });

    it("should pass undefined tenantId when not provided", async () => {
      mockSearchFromEventContext.mockResolvedValue(createMockRAGResult());

      await retrieveRelevantKnowledge("test-repo", "error", undefined, testContext);

      expect(mockSearchFromEventContext).toHaveBeenCalledWith(
        expect.any(Object),
        undefined,
        testContext
      );
    });

    it("should trim whitespace from failure log before extracting summary", async () => {
      mockSearchFromEventContext.mockResolvedValue(createMockRAGResult());

      await retrieveRelevantKnowledge(
        "test-repo",
        "  Error: Build failed  \n",
        undefined,
        testContext
      );

      const callArgs = mockSearchFromEventContext.mock.calls[0] as unknown[];
      const queryContext = callArgs[0] as { errorMessage: string };
      expect(queryContext.errorMessage).toBe("Error: Build failed");
    });
  });
});

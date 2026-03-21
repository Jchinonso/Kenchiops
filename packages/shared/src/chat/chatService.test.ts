/**
 * Tests for chat/chatService — core business logic for the Copilot Drawer.
 *
 * Mocks all port dependencies (ChatRepositoryPort, ChatLLMPort, ChatContextPort).
 * Tests orchestration flow, fail-safe context fetching, and delegation methods.
 *
 * @module chat/chatService.test
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type {
  ChatRepositoryPort,
  ChatContextPort,
  ChatLLMPort,
  ChatCompletionInput,
  ChatStreamChunk,
  ChatContextData,
  ChatLLMStreamDelta,
} from "./types.js";
import type { RequestContext } from "../core/types.js";

// ==================== Mocks ====================

// Mock createLogger to suppress log output
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock("../core/logger.js", () => ({
  createLogger: () => mockLogger,
}));

jest.mock("../core/config.js", () => ({
  config: {
    LLM_MODEL: "test-model",
    OPENAI_MODEL: "",
    LLM_PROVIDER: "openai",
  },
}));

jest.mock("../llm/providers/llmProvider/clientFactory.js", () => ({
  isOpenRouterProvider: () => false,
}));

// Now import the module under test (after mocks are set up)
import { createChatService } from "./chatService.js";

// ==================== Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-req-id",
  tenantId: "test-tenant",
};

const createInput = (overrides: Partial<ChatCompletionInput> = {}): ChatCompletionInput => ({
  userMessage: "Why did my build fail?",
  pageContext: { pageType: "analysis", entityId: "analysis-123" },
  tenantId: "test-tenant",
  userId: "user-1",
  ...overrides,
});

const createMockRepository = (): {
  [K in keyof ChatRepositoryPort]: jest.Mock;
} => ({
  createConversation: jest.fn<ChatRepositoryPort["createConversation"]>(),
  createMessage: jest.fn<ChatRepositoryPort["createMessage"]>(),
  getMessagesByConversation: jest.fn<ChatRepositoryPort["getMessagesByConversation"]>(),
  findConversationsByUser: jest.fn<ChatRepositoryPort["findConversationsByUser"]>(),
  findConversationById: jest.fn<ChatRepositoryPort["findConversationById"]>(),
  deleteConversation: jest.fn<ChatRepositoryPort["deleteConversation"]>(),
  updateConversationTitle: jest.fn<ChatRepositoryPort["updateConversationTitle"]>(),
  getConversationTokenCount: jest.fn<ChatRepositoryPort["getConversationTokenCount"]>(),
  deleteOldestMessages: jest.fn<ChatRepositoryPort["deleteOldestMessages"]>(),
});

const createMockLLMPort = (): { [K in keyof ChatLLMPort]: jest.Mock } => ({
  createStreamingCompletion: jest.fn(),
});

const createMockContextPort = (): {
  [K in keyof ChatContextPort]: jest.Mock;
} => ({
  getAnalysisContext: jest.fn<ChatContextPort["getAnalysisContext"]>(),
  getIncidentContext: jest.fn<ChatContextPort["getIncidentContext"]>(),
  searchRAG: jest.fn<ChatContextPort["searchRAG"]>(),
});

/** Helper: collect all chunks from an async generator. */
const collectChunks = async (
  gen: AsyncGenerator<ChatStreamChunk>
): Promise<readonly ChatStreamChunk[]> => {
  const chunks: ChatStreamChunk[] = [];
  for await (const chunk of gen) {
    chunks.push(chunk);
  }
  return chunks;
};

/** Helper: create an async generator from an array of deltas. */
async function* toAsyncIterable(
  items: readonly ChatLLMStreamDelta[]
): AsyncGenerator<ChatLLMStreamDelta> {
  for (const item of items) {
    yield item;
  }
}

// ==================== streamCompletion ====================

describe("createChatService", () => {
  // let: reassigned in beforeEach
  let mockRepo: ReturnType<typeof createMockRepository>; // let: reset per test
  let mockLLM: ReturnType<typeof createMockLLMPort>; // let: reset per test
  let mockCtx: ReturnType<typeof createMockContextPort>; // let: reset per test

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo = createMockRepository();
    mockLLM = createMockLLMPort();
    mockCtx = createMockContextPort();

    // Default happy-path stubs
    mockRepo.createConversation.mockResolvedValue({ id: "conv-new" });
    mockRepo.createMessage.mockResolvedValue({ id: "msg-1" });
    mockRepo.getMessagesByConversation.mockResolvedValue([]);
    mockRepo.getConversationTokenCount.mockResolvedValue(100);

    mockLLM.createStreamingCompletion.mockReturnValue(
      toAsyncIterable([
        { content: "Hello", finishReason: null },
        { content: " world", finishReason: "stop" },
      ])
    );

    mockCtx.getAnalysisContext.mockResolvedValue(null);
    mockCtx.getIncidentContext.mockResolvedValue(null);
    mockCtx.searchRAG.mockResolvedValue({
      formattedContext: "",
      sources: [],
    });
  });

  describe("streamCompletion", () => {
    it("should create conversation when no conversationId provided", async () => {
      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      const chunks = await collectChunks(service.streamCompletion(createInput(), testContext));

      expect(mockRepo.createConversation).toHaveBeenCalledTimes(1);
      const createdChunk = chunks.find((c) => c.type === "conversation_created");
      expect(createdChunk).toBeDefined();
      expect(createdChunk?.type === "conversation_created" && createdChunk.conversationId).toBe(
        "conv-new"
      );
    });

    it("should not create conversation when conversationId is provided", async () => {
      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      const input = createInput({ conversationId: "existing-conv" });
      const chunks = await collectChunks(service.streamCompletion(input, testContext));

      expect(mockRepo.createConversation).not.toHaveBeenCalled();
      expect(chunks.find((c) => c.type === "conversation_created")).toBeUndefined();
    });

    it("should save user message with estimated token count", async () => {
      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      await collectChunks(service.streamCompletion(createInput(), testContext));

      // First createMessage call is the user message
      expect(mockRepo.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "conv-new",
          role: "user",
          content: "Why did my build fail?",
          tokenCount: expect.any(Number),
        }),
        testContext
      );
    });

    it("should fetch page context and RAG in parallel", async () => {
      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      await collectChunks(service.streamCompletion(createInput(), testContext));

      // Both should be called
      expect(mockCtx.getAnalysisContext).toHaveBeenCalledWith(
        "analysis-123",
        "test-tenant",
        testContext
      );
      expect(mockCtx.searchRAG).toHaveBeenCalled();
    });

    it("should yield rag_sources chunk when RAG returns results", async () => {
      const ragSources = [{ title: "Fix guide", docType: "runbook", similarity: 0.9 }];
      mockCtx.searchRAG.mockResolvedValue({
        formattedContext: "## Context\nSome text",
        sources: ragSources,
      });

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      const chunks = await collectChunks(service.streamCompletion(createInput(), testContext));

      const ragChunk = chunks.find((c) => c.type === "rag_sources");
      expect(ragChunk).toBeDefined();
      expect(ragChunk?.type === "rag_sources" && ragChunk.sources).toEqual(ragSources);
    });

    it("should not yield rag_sources chunk when RAG returns empty sources", async () => {
      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      const chunks = await collectChunks(service.streamCompletion(createInput(), testContext));

      expect(chunks.find((c) => c.type === "rag_sources")).toBeUndefined();
    });

    it("should yield token chunks from LLM stream", async () => {
      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      const chunks = await collectChunks(service.streamCompletion(createInput(), testContext));

      const tokenChunks = chunks.filter((c) => c.type === "token");
      expect(tokenChunks).toHaveLength(2);
      expect(tokenChunks[0]).toEqual({
        type: "token",
        content: "Hello",
      });
      expect(tokenChunks[1]).toEqual({
        type: "token",
        content: " world",
      });
    });

    it("should skip token chunks with null content", async () => {
      mockLLM.createStreamingCompletion.mockReturnValue(
        toAsyncIterable([
          { content: null, finishReason: null },
          { content: "data", finishReason: "stop" },
        ])
      );

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      const chunks = await collectChunks(service.streamCompletion(createInput(), testContext));

      const tokenChunks = chunks.filter((c) => c.type === "token");
      expect(tokenChunks).toHaveLength(1);
      expect(tokenChunks[0]).toEqual({ type: "token", content: "data" });
    });

    it("should save assistant message with token count and ragContextUsed", async () => {
      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      await collectChunks(service.streamCompletion(createInput(), testContext));

      // Second createMessage call is the assistant message
      const assistantCall = mockRepo.createMessage.mock.calls[1];
      expect(assistantCall[0]).toEqual(
        expect.objectContaining({
          conversationId: "conv-new",
          role: "assistant",
          content: "Hello world",
          tokenCount: expect.any(Number),
          ragContextUsed: false,
        })
      );
    });

    it("should set ragContextUsed true when RAG sources are present", async () => {
      mockCtx.searchRAG.mockResolvedValue({
        formattedContext: "## Context",
        sources: [{ title: "Doc", docType: "runbook", similarity: 0.8 }],
      });

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      await collectChunks(service.streamCompletion(createInput(), testContext));

      const assistantCall = mockRepo.createMessage.mock.calls[1];
      expect(assistantCall[0].ragContextUsed).toBe(true);
    });

    it("should set ragContextUsed true when page context is found (even without RAG)", async () => {
      const contextData: ChatContextData = {
        entityType: "analysis",
        title: "Build fail",
        summary: "TS error",
        details: null,
      };
      mockCtx.getAnalysisContext.mockResolvedValue(contextData);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      await collectChunks(service.streamCompletion(createInput(), testContext));

      const assistantCall = mockRepo.createMessage.mock.calls[1];
      expect(assistantCall[0].ragContextUsed).toBe(true);
    });

    it("should call trimConversationIfNeeded after saving assistant message", async () => {
      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      await collectChunks(service.streamCompletion(createInput(), testContext));

      expect(mockRepo.getConversationTokenCount).toHaveBeenCalledWith("conv-new");
    });

    it("should yield done as the last chunk on success", async () => {
      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      const chunks = await collectChunks(service.streamCompletion(createInput(), testContext));

      expect(chunks[chunks.length - 1]).toEqual({ type: "done" });
    });

    it("should proceed without context when contextPort is undefined", async () => {
      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        // No contextPort
      });

      const chunks = await collectChunks(service.streamCompletion(createInput(), testContext));

      const doneChunk = chunks.find((c) => c.type === "done");
      expect(doneChunk).toBeDefined();
      // Should not have called any context methods
      expect(mockCtx.getAnalysisContext).not.toHaveBeenCalled();
    });

    it("should proceed when contextPort.getAnalysisContext throws (fail-safe)", async () => {
      mockCtx.getAnalysisContext.mockRejectedValue(new Error("DB connection lost"));

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      const chunks = await collectChunks(service.streamCompletion(createInput(), testContext));

      const doneChunk = chunks.find((c) => c.type === "done");
      expect(doneChunk).toBeDefined();
    });

    it("should proceed when contextPort.searchRAG throws (fail-safe)", async () => {
      mockCtx.searchRAG.mockRejectedValue(new Error("RAG service down"));

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      const chunks = await collectChunks(service.streamCompletion(createInput(), testContext));

      const doneChunk = chunks.find((c) => c.type === "done");
      expect(doneChunk).toBeDefined();
    });

    it("should yield error chunk when LLM stream fails", async () => {
      mockLLM.createStreamingCompletion.mockImplementation(function* () {
        yield; // yield before throwing to satisfy require-yield
        throw new Error("LLM API error");
      });

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      const chunks = await collectChunks(service.streamCompletion(createInput(), testContext));

      const errorChunk = chunks.find((c) => c.type === "error");
      expect(errorChunk).toBeDefined();
      expect(errorChunk?.type === "error" && errorChunk.error).toContain("error occurred");
    });

    it("should yield error chunk when repository.createConversation fails", async () => {
      mockRepo.createConversation.mockRejectedValue(new Error("DB write failed"));

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      const chunks = await collectChunks(service.streamCompletion(createInput(), testContext));

      const errorChunk = chunks.find((c) => c.type === "error");
      expect(errorChunk).toBeDefined();
    });

    it("should not fail when trimConversationIfNeeded throws", async () => {
      mockRepo.getConversationTokenCount.mockRejectedValue(new Error("Token count query failed"));

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      const chunks = await collectChunks(service.streamCompletion(createInput(), testContext));

      // Should still yield done (trim failure is non-fatal)
      expect(chunks[chunks.length - 1]).toEqual({ type: "done" });
    });

    it("should delete oldest messages when token count exceeds budget", async () => {
      // Token count exceeds MAX_CONTEXT_TOKENS
      mockRepo.getConversationTokenCount.mockResolvedValue(999_999);
      mockRepo.deleteOldestMessages.mockResolvedValue(5);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      await collectChunks(service.streamCompletion(createInput(), testContext));

      expect(mockRepo.deleteOldestMessages).toHaveBeenCalledWith(
        "conv-new",
        expect.any(Number),
        testContext
      );
    });

    it("should not delete messages when token count is within budget", async () => {
      mockRepo.getConversationTokenCount.mockResolvedValue(100);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      await collectChunks(service.streamCompletion(createInput(), testContext));

      expect(mockRepo.deleteOldestMessages).not.toHaveBeenCalled();
    });

    it("should re-run RAG with enriched query when page context is found", async () => {
      const contextData: ChatContextData = {
        entityType: "analysis",
        title: "Build fail",
        summary: "Missing dep",
        details: null,
      };
      mockCtx.getAnalysisContext.mockResolvedValue(contextData);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      await collectChunks(service.streamCompletion(createInput(), testContext));

      // searchRAG should be called twice: initial + enriched
      expect(mockCtx.searchRAG).toHaveBeenCalledTimes(2);
    });

    it("should fetch incident context when pageType is incident", async () => {
      const input = createInput({
        pageContext: { pageType: "incident", entityId: "alert-456" },
      });

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      await collectChunks(service.streamCompletion(input, testContext));

      expect(mockCtx.getIncidentContext).toHaveBeenCalledWith(
        "alert-456",
        "test-tenant",
        testContext
      );
      expect(mockCtx.getAnalysisContext).not.toHaveBeenCalled();
    });

    it("should not fetch page context when entityId is undefined", async () => {
      const input = createInput({
        pageContext: { pageType: "overview" },
      });

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      await collectChunks(service.streamCompletion(input, testContext));

      expect(mockCtx.getAnalysisContext).not.toHaveBeenCalled();
      expect(mockCtx.getIncidentContext).not.toHaveBeenCalled();
    });

    it("should load history before saving user message", async () => {
      const callOrder: string[] = [];
      mockRepo.getMessagesByConversation.mockImplementation(async () => {
        callOrder.push("getHistory");
        return [];
      });
      mockRepo.createMessage.mockImplementation(async () => {
        callOrder.push("createMessage");
        return { id: "msg-1" };
      });

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      await collectChunks(
        service.streamCompletion(createInput({ conversationId: "existing" }), testContext)
      );

      expect(callOrder[0]).toBe("getHistory");
      expect(callOrder[1]).toBe("createMessage");
    });
  });

  // ==================== Delegation Methods ====================

  describe("listConversations", () => {
    it("should delegate to repository", async () => {
      const expected = [
        {
          id: "c1",
          tenantId: "t",
          userId: "u",
          title: "conv",
          pageContext: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockRepo.findConversationsByUser.mockResolvedValue(expected);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
      });

      const result = await service.listConversations("t", "u", 10, testContext);
      expect(result).toBe(expected);
      expect(mockRepo.findConversationsByUser).toHaveBeenCalledWith("t", "u", 10, testContext);
    });
  });

  describe("getConversation", () => {
    it("should delegate to repository", async () => {
      const expected = {
        id: "c1",
        tenantId: "t",
        userId: "u",
        title: "conv",
        pageContext: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRepo.findConversationById.mockResolvedValue(expected);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
      });

      const result = await service.getConversation("c1", "t", testContext);
      expect(result).toBe(expected);
    });
  });

  describe("getMessages", () => {
    it("should delegate to repository", async () => {
      const expected = [{ role: "user", content: "hi" }];
      mockRepo.getMessagesByConversation.mockResolvedValue(expected);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
      });

      const result = await service.getMessages("c1", 50, testContext);
      expect(result).toBe(expected);
    });
  });

  describe("deleteConversation", () => {
    it("should delegate to repository", async () => {
      mockRepo.deleteConversation.mockResolvedValue(true);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
      });

      const result = await service.deleteConversation("c1", "t", testContext);
      expect(result).toBe(true);
      expect(mockRepo.deleteConversation).toHaveBeenCalledWith("c1", "t", testContext);
    });
  });

  describe("updateConversationTitle", () => {
    it("should delegate to repository", async () => {
      const expected = {
        id: "c1",
        tenantId: "t",
        userId: "u",
        title: "new title",
        pageContext: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRepo.updateConversationTitle.mockResolvedValue(expected);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
      });

      const result = await service.updateConversationTitle("c1", "t", "new title", testContext);
      expect(result).toBe(expected);
    });
  });
});

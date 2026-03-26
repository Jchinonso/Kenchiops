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
  ChatBudgetPort,
  ChatBudgetStatus,
  ChatCompletionInput,
  ChatStreamChunk,
  ChatContextData,
  ChatLLMStreamDelta,
} from "../../chat/types.js";
import type { RequestContext } from "../../core/types.js";

// ==================== Mocks ====================

// Mock createLogger to suppress log output
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock("../../core/logger.js", () => ({
  createLogger: () => mockLogger,
}));

jest.mock("../../core/config.js", () => ({
  config: {
    LLM_MODEL: "test-model",
    OPENAI_MODEL: "",
    LLM_PROVIDER: "openai",
  },
}));

jest.mock("../../llm/providers/llmProvider/clientFactory.js", () => ({
  isOpenRouterProvider: () => false,
}));

// Now import the module under test (after mocks are set up)
import { createChatService } from "../../chat/chatService.js";

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
  countConversationsByUser: jest.fn<ChatRepositoryPort["countConversationsByUser"]>(),
  countMessagesByConversation: jest.fn<ChatRepositoryPort["countMessagesByConversation"]>(),
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

const createMockBudgetPort = (): {
  [K in keyof ChatBudgetPort]: jest.Mock;
} => ({
  checkBudget: jest.fn<ChatBudgetPort["checkBudget"]>(),
  incrementUsage: jest.fn<ChatBudgetPort["incrementUsage"]>(),
});

/** Create a ChatBudgetStatus with sensible defaults. */
const createBudgetStatus = (overrides: Partial<ChatBudgetStatus> = {}): ChatBudgetStatus => ({
  tokensUsed: 10_000,
  budgetLimit: 50_000,
  remaining: 40_000,
  ratioUsed: 0.2,
  isWarning: false,
  isExhausted: false,
  ...overrides,
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
    mockRepo.countConversationsByUser.mockResolvedValue(0);
    mockRepo.countMessagesByConversation.mockResolvedValue(0);

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

      expect(mockRepo.getConversationTokenCount).toHaveBeenCalledWith("conv-new", testContext);
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

    // ==================== Off-topic early-exit ====================

    it("should skip RAG and context fetch for off-topic messages", async () => {
      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      const input = createInput({ userMessage: "2+4" });
      const chunks = await collectChunks(service.streamCompletion(input, testContext));

      // RAG and context should NOT be called
      expect(mockCtx.searchRAG).not.toHaveBeenCalled();
      expect(mockCtx.getAnalysisContext).not.toHaveBeenCalled();
      expect(mockCtx.getIncidentContext).not.toHaveBeenCalled();

      // User and assistant messages should still be saved
      expect(mockRepo.createMessage).toHaveBeenCalledTimes(2);
      expect(mockRepo.createMessage).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ role: "user", content: "2+4" }),
        testContext
      );
      expect(mockRepo.createMessage).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          role: "assistant",
          ragContextUsed: false,
        }),
        testContext
      );

      // Should yield token chunks and done
      const tokenChunks = chunks.filter((c) => c.type === "token");
      expect(tokenChunks.length).toBeGreaterThan(0);
      expect(chunks[chunks.length - 1]).toEqual({ type: "done" });
    });

    it("should go through full pipeline for on-topic messages", async () => {
      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      const input = createInput({ userMessage: "Why did my build fail?" });
      await collectChunks(service.streamCompletion(input, testContext));

      // RAG should be called for on-topic messages
      expect(mockCtx.searchRAG).toHaveBeenCalled();
    });

    it("should not yield rag_sources chunk for off-topic messages", async () => {
      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      const input = createInput({ userMessage: "what is my name" });
      const chunks = await collectChunks(service.streamCompletion(input, testContext));

      expect(chunks.find((c) => c.type === "rag_sources")).toBeUndefined();
    });

    it("should pass maxTokens option to LLM port for off-topic messages", async () => {
      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      const input = createInput({ userMessage: "2+4" });
      await collectChunks(service.streamCompletion(input, testContext));

      expect(mockLLM.createStreamingCompletion).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
        testContext,
        expect.objectContaining({ maxTokens: 2048 })
      );
    });

    it("should pass maxTokens option to LLM port for on-topic messages", async () => {
      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      const input = createInput({ userMessage: "Why did my build fail?" });
      await collectChunks(service.streamCompletion(input, testContext));

      expect(mockLLM.createStreamingCompletion).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
        testContext,
        expect.objectContaining({ maxTokens: 2048 })
      );
    });

    it("should use minimal messages (system + user only) for off-topic flow", async () => {
      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      // Provide history that would normally be included
      mockRepo.getMessagesByConversation.mockResolvedValue([
        { role: "user", content: "previous question" },
        { role: "assistant", content: "previous answer" },
      ]);

      const input = createInput({
        userMessage: "what is the capital of France",
        conversationId: "existing-conv",
      });
      await collectChunks(service.streamCompletion(input, testContext));

      // Off-topic path builds minimal messages: system + current user only (no history)
      const llmCallArgs = mockLLM.createStreamingCompletion.mock.calls[0];
      const messages = llmCallArgs[0] as ReadonlyArray<{ role: string; content: string }>;
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("system");
      expect(messages[1].role).toBe("user");
      expect(messages[1].content).toBe("what is the capital of France");
    });

    it("should still trim conversation for off-topic messages", async () => {
      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      const input = createInput({ userMessage: "tell me a joke" });
      await collectChunks(service.streamCompletion(input, testContext));

      // Unified pipeline trims after all completions (cheap, fail-safe)
      expect(mockRepo.getConversationTokenCount).toHaveBeenCalled();
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

    // ==================== Budget Integration ====================

    it("should yield error and return early when budget is exhausted", async () => {
      const mockBudget = createMockBudgetPort();
      mockBudget.checkBudget.mockResolvedValue(
        createBudgetStatus({ isExhausted: true, ratioUsed: 1.0, remaining: 0 })
      );

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
        budgetPort: mockBudget,
      });

      const input = createInput({ planTier: "free" });
      const chunks = await collectChunks(service.streamCompletion(input, testContext));

      // Should yield error about daily limit
      const errorChunk = chunks.find((c) => c.type === "error");
      expect(errorChunk).toBeDefined();
      expect(errorChunk?.type === "error" && errorChunk.error).toContain("daily chat token budget");

      // LLM should NOT be called
      expect(mockLLM.createStreamingCompletion).not.toHaveBeenCalled();

      // No assistant message should be saved
      const assistantCalls = mockRepo.createMessage.mock.calls.filter(
        (call) => (call[0] as { role: string }).role === "assistant"
      );
      expect(assistantCalls).toHaveLength(0);
    });

    it("should yield budget_warning chunk before proceeding when at warning threshold", async () => {
      const mockBudget = createMockBudgetPort();
      mockBudget.checkBudget.mockResolvedValue(
        createBudgetStatus({
          isWarning: true,
          isExhausted: false,
          ratioUsed: 0.85,
          remaining: 7_500,
        })
      );
      mockBudget.incrementUsage.mockResolvedValue(undefined);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
        budgetPort: mockBudget,
      });

      const input = createInput({ planTier: "free" });
      const chunks = await collectChunks(service.streamCompletion(input, testContext));

      // Should yield budget_warning chunk
      const warningChunk = chunks.find((c) => c.type === "budget_warning");
      expect(warningChunk).toBeDefined();
      expect(warningChunk?.type === "budget_warning" && warningChunk.ratioUsed).toBe(0.85);
      expect(warningChunk?.type === "budget_warning" && warningChunk.remaining).toBe(7_500);

      // Should still proceed — LLM called, done emitted
      expect(mockLLM.createStreamingCompletion).toHaveBeenCalled();
      expect(chunks[chunks.length - 1]).toEqual({ type: "done" });
    });

    it("should not yield budget_warning when under threshold", async () => {
      const mockBudget = createMockBudgetPort();
      mockBudget.checkBudget.mockResolvedValue(
        createBudgetStatus({ isWarning: false, isExhausted: false })
      );
      mockBudget.incrementUsage.mockResolvedValue(undefined);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
        budgetPort: mockBudget,
      });

      const input = createInput({ planTier: "free" });
      const chunks = await collectChunks(service.streamCompletion(input, testContext));

      expect(chunks.find((c) => c.type === "budget_warning")).toBeUndefined();
      expect(chunks[chunks.length - 1]).toEqual({ type: "done" });
    });

    it("should call incrementUsage after assistant message in normal flow", async () => {
      const mockBudget = createMockBudgetPort();
      mockBudget.checkBudget.mockResolvedValue(createBudgetStatus());
      mockBudget.incrementUsage.mockResolvedValue(undefined);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
        budgetPort: mockBudget,
      });

      const input = createInput({ planTier: "free" });
      await collectChunks(service.streamCompletion(input, testContext));

      expect(mockBudget.incrementUsage).toHaveBeenCalledTimes(1);
      expect(mockBudget.incrementUsage).toHaveBeenCalledWith(
        "test-tenant",
        expect.any(Number), // total tokens (user + assistant)
        testContext
      );

      // Verify token count is positive (user tokens + assistant tokens)
      const tokensArg = mockBudget.incrementUsage.mock.calls[0][1] as number;
      expect(tokensArg).toBeGreaterThan(0);
    });

    it("should call incrementUsage after assistant message in off-topic flow", async () => {
      const mockBudget = createMockBudgetPort();
      mockBudget.checkBudget.mockResolvedValue(createBudgetStatus());
      mockBudget.incrementUsage.mockResolvedValue(undefined);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
        budgetPort: mockBudget,
      });

      const input = createInput({ userMessage: "2+4", planTier: "free" });
      await collectChunks(service.streamCompletion(input, testContext));

      expect(mockBudget.incrementUsage).toHaveBeenCalledTimes(1);
      expect(mockBudget.incrementUsage).toHaveBeenCalledWith(
        "test-tenant",
        expect.any(Number),
        testContext
      );
    });

    it("should fail open when checkBudget throws", async () => {
      const mockBudget = createMockBudgetPort();
      mockBudget.checkBudget.mockRejectedValue(new Error("Redis down"));
      mockBudget.incrementUsage.mockResolvedValue(undefined);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
        budgetPort: mockBudget,
      });

      const input = createInput({ planTier: "free" });
      const chunks = await collectChunks(service.streamCompletion(input, testContext));

      // Should proceed normally — LLM called, done emitted
      expect(mockLLM.createStreamingCompletion).toHaveBeenCalled();
      expect(chunks[chunks.length - 1]).toEqual({ type: "done" });
    });

    it("should fail open when incrementUsage throws", async () => {
      const mockBudget = createMockBudgetPort();
      mockBudget.checkBudget.mockResolvedValue(createBudgetStatus());
      mockBudget.incrementUsage.mockRejectedValue(new Error("DB write failed"));

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
        budgetPort: mockBudget,
      });

      const input = createInput({ planTier: "free" });
      const chunks = await collectChunks(service.streamCompletion(input, testContext));

      // Should still yield done — increment failure is non-fatal
      expect(chunks[chunks.length - 1]).toEqual({ type: "done" });
      // No error chunk should be emitted
      expect(chunks.find((c) => c.type === "error")).toBeUndefined();
    });

    it("should work normally when budgetPort is undefined", async () => {
      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
        // No budgetPort
      });

      const input = createInput({ planTier: "free" });
      const chunks = await collectChunks(service.streamCompletion(input, testContext));

      // Normal flow: token chunks + done
      expect(mockLLM.createStreamingCompletion).toHaveBeenCalled();
      expect(chunks[chunks.length - 1]).toEqual({ type: "done" });
      expect(chunks.find((c) => c.type === "budget_warning")).toBeUndefined();
    });

    it("should skip budget check when planTier is not provided", async () => {
      const mockBudget = createMockBudgetPort();

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
        budgetPort: mockBudget,
      });

      // No planTier in input
      const input = createInput();
      await collectChunks(service.streamCompletion(input, testContext));

      // Budget check should not be called — condition is `budgetPort && input.planTier`
      expect(mockBudget.checkBudget).not.toHaveBeenCalled();
    });

    it("should NOT create conversation when budget is exhausted for a new conversation", async () => {
      // Previously this was a bug — conversation was created before budget check.
      // Now budget check runs BEFORE conversation creation in prepareCompletion.
      const mockBudget = createMockBudgetPort();
      mockBudget.checkBudget.mockResolvedValue(
        createBudgetStatus({ isExhausted: true, ratioUsed: 1.0, remaining: 0 })
      );

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
        budgetPort: mockBudget,
      });

      // No conversationId — would normally trigger createConversation
      const input = createInput({ planTier: "free" });
      const chunks = await collectChunks(service.streamCompletion(input, testContext));

      // Conversation should NOT be created (budget checked first)
      expect(mockRepo.createConversation).not.toHaveBeenCalled();
      // Error chunk should be yielded
      const errorChunk = chunks.find((c) => c.type === "error");
      expect(errorChunk).toBeDefined();
      expect(errorChunk?.type === "error" && errorChunk.error).toContain("daily chat token budget");
      // No conversation_created chunk should be emitted
      expect(chunks.find((c) => c.type === "conversation_created")).toBeUndefined();
    });

    it("should use ratioUsed (not percentUsed) in budget_warning chunk payload", async () => {
      const mockBudget = createMockBudgetPort();
      mockBudget.checkBudget.mockResolvedValue(
        createBudgetStatus({
          isWarning: true,
          isExhausted: false,
          ratioUsed: 0.92,
          remaining: 4_000,
        })
      );
      mockBudget.incrementUsage.mockResolvedValue(undefined);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
        budgetPort: mockBudget,
      });

      const input = createInput({ planTier: "free" });
      const chunks = await collectChunks(service.streamCompletion(input, testContext));

      const warningChunk = chunks.find((c) => c.type === "budget_warning");
      expect(warningChunk).toBeDefined();

      // Verify the field is named "ratioUsed" not "percentUsed"
      if (warningChunk?.type === "budget_warning") {
        expect(warningChunk).toHaveProperty("ratioUsed", 0.92);
        expect(warningChunk).toHaveProperty("remaining", 4_000);
        // Ensure "percentUsed" is NOT present
        expect(warningChunk).not.toHaveProperty("percentUsed");
      }
    });

    it("should not call incrementUsage when budget is exhausted (early return)", async () => {
      const mockBudget = createMockBudgetPort();
      mockBudget.checkBudget.mockResolvedValue(createBudgetStatus({ isExhausted: true }));

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
        budgetPort: mockBudget,
      });

      const input = createInput({ planTier: "free" });
      await collectChunks(service.streamCompletion(input, testContext));

      expect(mockBudget.incrementUsage).not.toHaveBeenCalled();
    });
  });

  // ==================== Guard 1: Max Messages per Conversation ====================

  describe("streamCompletion — Guard 1: max messages per conversation", () => {
    it("should yield error when message count >= 50", async () => {
      mockRepo.countMessagesByConversation.mockResolvedValue(50);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      const input = createInput({ conversationId: "existing-conv" });
      const chunks = await collectChunks(service.streamCompletion(input, testContext));

      const errorChunk = chunks.find((c) => c.type === "error");
      expect(errorChunk).toBeDefined();
      expect(errorChunk?.type === "error" && errorChunk.error).toContain("maximum message limit");

      // LLM should NOT be called
      expect(mockLLM.createStreamingCompletion).not.toHaveBeenCalled();

      // No user or assistant message should be saved after the guard
      // (user message is saved BEFORE the guard in source, but assistant should not be)
      const assistantCalls = mockRepo.createMessage.mock.calls.filter(
        (call) => (call[0] as { role: string }).role === "assistant"
      );
      expect(assistantCalls).toHaveLength(0);
    });

    it("should allow when message count is 49", async () => {
      mockRepo.countMessagesByConversation.mockResolvedValue(49);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      const input = createInput({ conversationId: "existing-conv" });
      const chunks = await collectChunks(service.streamCompletion(input, testContext));

      // LLM should be called — normal flow proceeds
      expect(mockLLM.createStreamingCompletion).toHaveBeenCalled();
      expect(chunks[chunks.length - 1]).toEqual({ type: "done" });
    });

    it("should use countMessagesByConversation not history length", async () => {
      // History returns MAX_HISTORY_MESSAGES (20) items, but count returns 50
      const fakeHistory = Array.from({ length: 20 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `message ${i}`,
      }));
      mockRepo.getMessagesByConversation.mockResolvedValue(fakeHistory);
      mockRepo.countMessagesByConversation.mockResolvedValue(50);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      const input = createInput({ conversationId: "existing-conv" });
      const chunks = await collectChunks(service.streamCompletion(input, testContext));

      // Should be blocked despite history having only 20 messages
      const errorChunk = chunks.find((c) => c.type === "error");
      expect(errorChunk).toBeDefined();
      expect(errorChunk?.type === "error" && errorChunk.error).toContain("maximum message limit");
      expect(mockLLM.createStreamingCompletion).not.toHaveBeenCalled();
    });
  });

  // ==================== Guard 2: Max Conversations per User ====================

  describe("streamCompletion — Guard 2: max conversations per user", () => {
    it("should yield error when conversation count >= 20 and creating new conversation", async () => {
      mockRepo.countConversationsByUser.mockResolvedValue(20);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      // No conversationId — creating a new conversation
      const input = createInput();
      const chunks = await collectChunks(service.streamCompletion(input, testContext));

      const errorChunk = chunks.find((c) => c.type === "error");
      expect(errorChunk).toBeDefined();
      expect(errorChunk?.type === "error" && errorChunk.error).toContain(
        "maximum number of conversations"
      );

      // Conversation should NOT be created
      expect(mockRepo.createConversation).not.toHaveBeenCalled();

      // LLM should NOT be called
      expect(mockLLM.createStreamingCompletion).not.toHaveBeenCalled();
    });

    it("should allow when conversation count is 19", async () => {
      mockRepo.countConversationsByUser.mockResolvedValue(19);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      // No conversationId — creating a new conversation
      const input = createInput();
      const chunks = await collectChunks(service.streamCompletion(input, testContext));

      // Conversation should be created
      expect(mockRepo.createConversation).toHaveBeenCalledTimes(1);

      // Normal flow proceeds
      expect(mockLLM.createStreamingCompletion).toHaveBeenCalled();
      expect(chunks[chunks.length - 1]).toEqual({ type: "done" });
    });

    it("should not check guard when conversationId is provided", async () => {
      mockRepo.countConversationsByUser.mockResolvedValue(20);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      // Has conversationId — existing conversation
      const input = createInput({ conversationId: "existing-conv" });
      const chunks = await collectChunks(service.streamCompletion(input, testContext));

      // Normal flow proceeds despite count being at limit
      expect(mockLLM.createStreamingCompletion).toHaveBeenCalled();
      expect(chunks[chunks.length - 1]).toEqual({ type: "done" });
    });

    it("should not call countConversationsByUser when conversationId is provided", async () => {
      mockRepo.countConversationsByUser.mockResolvedValue(25);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
        contextPort: mockCtx,
      });

      const input = createInput({ conversationId: "existing-conv" });
      await collectChunks(service.streamCompletion(input, testContext));

      // countConversationsByUser should NOT be called at all
      expect(mockRepo.countConversationsByUser).not.toHaveBeenCalled();
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
    it("should delegate to repository after ownership check", async () => {
      const expected = [{ role: "user", content: "hi" }];
      mockRepo.findConversationById.mockResolvedValue({
        id: "c1",
        tenantId: "test-tenant",
        userId: "user-1",
        title: "Test",
        pageContext: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockRepo.getMessagesByConversation.mockResolvedValue(expected);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
      });

      const result = await service.getMessages("c1", "test-tenant", "user-1", 50, testContext);
      expect(result).toBe(expected);
    });

    it("should throw NotFoundError when conversation does not exist", async () => {
      mockRepo.findConversationById.mockResolvedValue(null);

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
      });

      await expect(
        service.getMessages("c1", "test-tenant", "user-1", 50, testContext)
      ).rejects.toThrow("Conversation not found");
    });

    it("should throw AuthorizationError when user does not own conversation", async () => {
      mockRepo.findConversationById.mockResolvedValue({
        id: "c1",
        tenantId: "test-tenant",
        userId: "other-user",
        title: "Test",
        pageContext: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const service = createChatService({
        chatRepository: mockRepo,
        llmPort: mockLLM,
      });

      await expect(
        service.getMessages("c1", "test-tenant", "user-1", 50, testContext)
      ).rejects.toThrow("You do not have access to this conversation");
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

/**
 * Tests for adapters/chatLLMAdapter — streaming LLM completions for Copilot Drawer.
 *
 * Mocks getLLMSDKClient from @kenchi/shared. Verifies streaming yield behavior,
 * structured logging, and ExternalServiceError classification.
 *
 * @module adapters/chatLLMAdapter.test
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ExternalServiceError } from "@kenchi/shared";
import type { ChatLLMMessage, ChatLLMStreamDelta } from "@kenchi/shared";
import type { RequestContext } from "@kenchi/shared";

// ==================== Mocks ====================

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockCreate = jest.fn();
const mockClient = {
  chat: {
    completions: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
};

jest.mock("@kenchi/shared", () => {
  const actual = jest.requireActual<typeof import("@kenchi/shared")>("@kenchi/shared");
  return {
    ...actual,
    getLLMSDKClient: () => mockClient,
    createLogger: () => mockLogger,
  };
});

import { createChatLLMAdapter } from "./chatLLMAdapter.js";

// ==================== Fixtures ====================

const testContext: RequestContext = {
  requestId: "test-req-id",
  tenantId: "test-tenant",
};

const createMessages = (): readonly ChatLLMMessage[] => [
  { role: "system", content: "You are helpful." },
  { role: "user", content: "Hello" },
];

/**
 * Creates a mock async iterable stream of SDK chunks.
 * Mimics the shape returned by OpenAI SDK's streaming response.
 */
const createMockStream = (
  deltas: ReadonlyArray<{
    content?: string | null;
    finish_reason?: string | null;
  }>
) => {
  const chunks = deltas.map((d) => ({
    choices: [
      {
        delta: { content: d.content ?? null },
        finish_reason: d.finish_reason ?? null,
      },
    ],
  }));

  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
};

/** Helper: collect all deltas from the adapter's async generator. */
const collectDeltas = async (
  gen: AsyncIterable<ChatLLMStreamDelta>
): Promise<readonly ChatLLMStreamDelta[]> => {
  const deltas: ChatLLMStreamDelta[] = [];
  for await (const d of gen) {
    deltas.push(d);
  }
  return deltas;
};

// ==================== Tests ====================

describe("createChatLLMAdapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("createStreamingCompletion", () => {
    it("should yield content deltas from the stream", async () => {
      const stream = createMockStream([
        { content: "Hello" },
        { content: " there" },
        { content: null, finish_reason: "stop" },
      ]);
      mockCreate.mockResolvedValue(stream);

      const adapter = createChatLLMAdapter();
      const deltas = await collectDeltas(
        adapter.createStreamingCompletion(createMessages(), "test-model", testContext)
      );

      expect(deltas).toHaveLength(3);
      expect(deltas[0].content).toBe("Hello");
      expect(deltas[1].content).toBe(" there");
      expect(deltas[2].content).toBeNull();
      expect(deltas[2].finishReason).toBe("stop");
    });

    it("should skip chunks with no delta", async () => {
      const stream = {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: "yes" }, finish_reason: null }] };
          yield { choices: [{}] }; // No delta
          yield { choices: [{ delta: { content: "!" }, finish_reason: null }] };
        },
      };
      mockCreate.mockResolvedValue(stream);

      const adapter = createChatLLMAdapter();
      const deltas = await collectDeltas(
        adapter.createStreamingCompletion(createMessages(), "test-model", testContext)
      );

      // Only 2 deltas should be yielded (chunk without delta is skipped)
      expect(deltas).toHaveLength(2);
    });

    it("should log success with provider/operation/durationMs/model/context", async () => {
      mockCreate.mockResolvedValue(createMockStream([{ content: "ok" }]));

      const adapter = createChatLLMAdapter();
      await collectDeltas(
        adapter.createStreamingCompletion(createMessages(), "gpt-4", testContext)
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("stream completed"),
        expect.objectContaining({
          provider: "llm",
          operation: "streamChatCompletion",
          durationMs: expect.any(Number),
          model: "gpt-4",
          requestId: "test-req-id",
          tenantId: "test-tenant",
        })
      );
    });

    it("should throw ExternalServiceError on SDK failure", async () => {
      mockCreate.mockRejectedValue(new Error("API rate limit exceeded"));

      const adapter = createChatLLMAdapter();

      await expect(
        collectDeltas(
          adapter.createStreamingCompletion(createMessages(), "test-model", testContext)
        )
      ).rejects.toThrow(ExternalServiceError);
    });

    it("should throw ExternalServiceError with retryable=true on timeout", async () => {
      mockCreate.mockRejectedValue(new Error("Chat LLM stream connection timed out"));

      const adapter = createChatLLMAdapter();

      try {
        await collectDeltas(
          adapter.createStreamingCompletion(createMessages(), "test-model", testContext)
        );
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const ese = error as ExternalServiceError;
        expect(ese.retryable).toBe(true);
      }
    });

    it("should throw ExternalServiceError with retryable=false on non-timeout errors", async () => {
      mockCreate.mockRejectedValue(new Error("Invalid API key"));

      const adapter = createChatLLMAdapter();

      try {
        await collectDeltas(
          adapter.createStreamingCompletion(createMessages(), "test-model", testContext)
        );
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        const ese = error as ExternalServiceError;
        expect(ese.retryable).toBe(false);
      }
    });

    it("should log error with correct fields on failure", async () => {
      mockCreate.mockRejectedValue(new Error("Server error"));

      const adapter = createChatLLMAdapter();

      try {
        await collectDeltas(
          adapter.createStreamingCompletion(createMessages(), "gpt-4", testContext)
        );
      } catch {
        // Expected
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("stream failed"),
        expect.objectContaining({
          provider: "llm",
          operation: "streamChatCompletion",
          durationMs: expect.any(Number),
          model: "gpt-4",
          category: "unknown",
          retryable: false,
          requestId: "test-req-id",
          tenantId: "test-tenant",
        })
      );
    });

    it("should log error with retryable category on timeout", async () => {
      mockCreate.mockRejectedValue(new Error("Chat LLM stream connection timed out"));

      const adapter = createChatLLMAdapter();

      try {
        await collectDeltas(
          adapter.createStreamingCompletion(createMessages(), "test-model", testContext)
        );
      } catch {
        // Expected
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          category: "retryable",
          retryable: true,
        })
      );
    });

    it("should pass messages and model to SDK client.create", async () => {
      mockCreate.mockResolvedValue(createMockStream([]));

      const adapter = createChatLLMAdapter();
      const messages = createMessages();
      await collectDeltas(adapter.createStreamingCompletion(messages, "my-model", testContext));

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "my-model",
          stream: true,
          messages: [
            { role: "system", content: "You are helpful." },
            { role: "user", content: "Hello" },
          ],
        })
      );
    });

    it("should throw ExternalServiceError when stream iteration fails mid-stream", async () => {
      const failingStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            choices: [
              {
                delta: { content: "partial" },
                finish_reason: null,
              },
            ],
          };
          throw new Error("Connection reset");
        },
      };
      mockCreate.mockResolvedValue(failingStream);

      const adapter = createChatLLMAdapter();

      await expect(
        collectDeltas(
          adapter.createStreamingCompletion(createMessages(), "test-model", testContext)
        )
      ).rejects.toThrow(ExternalServiceError);
    });
  });
});

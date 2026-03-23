/**
 * Unit tests for useCopilotChat hook.
 *
 * Tests chat state management and SSE streaming:
 * - Initial state: empty messages, not streaming, no error
 * - sendMessage: adds user + assistant placeholder, streams tokens
 * - sendMessage: ignores empty/whitespace input
 * - sendMessage: ignores calls while already streaming
 * - SSE parsing: token chunks append to assistant message
 * - SSE parsing: conversation_created sets conversationId
 * - SSE parsing: error chunk sets error state
 * - SSE parsing: rag_sources chunk sets ragSources
 * - SSE parsing: ignores non-data lines and malformed JSON
 * - API error response: sets error, removes placeholder
 * - Missing response body: sets error, removes placeholder
 * - Network error: sets error, removes empty placeholder
 * - clearConversation: resets all state
 * - loadConversation: fetches and displays messages
 * - loadConversation: filters out system messages
 * - loadConversation: handles API failure
 * - loadConversation: handles network error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ==================== Mocks ====================

vi.mock("@/lib/apiClient", () => ({
  API_URL: "https://api.test",
}));

const mockPageContext = { pageType: "overview" as const };
vi.mock("@/hooks/usePageContext", () => ({
  usePageContext: () => mockPageContext,
}));

import { useCopilotChat } from "./hooks.ts";

// ==================== Helpers ====================

/** Create a minimal ReadableStream from string chunks. */
const createSSEStream = (lines: readonly string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  const text = lines.join("\n") + "\n";

  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
};

/** Create a successful SSE Response with the given lines. */
const createStreamResponse = (lines: readonly string[]): Response =>
  ({
    ok: true,
    status: 200,
    body: createSSEStream(lines),
    text: () => Promise.resolve(""),
  }) as unknown as Response;

/** Create a failed Response. */
const createErrorResponse = (status: number, body: string): Response =>
  ({
    ok: false,
    status,
    body: null,
    text: () => Promise.resolve(body),
  }) as unknown as Response;

/** Create a successful JSON Response for loadConversation. */
const createJsonResponse = (data: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data }),
  }) as unknown as Response;

// ==================== Setup ====================

const mockFetch = vi.fn<typeof globalThis.fetch>();

beforeEach(() => {
  vi.clearAllMocks();
  // Provide a stable UUID for deterministic test assertions
  vi.spyOn(crypto, "randomUUID")
    .mockReturnValueOnce("user-msg-1" as ReturnType<typeof crypto.randomUUID>)
    .mockReturnValueOnce("assistant-msg-1" as ReturnType<typeof crypto.randomUUID>);
  globalThis.fetch = mockFetch;
});

// ==================== Tests ====================

describe("useCopilotChat", () => {
  describe("initial state", () => {
    it("should return empty messages array", () => {
      const { result } = renderHook(() => useCopilotChat());

      expect(result.current.messages).toEqual([]);
    });

    it("should not be streaming", () => {
      const { result } = renderHook(() => useCopilotChat());

      expect(result.current.isStreaming).toBe(false);
    });

    it("should have no error", () => {
      const { result } = renderHook(() => useCopilotChat());

      expect(result.current.error).toBeNull();
    });

    it("should have no conversationId", () => {
      const { result } = renderHook(() => useCopilotChat());

      expect(result.current.conversationId).toBeNull();
    });

    it("should have empty ragSources", () => {
      const { result } = renderHook(() => useCopilotChat());

      expect(result.current.ragSources).toEqual([]);
    });
  });

  describe("sendMessage", () => {
    it("should ignore empty string input", async () => {
      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("");
      });

      expect(result.current.messages).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should ignore whitespace-only input", async () => {
      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("   \n\t  ");
      });

      expect(result.current.messages).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should add user message and assistant placeholder on send", async () => {
      mockFetch.mockResolvedValueOnce(createStreamResponse(['data: {"type":"done"}']));

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("Hello");
      });

      // Immediately after sendMessage, messages should include user + placeholder
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0]).toEqual(
        expect.objectContaining({ role: "user", content: "Hello" })
      );
      expect(result.current.messages[1]).toEqual(
        expect.objectContaining({ role: "assistant", content: "" })
      );
    });

    it("should trim the input before sending", async () => {
      mockFetch.mockResolvedValueOnce(createStreamResponse(['data: {"type":"done"}']));

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("  Hello world  ");
      });

      expect(result.current.messages[0].content).toBe("Hello world");

      // Verify the trimmed message was sent in the fetch body
      await waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
      });

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.message).toBe("Hello world");
    });

    it("should send request with correct URL and headers", async () => {
      mockFetch.mockResolvedValueOnce(createStreamResponse(['data: {"type":"done"}']));

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("Test");
      });

      await waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test/api/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    it("should include pageContext and conversationId in request body", async () => {
      mockFetch.mockResolvedValueOnce(createStreamResponse(['data: {"type":"done"}']));

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("Test");
      });

      await waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(body.pageContext).toEqual({ pageType: "overview" });
      expect(body.conversationId).toBeUndefined();
    });

    it("should set isStreaming to true during streaming", async () => {
      // Use a stream that we can control timing on
      mockFetch.mockResolvedValueOnce(createStreamResponse(['data: {"type":"done"}']));

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("Test");
      });

      // Immediately after send, should be streaming
      expect(result.current.isStreaming).toBe(true);

      await waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
      });
    });
  });

  describe("SSE token streaming", () => {
    it("should append token content to assistant message", async () => {
      mockFetch.mockResolvedValueOnce(
        createStreamResponse([
          'data: {"type":"token","content":"Hello"}',
          'data: {"type":"token","content":" world"}',
          'data: {"type":"done"}',
        ])
      );

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("Hi");
      });

      await waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[1].content).toBe("Hello world");
    });

    it("should set conversationId from conversation_created chunk", async () => {
      mockFetch.mockResolvedValueOnce(
        createStreamResponse([
          'data: {"type":"conversation_created","conversationId":"conv-123"}',
          'data: {"type":"done"}',
        ])
      );

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("Hi");
      });

      await waitFor(() => {
        expect(result.current.conversationId).toBe("conv-123");
      });
    });

    it("should set error from error chunk", async () => {
      mockFetch.mockResolvedValueOnce(
        createStreamResponse([
          'data: {"type":"error","error":"Rate limit exceeded"}',
          'data: {"type":"done"}',
        ])
      );

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("Hi");
      });

      await waitFor(() => {
        expect(result.current.error).toBe("Rate limit exceeded");
      });
    });

    it("should set ragSources from rag_sources chunk", async () => {
      const sources = [{ title: "Deploy Guide", docType: "runbook", similarity: 0.92 }];
      mockFetch.mockResolvedValueOnce(
        createStreamResponse([
          `data: ${JSON.stringify({ type: "rag_sources", sources })}`,
          'data: {"type":"done"}',
        ])
      );

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("Hi");
      });

      await waitFor(() => {
        expect(result.current.ragSources).toEqual(sources);
      });
    });

    it("should ignore non-data SSE lines", async () => {
      mockFetch.mockResolvedValueOnce(
        createStreamResponse([
          ": keep-alive comment",
          "event: ping",
          "",
          'data: {"type":"token","content":"OK"}',
          'data: {"type":"done"}',
        ])
      );

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("Hi");
      });

      await waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
      });

      expect(result.current.messages[1].content).toBe("OK");
    });

    it("should ignore malformed JSON in SSE data lines", async () => {
      mockFetch.mockResolvedValueOnce(
        createStreamResponse([
          "data: {invalid json}",
          'data: {"type":"token","content":"Valid"}',
          'data: {"type":"done"}',
        ])
      );

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("Hi");
      });

      await waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
      });

      expect(result.current.messages[1].content).toBe("Valid");
    });
  });

  describe("error handling", () => {
    it("should set error and remove placeholder on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce(createErrorResponse(500, "Internal Server Error"));

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("Hi");
      });

      await waitFor(() => {
        expect(result.current.error).toBe("Chat request failed: Internal Server Error");
      });

      // Placeholder should be removed, only user message remains
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].role).toBe("user");
      expect(result.current.isStreaming).toBe(false);
    });

    it("should set error when response has no body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: null,
        text: () => Promise.resolve(""),
      } as unknown as Response);

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("Hi");
      });

      await waitFor(() => {
        expect(result.current.error).toBe("No response body received");
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.isStreaming).toBe(false);
    });

    it("should set error on network failure", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("Hi");
      });

      await waitFor(() => {
        expect(result.current.error).toBe("Failed to fetch");
      });

      // removeEmptyPlaceholder should remove the empty assistant message
      // user message stays, empty assistant placeholder is removed
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].role).toBe("user");
      expect(result.current.isStreaming).toBe(false);
    });

    it("should silently handle AbortError without setting error", async () => {
      const abortError = new DOMException("The operation was aborted", "AbortError");
      mockFetch.mockRejectedValueOnce(abortError);

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("Hi");
      });

      await waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });

    it("should set generic error for non-Error thrown values", async () => {
      mockFetch.mockRejectedValueOnce("string error");

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("Hi");
      });

      await waitFor(() => {
        expect(result.current.error).toBe("An unexpected error occurred");
      });
    });
  });

  describe("sendMessage guard conditions", () => {
    it("should not send while already streaming", async () => {
      // Create a stream that takes time to resolve
      // let: resolve function needs to be assigned from inside the Promise constructor
      let resolveStream!: () => void; // let: assigned inside Promise constructor
      const pendingResponse = new Promise<Response>((resolve) => {
        resolveStream = () => resolve(createStreamResponse(['data: {"type":"done"}']));
      });

      mockFetch.mockReturnValueOnce(pendingResponse);

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("First");
      });

      expect(result.current.isStreaming).toBe(true);

      // Try to send second message while streaming
      act(() => {
        result.current.sendMessage("Second");
      });

      // Only one fetch call should have been made
      expect(mockFetch).toHaveBeenCalledTimes(1);
      // Still only 2 messages (first user + placeholder)
      expect(result.current.messages).toHaveLength(2);

      // Clean up
      resolveStream();
      await waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
      });
    });
  });

  describe("budget_warning SSE handling", () => {
    it("should set budgetWarning state from budget_warning chunk", async () => {
      mockFetch.mockResolvedValueOnce(
        createStreamResponse([
          'data: {"type":"budget_warning","ratioUsed":0.85,"remaining":7500}',
          'data: {"type":"token","content":"Hello"}',
          'data: {"type":"done"}',
        ])
      );

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("Hi");
      });

      await waitFor(() => {
        expect(result.current.budgetWarning).toEqual({
          ratioUsed: 0.85,
          remaining: 7500,
        });
      });

      // Normal streaming should still complete
      expect(result.current.messages[1].content).toBe("Hello");
    });

    it("should have null budgetWarning in initial state", () => {
      const { result } = renderHook(() => useCopilotChat());

      expect(result.current.budgetWarning).toBeNull();
    });

    it("should clear budgetWarning on sendMessage", async () => {
      // First: trigger a budget warning
      mockFetch.mockResolvedValueOnce(
        createStreamResponse([
          'data: {"type":"budget_warning","ratioUsed":0.9,"remaining":5000}',
          'data: {"type":"done"}',
        ])
      );

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("First");
      });

      await waitFor(() => {
        expect(result.current.budgetWarning).not.toBeNull();
      });

      // Wait for cooldown to expire before sending second message
      await waitFor(
        () => {
          expect(result.current.isCooldown).toBe(false);
        },
        { timeout: 3000 }
      );

      // Second: send another message — budgetWarning should be cleared
      vi.spyOn(crypto, "randomUUID")
        .mockReturnValueOnce("user-msg-2" as ReturnType<typeof crypto.randomUUID>)
        .mockReturnValueOnce("assistant-msg-2" as ReturnType<typeof crypto.randomUUID>);

      mockFetch.mockResolvedValueOnce(createStreamResponse(['data: {"type":"done"}']));

      act(() => {
        result.current.sendMessage("Second");
      });

      // budgetWarning should be null immediately after sendMessage
      // (before the new stream arrives)
      expect(result.current.budgetWarning).toBeNull();
    });

    it("should clear budgetWarning on clearConversation", async () => {
      // Trigger a budget warning
      mockFetch.mockResolvedValueOnce(
        createStreamResponse([
          'data: {"type":"budget_warning","ratioUsed":0.95,"remaining":2500}',
          'data: {"type":"done"}',
        ])
      );

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("Hi");
      });

      await waitFor(() => {
        expect(result.current.budgetWarning).not.toBeNull();
      });

      act(() => {
        result.current.clearConversation();
      });

      expect(result.current.budgetWarning).toBeNull();
    });

    it("should include budgetWarning in return value", () => {
      const { result } = renderHook(() => useCopilotChat());

      // budgetWarning should exist as a property of the hook result
      expect(result.current).toHaveProperty("budgetWarning");
    });
  });

  describe("cooldown guard", () => {
    it("should have isCooldown as false initially", () => {
      const { result } = renderHook(() => useCopilotChat());

      expect(result.current.isCooldown).toBe(false);
    });

    it("should set isCooldown to true after sending a message", async () => {
      mockFetch.mockResolvedValueOnce(createStreamResponse(['data: {"type":"done"}']));

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("Hello");
      });

      expect(result.current.isCooldown).toBe(true);
    });

    it("should set isCooldown to false after 2 seconds", async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValueOnce(createStreamResponse(['data: {"type":"done"}']));

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("Hello");
      });

      expect(result.current.isCooldown).toBe(true);

      // Advance past the cooldown period (2000ms)
      act(() => {
        vi.advanceTimersByTime(2_000);
      });

      expect(result.current.isCooldown).toBe(false);

      vi.useRealTimers();
    });

    it("should silently ignore a second message sent during cooldown", async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValueOnce(createStreamResponse(['data: {"type":"done"}']));

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("First");
      });

      // Wait for stream to finish so isStreaming is false
      // (we need to flush the microtask queue for the stream to complete)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // Reset UUID mocks for potential second message
      vi.spyOn(crypto, "randomUUID")
        .mockReturnValueOnce("user-msg-2" as ReturnType<typeof crypto.randomUUID>)
        .mockReturnValueOnce("assistant-msg-2" as ReturnType<typeof crypto.randomUUID>);

      // Try to send second message while still in cooldown
      act(() => {
        result.current.sendMessage("Second");
      });

      // Only one fetch call should have been made
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Only the first message pair should exist
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].content).toBe("First");

      vi.useRealTimers();
    });

    it("should clear isCooldown on clearConversation", async () => {
      mockFetch.mockResolvedValueOnce(createStreamResponse(['data: {"type":"done"}']));

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("Hello");
      });

      expect(result.current.isCooldown).toBe(true);

      act(() => {
        result.current.clearConversation();
      });

      expect(result.current.isCooldown).toBe(false);
    });
  });

  describe("clearConversation", () => {
    it("should reset all state", async () => {
      mockFetch.mockResolvedValueOnce(
        createStreamResponse([
          'data: {"type":"conversation_created","conversationId":"conv-1"}',
          'data: {"type":"token","content":"Hello"}',
          'data: {"type":"done"}',
        ])
      );

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.sendMessage("Hi");
      });

      await waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
      });

      // Verify state is populated
      expect(result.current.messages.length).toBeGreaterThan(0);
      expect(result.current.conversationId).toBe("conv-1");

      // Clear
      act(() => {
        result.current.clearConversation();
      });

      expect(result.current.messages).toEqual([]);
      expect(result.current.conversationId).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.ragSources).toEqual([]);
    });
  });

  describe("loadConversation", () => {
    it("should fetch messages and set conversationId", async () => {
      const apiMessages = [
        {
          id: "msg-1",
          conversationId: "conv-99",
          role: "user",
          content: "Previous question",
          createdAt: "2026-03-01T00:00:00Z",
        },
        {
          id: "msg-2",
          conversationId: "conv-99",
          role: "assistant",
          content: "Previous answer",
          createdAt: "2026-03-01T00:00:01Z",
        },
      ];

      mockFetch.mockResolvedValueOnce(createJsonResponse(apiMessages));

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.loadConversation("conv-99");
      });

      // conversationId is set immediately (synchronously)
      expect(result.current.conversationId).toBe("conv-99");

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(2);
      });

      expect(result.current.messages[0]).toEqual({
        id: "msg-1",
        role: "user",
        content: "Previous question",
        createdAt: "2026-03-01T00:00:00Z",
      });
      expect(result.current.messages[1]).toEqual({
        id: "msg-2",
        role: "assistant",
        content: "Previous answer",
        createdAt: "2026-03-01T00:00:01Z",
      });
    });

    it("should fetch from correct URL", async () => {
      mockFetch.mockResolvedValueOnce(createJsonResponse([]));

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.loadConversation("conv-42");
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "https://api.test/api/v1/chat/conversations/conv-42/messages",
          expect.objectContaining({
            credentials: "include",
            headers: { "Content-Type": "application/json" },
          })
        );
      });
    });

    it("should filter out system messages", async () => {
      const apiMessages = [
        {
          id: "msg-sys",
          conversationId: "conv-1",
          role: "system",
          content: "You are a helpful assistant",
          createdAt: "2026-03-01T00:00:00Z",
        },
        {
          id: "msg-user",
          conversationId: "conv-1",
          role: "user",
          content: "Hello",
          createdAt: "2026-03-01T00:00:01Z",
        },
      ];

      mockFetch.mockResolvedValueOnce(createJsonResponse(apiMessages));

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.loadConversation("conv-1");
      });

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(1);
      });

      expect(result.current.messages[0].role).toBe("user");
    });

    it("should set error on API failure", async () => {
      mockFetch.mockResolvedValueOnce(createErrorResponse(500, "Server Error"));

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.loadConversation("conv-bad");
      });

      await waitFor(() => {
        expect(result.current.error).toBe("Failed to load conversation");
      });
    });

    it("should set error on network failure", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Network error"));

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.loadConversation("conv-net");
      });

      await waitFor(() => {
        expect(result.current.error).toBe("Failed to load conversation");
      });
    });

    it("should clear previous error and ragSources when loading", async () => {
      // First, cause an error
      mockFetch.mockResolvedValueOnce(createErrorResponse(500, "Error"));

      const { result } = renderHook(() => useCopilotChat());

      act(() => {
        result.current.loadConversation("conv-err");
      });

      await waitFor(() => {
        expect(result.current.error).toBe("Failed to load conversation");
      });

      // Now load a valid conversation
      mockFetch.mockResolvedValueOnce(createJsonResponse([]));

      act(() => {
        result.current.loadConversation("conv-good");
      });

      // Error should be cleared immediately
      expect(result.current.error).toBeNull();

      await waitFor(() => {
        expect(result.current.messages).toEqual([]);
      });
    });
  });
});

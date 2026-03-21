/**
 * Copilot Chat Hook
 *
 * Manages chat state and streaming for the Kenchi Copilot Drawer.
 * Uses plain useState for local UI state and the browser Fetch API
 * with ReadableStream for SSE parsing.
 *
 * Does NOT use TanStack Query — streaming SSE does not fit the
 * query/mutation model.
 */

import { useState, useCallback, useRef } from "react";
import { API_URL } from "@/lib/apiClient";
import { usePageContext } from "@/hooks/usePageContext";
import type {
  CopilotMessage,
  ChatRAGSource,
  ChatStreamChunk,
  ConversationMessageResponse,
  UseCopilotChatResult,
} from "./types.ts";

// ==================== Constants ====================

const COMPLETIONS_PATH = "/api/v1/chat/completions";
const MESSAGES_PATH_PREFIX = "/api/v1/chat/conversations";

// ==================== Helpers ====================

const generateId = (): string => crypto.randomUUID();

const createUserMessage = (text: string): CopilotMessage => ({
  id: generateId(),
  role: "user",
  content: text,
  createdAt: new Date().toISOString(),
});

const createAssistantPlaceholder = (): CopilotMessage => ({
  id: generateId(),
  role: "assistant",
  content: "",
  createdAt: new Date().toISOString(),
});

/**
 * Parse a single SSE data line into a ChatStreamChunk.
 * Returns null for non-data lines or parse failures.
 */
const parseSSELine = (line: string): ChatStreamChunk | null => {
  if (!line.startsWith("data: ")) {
    return null;
  }

  try {
    return JSON.parse(line.slice(6)) as ChatStreamChunk;
  } catch {
    return null;
  }
};

/**
 * Appends content to the last message in the array (immutably).
 * Used to build up the assistant response token by token.
 */
const appendToLastMessage = (
  messages: readonly CopilotMessage[],
  content: string
): readonly CopilotMessage[] => {
  const { length } = messages;
  if (length === 0) {
    return messages;
  }
  const lastMessage = messages[length - 1];
  return [
    ...messages.slice(0, length - 1),
    { ...lastMessage, content: lastMessage.content + content },
  ];
};

/** Safely extract error text from a failed Response. */
const extractErrorText = async (response: Response): Promise<string> => {
  try {
    return await response.text();
  } catch {
    return "Request failed";
  }
};

/** Check if a Response indicates success. */
const isResponseOk = (response: Response): boolean => {
  const { ok } = response;
  return ok;
};

/** Extract the readable body stream from a Response (null if absent). */
const getResponseBody = (response: Response): ReadableStream<Uint8Array> | null => {
  const { body } = response;
  return body;
};

/** Remove the last message if it's an empty assistant placeholder. */
const removeEmptyPlaceholder = (prev: readonly CopilotMessage[]): readonly CopilotMessage[] => {
  const { length } = prev;
  if (length === 0) {
    return prev;
  }
  const last = prev[length - 1];
  return last.role === "assistant" && last.content === "" ? prev.slice(0, length - 1) : prev;
};

/** Abort any in-flight request and clear the ref. */
const abortAndClear = (ref: React.MutableRefObject<AbortController | null>): void => {
  const existing = ref.current;
  if (existing) {
    existing.abort();
    // eslint-disable-next-line no-param-reassign
    ref.current = null;
  }
};

/**
 * Convert a conversation message response to a displayable CopilotMessage.
 * Returns an empty array for system messages (filtered out via flatMap).
 */
const toDisplayMessages = (msg: ConversationMessageResponse): readonly CopilotMessage[] => {
  const { id, role, content, createdAt } = msg;
  if (role !== "user" && role !== "assistant") {
    return [];
  }
  return [{ id, role, content, createdAt }];
};

// ==================== Hook ====================

export const useCopilotChat = (): UseCopilotChatResult => {
  const [messages, setMessages] = useState<readonly CopilotMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ragSources, setRagSources] = useState<readonly ChatRAGSource[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const pageContext = usePageContext();

  const sendMessage = useCallback(
    (text: string): void => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || isStreaming) {
        return;
      }

      setError(null);

      const userMessage = createUserMessage(trimmed);
      const assistantPlaceholder = createAssistantPlaceholder();

      setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
      setIsStreaming(true);

      // Cancel any previous in-flight stream
      abortAndClear(abortControllerRef);
      const controller = new AbortController();
      abortControllerRef.current = controller; // eslint-disable-line no-param-reassign

      const streamChat = async (): Promise<void> => {
        try {
          const response = await fetch(`${API_URL}${COMPLETIONS_PATH}`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: trimmed,
              pageContext,
              ...(conversationId !== null && { conversationId }),
            }),
            signal: controller.signal,
          });

          if (!isResponseOk(response)) {
            const errorText = await extractErrorText(response);
            setError(`Chat request failed: ${errorText}`);
            setMessages((prev) => prev.slice(0, prev.length - 1));
            setIsStreaming(false);
            return;
          }

          const body = getResponseBody(response);
          if (!body) {
            setError("No response body received");
            setMessages((prev) => prev.slice(0, prev.length - 1));
            setIsStreaming(false);
            return;
          }

          const reader = body.getReader();
          const decoder = new TextDecoder();
          // let: buffer accumulates partial SSE lines across read() calls
          let buffer = ""; // let: SSE line buffer for incomplete chunks

          // let: loop reads from stream until done
          let reading = true; // let: stream read loop control
          while (reading) {
            const { done, value } = await reader.read();
            if (done) {
              reading = false;
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const chunk = parseSSELine(line);
              if (!chunk) {
                continue;
              }

              if (chunk.type === "token") {
                setMessages((prev) => appendToLastMessage(prev, chunk.content));
              } else if (chunk.type === "conversation_created") {
                setConversationId(chunk.conversationId);
              } else if (chunk.type === "error") {
                setError(chunk.error);
              } else if (chunk.type === "rag_sources") {
                setRagSources(chunk.sources);
              } else if (chunk.type === "done") {
                // Stream complete — no action needed, cleanup below
              }
            }
          }
        } catch (thrown: unknown) {
          // AbortError is expected when the user navigates away or sends a new message
          const isAbort = thrown instanceof DOMException && thrown.name === "AbortError";
          if (isAbort) {
            return;
          }
          const errorMessage =
            thrown instanceof Error ? thrown.message : "An unexpected error occurred";
          setError(errorMessage);
          setMessages(removeEmptyPlaceholder);
        } finally {
          setIsStreaming(false);
          if (abortControllerRef.current === controller) {
            abortControllerRef.current = null; // eslint-disable-line no-param-reassign
          }
        }
      };

      void streamChat();
    },
    [isStreaming, pageContext, conversationId]
  );

  const clearConversation = useCallback((): void => {
    abortAndClear(abortControllerRef);
    setMessages([]);
    setConversationId(null);
    setError(null);
    setIsStreaming(false);
    setRagSources([]);
  }, []);

  const loadConversation = useCallback((id: string): void => {
    abortAndClear(abortControllerRef);

    setConversationId(id);
    setError(null);
    setIsStreaming(false);
    setRagSources([]);

    const fetchMessages = async (): Promise<void> => {
      try {
        const response = await fetch(`${API_URL}${MESSAGES_PATH_PREFIX}/${id}/messages`, {
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });

        if (!isResponseOk(response)) {
          setError("Failed to load conversation");
          return;
        }

        const json = (await response.json()) as {
          readonly data: readonly ConversationMessageResponse[];
        };

        const loaded = json.data.flatMap(toDisplayMessages);
        setMessages(loaded);
      } catch {
        setError("Failed to load conversation");
      }
    };

    void fetchMessages();
  }, []);

  return {
    messages,
    isStreaming,
    conversationId,
    error,
    ragSources,
    sendMessage,
    clearConversation,
    loadConversation,
  };
};

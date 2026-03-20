/**
 * Chat LLM Adapter
 *
 * Adapter for streaming LLM completions in the Kenchi Copilot Drawer.
 * Wraps the OpenAI-compatible SDK client with timeout, structured logging,
 * and error classification per CLAUDE.md adapter requirements.
 *
 * @module adapters/chatLLMAdapter
 */

import {
  getLLMSDKClient,
  createLogger,
  getErrorMessage,
  ExternalServiceError,
  type ChatLLMPort,
  type ChatLLMStreamDelta,
  type ChatLLMMessage,
  type RequestContext,
} from "@kenchi/shared";

/** Timeout for the initial streaming connection (ms). */
const STREAM_CONNECT_TIMEOUT_MS = 30_000;

const PROVIDER = "llm" as const;
const OPERATION = "streamChatCompletion" as const;

/**
 * Creates a ChatLLMPort adapter backed by the OpenAI-compatible SDK client.
 * Includes timeout, structured logging, and error classification.
 */
export const createChatLLMAdapter = (): ChatLLMPort => ({
  async *createStreamingCompletion(
    messages: readonly ChatLLMMessage[],
    model: string,
    context: RequestContext
  ): AsyncGenerator<ChatLLMStreamDelta> {
    const logger = createLogger("chat-llm-adapter");
    const startTime = Date.now();

    try {
      const client = getLLMSDKClient();

      const streamPromise = client.chat.completions.create({
        model,
        messages: messages.map(({ role, content }) => ({ role, content })),
        stream: true,
      });

      // Hard timeout on initial connection via Promise.race
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        const id = setTimeout(() => {
          clearTimeout(id);
          reject(new Error("Chat LLM stream connection timed out"));
        }, STREAM_CONNECT_TIMEOUT_MS);
      });

      const stream = await Promise.race([streamPromise, timeoutPromise]);

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta) {
          yield {
            content: delta.content ?? null,
            finishReason: chunk.choices[0]?.finish_reason ?? null,
          };
        }
      }

      const durationMs = Date.now() - startTime;
      logger.info("Chat LLM stream completed", {
        provider: PROVIDER,
        operation: OPERATION,
        durationMs,
        model,
        ...context,
      });
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMsg = getErrorMessage(error);

      // Classify retryable vs non-retryable
      const isTimeout = errorMsg.includes("timed out");
      const retryable = isTimeout;

      logger.error("Chat LLM stream failed", {
        provider: PROVIDER,
        operation: OPERATION,
        durationMs,
        model,
        category: retryable ? "retryable" : "non_retryable",
        retryable,
        ...context,
      });

      throw new ExternalServiceError(PROVIDER, `Chat LLM streaming failed: ${errorMsg}`, {
        metadata: { operation: OPERATION, model },
        retryable,
      });
    }
  },
});

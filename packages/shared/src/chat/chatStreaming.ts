/**
 * Chat Streaming
 *
 * Pure token collector and top-level orchestrator.
 * collectStreamTokens: yields token chunks, returns collected content.
 * streamCompletion: sequences prepare → stream → finalize.
 *
 * @module chat/chatStreaming
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage, isAppError } from "../core/errors.js";
import { CHAT_DEFAULTS } from "../constants/api.js";
import { resolveLLMModel } from "../llm/providers/llmProvider/clientFactory.js";
import type { RequestContext } from "../core/types.js";
import type {
  ChatCompletionInput,
  ChatStreamChunk,
  ChatLLMPort,
  ChatLLMMessage,
  ChatServiceDeps,
  StreamResult,
} from "./types.js";
import { prepareCompletion } from "./chatPrepare.js";
import { finalizeCompletion } from "./chatFinalize.js";

const logger = createLogger("chat-streaming");

/**
 * Streams LLM tokens, yielding each as a ChatStreamChunk.
 * Returns the collected content and duration via generator return.
 * Pure — no persistence, no side effects.
 */
export const collectStreamTokens = async function* (
  llmPort: ChatLLMPort,
  messages: readonly ChatLLMMessage[],
  context: RequestContext
): AsyncGenerator<ChatStreamChunk, StreamResult> {
  const startTime = Date.now();
  let content = ""; // let: accumulated during async streaming iteration
  const chatModel = resolveLLMModel();

  const stream = llmPort.createStreamingCompletion(messages, chatModel, context, {
    maxTokens: CHAT_DEFAULTS.MAX_RESPONSE_TOKENS,
  });

  for await (const delta of stream) {
    if (delta.content) {
      content += delta.content;
      yield { type: "token", content: delta.content };
    }
  }

  return { content, durationMs: Date.now() - startTime };
};

/**
 * Streams a chat completion end-to-end.
 * Three phases: prepare → stream tokens → finalize.
 */
export const streamCompletion = async function* (
  deps: ChatServiceDeps,
  input: ChatCompletionInput,
  context: RequestContext
): AsyncGenerator<ChatStreamChunk> {
  // let: may be reassigned after conversation creation for error-logging scope
  let { conversationId } = input; // let: needed in catch block after creation

  try {
    // Emit investigation_started early so frontend can show skeleton loading card.
    const shouldInvestigate =
      input.pageContext.pageType === "incident" &&
      input.pageContext.entityId &&
      deps.contextPort?.investigateIncident;

    if (shouldInvestigate) {
      yield { type: "investigation_started" };
    }

    // Phase 1: Prepare (conversation, budget, history, pipeline)
    const prepared = await prepareCompletion(
      deps.chatRepository,
      deps.budgetPort,
      deps.contextPort,
      input,
      context
    );
    if (!prepared.ok) {
      yield { type: "error", error: prepared.error };
      return;
    }

    const { state } = prepared;
    conversationId = state.conversationId;

    // Emit pre-stream chunks (conversation_created, budget_warning, rag_sources)
    for (const chunk of state.preStreamChunks) {
      yield chunk;
    }

    // Phase 2: Stream LLM tokens
    const { content, durationMs } = yield* collectStreamTokens(
      deps.llmPort,
      state.pipeline.messages,
      context
    );

    logger.info("Chat LLM streaming completed", {
      provider: "llm",
      operation: "streamChatCompletion",
      durationMs,
      responseLength: content.length,
      ...state.pipeline.logMetadata,
      ...context,
    });

    // Phase 3: Finalize (persist, budget, trim)
    await finalizeCompletion(
      {
        chatRepository: deps.chatRepository,
        budgetPort: deps.budgetPort,
        conversationId,
        tenantId: input.tenantId,
        planTier: input.planTier,
        content,
        ragContextUsed: state.pipeline.ragContextUsed,
        userTokenCount: state.userTokenCount,
      },
      context
    );

    yield { type: "done" };
  } catch (error: unknown) {
    if (!isAppError(error)) {
      logger.error("Chat stream completion failed", {
        provider: "llm",
        operation: "streamChatCompletion",
        conversationId,
        error: getErrorMessage(error),
        ...context,
      });
    }

    yield {
      type: "error",
      error: "An error occurred while generating a response. Please try again.",
    };
  }
};

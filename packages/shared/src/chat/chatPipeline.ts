/**
 * Chat Completion Pipeline
 *
 * Builds the LLM message pipeline for chat completions.
 * Handles two paths: off-topic messages get a minimal prompt,
 * on-topic messages get full page context + RAG enrichment.
 *
 * @module chat/chatPipeline
 */

import { createLogger } from "../core/logger.js";
import { CHAT_DEFAULTS } from "../constants/api.js";
import type { RequestContext } from "../core/types.js";
import type { ChatCompletionInput, ChatContextPort, CompletionPipeline } from "./types.js";
import {
  classifyMessageTopic,
  buildSystemPrompt,
  extractRAGSources,
  buildLLMMessages,
  trimMessagesToFit,
} from "./helpers.js";
import { fetchPageContext, fetchRAGContext } from "./chatContext.js";

const logger = createLogger("chat-pipeline");

/**
 * Builds a minimal pipeline for off-topic messages.
 * No RAG search or page context — just the base system prompt.
 */
const buildMinimalPipeline = (
  conversationId: string,
  userMessage: string,
  offTopicCategory: string
): CompletionPipeline => ({
  messages: [
    { role: "system", content: buildSystemPrompt(null, null) },
    { role: "user", content: userMessage },
  ],
  ragSources: [],
  ragContextUsed: false,
  logMetadata: { conversationId, offTopicCategory },
});

/**
 * Builds the full pipeline: page context + RAG search + history + trimming.
 */
const buildFullPipeline = async (
  contextPort: ChatContextPort | undefined,
  conversationId: string,
  input: ChatCompletionInput,
  history: ReadonlyArray<{ readonly role: string; readonly content: string }>,
  context: RequestContext
): Promise<CompletionPipeline> => {
  // Fetch page context + initial RAG in parallel (both fail-safe)
  const [pageContextData, initialRag] = await Promise.all([
    fetchPageContext(contextPort, input.pageContext, input.tenantId, context),
    fetchRAGContext(contextPort, input.userMessage, null, input.tenantId, context),
  ]);

  // Re-run RAG with enriched query if page context was found
  const ragResult = pageContextData
    ? await fetchRAGContext(
        contextPort,
        input.userMessage,
        pageContextData,
        input.tenantId,
        context
      )
    : initialRag;

  const ragSources = extractRAGSources(ragResult);
  const systemPrompt = buildSystemPrompt(pageContextData, ragResult);
  const rawMessages = buildLLMMessages(systemPrompt, history, input.userMessage);
  const messages = trimMessagesToFit(rawMessages, CHAT_DEFAULTS.MAX_CONTEXT_TOKENS);

  return {
    messages,
    ragSources,
    ragContextUsed: ragSources.length > 0 || pageContextData !== null,
    logMetadata: {
      conversationId,
      hasPageContext: pageContextData !== null,
      ragSourceCount: ragSources.length,
    },
  };
};

/**
 * Builds the completion pipeline for a chat message.
 * Off-topic messages get a minimal prompt; on-topic messages get the full
 * page context + RAG enrichment pipeline.
 */
export const buildCompletionPipeline = async (
  contextPort: ChatContextPort | undefined,
  conversationId: string,
  input: ChatCompletionInput,
  history: ReadonlyArray<{ readonly role: string; readonly content: string }>,
  context: RequestContext
): Promise<CompletionPipeline> => {
  const offTopicCategory = classifyMessageTopic(input.userMessage);

  if (offTopicCategory !== null) {
    logger.info("Off-topic message — skipping RAG and context fetch", {
      conversationId,
      category: offTopicCategory,
      ...context,
    });

    return buildMinimalPipeline(conversationId, input.userMessage, offTopicCategory);
  }

  return buildFullPipeline(contextPort, conversationId, input, history, context);
};

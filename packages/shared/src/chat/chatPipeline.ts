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
import { fetchPageContext, fetchRAGContext, fetchInvestigationContext } from "./chatContext.js";

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
  // Fetch page context + investigation in parallel (all fail-safe)
  const [pageContextData, investigationResult] = await Promise.all([
    fetchPageContext(contextPort, input.pageContext, input.tenantId, context),
    fetchInvestigationContext(contextPort, input, context),
  ]);

  // Fetch RAG after page context resolves so it can enrich the query
  const ragResult = await fetchRAGContext(
    contextPort,
    input.userMessage,
    pageContextData,
    input.tenantId,
    context
  );

  const ragSources = extractRAGSources(ragResult);
  const systemPrompt = buildSystemPrompt(pageContextData, ragResult, investigationResult);
  const rawMessages = buildLLMMessages(systemPrompt, history, input.userMessage);
  const messages = trimMessagesToFit(rawMessages, CHAT_DEFAULTS.MAX_CONTEXT_TOKENS);

  return {
    messages,
    ragSources,
    ragContextUsed: ragSources.length > 0 || pageContextData !== null,
    investigationResult,
    logMetadata: {
      conversationId,
      hasPageContext: pageContextData !== null,
      ragSourceCount: ragSources.length,
      hasInvestigation: investigationResult?.success ?? false,
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

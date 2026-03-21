/**
 * Chat Service
 *
 * Core business logic for the Kenchi Copilot Drawer chat feature.
 * Orchestrates conversation management, LLM streaming, message persistence,
 * context injection, RAG search, and token management.
 *
 * No vendor SDK imports — the LLM client is injected via ChatLLMPort.
 *
 * @module chat/chatService
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import { config } from "../core/config.js";
import { CHAT_DEFAULTS } from "../constants/api.js";
import { LLM_DEFAULTS, OPENROUTER_DEFAULTS } from "../constants/index.js";
import { isOpenRouterProvider } from "../llm/providers/llmProvider/clientFactory.js";
import type { RequestContext } from "../core/types.js";
import type {
  ChatCompletionInput,
  ChatStreamChunk,
  ChatLLMPort,
  ChatRepositoryPort,
  ChatContextPort,
  ChatPageContext,
  ChatContextData,
  ChatRAGResult,
} from "./types.js";
import {
  estimateTokens,
  buildSystemPrompt,
  extractRAGSources,
  buildLLMMessages,
  trimMessagesToFit,
  deriveTitle,
} from "./helpers.js";

// ==================== Constants ====================

/**
 * Resolves the LLM model for chat, using the same config chain as the main LLM client.
 */
const resolveChatModel = (): string =>
  config.LLM_MODEL ||
  config.OPENAI_MODEL ||
  (isOpenRouterProvider() ? OPENROUTER_DEFAULTS.MODEL : LLM_DEFAULTS.MODEL);

// ==================== Service Dependencies ====================

/** Dependencies injected into the chat service factory. */
export interface ChatServiceDeps {
  readonly chatRepository: ChatRepositoryPort;
  readonly llmPort: ChatLLMPort;
  readonly contextPort?: ChatContextPort;
}

// ==================== Context Fetching (fail-safe) ====================

/**
 * Fetches page context data based on the page context.
 * Returns null on any error — never blocks the chat flow.
 */
const fetchPageContext = async (
  contextPort: ChatContextPort | undefined,
  pageContext: ChatPageContext,
  tenantId: string,
  logger: ReturnType<typeof createLogger>,
  context: RequestContext
): Promise<ChatContextData | null> => {
  if (!contextPort || !pageContext.entityId) {
    return null;
  }

  try {
    const { pageType, entityId } = pageContext;
    if (pageType === "analysis") {
      return await contextPort.getAnalysisContext(entityId, tenantId, context);
    }
    if (pageType === "incident") {
      return await contextPort.getIncidentContext(entityId, tenantId, context);
    }
    return null;
  } catch (error: unknown) {
    logger.warn("Failed to fetch page context for chat — proceeding without it", {
      pageType: pageContext.pageType,
      error: getErrorMessage(error),
      ...context,
    });
    return null;
  }
};

/**
 * Performs RAG search based on the user message and optional entity context.
 * Returns null on any error — never blocks the chat flow.
 */
const fetchRAGContext = async (
  contextPort: ChatContextPort | undefined,
  userMessage: string,
  pageContextData: ChatContextData | null,
  tenantId: string,
  logger: ReturnType<typeof createLogger>,
  context: RequestContext
): Promise<ChatRAGResult | null> => {
  if (!contextPort) {
    return null;
  }

  try {
    const contextSuffix = pageContextData
      ? ` ${pageContextData.title}${pageContextData.summary ? ` ${pageContextData.summary}` : ""}`
      : "";
    const queryText = userMessage + contextSuffix;
    return await contextPort.searchRAG(queryText, tenantId, context);
  } catch (error: unknown) {
    logger.warn("RAG search failed for chat — proceeding without context", {
      error: getErrorMessage(error),
      ...context,
    });
    return null;
  }
};

// ==================== Service Factory ====================

/**
 * Creates the chat service with injected dependencies.
 */
export const createChatService = (deps: ChatServiceDeps) => {
  const { chatRepository, llmPort, contextPort } = deps;

  /**
   * Trims conversation history if token count exceeds budget.
   */
  const trimConversationIfNeeded = async (
    conversationId: string,
    context: RequestContext
  ): Promise<void> => {
    const totalTokens = await chatRepository.getConversationTokenCount(conversationId);

    if (totalTokens <= CHAT_DEFAULTS.MAX_CONTEXT_TOKENS) {
      return;
    }

    const logger = createLogger("chat-service");
    logger.info("Trimming conversation history — token budget exceeded", {
      conversationId,
      totalTokens,
      maxTokens: CHAT_DEFAULTS.MAX_CONTEXT_TOKENS,
      ...context,
    });

    await chatRepository.deleteOldestMessages(
      conversationId,
      CHAT_DEFAULTS.MAX_TRIM_BATCH,
      context
    );
  };

  /**
   * Streams a chat completion, yielding chunks as they arrive.
   *
   * Flow:
   * 1. Create conversation if needed (yields conversation_created chunk)
   * 2. Load history, save user message
   * 3. Fetch page context + RAG (parallel, fail-safe)
   * 4. Build context-enriched prompt, trim to budget
   * 5. Stream LLM response
   * 6. Save assistant message, trim if over budget
   * 7. Yield done
   */
  async function* streamCompletion(
    input: ChatCompletionInput,
    context: RequestContext
  ): AsyncGenerator<ChatStreamChunk> {
    const logger = createLogger("chat-service");

    // let: conversationId may be created mid-flow if not provided
    let { conversationId } = input; // let: optionally assigned when new conversation is created

    try {
      // Step 1: Create conversation if needed
      if (!conversationId) {
        const conversation = await chatRepository.createConversation(
          {
            tenantId: input.tenantId,
            userId: input.userId,
            title: deriveTitle(input.userMessage),
            pageContext: JSON.stringify(input.pageContext),
          },
          context
        );
        conversationId = conversation.id;

        yield { type: "conversation_created", conversationId };

        logger.info("Created new chat conversation", {
          conversationId,
          ...context,
        });
      }

      // Step 2: Load history BEFORE saving user message
      const history = await chatRepository.getMessagesByConversation(
        conversationId,
        CHAT_DEFAULTS.MAX_HISTORY_MESSAGES,
        context
      );

      // Save user message with estimated token count
      const userTokenCount = estimateTokens(input.userMessage);
      await chatRepository.createMessage(
        {
          conversationId,
          role: "user",
          content: input.userMessage,
          tokenCount: userTokenCount,
        },
        context
      );

      // Step 3: Fetch page context + initial RAG in parallel (both fail-safe)
      const [pageContextData, initialRag] = await Promise.all([
        fetchPageContext(contextPort, input.pageContext, input.tenantId, logger, context),
        fetchRAGContext(contextPort, input.userMessage, null, input.tenantId, logger, context),
      ]);

      // Re-run RAG with enriched query if page context was found
      const ragResult = pageContextData
        ? await fetchRAGContext(
            contextPort,
            input.userMessage,
            pageContextData,
            input.tenantId,
            logger,
            context
          )
        : initialRag;

      // Step 4: Emit RAG sources if found
      const ragSources = extractRAGSources(ragResult);
      if (ragSources.length > 0) {
        yield { type: "rag_sources", sources: ragSources };
      }

      // Step 5: Build prompt, trim to budget
      const systemPrompt = buildSystemPrompt(pageContextData, ragResult);
      const rawMessages = buildLLMMessages(systemPrompt, history, input.userMessage);
      const llmMessages = trimMessagesToFit(rawMessages, CHAT_DEFAULTS.MAX_CONTEXT_TOKENS);

      // Step 6: Stream LLM response
      const startTime = Date.now();
      const contentParts: string[] = []; // Mutable array for O(1) append during streaming

      const chatModel = resolveChatModel();
      const stream = llmPort.createStreamingCompletion(llmMessages, chatModel, context);

      for await (const delta of stream) {
        if (delta.content) {
          contentParts.push(delta.content);
          yield { type: "token", content: delta.content };
        }
      }

      const durationMs = Date.now() - startTime;
      const fullContent = contentParts.join("");

      logger.info("Chat LLM streaming completed", {
        provider: "llm",
        operation: "streamChatCompletion",
        durationMs,
        conversationId,
        responseLength: fullContent.length,
        hasPageContext: pageContextData !== null,
        ragSourceCount: ragSources.length,
        ...context,
      });

      // Step 7: Save assistant message with token count
      const assistantTokenCount = estimateTokens(fullContent);
      const ragContextUsed = ragSources.length > 0 || pageContextData !== null;
      await chatRepository.createMessage(
        {
          conversationId,
          role: "assistant",
          content: fullContent,
          tokenCount: assistantTokenCount,
          ragContextUsed,
        },
        context
      );

      // Step 8: Trim conversation if over budget
      try {
        await trimConversationIfNeeded(conversationId, context);
      } catch (trimError: unknown) {
        logger.warn("Failed to trim conversation — will retry next message", {
          conversationId,
          error: getErrorMessage(trimError),
          ...context,
        });
      }

      yield { type: "done" };
    } catch (error: unknown) {
      logger.error("Chat stream completion failed", {
        provider: "llm",
        operation: "streamChatCompletion",
        conversationId,
        error: getErrorMessage(error),
        ...context,
      });

      yield {
        type: "error",
        error: "An error occurred while generating a response. Please try again.",
      };
    }
  }

  return {
    streamCompletion,

    listConversations: async (
      tenantId: string,
      userId: string,
      limit: number,
      context: RequestContext
    ) => chatRepository.findConversationsByUser(tenantId, userId, limit, context),

    getConversation: async (conversationId: string, tenantId: string, context: RequestContext) =>
      chatRepository.findConversationById(conversationId, tenantId, context),

    getMessages: async (conversationId: string, limit: number, context: RequestContext) =>
      chatRepository.getMessagesByConversation(conversationId, limit, context),

    deleteConversation: async (conversationId: string, tenantId: string, context: RequestContext) =>
      chatRepository.deleteConversation(conversationId, tenantId, context),

    updateConversationTitle: async (
      conversationId: string,
      tenantId: string,
      title: string,
      context: RequestContext
    ) => chatRepository.updateConversationTitle(conversationId, tenantId, title, context),
  };
};

/** Return type of createChatService for external typing. */
export type ChatService = ReturnType<typeof createChatService>;

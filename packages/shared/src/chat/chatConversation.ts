/**
 * Chat Conversation Management
 *
 * Standalone functions for conversation lifecycle: creation with limit enforcement,
 * history loading with message limit validation, and token-budget trimming.
 *
 * @module chat/chatConversation
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import { CHAT_DEFAULTS } from "../constants/api.js";
import type { RequestContext } from "../core/types.js";
import type {
  ChatCompletionInput,
  ChatRepositoryPort,
  EnsureConversationResult,
  LoadHistoryResult,
} from "./types.js";
import { estimateTokens, deriveTitle } from "./helpers.js";

// ==================== Message Persistence ====================

const logger = createLogger("chat-conversation");

/**
 * Ensures a conversation exists. Creates one if no conversationId is provided,
 * enforcing the per-user conversation limit.
 *
 * @returns Ok with conversationId and isNew flag, or error message if limit exceeded.
 */
export const ensureConversation = async (
  chatRepository: ChatRepositoryPort,
  input: ChatCompletionInput,
  context: RequestContext
): Promise<EnsureConversationResult> => {
  if (input.conversationId) {
    return { ok: true, conversationId: input.conversationId, isNew: false };
  }

  const count = await chatRepository.countConversationsByUser(
    input.tenantId,
    input.userId,
    context
  );

  if (count >= CHAT_DEFAULTS.MAX_CONVERSATIONS_PER_USER) {
    return {
      ok: false,
      error:
        "You have reached the maximum number of conversations. Please delete an old conversation to start a new one.",
    };
  }

  const conversation = await chatRepository.createConversation(
    {
      tenantId: input.tenantId,
      userId: input.userId,
      title: deriveTitle(input.userMessage),
      pageContext: JSON.stringify(input.pageContext),
    },
    context
  );

  logger.info("Created new chat conversation", {
    conversationId: conversation.id,
    ...context,
  });

  return { ok: true, conversationId: conversation.id, isNew: true };
};

/**
 * Loads conversation history, validates message limits, and persists the user message.
 *
 * @returns Ok with history and userTokenCount, or error message if limit exceeded.
 */
export const loadHistoryAndSaveUserMessage = async (
  chatRepository: ChatRepositoryPort,
  conversationId: string,
  tenantId: string,
  userMessage: string,
  context: RequestContext
): Promise<LoadHistoryResult> => {
  const history = await chatRepository.getMessagesByConversation(
    conversationId,
    CHAT_DEFAULTS.MAX_HISTORY_MESSAGES,
    context
  );

  const messageCount = await chatRepository.countMessagesByConversation(conversationId, context);

  if (messageCount >= CHAT_DEFAULTS.MAX_MESSAGES_PER_CONVERSATION) {
    return {
      ok: false,
      error:
        "This conversation has reached the maximum message limit. Please start a new conversation.",
    };
  }

  const userTokenCount = estimateTokens(userMessage);
  await chatRepository.createMessage(
    {
      conversationId,
      tenantId,
      role: "user",
      content: userMessage,
      tokenCount: userTokenCount,
    },
    context
  );

  return { ok: true, history, userTokenCount };
};

/**
 * Persists the assistant's response message with token count.
 *
 * @returns The estimated token count for the assistant message.
 */
export const persistAssistantMessage = async (
  chatRepository: ChatRepositoryPort,
  conversationId: string,
  tenantId: string,
  content: string,
  ragContextUsed: boolean,
  context: RequestContext
): Promise<number> => {
  const tokenCount = estimateTokens(content);
  await chatRepository.createMessage(
    {
      conversationId,
      tenantId,
      role: "assistant",
      content,
      tokenCount,
      ragContextUsed,
    },
    context
  );
  return tokenCount;
};

/**
 * Trims oldest messages from conversation if token count exceeds budget.
 * Fail-safe — logs and swallows errors.
 */
export const trimConversationSafe = async (
  chatRepository: ChatRepositoryPort,
  conversationId: string,
  context: RequestContext
): Promise<void> => {
  try {
    const totalTokens = await chatRepository.getConversationTokenCount(conversationId, context);

    if (totalTokens <= CHAT_DEFAULTS.MAX_CONTEXT_TOKENS) {
      return;
    }

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
  } catch (error: unknown) {
    logger.warn("Failed to trim conversation — will retry next message", {
      conversationId,
      error: getErrorMessage(error),
      ...context,
    });
  }
};

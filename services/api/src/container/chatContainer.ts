/**
 * Chat Composition Root
 *
 * Wires the chat service with its dependencies: LLM adapter, context adapter,
 * budget port, and repository port. Returns a container with the fully
 * assembled chat subsystem.
 *
 * @module container/chatContainer
 */

import {
  createChatService,
  checkChatBudget,
  incrementChatTokenUsage,
  createConversation,
  createMessage,
  getMessagesByConversation,
  getConversationTokenCount,
  deleteOldestMessages,
  findConversationsByUser,
  findConversationById,
  deleteConversation,
  updateConversationTitle,
  countConversationsByUser,
  countMessagesByConversation,
  type ChatRepositoryPort,
  type ChatService,
} from "@kenchi/shared";
import { createChatLLMAdapter } from "../adapters/chatLLMAdapter.js";
import { createChatContextAdapter } from "../adapters/chatContextAdapter.js";

// ==================== Repository Port Adapter ====================

/**
 * Wraps the standalone repository functions into the ChatRepositoryPort interface.
 * This adapter bridges the concrete repository exports to the port abstraction.
 */
const chatRepositoryAdapter: ChatRepositoryPort = {
  createConversation: async (input, context) => createConversation(input, context),
  createMessage: async (input, context) => createMessage(input, context),
  getMessagesByConversation: async (conversationId, limit, context) =>
    getMessagesByConversation(conversationId, limit, context),
  findConversationsByUser: async (tenantId, userId, limit, context) =>
    findConversationsByUser(tenantId, userId, limit, context),
  findConversationById: async (id, tenantId, context) =>
    findConversationById(id, tenantId, context),
  deleteConversation: async (id, tenantId, context) => deleteConversation(id, tenantId, context),
  updateConversationTitle: async (id, tenantId, title, context) =>
    updateConversationTitle(id, tenantId, title, context),
  getConversationTokenCount: async (conversationId, context) =>
    getConversationTokenCount(conversationId, context),
  deleteOldestMessages: async (conversationId, count, context) =>
    deleteOldestMessages(conversationId, count, context),
  countConversationsByUser: async (tenantId, userId, context) =>
    countConversationsByUser(tenantId, userId, context),
  countMessagesByConversation: async (conversationId, context) =>
    countMessagesByConversation(conversationId, context),
};

// ==================== Container Type ====================

/** Chat subsystem container. */
export interface ChatContainer {
  readonly chatService: ChatService;
}

// ==================== Factory ====================

// Lazy-init to avoid crashing the API service on startup if LLM config is missing
// let: singleton initialized on first use
let chatContainerInstance: ChatContainer | null = null; // let: lazy singleton

/**
 * Returns the chat container, creating it on first call (lazy singleton).
 * Lazy initialization avoids startup crashes when LLM config is missing.
 */
export const getChatContainer = (): ChatContainer => {
  if (!chatContainerInstance) {
    chatContainerInstance = createChatContainer();
  }
  return chatContainerInstance;
};

/**
 * Creates the chat container with all dependencies wired.
 */
const createChatContainer = (): ChatContainer => {
  const chatService = createChatService({
    chatRepository: chatRepositoryAdapter,
    llmPort: createChatLLMAdapter(),
    contextPort: createChatContextAdapter(),
    budgetPort: {
      checkBudget: checkChatBudget,
      incrementUsage: incrementChatTokenUsage,
    },
  });

  return { chatService };
};

/**
 * Chat Service Factory
 *
 * Pure binding layer — wires injected dependencies to standalone functions.
 * All business logic lives in focused modules:
 *   chatStreaming.ts    — streamCompletion orchestration
 *   chatConversation.ts — conversation lifecycle
 *   chatPipeline.ts     — LLM message building
 *   chatBudgetGuard.ts  — budget checking/tracking
 *   chatContext.ts       — page context + RAG fetching
 *
 * @module chat/chatService
 */

import { AuthorizationError, NotFoundError } from "../core/errors.js";
import type { RequestContext } from "../core/types.js";
import type { ChatCompletionInput, ChatServiceDeps, ChatService } from "./types.js";
import { streamCompletion } from "./chatStreaming.js";

/**
 * Creates the chat service by binding dependencies to standalone functions.
 */
export const createChatService = (deps: ChatServiceDeps): ChatService => ({
  streamCompletion: (input: ChatCompletionInput, context: RequestContext) =>
    streamCompletion(deps, input, context),

  listConversations: (tenantId: string, userId: string, limit: number, context: RequestContext) =>
    deps.chatRepository.findConversationsByUser(tenantId, userId, limit, context),

  getConversation: (conversationId: string, tenantId: string, context: RequestContext) =>
    deps.chatRepository.findConversationById(conversationId, tenantId, context),

  getMessages: async (
    conversationId: string,
    tenantId: string,
    userId: string,
    limit: number,
    context: RequestContext
  ) => {
    const conversation = await deps.chatRepository.findConversationById(
      conversationId,
      tenantId,
      context
    );
    if (!conversation) {
      throw new NotFoundError("Conversation not found", {
        metadata: { conversationId },
      });
    }
    if (conversation.userId !== userId) {
      throw new AuthorizationError("You do not have access to this conversation", {
        operation: "getMessages",
      });
    }
    return deps.chatRepository.getMessagesByConversation(conversationId, limit, context);
  },

  deleteConversation: (conversationId: string, tenantId: string, context: RequestContext) =>
    deps.chatRepository.deleteConversation(conversationId, tenantId, context),

  updateConversationTitle: (
    conversationId: string,
    tenantId: string,
    title: string,
    context: RequestContext
  ) => deps.chatRepository.updateConversationTitle(conversationId, tenantId, title, context),
});

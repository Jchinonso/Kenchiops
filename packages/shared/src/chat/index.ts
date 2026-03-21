/**
 * Chat Module
 *
 * Types and utilities for the Kenchi Copilot Drawer chat feature.
 *
 * @module chat
 */

export type {
  ChatCompletionInput,
  ChatPageContext,
  ChatPageType,
  ChatStreamChunkType,
  ChatStreamChunk,
  ChatRAGSource,
  ChatLLMStreamDelta,
  ChatLLMPort,
  ChatLLMMessage,
  ChatContextPort,
  ChatContextData,
  ChatRAGResult,
  ChatRepositoryPort,
  ChatConversationSummary,
  CreateConversationPortInput,
  CreateMessagePortInput,
} from "./types.js";

export { createChatService, type ChatService, type ChatServiceDeps } from "./chatService.js";

export {
  estimateTokens as estimateChatTokens,
  buildSystemPrompt as buildChatSystemPrompt,
  buildLLMMessages as buildChatLLMMessages,
  trimMessagesToFit as trimChatMessagesToFit,
  deriveTitle as deriveChatTitle,
} from "./helpers.js";

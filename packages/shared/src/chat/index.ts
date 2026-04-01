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
  ChatLLMOptions,
  ChatLLMPort,
  ChatLLMMessage,
  ChatContextPort,
  ChatContextData,
  ChatRAGResult,
  ChatRepositoryPort,
  ChatConversationSummary,
  CreateConversationPortInput,
  CreateMessagePortInput,
  ChatBudgetStatus,
  ChatBudgetPort,
  ChatServiceDeps,
  CompletionPipeline,
  EnsureConversationResult,
  BudgetGuardResult,
  LoadHistoryResult,
  StreamResult,
  PreparedCompletion,
  PrepareCompletionResult,
  FinalizeCompletionInput,
} from "./types.js";

export type {
  ChatService,
  ChatTokenUsageRepositoryPort,
  ChatInvestigationResult,
  ChatInvestigationDiagnosis,
} from "./types.js";

export { createChatService } from "./chatService.js";

export { fetchPageContext, fetchRAGContext, fetchInvestigationContext } from "./chatContext.js";

export {
  ensureConversation,
  loadHistoryAndSaveUserMessage,
  persistAssistantMessage,
  trimConversationSafe,
} from "./chatConversation.js";

export { streamCompletion as streamChatCompletion, collectStreamTokens } from "./chatStreaming.js";

export { prepareCompletion } from "./chatPrepare.js";

export { finalizeCompletion } from "./chatFinalize.js";

export { buildCompletionPipeline } from "./chatPipeline.js";

export { checkBudgetGuard, incrementBudgetSafe } from "./chatBudgetGuard.js";

export {
  estimateTokens as estimateChatTokens,
  buildSystemPrompt as buildChatSystemPrompt,
  formatInvestigationSection as formatChatInvestigationSection,
  buildLLMMessages as buildChatLLMMessages,
  trimMessagesToFit as trimChatMessagesToFit,
  deriveTitle as deriveChatTitle,
  classifyMessageTopic as classifyChatMessageTopic,
} from "./helpers.js";

export {
  createChatBudgetFunctions,
  checkChatBudget,
  incrementChatTokenUsage,
} from "./chatBudget.js";

export { chatUserRateLimit } from "./chatRateLimit.js";

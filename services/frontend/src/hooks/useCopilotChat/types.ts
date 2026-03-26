/**
 * Copilot Chat Types
 *
 * Type definitions for the useCopilotChat hook and related components.
 */

// ==================== Message Types ====================

export interface CopilotMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly createdAt: string;
}

// ==================== Stream Chunk Types ====================

// SYNC: Mirrors ChatStreamChunk, ChatRAGSource, ChatPageContext from
// packages/shared/src/chat/types.ts — frontend Docker build context does not
// include the shared package, so these must be duplicated here. When changing
// the shape in shared, update this file to match.
export type ChatStreamChunk =
  | { readonly type: "token"; readonly content: string }
  | { readonly type: "done" }
  | { readonly type: "error"; readonly error: string }
  | { readonly type: "conversation_created"; readonly conversationId: string }
  | { readonly type: "rag_sources"; readonly sources: ReadonlyArray<ChatRAGSource> }
  | { readonly type: "budget_warning"; readonly ratioUsed: number; readonly remaining: number };

export interface ChatRAGSource {
  readonly title: string;
  readonly docType: string;
  readonly similarity: number;
}

// ==================== Page Context ====================

export interface ChatPageContext {
  readonly pageType: "analysis" | "incident" | "knowledge-base" | "overview" | "failures";
  readonly entityId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ==================== API Response Types ====================

export interface ConversationMessageResponse {
  readonly id: string;
  readonly conversationId: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
  readonly createdAt: string;
}

// ==================== Budget Warning ====================

export interface BudgetWarning {
  readonly ratioUsed: number;
  readonly remaining: number;
}

// ==================== Hook Return Type ====================

export interface UseCopilotChatResult {
  readonly messages: ReadonlyArray<CopilotMessage>;
  readonly isStreaming: boolean;
  readonly conversationId: string | null;
  readonly error: string | null;
  readonly ragSources: ReadonlyArray<ChatRAGSource>;
  readonly budgetWarning: BudgetWarning | null;
  readonly isCooldown: boolean;
  readonly sendMessage: (text: string) => void;
  readonly clearConversation: () => void;
  readonly loadConversation: (id: string) => void;
}

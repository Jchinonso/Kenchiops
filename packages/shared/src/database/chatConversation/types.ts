/**
 * Chat Conversation Types
 *
 * Type definitions for chat conversations and messages
 * used by the Kenchi Copilot Drawer.
 *
 * @module database/chatConversation/types
 */

// ==================== Database Row Types ====================

/**
 * Database row for chat_conversations table.
 */
export interface ChatConversationRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly user_id: string;
  readonly title: string | null;
  readonly page_context: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/**
 * Database row for chat_messages table.
 */
export interface ChatMessageRow {
  readonly id: string;
  readonly conversation_id: string;
  readonly role: string;
  readonly content: string;
  readonly token_count: number | null;
  readonly rag_context_used: boolean;
  readonly created_at: Date;
}

// ==================== Domain Types ====================

/** Valid message roles. */
export type ChatMessageRole = "user" | "assistant" | "system";

/**
 * Domain object for a chat conversation.
 */
export interface ChatConversation {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly title: string | null;
  readonly pageContext: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Domain object for a chat message.
 */
export interface ChatMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly role: ChatMessageRole;
  readonly content: string;
  readonly tokenCount: number | null;
  readonly ragContextUsed: boolean;
  readonly createdAt: Date;
}

// ==================== Input Types ====================

/**
 * Input for creating a new chat conversation.
 */
export interface CreateConversationInput {
  readonly tenantId: string;
  readonly userId: string;
  readonly title?: string;
  readonly pageContext?: string;
}

/**
 * Input for creating a new chat message.
 */
export interface CreateMessageInput {
  readonly conversationId: string;
  readonly role: ChatMessageRole;
  readonly content: string;
  readonly tokenCount?: number;
  readonly ragContextUsed?: boolean;
}

// ==================== Aggregate Row Types ====================

/**
 * Database row for token count aggregation.
 */
export interface TokenCountRow {
  readonly total_tokens: string | null;
}

/**
 * Database row for deleted message count.
 */
export interface DeletedCountRow {
  readonly deleted_count: string;
}

/** Row shape for COUNT(*) queries. */
export interface ConversationCountRow {
  readonly count: string; // PostgreSQL returns count as string
}

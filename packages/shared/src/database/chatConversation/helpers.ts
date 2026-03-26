/**
 * Chat Conversation Helpers
 *
 * Validation functions and row mappers for chat conversation
 * repository operations.
 *
 * @module database/chatConversation/helpers
 */

import { ValidationError, validateNonEmptyString } from "../common.js";
import type {
  ChatConversationRow,
  ChatConversation,
  ChatMessageRow,
  ChatMessage,
  ChatMessageRole,
  CreateConversationInput,
  CreateMessageInput,
} from "./types.js";

// ==================== Constants ====================

const VALID_ROLES: ReadonlySet<ChatMessageRole> = new Set(["user", "assistant", "system"]);

// ==================== Row Mappers ====================

/**
 * Maps a database row to a ChatConversation domain object.
 */
export const mapRowToConversation = (row: ChatConversationRow): ChatConversation => ({
  id: row.id,
  tenantId: row.tenant_id,
  userId: row.user_id,
  title: row.title,
  pageContext: row.page_context,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Maps a database row to a ChatMessage domain object.
 */
export const mapRowToMessage = (row: ChatMessageRow): ChatMessage => ({
  id: row.id,
  conversationId: row.conversation_id,
  role: row.role as ChatMessageRole,
  content: row.content,
  tokenCount: row.token_count,
  ragContextUsed: row.rag_context_used,
  createdAt: row.created_at,
});

// ==================== Validation Functions ====================

/**
 * Validates CreateConversationInput.
 *
 * @throws ValidationError if input is invalid
 */
export const validateCreateConversationInput = (input: CreateConversationInput): void => {
  validateNonEmptyString(input.tenantId, "tenantId");
  validateNonEmptyString(input.userId, "userId");
};

/**
 * Validates CreateMessageInput.
 *
 * @throws ValidationError if input is invalid
 */
export const validateCreateMessageInput = (input: CreateMessageInput): void => {
  validateNonEmptyString(input.conversationId, "conversationId");
  validateNonEmptyString(input.tenantId, "tenantId");
  validateNonEmptyString(input.content, "content");

  if (!VALID_ROLES.has(input.role)) {
    throw new ValidationError("Invalid message role", {
      operation: "validateCreateMessageInput",
      metadata: { field: "role", value: input.role },
    });
  }
};

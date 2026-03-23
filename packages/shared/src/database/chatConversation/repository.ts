/**
 * Chat Conversation Repository
 *
 * Database operations for chat conversations and messages.
 * Used by the Kenchi Copilot Drawer for persistent chat sessions.
 *
 * @module database/chatConversation/repository
 */

import {
  query,
  createLogger,
  generateEventId,
  validateNonEmptyString,
  PARSE_INT_RADIX,
} from "../common.js";
import type { RequestContext } from "../../core/types.js";
import type {
  ChatConversationRow,
  ChatMessageRow,
  ChatConversation,
  ChatMessage,
  CreateConversationInput,
  CreateMessageInput,
  TokenCountRow,
  DeletedCountRow,
  ConversationCountRow,
} from "./types.js";
import {
  mapRowToConversation,
  mapRowToMessage,
  validateCreateConversationInput,
  validateCreateMessageInput,
} from "./helpers.js";

const logger = createLogger("chat-conversation-repository");

// ==================== Default Constants ====================

const DEFAULT_CONVERSATION_LIMIT = 50;
const DEFAULT_MESSAGE_LIMIT = 100;

// ==================== Conversation Operations ====================

/**
 * Creates a new chat conversation.
 *
 * @param input - Conversation creation input
 * @param context - Request context for logging
 * @returns The created conversation
 * @throws ValidationError if input is invalid
 */
export const createConversation = async (
  input: CreateConversationInput,
  context: RequestContext
): Promise<ChatConversation> => {
  validateCreateConversationInput(input);

  const id = generateEventId("chat");

  const result = await query<ChatConversationRow>(
    `INSERT INTO chat_conversations (id, tenant_id, user_id, title, page_context)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, input.tenantId, input.userId, input.title ?? null, input.pageContext ?? null]
  );

  logger.info("Created chat conversation", {
    conversationId: id,
    ...context,
  });

  return mapRowToConversation(result.rows[0]);
};

/**
 * Finds a conversation by ID, scoped to tenant.
 *
 * @param id - Conversation ID
 * @param tenantId - Tenant ID for isolation
 * @param context - Request context for logging
 * @returns The conversation or null if not found
 */
export const findConversationById = async (
  id: string,
  tenantId: string,
  _context: RequestContext
): Promise<ChatConversation | null> => {
  validateNonEmptyString(id, "id");
  validateNonEmptyString(tenantId, "tenantId");

  const result = await query<ChatConversationRow>(
    `SELECT * FROM chat_conversations
     WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  return result.rows.length > 0 ? mapRowToConversation(result.rows[0]) : null;
};

/**
 * Lists conversations for a user, ordered by most recent first.
 *
 * @param tenantId - Tenant ID for isolation
 * @param userId - User ID to filter by
 * @param limit - Maximum number of conversations to return
 * @param context - Request context for logging
 * @returns Array of conversations
 */
export const findConversationsByUser = async (
  tenantId: string,
  userId: string,
  limit: number = DEFAULT_CONVERSATION_LIMIT,
  _context: RequestContext
): Promise<readonly ChatConversation[]> => {
  validateNonEmptyString(tenantId, "tenantId");
  validateNonEmptyString(userId, "userId");

  const result = await query<ChatConversationRow>(
    `SELECT * FROM chat_conversations
     WHERE tenant_id = $1 AND user_id = $2
     ORDER BY updated_at DESC
     LIMIT $3`,
    [tenantId, userId, limit]
  );

  return Object.freeze(result.rows.map(mapRowToConversation));
};

/**
 * Deletes a conversation and all its messages (via CASCADE).
 *
 * @param id - Conversation ID
 * @param tenantId - Tenant ID for isolation
 * @param context - Request context for logging
 * @returns True if the conversation was deleted
 */
export const deleteConversation = async (
  id: string,
  tenantId: string,
  context: RequestContext
): Promise<boolean> => {
  validateNonEmptyString(id, "id");
  validateNonEmptyString(tenantId, "tenantId");

  const result = await query(
    `DELETE FROM chat_conversations
     WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  const deleted = result.rowCount > 0;

  if (deleted) {
    logger.info("Deleted chat conversation", {
      conversationId: id,
      ...context,
    });
  }

  return deleted;
};

/**
 * Updates the title of a conversation, scoped to tenant.
 *
 * @param id - Conversation ID
 * @param tenantId - Tenant ID for isolation
 * @param title - New conversation title
 * @param context - Request context for logging
 * @returns The updated conversation or null if not found
 */
export const updateConversationTitle = async (
  id: string,
  tenantId: string,
  title: string,
  context: RequestContext
): Promise<ChatConversation | null> => {
  validateNonEmptyString(id, "id");
  validateNonEmptyString(tenantId, "tenantId");
  validateNonEmptyString(title, "title");

  const result = await query<ChatConversationRow>(
    `UPDATE chat_conversations
     SET title = $3, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [id, tenantId, title]
  );

  if (result.rows.length === 0) {
    return null;
  }

  logger.info("Updated chat conversation title", {
    conversationId: id,
    ...context,
  });

  return mapRowToConversation(result.rows[0]);
};

// ==================== Message Operations ====================

/**
 * Creates a new message in a conversation.
 * Also touches the conversation's updated_at timestamp.
 *
 * @param input - Message creation input
 * @param context - Request context for logging
 * @returns The created message
 * @throws ValidationError if input is invalid
 */
export const createMessage = async (
  input: CreateMessageInput,
  context: RequestContext
): Promise<ChatMessage> => {
  validateCreateMessageInput(input);

  const id = generateEventId("msg");

  const result = await query<ChatMessageRow>(
    `WITH updated_conversation AS (
      UPDATE chat_conversations SET updated_at = NOW()
      WHERE id = $2
    )
    INSERT INTO chat_messages (id, conversation_id, role, content, token_count, rag_context_used)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [
      id,
      input.conversationId,
      input.role,
      input.content,
      input.tokenCount ?? null,
      input.ragContextUsed ?? false,
    ]
  );

  logger.info("Created chat message", {
    messageId: id,
    conversationId: input.conversationId,
    role: input.role,
    ...context,
  });

  return mapRowToMessage(result.rows[0]);
};

/**
 * Gets messages for a conversation, ordered by creation time ascending.
 *
 * @param conversationId - Conversation ID
 * @param limit - Maximum number of messages to return
 * @param context - Request context for logging
 * @returns Array of messages
 */
export const getMessagesByConversation = async (
  conversationId: string,
  limit: number = DEFAULT_MESSAGE_LIMIT,
  _context: RequestContext
): Promise<readonly ChatMessage[]> => {
  validateNonEmptyString(conversationId, "conversationId");

  const result = await query<ChatMessageRow>(
    `SELECT * FROM chat_messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [conversationId, limit]
  );

  return Object.freeze(result.rows.map(mapRowToMessage));
};

/**
 * Gets the total token count for all messages in a conversation.
 *
 * @param conversationId - Conversation ID
 * @param _context - Request context for logging
 * @returns Total token count (0 if no messages or no token counts recorded)
 */
export const getConversationTokenCount = async (
  conversationId: string,
  _context: RequestContext
): Promise<number> => {
  validateNonEmptyString(conversationId, "conversationId");

  const result = await query<TokenCountRow>(
    `SELECT COALESCE(SUM(token_count), 0) as total_tokens
     FROM chat_messages
     WHERE conversation_id = $1`,
    [conversationId]
  );

  return parseInt(result.rows[0].total_tokens ?? "0", PARSE_INT_RADIX);
};

/**
 * Deletes the oldest messages from a conversation to manage context window.
 *
 * @param conversationId - Conversation ID
 * @param count - Number of oldest messages to delete
 * @param context - Request context for logging
 * @returns Number of messages deleted
 */
export const deleteOldestMessages = async (
  conversationId: string,
  count: number,
  context: RequestContext
): Promise<number> => {
  validateNonEmptyString(conversationId, "conversationId");

  const result = await query<DeletedCountRow>(
    `WITH oldest AS (
      SELECT id FROM chat_messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
      LIMIT $2
    ),
    deleted AS (
      DELETE FROM chat_messages
      WHERE id IN (SELECT id FROM oldest)
      RETURNING 1
    )
    SELECT COUNT(*)::text as deleted_count FROM deleted`,
    [conversationId, count]
  );

  const deletedCount = parseInt(result.rows[0].deleted_count, PARSE_INT_RADIX);

  if (deletedCount > 0) {
    logger.info("Deleted oldest chat messages", {
      conversationId,
      deletedCount,
      ...context,
    });
  }

  return deletedCount;
};

/**
 * Counts the number of conversations for a user within a tenant.
 */
export const countConversationsByUser = async (
  tenantId: string,
  userId: string,
  _context: RequestContext
): Promise<number> => {
  const result = await query<ConversationCountRow>(
    "SELECT COUNT(*) as count FROM chat_conversations WHERE tenant_id = $1 AND user_id = $2",
    [tenantId, userId]
  );
  return parseInt(result.rows[0]?.count ?? "0", PARSE_INT_RADIX);
};

/**
 * Counts the total number of messages in a conversation.
 */
export const countMessagesByConversation = async (
  conversationId: string,
  _context: RequestContext
): Promise<number> => {
  validateNonEmptyString(conversationId, "conversationId");

  const result = await query<ConversationCountRow>(
    "SELECT COUNT(*) as count FROM chat_messages WHERE conversation_id = $1",
    [conversationId]
  );
  return parseInt(result.rows[0]?.count ?? "0", PARSE_INT_RADIX);
};

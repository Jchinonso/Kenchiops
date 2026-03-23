/**
 * Chat Conversation Module
 *
 * Database operations for chat conversations and messages
 * used by the Kenchi Copilot Drawer.
 *
 * @module database/chatConversation
 */

// Types
export type {
  ChatConversationRow,
  ChatMessageRow,
  ChatConversation,
  ChatMessage,
  ChatMessageRole,
  CreateConversationInput,
  CreateMessageInput,
  TokenCountRow,
  DeletedCountRow,
  ConversationCountRow,
} from "./types.js";

// Helpers (includes validation and mappers)
export {
  mapRowToConversation,
  mapRowToMessage,
  validateCreateConversationInput,
  validateCreateMessageInput,
} from "./helpers.js";

// Repository operations
export {
  createConversation,
  findConversationById,
  findConversationsByUser,
  deleteConversation,
  updateConversationTitle,
  createMessage,
  getMessagesByConversation,
  getConversationTokenCount,
  deleteOldestMessages,
  countConversationsByUser,
  countMessagesByConversation,
} from "./repository.js";

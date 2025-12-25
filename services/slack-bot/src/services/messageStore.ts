/**
 * Message Store
 *
 * In-memory store for tracking posted Slack messages by repository and commit.
 * Used for updating or deleting old messages when new analysis arrives.
 */

import { logger } from "@kenchi/shared";

// ==================== Types ====================

/**
 * Stored message info for update/delete operations
 */
export interface StoredMessage {
  readonly channelId: string;
  readonly timestamp: string;
  readonly postedAt: Date;
}

// ==================== Constants ====================

/**
 * Max age for stored messages (1 hour) - cleanup stale entries
 */
const MESSAGE_STORE_MAX_AGE_MS = 60 * 60 * 1000;

// ==================== Store ====================

/**
 * In-memory store for tracking posted messages by repository + commit.
 * Key format: "repository:commitSha"
 */
const messageStore = new Map<string, StoredMessage>();

// ==================== Public API ====================

/**
 * Build message store key from repository and commit SHA
 */
export const buildMessageKey = (repository: string, commitSha: string): string =>
  `${repository}:${commitSha}`;

/**
 * Get a stored message by key
 */
export const getMessage = (key: string): StoredMessage | undefined => messageStore.get(key);

/**
 * Store a message for later reference
 */
export const setMessage = (key: string, message: StoredMessage): void => {
  messageStore.set(key, message);
};

/**
 * Delete a message by key
 */
export const deleteMessage = (key: string): boolean => messageStore.delete(key);

/**
 * Cleanup old entries from message store.
 * Uses functional patterns - forEach for side effects.
 */
export const cleanupMessageStore = (): void => {
  const now = Date.now();

  // Find keys to delete using filter
  const keysToDelete = Array.from(messageStore.entries())
    .filter(([, stored]) => now - stored.postedAt.getTime() > MESSAGE_STORE_MAX_AGE_MS)
    .map(([key]) => key);

  // Delete old entries using forEach (proper side effect handling)
  keysToDelete.forEach((key) => messageStore.delete(key));

  if (keysToDelete.length > 0) {
    logger.info("Cleaned up old message store entries", {
      deletedCount: keysToDelete.length,
    });
  }
};

/**
 * Get the current size of the message store (for testing/debugging)
 */
export const getStoreSize = (): number => messageStore.size;

/**
 * Clear all messages from the store (for testing)
 */
export const clearStore = (): void => {
  messageStore.clear();
};

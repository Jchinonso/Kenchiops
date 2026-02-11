/**
 * Message Store Types
 *
 * Type definitions for the in-memory message tracking store.
 */

/**
 * Stored message info for update/delete operations
 */
export interface StoredMessage {
  readonly channelId: string;
  readonly timestamp: string;
  readonly postedAt: Date;
}

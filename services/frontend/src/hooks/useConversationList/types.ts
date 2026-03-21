/**
 * Conversation List Types
 *
 * Type definitions for the useConversationList hook.
 */

/** A conversation summary as returned by the API. */
export interface ConversationSummary {
  readonly id: string;
  readonly title: string | null;
  readonly pageContext: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Parsed page context extracted from the JSON string. */
export interface ParsedPageContext {
  readonly pageType: string;
}

/** Return type for the useConversationList hook. */
export interface UseConversationListResult {
  readonly conversations: ReadonlyArray<ConversationSummary>;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly deleteConversation: (id: string) => void;
  readonly isDeleting: boolean;
  readonly renameConversation: (id: string, title: string) => void;
  readonly isRenaming: boolean;
  readonly refetch: () => void;
}

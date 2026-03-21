/**
 * Chat Types
 *
 * Type definitions for the Kenchi Copilot Drawer chat feature,
 * including streaming, page context, and RAG source types.
 *
 * @module chat/types
 */

/**
 * Input for a chat completion request.
 */
export interface ChatCompletionInput {
  /** Existing conversation ID. Undefined means create a new conversation. */
  readonly conversationId?: string;
  readonly userMessage: string;
  readonly pageContext: ChatPageContext;
  readonly tenantId: string;
  readonly userId: string;
}

/**
 * Context about the page the user is currently viewing.
 */
export interface ChatPageContext {
  readonly pageType: ChatPageType;
  readonly entityId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Pages that support the Copilot Drawer. */
export type ChatPageType = "analysis" | "incident" | "knowledge-base" | "overview" | "failures";

/** Types of chunks emitted during a streamed chat response. */
export type ChatStreamChunkType =
  | "token"
  | "done"
  | "error"
  | "rag_sources"
  | "conversation_created";

/**
 * A single chunk in a streamed chat response.
 * Discriminated union keyed on `type` for exhaustive handling.
 */
export type ChatStreamChunk =
  | { readonly type: "token"; readonly content: string }
  | { readonly type: "done" }
  | { readonly type: "error"; readonly error: string }
  | { readonly type: "conversation_created"; readonly conversationId: string }
  | { readonly type: "rag_sources"; readonly sources: ReadonlyArray<ChatRAGSource> };

/**
 * A RAG source document surfaced during chat.
 */
export interface ChatRAGSource {
  readonly title: string;
  readonly docType: string;
  readonly similarity: number;
}

// ==================== Port Interfaces ====================

/**
 * A single delta from a streaming LLM completion.
 * Mirrors the OpenAI SDK stream chunk shape without importing vendor types.
 */
export interface ChatLLMStreamDelta {
  readonly content?: string | null;
  readonly finishReason?: string | null;
}

/**
 * Port interface for streaming LLM completions.
 * The chat service depends on this abstraction, not on vendor SDKs.
 */
export interface ChatLLMPort {
  /** Creates a streaming chat completion. Returns an async iterable of deltas. */
  readonly createStreamingCompletion: (
    messages: ReadonlyArray<ChatLLMMessage>,
    model: string,
    context: import("../core/types.js").RequestContext
  ) => AsyncIterable<ChatLLMStreamDelta>;
}

/**
 * A message in the LLM conversation (vendor-agnostic).
 */
export interface ChatLLMMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

/**
 * Port interface for fetching page context data for chat enrichment.
 * Allows the chat service to enrich prompts without importing repositories directly.
 */
export interface ChatContextPort {
  /** Fetches analysis data by ID for prompt enrichment. Returns null if not found. */
  readonly getAnalysisContext: (
    entityId: string,
    tenantId: string,
    context: import("../core/types.js").RequestContext
  ) => Promise<ChatContextData | null>;
  /** Fetches incident data by ID for prompt enrichment. Returns null if not found. */
  readonly getIncidentContext: (
    entityId: string,
    tenantId: string,
    context: import("../core/types.js").RequestContext
  ) => Promise<ChatContextData | null>;
  /** Searches knowledge docs for relevant context. Returns empty array on failure. */
  readonly searchRAG: (
    queryText: string,
    tenantId: string,
    context: import("../core/types.js").RequestContext
  ) => Promise<ChatRAGResult>;
}

/** Structured context data fetched for a page entity. */
export interface ChatContextData {
  readonly entityType: "analysis" | "incident";
  readonly title: string;
  readonly summary: string | null;
  readonly details: string | null;
}

/** RAG search results formatted for the chat service. */
export interface ChatRAGResult {
  readonly formattedContext: string;
  readonly sources: ReadonlyArray<ChatRAGSource>;
}

/**
 * Port interface for the chat repository.
 * Mirrors the repository exports for dependency injection.
 */
export interface ChatRepositoryPort {
  readonly createConversation: (
    input: CreateConversationPortInput,
    context: import("../core/types.js").RequestContext
  ) => Promise<{ readonly id: string }>;
  readonly createMessage: (
    input: CreateMessagePortInput,
    context: import("../core/types.js").RequestContext
  ) => Promise<{ readonly id: string }>;
  readonly getMessagesByConversation: (
    conversationId: string,
    limit: number,
    context: import("../core/types.js").RequestContext
  ) => Promise<ReadonlyArray<{ readonly role: string; readonly content: string }>>;
  readonly findConversationsByUser: (
    tenantId: string,
    userId: string,
    limit: number,
    context: import("../core/types.js").RequestContext
  ) => Promise<ReadonlyArray<ChatConversationSummary>>;
  readonly findConversationById: (
    id: string,
    tenantId: string,
    context: import("../core/types.js").RequestContext
  ) => Promise<ChatConversationSummary | null>;
  readonly deleteConversation: (
    id: string,
    tenantId: string,
    context: import("../core/types.js").RequestContext
  ) => Promise<boolean>;
  readonly updateConversationTitle: (
    id: string,
    tenantId: string,
    title: string,
    context: import("../core/types.js").RequestContext
  ) => Promise<ChatConversationSummary | null>;
  readonly getConversationTokenCount: (conversationId: string) => Promise<number>;
  readonly deleteOldestMessages: (
    conversationId: string,
    count: number,
    context: import("../core/types.js").RequestContext
  ) => Promise<number>;
}

/** Minimal conversation shape returned by the repository port. */
export interface ChatConversationSummary {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly title: string | null;
  readonly pageContext: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Input for creating a conversation via the port. */
export interface CreateConversationPortInput {
  readonly tenantId: string;
  readonly userId: string;
  readonly title?: string;
  readonly pageContext?: string;
}

/** Input for creating a message via the port. */
export interface CreateMessagePortInput {
  readonly conversationId: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
  readonly tokenCount?: number;
  readonly ragContextUsed?: boolean;
}

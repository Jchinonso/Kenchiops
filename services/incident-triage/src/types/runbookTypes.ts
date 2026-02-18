/**
 * Runbook Matching Types
 *
 * Type definitions for runbook search results and the runbook matcher service.
 */

import type { RequestContext } from "@kenchi/shared";

// ==================== Runbook Match ====================

/**
 * A single runbook match result from vector similarity search.
 */
export interface RunbookMatch {
  readonly docId: string;
  readonly title: string;
  readonly similarity: number;
  readonly content: string | null;
  readonly sourceUrl: string | null;
}

/**
 * Complete result from the runbook matching stage.
 */
export interface RunbookMatchResult {
  readonly matches: readonly RunbookMatch[];
  readonly embeddingTokenCount: number;
  readonly durationMs: number;
}

// ==================== Port Interfaces ====================

/**
 * Port for generating embeddings from text.
 * Decouples runbook matcher from the concrete embedding implementation.
 */
export interface EmbeddingPort {
  readonly generate: (tenantId: string, text: string) => Promise<EmbeddingResult>;
}

/**
 * Result from embedding generation.
 */
export interface EmbeddingResult {
  readonly embedding: readonly number[];
  readonly tokenCount: number;
}

/**
 * Port for searching knowledge documents by vector similarity.
 * Decouples runbook matcher from the concrete search implementation.
 */
export interface KnowledgeSearchPort {
  readonly searchRunbooks: (
    embedding: readonly number[],
    tenantId: string,
    limit: number,
    minSimilarity: number
  ) => Promise<readonly KnowledgeSearchResult[]>;
}

/**
 * Result from knowledge document vector search.
 */
export interface KnowledgeSearchResult {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly sourceUrl: string | null;
  readonly similarity: number;
}

// ==================== Service Interface ====================

/**
 * Public interface for the runbook matcher service.
 */
export interface RunbookMatcherService {
  readonly matchRunbooks: (
    alertText: string,
    tenantId: string,
    context: RequestContext
  ) => Promise<RunbookMatchResult>;
}

/**
 * Q&A Service Types
 *
 * Type definitions for RAG-powered question answering.
 */

/**
 * Single Q&A search result with formatted content.
 */
export interface QASearchResult {
  readonly id: string;
  readonly title: string;
  readonly snippet: string;
  readonly sourceUrl?: string;
  readonly docType: string;
  readonly similarity: number;
  readonly sourceType: "knowledge" | "diff";
}

/**
 * Q&A search response with results and metadata.
 */
export interface QASearchResponse {
  readonly success: boolean;
  readonly query: string;
  readonly results: readonly QASearchResult[];
  readonly totalFound: number;
  readonly cacheHit: boolean;
  readonly error?: string;
}

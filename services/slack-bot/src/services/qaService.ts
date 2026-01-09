/**
 * Q&A Service for RAG-powered question answering.
 *
 * Searches the knowledge base and returns relevant answers
 * with source links and feedback buttons.
 *
 * @module services/qaService
 */

import {
  createLogger,
  getErrorMessage,
  searchAll,
  QA_CONFIG,
  isQuestionLike,
  QA_MESSAGES,
  type VectorSearchResult,
  type KnowledgeDocRecord,
  type DiffChunk,
} from "@kenchi/shared";

const logger = createLogger("qa-service");

// ==================== Types ====================

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

// ==================== Helper Functions ====================

/**
 * Truncates text to a maximum length, preserving word boundaries.
 */
const truncateSnippet = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }

  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  const minBoundaryPosition = maxLength * QA_CONFIG.TRUNCATION_WORD_BOUNDARY_RATIO;

  return lastSpace > minBoundaryPosition
    ? `${truncated.slice(0, lastSpace)}...`
    : `${truncated}...`;
};

/**
 * Extracts a meaningful title from document content or metadata.
 */
const extractTitle = (doc: KnowledgeDocRecord): string => {
  if (doc.title) {
    return doc.title;
  }

  // Try to extract from first line of content
  const firstLine = doc.content.split("\n")[0]?.trim();
  const isValidTitle =
    firstLine && firstLine.length > 0 && firstLine.length < QA_CONFIG.MAX_EXTRACTED_TITLE_LENGTH;

  if (isValidTitle) {
    return firstLine.replace(/^#+\s*/, ""); // Remove markdown headers
  }

  return `${doc.docType} document`;
};

/**
 * Builds source URL from document metadata.
 */
const buildSourceUrl = (doc: KnowledgeDocRecord): string | undefined => {
  if (doc.sourceUrl) {
    return doc.sourceUrl;
  }

  if (doc.repository && doc.filePath) {
    return `https://github.com/${doc.repository}/blob/main/${doc.filePath}`;
  }

  return undefined;
};

/**
 * Maps a knowledge doc result to QASearchResult.
 */
const mapKnowledgeDocResult = (result: VectorSearchResult<KnowledgeDocRecord>): QASearchResult => ({
  id: result.item.id,
  title: extractTitle(result.item),
  snippet: truncateSnippet(result.item.content, QA_CONFIG.MAX_SNIPPET_LENGTH),
  sourceUrl: buildSourceUrl(result.item),
  docType: result.item.docType,
  similarity: result.similarity,
  sourceType: "knowledge",
});

/**
 * Maps a diff chunk result to QASearchResult.
 */
const mapDiffChunkResult = (result: VectorSearchResult<DiffChunk>): QASearchResult => ({
  id: result.item.id,
  title: `PR #${result.item.prNumber}: ${result.item.filePath}`,
  snippet: truncateSnippet(result.item.content, QA_CONFIG.MAX_SNIPPET_LENGTH),
  sourceUrl: result.item.repository
    ? `https://github.com/${result.item.repository}/pull/${result.item.prNumber}`
    : undefined,
  docType: "pr_diff",
  similarity: result.similarity,
  sourceType: "diff",
});

/**
 * Combines and sorts results from both sources by similarity.
 */
const combineAndSortResults = (
  knowledgeDocs: ReadonlyArray<VectorSearchResult<KnowledgeDocRecord>>,
  diffChunks: ReadonlyArray<VectorSearchResult<DiffChunk>>
): readonly QASearchResult[] => {
  const knowledgeResults = knowledgeDocs.map(mapKnowledgeDocResult);
  const diffResults = diffChunks.map(mapDiffChunkResult);

  const combined = [...knowledgeResults, ...diffResults];

  // Sort by similarity descending, filter by threshold, limit results
  return combined
    .sort((first, second) => second.similarity - first.similarity)
    .filter((result) => result.similarity >= QA_CONFIG.MIN_SIMILARITY_THRESHOLD)
    .slice(0, QA_CONFIG.MAX_RESULTS_TO_SHOW);
};

// ==================== Public API ====================

/**
 * Determines if a query should trigger Q&A search.
 *
 * @param query - The query text to check
 * @returns True if the query should trigger Q&A search
 */
export const shouldTriggerQA = (query: string): boolean => {
  const trimmedQuery = query.trim();

  // Check minimum length
  if (trimmedQuery.length < QA_CONFIG.MIN_QUERY_LENGTH) {
    return false;
  }

  // Check if it looks like a question
  return isQuestionLike(trimmedQuery);
};

/**
 * Performs a Q&A search against the knowledge base.
 *
 * @param query - The question or search query
 * @param tenantId - Optional tenant ID for filtering
 * @param repository - Optional repository for filtering
 * @returns Q&A search response with results
 */
export const performQASearch = async (
  query: string,
  tenantId?: string,
  repository?: string
): Promise<QASearchResponse> => {
  const trimmedQuery = query.trim();

  logger.info("Performing Q&A search", {
    queryLength: trimmedQuery.length,
    tenantId,
    repository,
  });

  // Validate query length
  if (trimmedQuery.length < QA_CONFIG.MIN_QUERY_LENGTH) {
    logger.debug("Query too short for Q&A", { queryLength: trimmedQuery.length });
    return {
      success: false,
      query: trimmedQuery,
      results: [],
      totalFound: 0,
      cacheHit: false,
      error: QA_MESSAGES.QUERY_TOO_SHORT,
    };
  }

  try {
    const searchResult = await searchAll({
      queryText: trimmedQuery,
      tenantId,
      repository,
      topK: QA_CONFIG.SEARCH_TOP_K,
      enableReranking: true,
    });

    const totalFound = searchResult.knowledgeDocs.length + searchResult.diffChunks.length;

    logger.info("Q&A search complete", {
      knowledgeDocsFound: searchResult.knowledgeDocs.length,
      diffChunksFound: searchResult.diffChunks.length,
      cacheHit: searchResult.cacheHit,
    });

    const results = combineAndSortResults(searchResult.knowledgeDocs, searchResult.diffChunks);

    if (results.length === 0) {
      return {
        success: true,
        query: trimmedQuery,
        results: [],
        totalFound,
        cacheHit: searchResult.cacheHit,
      };
    }

    return {
      success: true,
      query: trimmedQuery,
      results,
      totalFound,
      cacheHit: searchResult.cacheHit,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Q&A search failed", {
      query: trimmedQuery,
      error: errorMessage,
    });

    return {
      success: false,
      query: trimmedQuery,
      results: [],
      totalFound: 0,
      cacheHit: false,
      error: QA_MESSAGES.SEARCH_ERROR,
    };
  }
};

/**
 * Generates a unique query ID for tracking Q&A interactions.
 *
 * @param query - The search query
 * @param userId - The user ID
 * @returns A unique query ID
 */
export const generateQueryId = (query: string, userId: string): string => {
  const timestamp = Date.now();
  const queryHash = query.slice(0, 20).replace(/\s+/g, "_");
  return `qa_${userId}_${timestamp}_${queryHash}`;
};

/**
 * Runbook Matcher Service
 *
 * Generates an embedding from alert text and searches for similar runbooks
 * in the knowledge doc store. Uses port interfaces for testability.
 *
 * @module services/runbookMatcher
 */

import { createLogger, type RequestContext } from "@kenchi/shared";
import type {
  RunbookMatcherService,
  RunbookMatchResult,
  RunbookMatch,
  EmbeddingPort,
  KnowledgeSearchPort,
  KnowledgeSearchResult,
} from "../types/runbookTypes.js";
import { RUNBOOK_MATCH_DEFAULTS } from "../constants/triageConstants.js";

// ==================== Pure Helpers ====================

/**
 * Maps a knowledge search result to a RunbookMatch domain object.
 */
const toRunbookMatch = (searchResult: KnowledgeSearchResult): RunbookMatch => ({
  docId: searchResult.id,
  title: searchResult.title,
  similarity: searchResult.similarity,
  content: searchResult.content,
  sourceUrl: searchResult.sourceUrl,
});

const isEmptyText = (text: string): boolean => {
  const { length } = text;
  return length === 0;
};

// ==================== Factory ====================

/**
 * Creates a runbook matcher service with injected dependencies.
 *
 * @param embeddingPort - Port for generating embeddings
 * @param knowledgeSearchPort - Port for searching knowledge documents
 */
export const createRunbookMatcher = (
  embeddingPort: EmbeddingPort,
  knowledgeSearchPort: KnowledgeSearchPort
): RunbookMatcherService => {
  const logger = createLogger("runbook-matcher");

  const matchRunbooks = async (
    alertText: string,
    tenantId: string,
    context: RequestContext
  ): Promise<RunbookMatchResult> => {
    const startTime = Date.now();
    const text = alertText.trim();

    if (isEmptyText(text)) {
      return {
        matches: [],
        embedding: [],
        embeddingTokenCount: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // Step 1: Generate embedding from alert text
    const { embedding, tokenCount } = await embeddingPort.generate(tenantId, text);

    // Step 2: Search for matching runbooks
    const searchResults = await knowledgeSearchPort.searchRunbooks(
      embedding,
      tenantId,
      RUNBOOK_MATCH_DEFAULTS.MAX_RESULTS,
      RUNBOOK_MATCH_DEFAULTS.MIN_SIMILARITY
    );

    // Step 3: Map to domain results
    const matches: readonly RunbookMatch[] = searchResults.map(toRunbookMatch);
    const durationMs = Date.now() - startTime;

    logger.info("Runbook matching completed", {
      matchCount: matches.length,
      embeddingTokenCount: tokenCount,
      durationMs,
      ...context,
    });

    return { matches, embedding, embeddingTokenCount: tokenCount, durationMs };
  };

  return { matchRunbooks };
};

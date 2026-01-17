/**
 * Analysis RAG Integration
 *
 * Handles retrieval of relevant knowledge documents using RAG search.
 *
 * @module services/analysisRAG
 */

import {
  createLogger,
  getErrorMessage,
  EVIDENCE_TEXT_LIMITS,
  RAG_TO_EVIDENCE_DOC_TYPE_MAP,
  searchFromEventContext,
  SERVICE_NAMES,
  type KnowledgeDocument,
  type RAGSearchResult,
  type EventQueryContext,
} from "@kenchi/shared";

const logger = createLogger(SERVICE_NAMES.API);

// ==================== Helper Functions ====================

/**
 * Extracts error summary from failure log for RAG query.
 * Takes the first N characters of the log which typically contains the main error.
 */
const extractErrorSummary = (failureLog: string): string => {
  const trimmed = failureLog.trim();
  return trimmed.length > EVIDENCE_TEXT_LIMITS.ERROR_SUMMARY_MAX_LENGTH
    ? trimmed.substring(0, EVIDENCE_TEXT_LIMITS.ERROR_SUMMARY_MAX_LENGTH)
    : trimmed;
};

/**
 * Maps RAG doc type to Evidence KnowledgeDocument type.
 */
const mapDocType = (
  docType: string
): "runbook" | "past_incident" | "documentation" | "best_practice" | "playbook" =>
  RAG_TO_EVIDENCE_DOC_TYPE_MAP[docType] ?? "documentation";

/**
 * Truncates content to create a short excerpt.
 */
const truncateExcerpt = (content: string): string => {
  const trimmed = content.trim();
  if (trimmed.length <= EVIDENCE_TEXT_LIMITS.EXCERPT_MAX_LENGTH) {
    return trimmed;
  }
  return `${trimmed.substring(0, EVIDENCE_TEXT_LIMITS.EXCERPT_MAX_LENGTH)}...`;
};

/**
 * Extracts tags from document metadata if present.
 */
const extractTags = (metadata: Record<string, unknown> | null): string[] => {
  if (!metadata) {
    return [];
  }
  const { tags } = metadata;
  if (Array.isArray(tags) && tags.every((tag) => typeof tag === "string")) {
    return tags as string[];
  }
  return [];
};

// ==================== RAG Result Mapping ====================

/**
 * Maps RAG search results to KnowledgeDocument format for Evidence.
 */
const mapRAGResultsToKnowledgeDocs = (ragResult: RAGSearchResult): readonly KnowledgeDocument[] =>
  ragResult.knowledgeDocs.map((docResult) => ({
    id: docResult.item.id,
    type: mapDocType(docResult.item.docType),
    title: docResult.item.title,
    excerpt: truncateExcerpt(docResult.item.content),
    similarity: docResult.similarity,
    url: docResult.item.sourceUrl ?? undefined,
    metadata: {
      createdAt: docResult.item.createdAt.toISOString(),
      updatedAt: docResult.item.updatedAt?.toISOString(),
      tags: extractTags(docResult.item.metadata),
    },
  }));

// ==================== Public API ====================

/**
 * Retrieves relevant knowledge documents using RAG search.
 * Returns empty array if search fails (graceful degradation).
 * When tenantId is provided, enables cost tracking and budget-aware tier selection.
 */
export const retrieveRelevantKnowledge = async (
  repository: string,
  failureLog: string,
  tenantId?: string
): Promise<readonly KnowledgeDocument[]> => {
  try {
    const errorSummary = extractErrorSummary(failureLog);

    const queryContext: EventQueryContext = {
      eventType: "ci_failure",
      repository,
      errorMessage: errorSummary,
    };

    logger.info("Searching RAG for relevant knowledge", {
      repository,
      tenantId,
      queryLength: errorSummary.length,
    });

    const ragResult = await searchFromEventContext(queryContext, tenantId);
    const knowledgeDocs = mapRAGResultsToKnowledgeDocs(ragResult);

    logger.info("RAG search completed", {
      repository,
      tenantId,
      diffChunksFound: ragResult.diffChunks.length,
      knowledgeDocsFound: knowledgeDocs.length,
      cacheHit: ragResult.cacheHit,
    });

    return knowledgeDocs;
  } catch (error) {
    logger.warn("RAG search failed, continuing without knowledge context", {
      repository,
      tenantId,
      error: getErrorMessage(error),
    });
    return [];
  }
};

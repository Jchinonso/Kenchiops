/**
 * PR Fix Comment Ingestion
 *
 * Ingests fix explanations from PR comments into the RAG knowledge base.
 * Orchestrates detection, extraction, deduplication, and storage of fix knowledge.
 *
 * @module rag/prFixCommentIngestion
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import {
  KNOWLEDGE_DOC_TYPES,
  PR_FIX_COMMENT_CONFIG,
  SOURCE_RELIABILITY_SCORES,
} from "../constants/index.js";
import {
  findFixComments,
  extractFixKnowledge,
  isDuplicateKnowledge,
} from "./prFixCommentDetector.js";
import { ingestKnowledgeDoc } from "./ingestion.js";
import { searchKnowledgeDocs } from "./search.js";
import type {
  IngestKnowledgeDocInput,
  IngestKnowledgeDocResult,
  PRFixFailureContext,
  ExtractedFixKnowledge,
  IngestPRFixCommentsInput,
  FixCommentIngestionResult,
  IngestPRFixCommentsResult,
  DuplicateCheckResult,
} from "./types.js";

export type {
  IngestPRFixCommentsInput,
  FixCommentIngestionResult,
  IngestPRFixCommentsResult,
} from "./types.js";

const logger = createLogger("pr-fix-comment-ingestion");

// ==================== Deduplication ====================

/**
 * Checks if similar knowledge already exists in the database.
 * Returns false (no duplicate) if the check fails, to avoid losing knowledge.
 */
const checkForExistingKnowledge = async (
  knowledge: ExtractedFixKnowledge,
  tenantId?: string
): Promise<DuplicateCheckResult> => {
  try {
    const searchResponse = await searchKnowledgeDocs({
      queryText: knowledge.failureContext.errorSummary,
      tenantId,
      repository: knowledge.failureContext.repository,
      topK: 5,
      minSimilarity: PR_FIX_COMMENT_CONFIG.DEDUP_SIMILARITY_THRESHOLD,
    });

    const hasDuplicate = searchResponse.results.some((result) =>
      isDuplicateKnowledge(knowledge, result.item.content)
    );

    if (hasDuplicate) {
      logger.info("Found duplicate knowledge, skipping ingestion", {
        commentId: knowledge.sourceComment.id,
        repository: knowledge.failureContext.repository,
      });
    }

    return { isDuplicate: hasDuplicate, checkSucceeded: true };
  } catch (error) {
    logger.warn("Duplicate check failed, proceeding with ingestion to avoid missing knowledge", {
      commentId: knowledge.sourceComment.id,
      repository: knowledge.failureContext.repository,
      error: getErrorMessage(error),
    });
    return { isDuplicate: false, checkSucceeded: false };
  }
};

// ==================== Ingestion ====================

/**
 * Builds the ingestion input from extracted fix knowledge.
 */
const buildFixCommentIngestionInput = (
  knowledge: ExtractedFixKnowledge,
  tenantId?: string
): IngestKnowledgeDocInput => ({
  docType: KNOWLEDGE_DOC_TYPES.PR_FIX_COMMENT,
  title: knowledge.title,
  content: knowledge.content,
  tenantId,
  repository: knowledge.failureContext.repository,
  sourceUrl: knowledge.metadata.prUrl,
  metadata: {
    commentId: knowledge.metadata.commentId,
    prNumber: knowledge.failureContext.prNumber,
    commitSha: knowledge.failureContext.commitSha,
    checkRunId: knowledge.failureContext.checkRunId,
    checkName: knowledge.failureContext.checkName,
    filesChanged: [...knowledge.metadata.filesChanged],
    matchedPatterns: [...knowledge.metadata.matchedPatterns],
    confidence: knowledge.confidence,
    sourceReliability: SOURCE_RELIABILITY_SCORES.PR_FIX_COMMENT,
    extractedAt: knowledge.metadata.extractedAt,
    author: knowledge.sourceComment.author,
    commentCreatedAt: knowledge.sourceComment.createdAt,
  },
});

/**
 * Builds a failure result for a fix comment ingestion.
 */
const buildFixFailureResult = (
  commentId: string,
  confidence: number,
  error: string
): FixCommentIngestionResult => ({
  success: false,
  commentId,
  confidence,
  error,
});

/**
 * Ingests a single extracted fix knowledge document.
 */
const ingestSingleFixComment = async (
  knowledge: ExtractedFixKnowledge,
  tenantId?: string,
  skipDedup?: boolean
): Promise<FixCommentIngestionResult> => {
  const commentId = knowledge.sourceComment.id;

  try {
    if (!skipDedup) {
      const duplicateCheck = await checkForExistingKnowledge(knowledge, tenantId);
      if (duplicateCheck.isDuplicate) {
        return {
          success: false,
          commentId,
          confidence: knowledge.confidence,
          skippedReason: "duplicate",
        };
      }
    }

    const result: IngestKnowledgeDocResult = await ingestKnowledgeDoc(
      buildFixCommentIngestionInput(knowledge, tenantId)
    );

    if (result.success) {
      logger.info("Fix comment knowledge stored", {
        commentId,
        documentId: result.parentId,
        chunksCreated: result.chunksCreated,
        confidence: knowledge.confidence,
      });
      return {
        success: true,
        commentId,
        documentId: result.parentId ?? undefined,
        confidence: knowledge.confidence,
      };
    }

    return buildFixFailureResult(commentId, knowledge.confidence, result.errors.join(", "));
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Fix comment ingestion failed", { commentId, error: errorMessage });
    return buildFixFailureResult(commentId, knowledge.confidence, errorMessage);
  }
};

// ==================== Public API ====================

/**
 * Ingests fix explanations from PR comments.
 *
 * Analyzes comments to find fix explanations, extracts knowledge,
 * checks for duplicates, and stores in the RAG knowledge base.
 *
 * @param input - PR comments and failure context
 * @returns Ingestion results for all fix comments found
 */
/**
 * Processes extracted knowledge sequentially via reduce.
 */
const processExtractedKnowledge = (
  extractedKnowledge: readonly ExtractedFixKnowledge[],
  tenantId?: string,
  skipDedup?: boolean
): Promise<readonly FixCommentIngestionResult[]> =>
  extractedKnowledge.reduce<Promise<readonly FixCommentIngestionResult[]>>(
    async (accPromise, knowledge) => {
      const acc = await accPromise;
      const result = await ingestSingleFixComment(knowledge, tenantId, skipDedup);
      return [...acc, result];
    },
    Promise.resolve([])
  );

export const ingestPRFixComments = async (
  input: IngestPRFixCommentsInput
): Promise<IngestPRFixCommentsResult> => {
  const { comments, failureContext, tenantId, skipDedup } = input;

  logger.info("Starting PR fix comment ingestion", {
    totalComments: comments.length,
    repository: failureContext.repository,
    prNumber: failureContext.prNumber,
    checkName: failureContext.checkName,
  });

  const fixCommentAnalyses = findFixComments(comments, failureContext.failedAt);

  if (fixCommentAnalyses.length === 0) {
    logger.info("No fix comments found in PR", {
      repository: failureContext.repository,
      prNumber: failureContext.prNumber,
    });
    return {
      totalComments: comments.length,
      fixCommentsFound: 0,
      ingested: 0,
      skipped: 0,
      failed: 0,
      results: [],
    };
  }

  const extractedKnowledge = fixCommentAnalyses.map((analysis) =>
    extractFixKnowledge(analysis, failureContext)
  );
  const results = await processExtractedKnowledge(extractedKnowledge, tenantId, skipDedup);

  const ingested = results.filter((result) => result.success).length;
  const skipped = results.filter((result) => result.skippedReason).length;
  const failed = results.filter((result) => !result.success && !result.skippedReason).length;

  logger.info("PR fix comment ingestion complete", {
    totalComments: comments.length,
    fixCommentsFound: fixCommentAnalyses.length,
    ingested,
    skipped,
    failed,
  });

  return Object.freeze({
    totalComments: comments.length,
    fixCommentsFound: fixCommentAnalyses.length,
    ingested,
    skipped,
    failed,
    results: Object.freeze(results),
  });
};

/**
 * Creates a failure context from check run and PR data.
 *
 * Helper function to construct PRFixFailureContext from webhook data.
 */
export const createFailureContext = (params: {
  checkRunId: number;
  checkName: string;
  errorSummary: string;
  failedAt: string;
  repository: string;
  prNumber: number;
  commitSha: string;
  filesChanged?: readonly string[];
}): PRFixFailureContext =>
  Object.freeze({
    checkRunId: params.checkRunId,
    checkName: params.checkName,
    errorSummary: params.errorSummary,
    failedAt: params.failedAt,
    repository: params.repository,
    prNumber: params.prNumber,
    commitSha: params.commitSha,
    filesChanged: params.filesChanged,
  });

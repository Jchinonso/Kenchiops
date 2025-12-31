/**
 * Analysis Service
 *
 * Handles CI failure analysis using OpenAI.
 * Uses singleton pattern for OpenAI client to enable connection reuse.
 * Integrates RAG for retrieving relevant knowledge documents.
 */

import {
  OpenAIClient,
  calculateConfidenceScore,
  createLogger,
  generateEventId,
  type Event,
  type Evidence,
  type KnowledgeDocument,
  type LLMAnalysisResult,
  LLMError,
  getErrorMessage,
  wrapError,
  EVENT_TYPES,
  EVENT_SOURCES,
  EVENT_SEVERITY,
  LOG_LEVELS,
  EVIDENCE_SOURCES,
  EVENT_DEFAULTS,
  SERVICE_NAMES,
  searchFromEventContext,
  type RAGSearchResult,
  type EventQueryContext,
} from "@kenchi/shared";
import type { AnalyzeRequest, AnalyzeResponse, AnalysisContext } from "../types/apiTypes.js";

const logger = createLogger(SERVICE_NAMES.API);

/**
 * Singleton OpenAI client instance
 */
let openaiClientInstance: OpenAIClient | null = null;

/**
 * Get or create the OpenAI client singleton
 */
const getOpenAIClient = (): OpenAIClient => {
  if (!openaiClientInstance) {
    openaiClientInstance = new OpenAIClient();
    logger.info("OpenAI client initialized");
  }
  return openaiClientInstance;
};

// ==================== RAG Integration ====================

/**
 * Extracts error summary from failure log for RAG query.
 * Takes the first 500 characters of the log which typically contains the main error.
 */
const extractErrorSummary = (failureLog: string): string => {
  const maxLength = 500;
  const trimmed = failureLog.trim();
  return trimmed.length > maxLength ? trimmed.substring(0, maxLength) : trimmed;
};

/**
 * Maps RAG doc type to Evidence KnowledgeDocument type.
 */
const mapDocType = (
  docType: string
): "runbook" | "past_incident" | "documentation" | "best_practice" | "playbook" => {
  const docTypeMap: Record<
    string,
    "runbook" | "past_incident" | "documentation" | "best_practice" | "playbook"
  > = {
    runbook: "runbook",
    postmortem: "past_incident",
    known_issues: "past_incident",
    troubleshooting: "runbook",
    sop: "runbook",
    documentation: "documentation",
    api_docs: "documentation",
    architecture: "documentation",
    readme: "documentation",
    changelog: "documentation",
    ci_cd: "best_practice",
    deployment: "playbook",
    testing: "best_practice",
    infrastructure: "documentation",
    config_guide: "documentation",
    database: "documentation",
    onboarding: "documentation",
    external: "documentation",
  };
  return docTypeMap[docType] ?? "documentation";
};

/**
 * Truncates content to create a short excerpt (first 200 chars).
 */
const truncateExcerpt = (content: string): string => {
  const maxLength = 200;
  const trimmed = content.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.substring(0, maxLength)}...`;
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

/**
 * Retrieves relevant knowledge documents using RAG search.
 * Returns empty array if search fails (graceful degradation).
 */
const retrieveRelevantKnowledge = async (
  repository: string,
  failureLog: string
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
      queryLength: errorSummary.length,
    });

    const ragResult = await searchFromEventContext(queryContext);
    const knowledgeDocs = mapRAGResultsToKnowledgeDocs(ragResult);

    logger.info("RAG search completed", {
      repository,
      diffChunksFound: ragResult.diffChunks.length,
      knowledgeDocsFound: knowledgeDocs.length,
      cacheHit: ragResult.cacheHit,
    });

    return knowledgeDocs;
  } catch (error) {
    logger.warn("RAG search failed, continuing without knowledge context", {
      repository,
      error: getErrorMessage(error),
    });
    return [];
  }
};

// ==================== Analysis Context ====================

/**
 * Create analysis context (Event and Evidence) from request
 */
export const createAnalysisContext = (request: AnalyzeRequest): AnalysisContext => {
  const eventId = generateEventId("evt");

  const event: Event = {
    id: eventId,
    type: EVENT_TYPES.CICD_FAILURE,
    source: EVENT_SOURCES.GITHUB_APP,
    timestamp: new Date().toISOString(),
    severity: EVENT_SEVERITY.HIGH,
    title: `CI Failure in ${request.repository}`,
    payload: {
      repository: request.repository,
      failureLog: request.failure_log,
      commit: request.commit || EVENT_DEFAULTS.UNKNOWN_COMMIT,
    },
  };

  const evidence: Evidence = {
    eventId,
    logs: [
      {
        level: LOG_LEVELS.ERROR,
        message: request.failure_log,
        timestamp: new Date().toISOString(),
        source: EVIDENCE_SOURCES.CI,
      },
    ],
    collectedAt: new Date().toISOString(),
  };

  return { event, evidence };
};

/**
 * Analyze CI failure using OpenAI
 */
export const analyzeFailure = async (
  event: Event,
  evidence: Evidence
): Promise<LLMAnalysisResult> => {
  const openaiClient = getOpenAIClient();

  try {
    const result = await openaiClient.analyzeIncident(event, evidence);
    return result;
  } catch (error) {
    logger.error("OpenAI analysis failed", {
      eventId: event.id,
      error: getErrorMessage(error),
    });
    throw new LLMError(wrapError("Failed to analyze CI failure", error));
  }
};

/**
 * Format analysis result into API response
 */
export const formatAnalysisResponse = (
  analysisResult: LLMAnalysisResult,
  evidence: Evidence,
  repository: string
): AnalyzeResponse => {
  const confidenceResult = calculateConfidenceScore(analysisResult, evidence);

  return {
    analysis: analysisResult.summary,
    identified_cause: analysisResult.identifiedCause,
    confidence: confidenceResult.finalScore,
    recommended_actions: analysisResult.recommendedActions,
    full_analysis: analysisResult,
    repository,
  };
};

/**
 * Complete analysis flow: create context, retrieve RAG knowledge, analyze, format response
 */
export const performAnalysis = async (request: AnalyzeRequest): Promise<AnalyzeResponse> => {
  const { event, evidence: baseEvidence } = createAnalysisContext(request);

  logger.info("CI failure analysis requested", {
    eventId: event.id,
    repository: request.repository,
  });

  // Retrieve relevant knowledge documents via RAG (Phase 2 integration)
  const relatedDocs = await retrieveRelevantKnowledge(request.repository, request.failure_log);

  // Enrich evidence with RAG results
  const enrichedEvidence: Evidence = {
    ...baseEvidence,
    relatedDocs: relatedDocs.length > 0 ? [...relatedDocs] : undefined,
  };

  logger.info("Evidence enriched with RAG context", {
    eventId: event.id,
    relatedDocsCount: relatedDocs.length,
  });

  const analysisResult = await analyzeFailure(event, enrichedEvidence);

  logger.info("Analysis completed", {
    eventId: event.id,
    confidence: calculateConfidenceScore(analysisResult, enrichedEvidence).finalScore,
    hasActions: (analysisResult.recommendedActions?.length ?? 0) > 0,
    ragDocsUsed: relatedDocs.length,
  });

  return formatAnalysisResponse(analysisResult, enrichedEvidence, request.repository);
};

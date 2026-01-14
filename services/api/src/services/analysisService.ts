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
  createAnalysis,
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
  selectModel,
  logModelSelection,
  sanitizeIdPart,
  type Event,
  type Evidence,
  type KnowledgeDocument,
  type LLMAnalysisResult,
  type RAGSearchResult,
  type EventQueryContext,
  type ModelSelectionResult,
  type LogEntry,
} from "@kenchi/shared";
import type { AnalyzeRequest, AnalyzeResponse, AnalysisContext } from "../types/apiTypes.js";

const logger = createLogger(SERVICE_NAMES.API);

// ==================== Section Splitting ====================

interface EvidenceSection {
  readonly heading: string;
  readonly content: string;
}

/**
 * Splits evidence log content into sections by markdown headings.
 */
const splitEvidenceSections = (content: string): readonly EvidenceSection[] => {
  if (!content.trim()) {
    return [];
  }

  const lines = content.split("\n");
  const sections: EvidenceSection[] = [];
  let currentHeading = "Overview";
  let currentLines: string[] = [];

  lines.forEach((line) => {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      // Save previous section if it has content
      if (currentLines.length > 0 || sections.length === 0) {
        sections.push({
          heading: currentHeading,
          content: currentLines.join("\n").trim(),
        });
      }
      currentHeading = headingMatch[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  });

  // Save final section
  if (currentLines.length > 0) {
    sections.push({
      heading: currentHeading,
      content: currentLines.join("\n").trim(),
    });
  }

  return sections.filter((section) => section.content.length > 0);
};

// ==================== Constants ====================

const ERROR_SECTION_HEADINGS = new Set<string>([
  "Failed Tests",
  "CI Annotations (Errors & Warnings)",
  "CI Check Output",
  "Workflow Logs",
]);

const SECTION_SOURCE_OVERRIDES: Readonly<Record<string, string>> = {
  "Failed Tests": "ci-tests",
  "CI Annotations (Errors & Warnings)": "ci-annotations",
  "CI Check Output": "ci-check",
  "Workflow Logs": "ci-logs",
  "Dependency Changes": "ci-deps",
  "Build Config Changes": "ci-config",
  "PR Diff": "ci-diff",
  "Relevant Source Files": "ci-source",
  "Commit Info": "ci-commit",
  "Recent PR Discussion": "ci-comments",
  "Pull Request": "ci-pr",
  Overview: "ci-overview",
} as const;

const buildEvidenceLogs = (failureLog: string, collectedAt: string): LogEntry[] => {
  const sections = splitEvidenceSections(failureLog);
  if (sections.length === 0) {
    return [
      {
        id: "raw_log",
        level: LOG_LEVELS.ERROR,
        message: failureLog,
        timestamp: collectedAt,
        source: EVIDENCE_SOURCES.CI,
      },
    ];
  }

  const baseTime = new Date(collectedAt).getTime();
  return sections.map((section, index) => {
    const { heading } = section;
    const logLevel = ERROR_SECTION_HEADINGS.has(heading) ? LOG_LEVELS.ERROR : LOG_LEVELS.INFO;
    const logId = sanitizeIdPart(heading);
    const logSource = SECTION_SOURCE_OVERRIDES[heading] ?? EVIDENCE_SOURCES.CI;
    const timestamp = new Date(baseTime + index * 1000).toISOString();
    const message = section.content ? `## ${heading}\n${section.content}` : `## ${heading}`;

    return {
      id: logId,
      level: logLevel,
      message,
      timestamp,
      source: logSource,
    };
  });
};

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
 * When tenantId is provided, enables cost tracking and budget-aware tier selection.
 */
const retrieveRelevantKnowledge = async (
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

// ==================== Analysis Context ====================

/**
 * Create analysis context (Event and Evidence) from request
 */
export const createAnalysisContext = (request: AnalyzeRequest): AnalysisContext => {
  const eventId = generateEventId("evt");
  const collectedAt = new Date().toISOString();

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

  // Build base evidence
  const evidence: Evidence = {
    eventId,
    logs: buildEvidenceLogs(request.failure_log, collectedAt),
    collectedAt,
    // Include test framework hint if detected by preprocessor
    testFramework: request.test_framework
      ? {
          name: request.test_framework.name,
          language: request.test_framework.language,
          assertionHint: request.test_framework.assertion_hint,
        }
      : undefined,
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
 * Selects the appropriate model for analysis and logs the selection.
 *
 * @param tenantId - Optional tenant ID for tenant-specific model selection
 * @returns Model selection result
 */
const selectAnalysisModel = (tenantId?: string): ModelSelectionResult => {
  const selection = selectModel(tenantId ?? "");
  logModelSelection(selection, tenantId ?? "");
  return selection;
};

/**
 * Complete analysis flow: create context, retrieve RAG knowledge, analyze, format response
 */
export const performAnalysis = async (request: AnalyzeRequest): Promise<AnalyzeResponse> => {
  const { event, evidence: baseEvidence } = createAnalysisContext(request);

  // Select model version for this analysis (Phase 3 fine-tuning integration)
  const modelSelection = selectAnalysisModel(request.tenant_id);

  logger.info("CI failure analysis requested", {
    eventId: event.id,
    repository: request.repository,
    tenantId: request.tenant_id,
    modelVersionId: modelSelection.versionId,
    modelId: modelSelection.modelId,
    selectionReason: modelSelection.reason,
  });

  // Retrieve relevant knowledge documents via RAG (Phase 2 integration)
  // When tenantId is provided, enables cost tracking and budget-aware tier selection
  const relatedDocs = await retrieveRelevantKnowledge(
    request.repository,
    request.failure_log,
    request.tenant_id
  );

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
  const confidenceResult = calculateConfidenceScore(analysisResult, enrichedEvidence);

  // Persist analysis to database for evaluation and fine-tuning
  // Note: eventId is null because we don't persist events to the events table
  const savedAnalysis = await createAnalysis({
    eventId: null,
    summary: analysisResult.summary,
    identifiedCause: analysisResult.identifiedCause,
    diagnosisConfidence: confidenceResult.finalScore,
    confidenceSignals: confidenceResult.breakdown as unknown as Record<string, unknown>,
    recommendedActions: analysisResult.recommendedActions?.map((action) => action.description),
    fullAnalysis: analysisResult as unknown as Record<string, unknown>,
    tenantId: request.tenant_id,
    modelVersionId: modelSelection.versionId,
  });

  logger.info("Analysis completed and saved", {
    analysisId: savedAnalysis.id,
    eventId: event.id,
    modelVersionId: modelSelection.versionId,
    confidence: confidenceResult.finalScore,
    hasActions: (analysisResult.recommendedActions?.length ?? 0) > 0,
    ragDocsUsed: relatedDocs.length,
  });

  return formatAnalysisResponse(analysisResult, enrichedEvidence, request.repository);
};

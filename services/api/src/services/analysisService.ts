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
  EVENT_DEFAULTS,
  SERVICE_NAMES,
  selectModel,
  logModelSelection,
  // Chunking pipeline imports
  estimateChunkTokens,
  type Event,
  type Evidence,
  type LLMAnalysisResult,
  type ModelSelectionResult,
} from "@kenchi/shared";
import type { AnalyzeRequest, AnalyzeResponse, AnalysisContext } from "../types/apiTypes.js";

// Import from split modules
import { buildEvidenceLogs } from "./analysisEvidence.js";
import { retrieveRelevantKnowledge } from "./analysisRAG.js";
import {
  CHUNKING_PIPELINE_CONFIG,
  executeChunkingPipeline,
  convertAggregatedToEvidence,
} from "./analysisChunkingPipeline.js";

const logger = createLogger(SERVICE_NAMES.API);

// ==================== OpenAI Client Singleton ====================

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

// ==================== Core Analysis Functions ====================

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

// ==================== Main Analysis Flow ====================

/**
 * Complete analysis flow with chunking pipeline integration.
 *
 * For large logs (above TOKEN_THRESHOLD):
 * - Stage 1: Smart chunking with protected zone detection
 * - Stage 2: Per-chunk artifact extraction using cheap LLM
 * - Stage 3: Aggregation, deduplication, and primary failure determination
 * - Stage 4: Final analysis with enriched context
 *
 * For small logs (below TOKEN_THRESHOLD):
 * - Direct analysis using existing flow
 */
export const performAnalysis = async (request: AnalyzeRequest): Promise<AnalyzeResponse> => {
  const { event, evidence: baseEvidence } = createAnalysisContext(request);

  // Select model version for this analysis (Phase 3 fine-tuning integration)
  const modelSelection = selectAnalysisModel(request.tenant_id);

  // Estimate log size to determine analysis path
  const estimatedTokens = estimateChunkTokens(request.failure_log);
  const useChunkingPipeline = estimatedTokens > CHUNKING_PIPELINE_CONFIG.TOKEN_THRESHOLD;

  logger.info("CI failure analysis requested", {
    eventId: event.id,
    repository: request.repository,
    tenantId: request.tenant_id,
    modelVersionId: modelSelection.versionId,
    modelId: modelSelection.modelId,
    selectionReason: modelSelection.reason,
    estimatedTokens,
    useChunkingPipeline,
  });

  // Retrieve relevant knowledge documents via RAG (Phase 2 integration)
  // When tenantId is provided, enables cost tracking and budget-aware tier selection
  const relatedDocs = await retrieveRelevantKnowledge(
    request.repository,
    request.failure_log,
    request.tenant_id
  );

  let enrichedEvidence: Evidence;

  if (useChunkingPipeline) {
    // Use chunking pipeline for large logs
    logger.info("Using chunking pipeline for large log", {
      eventId: event.id,
      repository: request.repository,
      estimatedTokens,
    });

    try {
      const aggregatedEvidence = await executeChunkingPipeline(
        request.failure_log,
        request.repository
      );

      // Convert aggregated evidence to standard Evidence format
      enrichedEvidence = convertAggregatedToEvidence(
        aggregatedEvidence,
        event.id,
        baseEvidence.collectedAt
      );

      // Add RAG results and test framework hint
      enrichedEvidence = {
        ...enrichedEvidence,
        relatedDocs: relatedDocs.length > 0 ? [...relatedDocs] : undefined,
        testFramework: baseEvidence.testFramework,
      };

      logger.info("Chunking pipeline evidence prepared", {
        eventId: event.id,
        artifactCount: aggregatedEvidence.artifacts.length,
        degradedMode: aggregatedEvidence.degraded_mode,
      });
    } catch (pipelineError) {
      logger.warn("Chunking pipeline failed, falling back to direct analysis", {
        eventId: event.id,
        repository: request.repository,
        error: getErrorMessage(pipelineError),
      });

      enrichedEvidence = {
        ...baseEvidence,
        relatedDocs: relatedDocs.length > 0 ? [...relatedDocs] : undefined,
      };
    }
  } else {
    // Use direct analysis for small logs
    enrichedEvidence = {
      ...baseEvidence,
      relatedDocs: relatedDocs.length > 0 ? [...relatedDocs] : undefined,
    };
  }

  logger.info("Evidence enriched with RAG context", {
    eventId: event.id,
    relatedDocsCount: relatedDocs.length,
    usedChunkingPipeline: useChunkingPipeline,
  });

  const analysisResult = await analyzeFailure(event, enrichedEvidence);
  const confidenceResult = calculateConfidenceScore(analysisResult, enrichedEvidence);

  // Persist analysis to database for evaluation and fine-tuning
  // Note: eventId is null because we don't persist events to the events table
  // aggregationKey links to feedback via repo:commit format
  const aggregationKey = request.commit ? `${request.repository}:${request.commit}` : undefined;

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
    aggregationKey,
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

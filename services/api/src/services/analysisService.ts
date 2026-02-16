/**
 * Analysis Service
 *
 * Handles CI failure analysis using LLM.
 * Uses singleton pattern for LLM client to enable connection reuse.
 * Integrates RAG for retrieving relevant knowledge documents.
 */

import {
  LLMClient,
  calculateConfidenceScore,
  createLogger,
  generateEventId,
  createAnalysis,
  publish,
  LLMError,
  getErrorMessage,
  wrapError,
  EVENT_TYPES,
  EVENT_SOURCES,
  EVENT_SEVERITY,
  EVENT_DEFAULTS,
  SERVICE_NAMES,
  PUBSUB_CHANNELS,
  DASHBOARD_EVENT_TYPES,
  selectModel,
  logModelSelection,
  // Chunking pipeline imports
  estimateChunkTokens,
  type Event,
  type Evidence,
  type LLMAnalysisResult,
  type ModelSelectionResult,
  type RequestContext,
  findEventIdByRepoAndCommit,
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

// ==================== LLM Client Singleton ====================

// let: lazy-initialized singleton, assigned once on first call
let llmClientInstance: LLMClient | null = null;

/**
 * Get or create the LLM client singleton
 */
const getLLMClient = (): LLMClient => {
  if (!llmClientInstance) {
    llmClientInstance = new LLMClient();
    logger.info("LLM client initialized");
  }
  return llmClientInstance;
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
    // Include PR diff context for failure-to-change correlation
    prDiffContext: request.pr_diff
      ? {
          prNumber: request.pr_number ?? 0,
          changedFiles: request.pr_changed_files ?? [],
          diff: request.pr_diff,
          title: request.pr_title,
        }
      : undefined,
  };

  return { event, evidence };
};

// ==================== Core Analysis Functions ====================

/**
 * Analyze CI failure using OpenAI
 *
 * @param event - The event to analyze
 * @param evidence - Evidence collected for the analysis
 * @param context - Request context for tracing
 */
export const analyzeFailure = async (
  event: Event,
  evidence: Evidence,
  context: RequestContext
): Promise<LLMAnalysisResult> => {
  const logContext = { ...context };
  const llmClient = getLLMClient();

  try {
    const result = await llmClient.analyzeIncident(event, evidence);
    return result;
  } catch (error) {
    logger.error("LLM analysis failed", {
      eventId: event.id,
      error: getErrorMessage(error),
      ...logContext,
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
 *
 *
 * @param request - Analysis request with log content and metadata
 * @param context - Request context for tracing and tenant identification
 */
export const performAnalysis = async (
  request: AnalyzeRequest,
  context: RequestContext
): Promise<AnalyzeResponse> => {
  const logContext = { ...context };
  const { event, evidence: baseEvidence } = createAnalysisContext(request);

  // Select model version for this analysis (Phase 3 fine-tuning integration)
  const modelSelection = selectAnalysisModel(request.tenant_id);

  // Estimate log size to determine analysis path
  const estimatedTokens = estimateChunkTokens(request.failure_log);
  const useChunkingPipeline = estimatedTokens > CHUNKING_PIPELINE_CONFIG.TOKEN_THRESHOLD;

  logger.info("Starting CI failure analysis", {
    eventId: event.id,
    repository: request.repository,
    workflowId: request.workflow_id,
    modelVersionId: modelSelection.versionId,
    modelId: modelSelection.modelId,
    selectionReason: modelSelection.reason,
    estimatedTokens,
    useChunkingPipeline,
    ...logContext,
  });

  // Retrieve relevant knowledge documents via RAG (Phase 2 integration)
  // When tenantId is provided, enables cost tracking and budget-aware tier selection
  const relatedDocs = await retrieveRelevantKnowledge(
    request.repository,
    request.failure_log,
    request.tenant_id,
    context
  );

  // let: conditionally assigned from chunking pipeline or fallback path
  let enrichedEvidence: Evidence;

  if (useChunkingPipeline) {
    // Use chunking pipeline for large logs
    logger.info("Using chunking pipeline for large log", {
      eventId: event.id,
      repository: request.repository,
      estimatedTokens,
      ...logContext,
    });

    try {
      const aggregatedEvidence = await executeChunkingPipeline(
        request.failure_log,
        request.repository,
        context
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

      // Count artifacts by type for pipeline accuracy and debugging (logging only)
      const artifactsByType = aggregatedEvidence.artifacts.reduce(
        (acc, artifact) => {
          acc[artifact.type] = (acc[artifact.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );
      const artifactsWithTestName = aggregatedEvidence.artifacts.filter(
        (artifact) => artifact.testName
      ).length;

      logger.info("Chunking pipeline evidence prepared", {
        eventId: event.id,
        artifactCount: aggregatedEvidence.artifacts.length,
        artifactsByType,
        artifactsWithTestName,
        degradedMode: aggregatedEvidence.degraded_mode,
        ...logContext,
      });
    } catch (pipelineError) {
      logger.warn("Chunking pipeline failed, falling back to direct analysis", {
        eventId: event.id,
        repository: request.repository,
        error: getErrorMessage(pipelineError),
        ...logContext,
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

  logger.info("Evidence enriched with RAG documents", {
    eventId: event.id,
    relatedDocsCount: relatedDocs.length,
    usedChunkingPipeline: useChunkingPipeline,
    ...logContext,
  });

  const analysisResult = await analyzeFailure(event, enrichedEvidence, context);
  const confidenceResult = calculateConfidenceScore(analysisResult, enrichedEvidence);

  // Persist analysis to database for evaluation and fine-tuning
  const aggregationKey = request.commit
    ? `${request.repository}:${request.commit}`
    : request.repository;

  // Link analysis to the corresponding failure event in the events table
  const linkedEventId =
    request.tenant_id && request.commit
      ? await findEventIdByRepoAndCommit(request.tenant_id, request.repository, request.commit)
      : null;

  const savedAnalysis = await createAnalysis({
    eventId: linkedEventId,
    summary: analysisResult.summary,
    identifiedCause: analysisResult.identifiedCause,
    diagnosisConfidence: confidenceResult.finalScore,
    confidenceSignals: confidenceResult.breakdown as unknown as Record<string, unknown>,
    recommendedActions: analysisResult.recommendedActions?.map((action) => action.description),
    fullAnalysis: {
      ...(analysisResult as unknown as Record<string, unknown>),
      repository: request.repository,
    },
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
    ...logContext,
  });

  // Publish dashboard SSE notification (fire-and-forget)
  void (async () => {
    try {
      await publish(PUBSUB_CHANNELS.DASHBOARD, DASHBOARD_EVENT_TYPES.ANALYSIS_COMPLETE, {
        tenantId: request.tenant_id,
        analysisId: savedAnalysis.id,
        repository: request.repository,
        confidence: confidenceResult.finalScore,
      });
    } catch (publishError) {
      logger.warn("Failed to publish dashboard notification", {
        error: getErrorMessage(publishError),
        analysisId: savedAnalysis.id,
      });
    }
  })();

  return formatAnalysisResponse(analysisResult, enrichedEvidence, request.repository);
};

/**
 * Windowed Analysis
 *
 * Processes a single window of buffered log lines using incremental summarization.
 * Receives flushed lines + previous summary, runs through the analysis pipeline,
 * and produces an updated summary for carry-forward.
 *
 * For small windows: single LLM call with lines + summary.
 * For large windows: routes through existing chunking pipeline first.
 *
 * @module services/windowedAnalysis
 */

import {
  createLogger,
  getErrorMessage,
  WINDOW_ANALYSIS_BUDGET,
  estimateChunkTokens,
  EVENT_TYPES,
  EVENT_SEVERITY,
  type RequestContext,
  type IncidentSummary,
  type Evidence,
  type Event,
} from "@kenchi/shared";
import type { WindowAnalysisInput, WindowAnalysisResult } from "./deployAnalysisTypes.js";
import {
  executeChunkingPipeline,
  convertAggregatedToEvidence,
} from "./analysisChunkingPipeline.js";
import { analyzeFailure } from "./analysisService.js";

const logger = createLogger("windowed-analysis");

// ==================== Pure Helpers ====================

/**
 * Builds a system prompt section for incremental window analysis.
 * Includes the previous summary so the LLM has full context.
 */
const buildWindowPromptContext = (previousSummary: IncidentSummary | null): string => {
  if (!previousSummary) {
    return "This is the first window of log data for this deployment. Analyze the logs and produce a summary.";
  }

  const summaryLines = [
    `## Previous Analysis (Window ${String(previousSummary.windowCount)})`,
    `**Status:** ${previousSummary.currentStatus}`,
    `**Time Range:** ${previousSummary.timeRange.start} to ${previousSummary.timeRange.end}`,
    "",
    "### Key Findings",
    ...previousSummary.keyFindings.map((finding) => `- ${finding}`),
    "",
    "### Error Timeline",
    ...previousSummary.errorTimeline.map(
      (entry) => `- [${entry.severity}] ${entry.timestamp}: ${entry.message}`
    ),
  ];

  if (previousSummary.unresolvedIssues.length > 0) {
    summaryLines.push("", "### Unresolved Issues");
    previousSummary.unresolvedIssues.forEach((issue) => {
      summaryLines.push(`- ${issue}`);
    });
  }

  return summaryLines.join("\n");
};

/**
 * Estimates whether the window batch needs the chunking pipeline
 * or can be sent directly as a single LLM call.
 */
const shouldUseChunkingPipeline = (estimatedTokens: number): boolean =>
  estimatedTokens > WINDOW_ANALYSIS_BUDGET.MAX_BATCH_TOKENS;

/**
 * Builds direct evidence from raw log (no chunking pipeline).
 */
const buildDirectEvidence = (eventId: string, collectedAt: string, rawLog: string): Evidence => ({
  eventId,
  logs: [{ timestamp: collectedAt, message: rawLog, level: "ERROR", source: "deploy" }],
  collectedAt,
});

/**
 * Runs the chunking pipeline with fallback to direct evidence on failure.
 */
/** Input for buildChunkedEvidence to stay within max-params. */
interface ChunkedEvidenceInput {
  readonly rawLog: string;
  readonly repository: string;
  readonly eventId: string;
  readonly collectedAt: string;
  readonly entityId: string;
  readonly windowNumber: number;
}

const buildChunkedEvidence = async (
  input: ChunkedEvidenceInput,
  context: RequestContext
): Promise<Evidence> => {
  try {
    const aggregated = await executeChunkingPipeline(input.rawLog, input.repository, context);
    return convertAggregatedToEvidence(aggregated, input.eventId, input.collectedAt);
  } catch (error: unknown) {
    logger.warn("Chunking pipeline failed in window — using direct log", {
      entityId: input.entityId,
      windowNumber: input.windowNumber,
      error: getErrorMessage(error),
      ...context,
    });
    return buildDirectEvidence(input.eventId, input.collectedAt, input.rawLog);
  }
};

/**
 * Extracts an updated IncidentSummary from the LLM analysis result.
 */
const buildUpdatedSummary = (
  input: WindowAnalysisInput,
  collectedAt: string,
  analysisResult: {
    readonly summary: string;
    readonly identifiedCause?: string;
    readonly recommendedActions?: ReadonlyArray<{
      readonly description: string;
      readonly priority?: string;
    }>;
  }
): IncidentSummary => ({
  version: (input.previousSummary?.version ?? 0) + 1,
  windowCount: input.windowNumber,
  timeRange: {
    start: input.previousSummary?.timeRange.start ?? collectedAt,
    end: collectedAt,
  },
  currentStatus: analysisResult.identifiedCause ?? "investigating",
  keyFindings: [
    ...(input.previousSummary?.keyFindings ?? []).slice(0, 7),
    analysisResult.summary,
  ].slice(0, 10),
  errorTimeline: [
    ...(input.previousSummary?.errorTimeline ?? []).slice(0, 7),
    {
      timestamp: collectedAt,
      severity: "critical" as const,
      message: analysisResult.identifiedCause ?? analysisResult.summary,
    },
  ].slice(0, 10),
  unresolvedIssues: (analysisResult.recommendedActions ?? [])
    .filter((action) => action.priority === "high" || action.priority === "critical")
    .map((action) => action.description)
    .slice(0, 5),
  metricsSnapshot: `Window ${String(input.windowNumber)}: ${String(input.lines.length)} lines, ${String(input.estimatedTokens)} tokens`,
  tokenCount: estimateChunkTokens(JSON.stringify(analysisResult.summary)),
});

// ==================== Main Entry Point ====================

/**
 * Processes a single analysis window.
 *
 * Flow:
 * 1. Join flushed lines into raw log
 * 2. If large → run chunking pipeline (Stage 1-3) first
 * 3. Build event + evidence with previous summary as context
 * 4. Run LLM analysis
 * 5. Extract updated summary from result
 */
export const processWindow = async (
  input: WindowAnalysisInput,
  context: RequestContext
): Promise<WindowAnalysisResult> => {
  const logContext = { ...context };
  const startTime = Date.now();
  const rawLog = input.lines.join("\n");
  const useChunking = shouldUseChunkingPipeline(input.estimatedTokens);
  const eventId = `window-${input.entityId}-${String(input.windowNumber)}`;
  const collectedAt = new Date().toISOString();

  logger.info("Starting window analysis", {
    provider: "llm",
    operation: "windowAnalysis",
    entityId: input.entityId,
    platform: input.platform,
    windowNumber: input.windowNumber,
    lineCount: input.lines.length,
    estimatedTokens: input.estimatedTokens,
    useChunking,
    hasPreviousSummary: input.previousSummary !== null,
    ...logContext,
  });

  // Build evidence — chunking pipeline for large batches, direct for small
  const evidence = useChunking
    ? await buildChunkedEvidence(
        {
          rawLog,
          repository: input.metadata.repository,
          eventId,
          collectedAt,
          entityId: input.entityId,
          windowNumber: input.windowNumber,
        },
        context
      )
    : buildDirectEvidence(eventId, collectedAt, rawLog);

  // Build event with previous summary in payload for LLM context
  const previousContext = buildWindowPromptContext(input.previousSummary);
  const event: Event = {
    id: eventId,
    type: EVENT_TYPES.CICD_FAILURE,
    source: input.platform,
    timestamp: new Date().toISOString(),
    severity: EVENT_SEVERITY.HIGH,
    title: `Deploy failure in ${input.metadata.repository} (window ${String(input.windowNumber)})`,
    payload: {
      repository: input.metadata.repository,
      branch: input.metadata.branch,
      commit: input.metadata.commit,
      platform: input.platform,
      deployId: input.entityId,
      previousAnalysisContext: previousContext,
    },
  };

  // Run LLM analysis
  const analysisResult = await analyzeFailure(event, evidence, context);

  // Build updated summary
  const updatedSummary = buildUpdatedSummary(input, collectedAt, analysisResult);

  const durationMs = Date.now() - startTime;
  logger.info("Window analysis completed", {
    provider: "llm",
    operation: "windowAnalysis",
    durationMs,
    entityId: input.entityId,
    windowNumber: input.windowNumber,
    summaryVersion: updatedSummary.version,
    keyFindingsCount: updatedSummary.keyFindings.length,
    ...logContext,
  });

  return {
    windowNumber: input.windowNumber,
    linesProcessed: input.lines.length,
    tokensProcessed: input.estimatedTokens,
    updatedSummary,
    usedChunkingPipeline: useChunking,
  };
};

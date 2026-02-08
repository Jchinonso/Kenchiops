/**
 * Slack Resolution Ingestion
 *
 * Integrates Slack resolution detection with the RAG ingestion pipeline.
 * Captures resolved issues from Slack threads as knowledge documents.
 *
 * @module rag/slackResolutionIngestion
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import { KNOWLEDGE_DOC_TYPES } from "../constants/index.js";
import { ingestKnowledgeDoc } from "./ingestion.js";
import { detectResolution } from "./slackResolutionDetector.js";
import type { SlackResolutionMetadata } from "./schemas/index.js";
import type {
  SlackThread,
  DetectedResolution,
  IngestSlackResolutionInput,
  SlackResolutionFailureContext,
  IngestSlackResolutionResult,
  BatchIngestSlackResolutionsResult,
  BatchAccumulator,
} from "./types.js";

export type {
  IngestSlackResolutionInput,
  SlackResolutionFailureContext,
  IngestSlackResolutionResult,
  BatchIngestSlackResolutionsResult,
} from "./types.js";

const logger = createLogger("slack-resolution-ingestion");

// ==================== Content Building ====================

/**
 * Builds the title for a Slack resolution document.
 */
const buildResolutionTitle = (
  resolution: DetectedResolution,
  thread: SlackThread,
  failureContext?: SlackResolutionFailureContext
): string => {
  // Use failure context if available
  if (failureContext?.checkName) {
    return `Resolution: ${failureContext.checkName} failure`;
  }

  // Use original issue if available
  if (thread.originalIssue) {
    const issuePreview = thread.originalIssue.substring(0, 50);
    return `Resolution: ${issuePreview}${thread.originalIssue.length > 50 ? "..." : ""}`;
  }

  // Use channel name if available
  if (thread.channelName) {
    return `Resolution from #${thread.channelName}`;
  }

  // Fallback to thread timestamp
  return `Resolution (${thread.threadTs})`;
};

/**
 * Builds comprehensive content for the knowledge document.
 */
const buildResolutionDocContent = (
  resolution: DetectedResolution,
  thread: SlackThread,
  failureContext?: SlackResolutionFailureContext
): string => {
  const sections: string[] = [];

  // Problem section
  sections.push("## Problem");
  if (failureContext?.errorMessage) {
    sections.push(failureContext.errorMessage);
  } else if (thread.originalIssue) {
    sections.push(thread.originalIssue);
  } else {
    sections.push("Issue discussed in Slack thread.");
  }

  // Context section if we have failure details
  if (failureContext && (failureContext.checkName || failureContext.affectedFiles?.length)) {
    sections.push("\n## Context");
    if (failureContext.checkName) {
      sections.push(`- Check: ${failureContext.checkName}`);
    }
    if (failureContext.prNumber) {
      sections.push(`- PR: #${failureContext.prNumber}`);
    }
    if (failureContext.affectedFiles?.length) {
      sections.push(`- Files: ${failureContext.affectedFiles.slice(0, 5).join(", ")}`);
    }
  }

  // Resolution section
  sections.push("\n## Resolution");
  sections.push(resolution.resolutionContent);

  // Confidence section
  sections.push("\n## Detection Metadata");
  sections.push(`- Confidence: ${(resolution.confidence * 100).toFixed(0)}%`);
  sections.push(`- Patterns matched: ${resolution.matchedPatterns.join(", ") || "none"}`);
  if (resolution.hasCodeBlock) {
    sections.push("- Contains code example");
  }
  if (resolution.hasPositiveReactions) {
    sections.push("- Confirmed by reactions");
  }
  if (resolution.resolverUsername) {
    sections.push(`- Resolver: @${resolution.resolverUsername}`);
  }

  // Source section
  sections.push("\n## Source");
  sections.push(`- Channel: ${thread.channelName ?? thread.channelId}`);
  sections.push(`- Thread: ${thread.threadTs}`);
  if (thread.repository) {
    sections.push(`- Repository: ${thread.repository}`);
  }

  return sections.join("\n");
};

/**
 * Builds metadata for the knowledge document.
 */
const buildResolutionMetadata = (
  resolution: DetectedResolution,
  thread: SlackThread,
  failureContext?: SlackResolutionFailureContext
): SlackResolutionMetadata => ({
  // Base metadata defaults
  hitCount: 0,
  negativeFeedbackCount: 0,
  repository: thread.repository,
  // Thread identification
  channelId: thread.channelId,
  channelName: thread.channelName,
  threadTs: thread.threadTs,
  resolutionMessageTs: resolution.resolutionMessageTs,
  // User information
  resolverUserId: resolution.resolverUserId,
  resolverUsername: resolution.resolverUsername,
  // Detection signals
  confidence: resolution.confidence,
  matchedPatterns: [...resolution.matchedPatterns],
  hasCodeBlock: resolution.hasCodeBlock,
  hasPositiveReactions: resolution.hasPositiveReactions,
  // Context from failure
  ...(failureContext?.checkName && { checkName: failureContext.checkName }),
  ...(failureContext?.prNumber && { prNumber: failureContext.prNumber }),
  ...(failureContext?.affectedFiles && { affectedFiles: [...failureContext.affectedFiles] }),
});

/**
 * Builds a Slack URL for the thread.
 */
const buildSlackUrl = (thread: SlackThread): string => {
  // Slack deep links format: slack://channel?team=TEAM&id=CHANNEL&message=TS
  // Web format: https://WORKSPACE.slack.com/archives/CHANNEL/p{ts without dot}
  const tsWithoutDot = thread.threadTs.replace(".", "");
  return `slack://channel?id=${thread.channelId}&message=${tsWithoutDot}`;
};

// ==================== Public API ====================

/**
 * Analyzes a Slack thread for resolution and ingests if found.
 *
 * This is the main entry point for capturing Slack resolutions.
 * It detects resolution signals, validates the finding, and
 * ingests the knowledge into the RAG system.
 *
 * @param input - The ingestion input
 * @returns Result with detection and ingestion details
 */
export const ingestSlackResolution = async (
  input: IngestSlackResolutionInput
): Promise<IngestSlackResolutionResult> => {
  const { thread, tenantId, repository, failureContext } = input;

  logger.info("Analyzing Slack thread for resolution", {
    channelId: thread.channelId,
    threadTs: thread.threadTs,
    messageCount: thread.messages.length,
    hasFailureContext: !!failureContext,
  });

  try {
    // Detect resolution in thread
    const detectionResult = detectResolution(thread);

    if (!detectionResult.hasResolution || !detectionResult.resolution) {
      logger.info("No resolution detected in thread", {
        channelId: thread.channelId,
        threadTs: thread.threadTs,
        candidatesFound: detectionResult.allCandidates.length,
        topScore: detectionResult.analysisMetadata.topScore,
      });

      return {
        success: true,
        resolutionDetected: false,
        resolution: null,
        ingestionResult: null,
        detectionResult,
      };
    }

    const { resolution } = detectionResult;

    // Build document content
    const title = buildResolutionTitle(resolution, thread, failureContext);
    const content = buildResolutionDocContent(resolution, thread, failureContext);
    const metadata = buildResolutionMetadata(resolution, thread, failureContext);

    logger.info("Resolution detected, ingesting", {
      channelId: thread.channelId,
      threadTs: thread.threadTs,
      confidence: resolution.confidence,
      title,
      contentLength: content.length,
    });

    // Ingest the resolution
    const ingestionResult = await ingestKnowledgeDoc({
      docType: KNOWLEDGE_DOC_TYPES.SLACK_RESOLUTION,
      title,
      content,
      tenantId,
      repository: repository ?? thread.repository,
      sourceUrl: buildSlackUrl(thread),
      metadata,
    });

    logger.info("Slack resolution ingested", {
      channelId: thread.channelId,
      threadTs: thread.threadTs,
      chunksCreated: ingestionResult.chunksCreated,
      chunksEmbedded: ingestionResult.chunksEmbedded,
      parentId: ingestionResult.parentId,
    });

    return {
      success: ingestionResult.success,
      resolutionDetected: true,
      resolution,
      ingestionResult,
      detectionResult,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    logger.error("Failed to ingest Slack resolution", {
      channelId: thread.channelId,
      threadTs: thread.threadTs,
      error: errorMessage,
    });

    return {
      success: false,
      resolutionDetected: false,
      resolution: null,
      ingestionResult: null,
      detectionResult: {
        hasResolution: false,
        resolution: null,
        allCandidates: [],
        analysisMetadata: {
          messagesAnalyzed: 0,
          candidatesFound: 0,
          topScore: 0,
          patternMatchCounts: {},
        },
      },
      error: errorMessage,
    };
  }
};

/**
 * Processes a single thread and updates the accumulator.
 * Used for sequential batch processing.
 */
const processThreadSequentially = async (
  accumulator: BatchAccumulator,
  thread: SlackThread,
  tenantId?: string
): Promise<BatchAccumulator> => {
  const result = await ingestSlackResolution({ thread, tenantId });

  return {
    results: [...accumulator.results, result],
    successCount: accumulator.successCount + (result.success ? 1 : 0),
    resolutionsDetected: accumulator.resolutionsDetected + (result.resolutionDetected ? 1 : 0),
    errorCount: accumulator.errorCount + (result.success ? 0 : 1),
  };
};

/**
 * Batch processes multiple Slack threads for resolution ingestion.
 *
 * Useful for catching up on threads from a channel or search results.
 * Processes threads sequentially to avoid rate limiting.
 *
 * @param threads - Array of threads to process
 * @param tenantId - Optional tenant ID
 * @returns Summary of batch processing
 */
export const batchIngestSlackResolutions = async (
  threads: readonly SlackThread[],
  tenantId?: string
): Promise<BatchIngestSlackResolutionsResult> => {
  logger.info("Starting batch Slack resolution ingestion", {
    threadCount: threads.length,
    tenantId,
  });

  const initialAccumulator: BatchAccumulator = {
    results: [],
    successCount: 0,
    resolutionsDetected: 0,
    errorCount: 0,
  };

  // Process threads sequentially using reduce to avoid rate limiting
  const finalAccumulator = await threads.reduce<Promise<BatchAccumulator>>(
    async (accumulatorPromise, thread) => {
      const accumulator = await accumulatorPromise;
      return processThreadSequentially(accumulator, thread, tenantId);
    },
    Promise.resolve(initialAccumulator)
  );

  logger.info("Batch Slack resolution ingestion complete", {
    threadCount: threads.length,
    successCount: finalAccumulator.successCount,
    resolutionsDetected: finalAccumulator.resolutionsDetected,
    errorCount: finalAccumulator.errorCount,
  });

  return {
    threadsProcessed: threads.length,
    successCount: finalAccumulator.successCount,
    resolutionsDetected: finalAccumulator.resolutionsDetected,
    errorCount: finalAccumulator.errorCount,
    results: finalAccumulator.results,
  };
};

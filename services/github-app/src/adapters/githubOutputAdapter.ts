/**
 * GitHub Actions Output Adapter
 *
 * Implements CIOutputPort for GitHub Actions.
 * Wraps existing consolidatedPoster that posts PR comments,
 * check annotations, and Slack notifications.
 *
 * @module adapters/githubOutputAdapter
 */

import {
  createLogger,
  getErrorMessage,
  ExternalServiceError,
  type CIOutputPort,
  type AggregatedFailures,
  type ConsolidatedPostResult,
  type RequestContext,
} from "@kenchi/shared";
import { postConsolidatedAnalysis } from "../services/aggregation/consolidatedPoster.js";

const logger = createLogger("github-output");

// ==================== Adapter ====================

export const githubOutputAdapter: CIOutputPort = {
  postAnalysisResults: async (
    aggregation: AggregatedFailures,
    context: RequestContext
  ): Promise<ConsolidatedPostResult> => {
    const startTime = Date.now();

    try {
      const result = await postConsolidatedAnalysis(aggregation);
      const durationMs = Date.now() - startTime;

      logger.info("Posted analysis results to GitHub", {
        provider: "github",
        operation: "postAnalysisResults",
        durationMs,
        repository: aggregation.repository.fullName,
        prCommentsPosted: result.prCommentsPosted,
        slackMessageSent: result.slackMessageSent,
        checkAnnotationsCreated: result.checkAnnotationsCreated,
        ...context,
      });

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error("Failed to post analysis results", {
        provider: "github",
        operation: "postAnalysisResults",
        durationMs,
        repository: aggregation.repository.fullName,
        error: getErrorMessage(error),
        ...context,
      });
      throw new ExternalServiceError(
        "github",
        `Failed to post analysis: ${getErrorMessage(error)}`,
        { retryable: true }
      );
    }
  },
};

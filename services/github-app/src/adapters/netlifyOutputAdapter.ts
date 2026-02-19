/**
 * Netlify Output Adapter
 *
 * Implements CIOutputPort for Netlify deploys.
 * Reuses the existing consolidatedPoster to post analysis results
 * to GitHub PRs (if linked) and Slack.
 *
 * @module adapters/netlifyOutputAdapter
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

const logger = createLogger("netlify-output");

// ==================== Adapter ====================

export const netlifyOutputAdapter: CIOutputPort = {
  postAnalysisResults: async (
    aggregation: AggregatedFailures,
    context: RequestContext
  ): Promise<ConsolidatedPostResult> => {
    const startTime = Date.now();

    try {
      // Reuse existing consolidated poster — it handles PR comments (if PRs exist),
      // Slack notifications, and check annotations. For Netlify deploys,
      // PR comments go to the linked GitHub PR via the PR numbers in the aggregation.
      const result = await postConsolidatedAnalysis(aggregation);
      const durationMs = Date.now() - startTime;

      logger.info("Posted Netlify analysis results", {
        provider: "netlify",
        operation: "postAnalysisResults",
        durationMs,
        // statusCode: N/A — wraps internal consolidatedPoster, HTTP status not propagated
        repository: aggregation.repository.fullName,
        prCommentsPosted: result.prCommentsPosted,
        slackMessageSent: result.slackMessageSent,
        checkAnnotationsCreated: result.checkAnnotationsCreated,
        ...context,
      });

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error("Failed to post Netlify analysis results", {
        provider: "netlify",
        operation: "postAnalysisResults",
        durationMs,
        repository: aggregation.repository.fullName,
        error: getErrorMessage(error),
        ...context,
      });
      throw new ExternalServiceError(
        "netlify",
        `Failed to post analysis: ${getErrorMessage(error)}`,
        { retryable: true }
      );
    }
  },
};

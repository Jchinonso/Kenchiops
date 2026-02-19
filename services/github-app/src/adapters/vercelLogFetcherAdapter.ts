/**
 * Vercel Log Fetcher Adapter
 *
 * Implements CILogFetcherPort for Vercel deployments.
 * Fetches build logs from Vercel's deployment events API.
 *
 * @module adapters/vercelLogFetcherAdapter
 */

import {
  createLogger,
  getErrorMessage,
  ExternalServiceError,
  stripAnsiCodes,
  VERCEL_API_BASE_URL,
  type CILogFetcherPort,
  type FetchedBuildLogs,
  type RequestContext,
} from "@kenchi/shared";
import { appConfig } from "../config/appConfig.js";
import type { VercelDeploymentLogEvent } from "../types/vercelTypes.js";

const logger = createLogger("vercel-log-fetcher");

/** Event types that contain build log output. */
const LOG_EVENT_TYPES: ReadonlySet<string> = new Set(["stdout", "stderr", "command"]);

/** Timeout for Vercel API requests. */
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Concatenate log text from deployment events,
 * filtering to stdout/stderr/command events only.
 * Strips ANSI escape codes (common in Next.js/TypeScript compiler output).
 */
const buildLogText = (events: readonly VercelDeploymentLogEvent[]): string => {
  const rawText = events
    .filter((event) => LOG_EVENT_TYPES.has(event.type) && event.payload.text)
    .map((event) => event.payload.text)
    .join("\n");

  return stripAnsiCodes(rawText);
};

// ==================== Adapter ====================

export const vercelLogFetcherAdapter: CILogFetcherPort = {
  fetchBuildLogs: async (
    buildId: string,
    _owner: string,
    _repo: string,
    _installationId: number,
    context: RequestContext
  ): Promise<FetchedBuildLogs> => {
    const startTime = Date.now();
    const url = `${VERCEL_API_BASE_URL}/v6/deployments/${buildId}/events`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${appConfig.vercel.apiToken}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        logger.error("Vercel API error fetching deployment events", {
          provider: "vercel",
          operation: "fetchBuildLogs",
          durationMs,
          statusCode: response.status,
          buildId,
          ...context,
        });
        throw new ExternalServiceError(
          "vercel",
          `Failed to fetch deployment events: HTTP ${response.status}`,
          { retryable: response.status >= 500 || response.status === 429 }
        );
      }

      const events = (await response.json()) as readonly VercelDeploymentLogEvent[];
      const logs = buildLogText(events);

      logger.info("Fetched Vercel deployment logs", {
        provider: "vercel",
        operation: "fetchBuildLogs",
        durationMs,
        statusCode: response.status,
        buildId,
        eventCount: events.length,
        logLength: logs.length,
        ...context,
      });

      return {
        buildId,
        // Deployment name is not available at fetch time — only the buildId (deployment ID) is passed
        buildName: buildId,
        logs,
        durationMs,
      };
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      const durationMs = Date.now() - startTime;
      logger.error("Failed to fetch Vercel deployment logs", {
        provider: "vercel",
        operation: "fetchBuildLogs",
        durationMs,
        buildId,
        error: getErrorMessage(error),
        ...context,
      });
      throw new ExternalServiceError(
        "vercel",
        `Failed to fetch deployment logs: ${getErrorMessage(error)}`,
        { retryable: true }
      );
    }
  },

  fetchAllFailedLogs: async (
    commitSha: string,
    _owner: string,
    _repo: string,
    _installationId: number,
    context: RequestContext
  ): Promise<readonly FetchedBuildLogs[]> => {
    // Vercel webhooks arrive per-deployment, so batch fetching is not needed.
    // Individual deployments are fetched via fetchBuildLogs when the aggregation resolves.
    logger.info("fetchAllFailedLogs is a no-op for Vercel (per-deployment webhooks)", {
      provider: "vercel",
      operation: "fetchAllFailedLogs",
      commitSha,
      ...context,
    });
    return [];
  },
};

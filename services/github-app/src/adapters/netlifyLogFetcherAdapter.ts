/**
 * Netlify Log Fetcher Adapter
 *
 * Implements CILogFetcherPort for Netlify deploys.
 * Fetches build logs from Netlify's deploy log API.
 *
 * @module adapters/netlifyLogFetcherAdapter
 */

import {
  createLogger,
  getErrorMessage,
  ExternalServiceError,
  stripAnsiCodes,
  NETLIFY_API_BASE_URL,
  type CILogFetcherPort,
  type FetchedBuildLogs,
  type RequestContext,
} from "@kenchi/shared";
import { appConfig } from "../config/appConfig.js";
import type { NetlifyLogEntry } from "../types/netlifyTypes.js";

const logger = createLogger("netlify-log-fetcher");

/** Timeout for Netlify API requests. */
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Concatenate log text from deploy log entries,
 * filtering to entries with a non-empty msg field.
 * Strips ANSI escape codes (common in build output).
 */
const buildLogText = (entries: readonly NetlifyLogEntry[]): string => {
  const rawText = entries
    .filter((entry) => entry.msg)
    .map((entry) => entry.msg)
    .join("\n");

  return stripAnsiCodes(rawText);
};

// ==================== Adapter ====================

export const netlifyLogFetcherAdapter: CILogFetcherPort = {
  fetchBuildLogs: async (
    buildId: string,
    _owner: string,
    _repo: string,
    _installationId: number,
    context: RequestContext
  ): Promise<FetchedBuildLogs> => {
    const startTime = Date.now();
    const url = `${NETLIFY_API_BASE_URL}/deploys/${buildId}/log`;

    try {
      const response = await globalThis.fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${appConfig.netlify.apiToken}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        logger.error("Netlify API error fetching deploy logs", {
          provider: "netlify",
          operation: "fetchBuildLogs",
          durationMs,
          statusCode: response.status,
          buildId,
          ...context,
        });
        throw new ExternalServiceError(
          "netlify",
          `Failed to fetch deploy logs: HTTP ${response.status}`,
          { retryable: response.status >= 500 || response.status === 429 }
        );
      }

      const entries = (await response.json()) as readonly NetlifyLogEntry[];
      const logs = buildLogText(entries);

      logger.info("Fetched Netlify deploy logs", {
        provider: "netlify",
        operation: "fetchBuildLogs",
        durationMs,
        statusCode: response.status,
        buildId,
        entryCount: entries.length,
        logLength: logs.length,
        ...context,
      });

      return {
        buildId,
        buildName: buildId,
        logs,
        durationMs,
      };
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      const durationMs = Date.now() - startTime;
      logger.error("Failed to fetch Netlify deploy logs", {
        provider: "netlify",
        operation: "fetchBuildLogs",
        durationMs,
        buildId,
        error: getErrorMessage(error),
        ...context,
      });
      throw new ExternalServiceError(
        "netlify",
        `Failed to fetch deploy logs: ${getErrorMessage(error)}`,
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
    // Netlify webhooks arrive per-deployment, so batch fetching is not needed.
    // Individual deploys are fetched via fetchBuildLogs when the aggregation resolves.
    logger.info("fetchAllFailedLogs is a no-op for Netlify (per-deployment webhooks)", {
      provider: "netlify",
      operation: "fetchAllFailedLogs",
      commitSha,
      ...context,
    });
    return [];
  },
};

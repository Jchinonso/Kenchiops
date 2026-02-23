/**
 * Netlify Monitoring Adapter
 *
 * Queries the Netlify API for recent failed deploys relevant to an
 * investigation. Uses resilientGet for automatic retry, circuit breaker,
 * and timeout. Returns empty arrays on failure -- never throws.
 *
 * @module adapters/netlifyMonitoringAdapter
 */

import {
  resilientGet,
  createLogger,
  getErrorMessage,
  redactSecrets,
  truncateText,
  type RequestContext,
} from "@kenchi/shared";
import type { InvestigationEvidenceItem } from "../types/investigationTypes.js";
import type {
  MonitoringAdapter,
  MonitoringQuery,
  NetlifyDeploy,
  NetlifyDeploysResponse,
} from "../types/monitoringTypes.js";
import { INVESTIGATION_RELEVANCE } from "../constants/investigationConstants.js";
import {
  MONITORING_DEFAULTS,
  NETLIFY_API,
  NETLIFY_ERROR_DEPLOY_STATES,
  MS_PER_HOUR,
} from "../constants/monitoringConstants.js";

const logger = createLogger("netlify-monitoring-adapter");

// ==================== Internal Helpers ====================

/**
 * Maps a Netlify deploy to an InvestigationEvidenceItem.
 */
const mapDeployToEvidence = (
  deploy: NetlifyDeploy,
  serviceName: string | null
): InvestigationEvidenceItem => {
  const {
    id,
    state,
    name,
    created_at: createdAt,
    error_message: errorMessage,
    branch,
    commit_ref: commitRef,
    commit_url: commitUrl,
    title: deployTitle,
    context: deployContext,
  } = deploy;

  const projectName = name ?? "unknown";
  const serviceMatches =
    serviceName !== null && projectName.toLowerCase().includes(serviceName.toLowerCase());

  const isError = NETLIFY_ERROR_DEPLOY_STATES.has(state);
  const relevance = serviceMatches
    ? isError
      ? INVESTIGATION_RELEVANCE.MONITORING_ALERT_SERVICE_MATCH
      : INVESTIGATION_RELEVANCE.MONITORING_SERVICE_MATCH
    : isError
      ? INVESTIGATION_RELEVANCE.MONITORING_ALERT_BASE
      : INVESTIGATION_RELEVANCE.MONITORING_BASE;

  const summaryParts = [
    `Deploy ${id.slice(0, 8)} (${state})`,
    branch ? `branch: ${branch}` : null,
    commitRef ? `commit: ${commitRef.slice(0, 8)}` : null,
    deployTitle ? truncateText(deployTitle, 100) : null,
    errorMessage ? `error: ${truncateText(errorMessage, 150)}` : null,
  ].filter((part): part is string => part !== null);

  return {
    id: `netlify-deploy-${id}`,
    source: "netlify_deploys",
    title: truncateText(`Netlify Deploy: ${projectName} (${state})`, 200),
    summary: truncateText(summaryParts.join(" | "), 300),
    relevance,
    timestamp: createdAt,
    metadata: {
      deployId: id,
      projectName,
      state,
      branch: branch ?? null,
      commitRef: commitRef ?? null,
      commitUrl: commitUrl ?? null,
      errorMessage: errorMessage ?? null,
      deployContext: deployContext ?? null,
      deployUrl: deploy.deploy_url ?? null,
    },
  };
};

/**
 * Fetches recent deploys from Netlify /api/v1/sites/:site_id/deploys endpoint.
 */
const fetchNetlifyDeploys = async (
  apiToken: string,
  siteId: string,
  query: MonitoringQuery,
  context: RequestContext
): Promise<readonly InvestigationEvidenceItem[]> => {
  const perPage = Math.min(query.limit, MONITORING_DEFAULTS.MAX_RESULTS_PER_PROVIDER);
  const url = `${NETLIFY_API.BASE_URL}${NETLIFY_API.DEPLOYS_PATH_PREFIX}${encodeURIComponent(siteId)}${NETLIFY_API.DEPLOYS_PATH_SUFFIX}?per_page=${String(perPage)}`;
  const startTime = Date.now();

  try {
    const response = await resilientGet<NetlifyDeploysResponse>(url, {
      timeout: MONITORING_DEFAULTS.REQUEST_TIMEOUT_MS,
      maxRetries: MONITORING_DEFAULTS.MAX_RETRIES,
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    });

    const durationMs = Date.now() - startTime;
    const allDeploys = response.data;

    // Filter by time window first, then by error state
    const cutoffMs = Date.now() - query.hoursBack * MS_PER_HOUR;
    const recentDeploys = allDeploys.filter(
      (deploy) => new Date(deploy.created_at).getTime() >= cutoffMs
    );

    const failedDeploys = recentDeploys.filter(
      (deploy) =>
        NETLIFY_ERROR_DEPLOY_STATES.has(deploy.state) || deploy.error_message !== undefined
    );

    logger.info("Netlify deploys fetched", {
      provider: "netlify",
      operation: "fetchDeploys",
      durationMs,
      statusCode: response.status,
      totalDeploys: allDeploys.length,
      recentDeploys: recentDeploys.length,
      failedDeploys: failedDeploys.length,
      ...context,
    });

    return failedDeploys
      .slice(0, MONITORING_DEFAULTS.MAX_RESULTS_PER_PROVIDER)
      .map((deploy) => mapDeployToEvidence(deploy, query.serviceName));
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = getErrorMessage(error);
    const statusCode = (error as { status?: number }).status;
    const isRetryable =
      errorMsg.includes("timeout") || (statusCode !== undefined && statusCode >= 500);

    logger.warn("Netlify deploys fetch failed", {
      provider: "netlify",
      operation: "fetchDeploys",
      durationMs,
      statusCode,
      retryable: isRetryable,
      error: redactSecrets(errorMsg),
      ...context,
    });
    return [];
  }
};

// ==================== Factory ====================

/**
 * Creates a Netlify monitoring adapter.
 *
 * @param apiToken - Netlify API token for authentication
 * @param siteId - Netlify site ID to query deploys for
 * @returns MonitoringAdapter implementation for Netlify
 */
export const createNetlifyMonitoringAdapter = (
  apiToken: string,
  siteId: string
): MonitoringAdapter => ({
  name: "netlify",

  isConfigured: (): boolean => apiToken.length > 0 && siteId.length > 0,

  fetchEvidence: async (
    query: MonitoringQuery,
    context: RequestContext
  ): Promise<readonly InvestigationEvidenceItem[]> => {
    const startTime = Date.now();

    try {
      const evidence = await fetchNetlifyDeploys(apiToken, siteId, query, context);
      const durationMs = Date.now() - startTime;

      logger.info("Netlify evidence gathered", {
        provider: "netlify",
        operation: "gatherEvidence",
        durationMs,
        deployCount: evidence.length,
        ...context,
      });

      return evidence;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = getErrorMessage(error);
      const statusCode = (error as { status?: number }).status;
      const isRetryable =
        errorMsg.includes("timeout") || (statusCode !== undefined && statusCode >= 500);

      logger.warn("Netlify evidence gathering failed", {
        provider: "netlify",
        operation: "gatherEvidence",
        durationMs,
        statusCode,
        retryable: isRetryable,
        error: redactSecrets(errorMsg),
        ...context,
      });
      return [];
    }
  },
});

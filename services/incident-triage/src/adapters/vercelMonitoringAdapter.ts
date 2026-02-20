/**
 * Vercel Monitoring Adapter
 *
 * Queries the Vercel API for recent failed or errored deployments relevant
 * to an investigation. Uses resilientGet for automatic retry, circuit
 * breaker, and timeout. Returns empty arrays on failure -- never throws.
 *
 * @module adapters/vercelMonitoringAdapter
 */

import {
  resilientGet,
  createLogger,
  getErrorMessage,
  truncateText,
  VERCEL_API_BASE_URL,
  type RequestContext,
} from "@kenchi/shared";
import type { InvestigationEvidenceItem } from "../types/investigationTypes.js";
import type {
  MonitoringAdapter,
  MonitoringQuery,
  VercelDeployment,
  VercelDeploymentsResponse,
} from "../types/monitoringTypes.js";
import { INVESTIGATION_RELEVANCE } from "../constants/investigationConstants.js";
import {
  MONITORING_DEFAULTS,
  VERCEL_API,
  VERCEL_ERROR_DEPLOYMENT_STATES,
} from "../constants/monitoringConstants.js";

// ==================== Internal Helpers ====================

/**
 * Maps a Vercel deployment to an InvestigationEvidenceItem.
 */
const mapDeploymentToEvidence = (
  deployment: VercelDeployment,
  serviceName: string | null
): InvestigationEvidenceItem => {
  const { uid, name, state, created, meta, creator, errorCode, errorMessage, inspectorUrl } =
    deployment;

  const serviceMatches =
    serviceName !== null && name.toLowerCase().includes(serviceName.toLowerCase());

  const isError = VERCEL_ERROR_DEPLOYMENT_STATES.has(state);
  const relevance = serviceMatches
    ? isError
      ? INVESTIGATION_RELEVANCE.MONITORING_ALERT_SERVICE_MATCH
      : INVESTIGATION_RELEVANCE.MONITORING_SERVICE_MATCH
    : isError
      ? INVESTIGATION_RELEVANCE.MONITORING_ALERT_BASE
      : INVESTIGATION_RELEVANCE.MONITORING_BASE;

  const commitSha = meta?.githubCommitSha ?? meta?.gitlabCommitSha ?? null;
  const commitMessage = meta?.githubCommitMessage ?? meta?.gitlabCommitMessage ?? null;

  const summaryParts = [
    `Deployment ${uid} (${state})`,
    commitSha ? `commit: ${commitSha.slice(0, 8)}` : null,
    commitMessage ? truncateText(commitMessage, 100) : null,
    errorMessage ? `error: ${truncateText(errorMessage, 150)}` : null,
  ].filter((part): part is string => part !== null);

  return {
    id: `vercel-deploy-${uid}`,
    source: "vercel_deployments",
    title: truncateText(`Vercel Deployment: ${name} (${state})`, 200),
    summary: truncateText(summaryParts.join(" | "), 300),
    relevance,
    timestamp: new Date(created).toISOString(),
    metadata: {
      deploymentUid: uid,
      projectName: name,
      state,
      errorCode: errorCode ?? null,
      errorMessage: errorMessage ?? null,
      commitSha,
      commitMessage,
      creatorUsername: creator?.username ?? null,
      inspectorUrl: inspectorUrl ?? null,
    },
  };
};

/**
 * Fetches recent deployments from Vercel, filtering by error/canceled state.
 */
const fetchVercelDeployments = async (
  apiToken: string,
  teamId: string,
  query: MonitoringQuery,
  context: RequestContext
): Promise<readonly InvestigationEvidenceItem[]> => {
  const adapterLogger = createLogger("vercel-monitoring-adapter");
  const now = Date.now();
  const since = now - query.hoursBack * 3600000;
  const teamParam = teamId ? `&teamId=${encodeURIComponent(teamId)}` : "";
  const url = `${VERCEL_API_BASE_URL}${VERCEL_API.DEPLOYMENTS}?limit=${String(query.limit)}${teamParam}&since=${String(since)}`;
  const startTime = Date.now();

  try {
    const response = await resilientGet<VercelDeploymentsResponse>(url, {
      timeout: MONITORING_DEFAULTS.REQUEST_TIMEOUT_MS,
      maxRetries: MONITORING_DEFAULTS.MAX_RETRIES,
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    });

    const durationMs = Date.now() - startTime;
    const allDeployments = response.data.deployments ?? [];

    // Filter to only error/canceled deployments
    const failedDeployments = allDeployments.filter((deployment) =>
      VERCEL_ERROR_DEPLOYMENT_STATES.has(deployment.state)
    );

    adapterLogger.info("Vercel deployments fetched", {
      provider: "vercel",
      operation: "fetchDeployments",
      durationMs,
      statusCode: response.status,
      totalDeployments: allDeployments.length,
      failedDeployments: failedDeployments.length,
      ...context,
    });

    return failedDeployments
      .slice(0, MONITORING_DEFAULTS.MAX_RESULTS_PER_PROVIDER)
      .map((deployment) => mapDeploymentToEvidence(deployment, query.serviceName));
  } catch (error) {
    const durationMs = Date.now() - startTime;
    adapterLogger.warn("Vercel deployments fetch failed", {
      provider: "vercel",
      operation: "fetchDeployments",
      durationMs,
      error: getErrorMessage(error),
      ...context,
    });
    return [];
  }
};

// ==================== Factory ====================

/**
 * Creates a Vercel monitoring adapter.
 *
 * @param apiToken - Vercel API token for authentication
 * @param teamId - Vercel team ID for scoping queries
 * @returns MonitoringAdapter implementation for Vercel
 */
export const createVercelMonitoringAdapter = (
  apiToken: string,
  teamId: string
): MonitoringAdapter => ({
  name: "vercel",

  isConfigured: (): boolean => apiToken.length > 0,

  fetchEvidence: async (
    query: MonitoringQuery,
    context: RequestContext
  ): Promise<readonly InvestigationEvidenceItem[]> => {
    const adapterLogger = createLogger("vercel-monitoring-adapter");
    const startTime = Date.now();

    try {
      const evidence = await fetchVercelDeployments(apiToken, teamId, query, context);
      const durationMs = Date.now() - startTime;

      adapterLogger.info("Vercel evidence gathered", {
        provider: "vercel",
        operation: "gatherEvidence",
        durationMs,
        deploymentCount: evidence.length,
        ...context,
      });

      return evidence;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      adapterLogger.warn("Vercel evidence gathering failed", {
        provider: "vercel",
        operation: "gatherEvidence",
        durationMs,
        error: getErrorMessage(error),
        ...context,
      });
      return [];
    }
  },
});

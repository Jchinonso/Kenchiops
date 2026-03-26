/**
 * Cross-Pipeline Correlation
 *
 * Detects temporal correlations between deploy failures (Pipeline A)
 * and alert spikes (Pipeline B) within the same time window.
 * Groups related events into CorrelatedIncident objects.
 *
 * @module diagnostics/correlation
 */

import { createLogger, getErrorMessage } from "../core/index.js";
import type { RequestContext } from "../core/types.js";
import type { CorrelatedIncident, CorrelatedDeployEvent, CorrelatedAlertEvent } from "./types.js";

const logger = createLogger("diagnostics-correlation");

// ==================== Constants ====================

/** Default time window for correlation (5 minutes in ms). */
const DEFAULT_CORRELATION_WINDOW_MS = 5 * 60 * 1000;

/** Maximum number of correlated incidents to return. */
const MAX_CORRELATED_INCIDENTS = 10;

// ==================== Pure Correlation Logic ====================

/**
 * Calculates a 0-1 correlation score between a deploy event and an alert event.
 * Factors: temporal proximity, repository/service match.
 */
export const calculateCorrelationScore = (
  deploy: CorrelatedDeployEvent,
  alert: CorrelatedAlertEvent,
  windowMs: number
): number => {
  const deployTime = new Date(deploy.failedAt).getTime();
  const alertTime = new Date(alert.triggeredAt).getTime();
  const timeDiffMs = Math.abs(deployTime - alertTime);

  // Temporal proximity: 1.0 at 0 diff, 0.0 at window edge
  const temporalScore = Math.max(0, 1 - timeDiffMs / windowMs);

  // Repository/service match bonus
  const titleLower = alert.title.toLowerCase();
  const repoLower = deploy.repository.toLowerCase();
  const repoName = repoLower.split("/").pop() ?? repoLower;
  const serviceMatchBonus = titleLower.includes(repoName) ? 0.2 : 0;

  // Alert fired AFTER deploy is more suspicious than before
  const causalOrderBonus = alertTime >= deployTime ? 0.1 : 0;

  return Math.min(1, temporalScore * 0.7 + serviceMatchBonus + causalOrderBonus);
};

/**
 * Groups deploy events with temporally correlated alerts.
 * Pure function — takes pre-fetched events, returns correlation groups.
 */
export const correlateEvents = (
  deployEvents: readonly CorrelatedDeployEvent[],
  alertEvents: readonly CorrelatedAlertEvent[],
  windowMs: number = DEFAULT_CORRELATION_WINDOW_MS
): readonly CorrelatedIncident[] => {
  if (deployEvents.length === 0 && alertEvents.length === 0) {
    return [];
  }

  // For each deploy, find alerts within the time window
  const incidents: CorrelatedIncident[] = deployEvents.map((deploy) => {
    const correlatedAlerts = alertEvents
      .map((alert) => ({
        alert,
        score: calculateCorrelationScore(deploy, alert, windowMs),
      }))
      .filter(({ score }) => score > 0.1)
      .sort((itemA, itemB) => itemB.score - itemA.score);

    const avgScore =
      correlatedAlerts.length > 0
        ? correlatedAlerts.reduce((sum, item) => sum + item.score, 0) / correlatedAlerts.length
        : 0;

    return {
      deployEvent: deploy,
      alertEvents: correlatedAlerts.map(({ alert }) => alert),
      correlationScore: avgScore,
      explanation:
        correlatedAlerts.length > 0
          ? `Deploy failure in ${deploy.repository} at ${deploy.failedAt} correlated with ${String(correlatedAlerts.length)} alert(s) within ${String(Math.round(windowMs / 60000))}min window`
          : `Deploy failure in ${deploy.repository} with no correlated alerts`,
    };
  });

  // Also include orphan alerts (alerts without a correlated deploy)
  const correlatedAlertIds = new Set(
    incidents.flatMap((incident) => incident.alertEvents.map((alert) => alert.alertId))
  );

  const orphanAlerts = alertEvents.filter((alert) => !correlatedAlertIds.has(alert.alertId));

  if (orphanAlerts.length > 0) {
    incidents.push({
      deployEvent: undefined,
      alertEvents: orphanAlerts,
      correlationScore: 0,
      explanation: `${String(orphanAlerts.length)} alert(s) without correlated deploy failure`,
    });
  }

  return incidents
    .sort((incidentA, incidentB) => incidentB.correlationScore - incidentA.correlationScore)
    .slice(0, MAX_CORRELATED_INCIDENTS);
};

/**
 * Finds correlated events for a tenant within a time window.
 * Accepts pre-fetched event lists (caller responsible for DB queries).
 *
 * This is the main entry point for cross-pipeline correlation.
 */
export const findCorrelatedIncidents = async (
  deployEvents: readonly CorrelatedDeployEvent[],
  alertEvents: readonly CorrelatedAlertEvent[],
  windowMinutes: number,
  context: RequestContext
): Promise<readonly CorrelatedIncident[]> => {
  const logContext = { ...context };

  try {
    const windowMs = windowMinutes * 60 * 1000;
    const incidents = correlateEvents(deployEvents, alertEvents, windowMs);

    logger.info("Cross-pipeline correlation completed", {
      operation: "findCorrelatedIncidents",
      deployCount: deployEvents.length,
      alertCount: alertEvents.length,
      correlatedGroups: incidents.length,
      windowMinutes,
      ...logContext,
    });

    return incidents;
  } catch (error: unknown) {
    logger.warn("Cross-pipeline correlation failed", {
      operation: "findCorrelatedIncidents",
      error: getErrorMessage(error),
      ...logContext,
    });
    return [];
  }
};

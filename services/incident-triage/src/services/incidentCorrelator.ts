/**
 * Incident Correlator Service
 *
 * Searches for similar past incidents using vector similarity on alert embeddings.
 * Categorizes matches by relationship type: same_root_cause, same_service,
 * similar_symptoms, or historical.
 *
 * @module services/incidentCorrelator
 */

import { createLogger, type RequestContext } from "@kenchi/shared";
import type {
  IncidentCorrelatorService,
  CorrelationResult,
  CorrelatedIncident,
  CorrelationType,
  TriageSearchPort,
  TriageSearchResult,
} from "../types/correlationTypes.js";
import { CORRELATION_DEFAULTS } from "../constants/triageConstants.js";

// ==================== Pure Helpers ====================

/**
 * Classifies the correlation type based on similarity score and service match.
 * Pure function -- deterministic based on inputs.
 */
const classifyCorrelation = (
  similarity: number,
  resultServiceName: string | null,
  currentServiceName: string | null
): CorrelationType => {
  if (similarity >= CORRELATION_DEFAULTS.SAME_ROOT_CAUSE_THRESHOLD) {
    return "same_root_cause";
  }

  const servicesMatch =
    currentServiceName !== null &&
    resultServiceName !== null &&
    currentServiceName.toLowerCase() === resultServiceName.toLowerCase();

  if (servicesMatch) {
    return "same_service";
  }

  if (similarity >= CORRELATION_DEFAULTS.SIMILAR_SYMPTOMS_THRESHOLD) {
    return "similar_symptoms";
  }

  return "historical";
};

/**
 * Maps a triage search result to a correlated incident domain object.
 */
const toCorrelatedIncident = (
  result: TriageSearchResult,
  currentServiceName: string | null
): CorrelatedIncident => ({
  triageResultId: result.triageResultId,
  alertId: result.alertId,
  similarity: result.similarity,
  correlationType: classifyCorrelation(result.similarity, result.serviceName, currentServiceName),
  severityLabel: result.severityLabel,
  serviceName: result.serviceName,
  createdAt: result.createdAt,
});

// ==================== Factory ====================

/**
 * Creates an incident correlator service with injected dependencies.
 *
 * @param triageSearchPort - Port for searching similar triage results
 */
export const createIncidentCorrelator = (
  triageSearchPort: TriageSearchPort
): IncidentCorrelatorService => {
  const logger = createLogger("incident-correlator");

  const correlateIncident = async (
    embedding: readonly number[],
    alertId: string,
    tenantId: string,
    serviceName: string | null,
    context: RequestContext
  ): Promise<CorrelationResult> => {
    const startTime = Date.now();

    const searchResults = await triageSearchPort.searchSimilar(
      embedding,
      tenantId,
      alertId,
      CORRELATION_DEFAULTS.MAX_RESULTS,
      CORRELATION_DEFAULTS.MIN_SIMILARITY
    );

    const correlations: readonly CorrelatedIncident[] = searchResults.map((result) =>
      toCorrelatedIncident(result, serviceName)
    );

    const durationMs = Date.now() - startTime;

    logger.info("Incident correlation completed", {
      correlationCount: correlations.length,
      durationMs,
      ...context,
    });

    return { correlations, durationMs };
  };

  return { correlateIncident };
};

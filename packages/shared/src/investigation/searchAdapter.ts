/**
 * Investigation Search Adapter
 *
 * Implements InvestigationSearchPort by querying the shared database
 * repositories for recent incidents, CI analyses, and triage results.
 * Maps domain records to InvestigationEvidenceItem.
 *
 * @module investigation/searchAdapter
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import { listIncidents } from "../database/incidentAlert/repository.js";
import { getAnalysesByTenantFiltered } from "../database/analysis/repository.js";
import { getTriageResultsByAlertIds } from "../database/incidentTriageResult/repository.js";
import type { IncidentAlertRecord } from "../database/incidentAlert/types.js";
import type { AnalysisRecord } from "../database/analysis/types.js";

import type { RequestContext } from "../core/types.js";
import type { InvestigationSearchPort, InvestigationEvidenceItem } from "./types.js";
import { INVESTIGATION_RELEVANCE } from "./constants.js";

const logger = createLogger("investigation-search-adapter");

// ==================== Mappers ====================

/**
 * Maps an IncidentAlertRecord to an InvestigationEvidenceItem.
 */
const mapIncidentToEvidence = (
  alert: IncidentAlertRecord,
  serviceName: string | null
): InvestigationEvidenceItem => {
  const serviceMatches =
    serviceName !== null &&
    alert.serviceName !== null &&
    alert.serviceName.toLowerCase() === serviceName.toLowerCase();

  const relevance = serviceMatches
    ? INVESTIGATION_RELEVANCE.INCIDENT_SERVICE_MATCH
    : INVESTIGATION_RELEVANCE.INCIDENT_BASE;

  return {
    id: alert.id,
    source: "past_incidents",
    title: alert.title,
    summary: alert.description ?? alert.title,
    relevance,
    timestamp: alert.receivedAt.toISOString(),
    metadata: {
      severity: alert.severity,
      status: alert.status,
      source: alert.source,
      serviceName: alert.serviceName,
      environment: alert.environment,
    },
  };
};

/**
 * Maps an AnalysisRecord to an InvestigationEvidenceItem.
 */
const mapAnalysisToEvidence = (
  analysis: AnalysisRecord,
  serviceName: string | null
): InvestigationEvidenceItem => {
  const aggregationKey = analysis.aggregationKey ?? "";
  const serviceMatches =
    serviceName !== null && aggregationKey.toLowerCase().includes(serviceName.toLowerCase());

  const relevance = serviceMatches
    ? INVESTIGATION_RELEVANCE.ANALYSIS_SERVICE_MATCH
    : INVESTIGATION_RELEVANCE.ANALYSIS_BASE;

  return {
    id: analysis.id,
    source: "ci_analyses",
    title: analysis.summary,
    summary: analysis.identifiedCause ?? analysis.summary,
    relevance,
    timestamp: analysis.createdAt.toISOString(),
    metadata: {
      diagnosisConfidence: analysis.diagnosisConfidence,
      aggregationKey: analysis.aggregationKey,
      modelVersionId: analysis.modelVersionId,
    },
  };
};

// ==================== Time Filtering ====================

/**
 * Computes the cutoff date for time-based filtering.
 */
const computeCutoffDate = (hoursBack: number): Date =>
  new Date(Date.now() - hoursBack * 60 * 60 * 1000);

/**
 * Checks if a date is within the lookback window.
 */
const isWithinWindow = (date: Date, cutoff: Date): boolean => date.getTime() >= cutoff.getTime();

// ==================== Triage Evidence Mapper ====================

/**
 * Maps a triage result + alert pair to an InvestigationEvidenceItem.
 */
const mapTriageToEvidence = (
  alert: IncidentAlertRecord,
  triageResult: {
    readonly id: string;
    readonly summarySource: string;
    readonly severityLabel: string | null;
    readonly confidence: number | null;
    readonly severityScore: number | null;
    readonly completeness: number | null;
    readonly createdAt: Date;
  },
  serviceName: string | null
): InvestigationEvidenceItem => {
  const serviceMatches =
    serviceName !== null &&
    alert.serviceName !== null &&
    alert.serviceName.toLowerCase() === serviceName.toLowerCase();

  const relevance = serviceMatches
    ? INVESTIGATION_RELEVANCE.TRIAGE_SERVICE_MATCH
    : INVESTIGATION_RELEVANCE.TRIAGE_BASE;

  const { summarySource } = triageResult;
  const summaryText =
    summarySource === "none"
      ? alert.title
      : `Severity: ${triageResult.severityLabel ?? "unknown"}, Confidence: ${String(triageResult.confidence ?? 0)}`;

  return {
    id: triageResult.id,
    source: "triage_results" as const,
    title: `Triage: ${alert.title}`,
    summary: summaryText,
    relevance,
    timestamp: triageResult.createdAt.toISOString(),
    metadata: {
      alertId: alert.id,
      severityScore: triageResult.severityScore,
      severityLabel: triageResult.severityLabel,
      confidence: triageResult.confidence,
      completeness: triageResult.completeness,
      summarySource,
      serviceName: alert.serviceName,
    },
  };
};

// ==================== Factory ====================

/**
 * Creates an investigation search adapter backed by shared database repositories.
 *
 * All methods are resilient -- errors are caught and logged, returning
 * empty arrays so evidence gathering never crashes the pipeline.
 *
 * @returns InvestigationSearchPort implementation
 */
export const createInvestigationSearchAdapter = (): InvestigationSearchPort => ({
  searchRecentIncidents: async (
    tenantId: string,
    serviceName: string | null,
    hoursBack: number,
    limit: number,
    context: RequestContext
  ): Promise<readonly InvestigationEvidenceItem[]> => {
    try {
      const result = await listIncidents({
        tenantId,
        limit,
        offset: 0,
      });

      const cutoff = computeCutoffDate(hoursBack);

      // Filter by time window only; service matching is applied via relevance scoring
      const filtered = result.items.filter((alert) => isWithinWindow(alert.receivedAt, cutoff));

      const evidence = filtered.map((alert) => mapIncidentToEvidence(alert, serviceName));

      logger.info("Searched recent incidents", {
        serviceName,
        hoursBack,
        totalFetched: result.items.length,
        afterTimeFilter: filtered.length,
        ...context,
      });

      return evidence;
    } catch (error) {
      logger.warn("Failed to search recent incidents, returning empty", {
        serviceName,
        hoursBack,
        error: getErrorMessage(error),
        ...context,
      });
      return [];
    }
  },

  searchRecentAnalyses: async (
    tenantId: string,
    serviceName: string | null,
    hoursBack: number,
    limit: number,
    context: RequestContext
  ): Promise<readonly InvestigationEvidenceItem[]> => {
    try {
      const since = computeCutoffDate(hoursBack).toISOString();

      const analyses = await getAnalysesByTenantFiltered({
        tenantId,
        repository: null,
        minConfidence: null,
        maxConfidence: null,
        since,
        limit,
        offset: 0,
      });

      const evidence = analyses.map((analysis) => mapAnalysisToEvidence(analysis, serviceName));

      logger.info("Searched recent analyses", {
        serviceName,
        hoursBack,
        resultCount: evidence.length,
        ...context,
      });

      return evidence;
    } catch (error) {
      logger.warn("Failed to search recent analyses, returning empty", {
        serviceName,
        hoursBack,
        error: getErrorMessage(error),
        ...context,
      });
      return [];
    }
  },

  searchRecentTriageResults: async (
    tenantId: string,
    serviceName: string | null,
    hoursBack: number,
    limit: number,
    context: RequestContext
  ): Promise<readonly InvestigationEvidenceItem[]> => {
    try {
      // Triage results are linked to alerts; fetch recent alerts then look up triage
      const alertResult = await listIncidents({
        tenantId,
        limit,
        offset: 0,
      });

      const cutoff = computeCutoffDate(hoursBack);
      const recentAlerts = alertResult.items.filter((alert) =>
        isWithinWindow(alert.receivedAt, cutoff)
      );

      // Batch lookup triage results for all recent alerts in a single query
      const alertIds = recentAlerts.map((alert) => alert.id);
      const triageResults = await getTriageResultsByAlertIds(alertIds, tenantId);

      // Build a lookup map keyed by alertId for O(1) matching
      const triageByAlertId = new Map(triageResults.map((triage) => [triage.alertId, triage]));

      const evidence: readonly InvestigationEvidenceItem[] = recentAlerts.flatMap((alert) => {
        const triageResult = triageByAlertId.get(alert.id);
        return triageResult !== undefined
          ? [mapTriageToEvidence(alert, triageResult, serviceName)]
          : [];
      });

      logger.info("Searched recent triage results", {
        serviceName,
        hoursBack,
        alertsChecked: recentAlerts.length,
        triageResultsFound: evidence.length,
        ...context,
      });

      return evidence;
    } catch (error) {
      logger.warn("Failed to search recent triage results, returning empty", {
        serviceName,
        hoursBack,
        error: getErrorMessage(error),
        ...context,
      });
      return [];
    }
  },
});

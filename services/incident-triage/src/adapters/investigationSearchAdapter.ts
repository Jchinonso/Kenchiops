/**
 * Investigation Search Adapter
 *
 * Implements InvestigationSearchPort by querying the shared database
 * repositories for recent incidents, CI analyses, and triage results.
 * Maps domain records to InvestigationEvidenceItem.
 *
 * @module adapters/investigationSearchAdapter
 */

import {
  createLogger,
  getErrorMessage,
  listIncidents,
  getAnalysesByTenantFiltered,
  getTriageResultByAlertId,
  type IncidentAlertRecord,
  type AnalysisRecord,
} from "@kenchi/shared";
import type {
  InvestigationSearchPort,
  InvestigationEvidenceItem,
} from "../types/investigationTypes.js";
import { INVESTIGATION_RELEVANCE } from "../constants/investigationConstants.js";

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
    limit: number
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
        tenantId,
        serviceName,
        hoursBack,
        totalFetched: result.items.length,
        afterTimeFilter: filtered.length,
      });

      return evidence;
    } catch (error) {
      logger.warn("Failed to search recent incidents, returning empty", {
        tenantId,
        serviceName,
        hoursBack,
        error: getErrorMessage(error),
      });
      return [];
    }
  },

  searchRecentAnalyses: async (
    tenantId: string,
    serviceName: string | null,
    hoursBack: number,
    limit: number
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
        tenantId,
        serviceName,
        hoursBack,
        resultCount: evidence.length,
      });

      return evidence;
    } catch (error) {
      logger.warn("Failed to search recent analyses, returning empty", {
        tenantId,
        serviceName,
        hoursBack,
        error: getErrorMessage(error),
      });
      return [];
    }
  },

  searchRecentTriageResults: async (
    tenantId: string,
    serviceName: string | null,
    hoursBack: number,
    limit: number
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

      // Look up triage results for each recent alert
      const triageLookups = await Promise.all(
        recentAlerts.map(async (alert) => {
          const triageResult = await getTriageResultByAlertId(alert.id);
          return triageResult === null ? null : { alert, triageResult };
        })
      );

      const withTriage = triageLookups.filter(
        (entry): entry is NonNullable<typeof entry> => entry !== null
      );

      const evidence: readonly InvestigationEvidenceItem[] = withTriage.map(
        ({ alert, triageResult }) => {
          const serviceMatches =
            serviceName !== null &&
            alert.serviceName !== null &&
            alert.serviceName.toLowerCase() === serviceName.toLowerCase();

          const relevance = serviceMatches
            ? INVESTIGATION_RELEVANCE.TRIAGE_SERVICE_MATCH
            : INVESTIGATION_RELEVANCE.TRIAGE_BASE;

          const summaryText =
            triageResult.summarySource === "none"
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
              summarySource: triageResult.summarySource,
              serviceName: alert.serviceName,
            },
          };
        }
      );

      logger.info("Searched recent triage results", {
        tenantId,
        serviceName,
        hoursBack,
        alertsChecked: recentAlerts.length,
        triageResultsFound: evidence.length,
      });

      return evidence;
    } catch (error) {
      logger.warn("Failed to search recent triage results, returning empty", {
        tenantId,
        serviceName,
        hoursBack,
        error: getErrorMessage(error),
      });
      return [];
    }
  },
});

/**
 * Incident Triage Result Helpers
 *
 * Row mappers and validation for triage result records.
 *
 * @module database/incidentTriageResult/helpers
 */

import { ValidationError } from "../common.js";
import type {
  IncidentTriageResultRow,
  IncidentTriageResultRecord,
  TriageResultSimilarityRow,
  TriageSimilarityResult,
} from "./types.js";

/**
 * Maps a database row to an IncidentTriageResultRecord domain object.
 */
export const mapRowToTriageResult = (row: IncidentTriageResultRow): IncidentTriageResultRecord => ({
  id: row.id,
  alertId: row.alert_id,
  tenantId: row.tenant_id,
  severityScore: row.severity_score,
  severityLabel: row.severity_label,
  severityFactors: row.severity_factors,
  confidence: row.confidence,
  completeness: row.completeness,
  missingFields: row.missing_fields,
  matchedRunbooks: row.matched_runbooks,
  correlatedIncidents: row.correlated_incidents,
  evidenceCatalog: row.evidence_catalog,
  aiSummary: row.ai_summary,
  summarySource: row.summary_source,
  routingDecision: row.routing_decision,
  dispatchedTo: row.dispatched_to,
  pipelineDurationMs: row.pipeline_duration_ms,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Maps a similarity search row to a TriageSimilarityResult domain object.
 */
export const mapRowToSimilarityResult = (
  row: TriageResultSimilarityRow
): TriageSimilarityResult => ({
  triageResultId: row.id,
  alertId: row.alert_id,
  similarity: row.similarity,
  severityLabel: row.severity_label,
  serviceName: row.joined_service_name,
  createdAt: row.created_at,
});

/**
 * Validates that a triage result ID is non-empty.
 */
export const validateTriageResultId = (id: string): void => {
  if (!id?.trim()) {
    throw new ValidationError("Triage result ID is required");
  }
};

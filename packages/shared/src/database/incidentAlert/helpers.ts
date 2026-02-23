/**
 * Incident Alert Helpers
 *
 * Validation functions and row mappers for incident alert repository operations.
 *
 * @module database/incidentAlert/helpers
 */

import { ValidationError } from "../common.js";
import type { IncidentAlertRow, IncidentAlertRecord, CreateIncidentAlertInput } from "./types.js";

// ==================== Row Mappers ====================

/**
 * Maps a database row to an IncidentAlertRecord domain object.
 */
export const mapRowToIncidentAlert = (row: IncidentAlertRow): IncidentAlertRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  source: row.source,
  sourceAlertId: row.source_alert_id,
  deliveryId: row.delivery_id,
  fingerprint: row.fingerprint,
  title: row.title,
  description: row.description,
  severity: row.severity,
  status: row.status,
  serviceName: row.service_name,
  environment: row.environment,
  metrics: row.metrics,
  labels: row.labels,
  sourcePayload: row.source_payload,
  receivedAt: row.received_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// ==================== Validation ====================

/**
 * Maps snake_case keys from row_to_json(t.*) triage result to camelCase domain keys.
 * Mirrors the column names in the incident_triage_results table.
 */
export const mapTriageResultKeys = (
  raw: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> => ({
  id: raw.id,
  alertId: raw.alert_id,
  tenantId: raw.tenant_id,
  severityScore: raw.severity_score,
  severityLabel: raw.severity_label,
  severityFactors: raw.severity_factors,
  confidence: raw.confidence,
  completeness: raw.completeness,
  missingFields: raw.missing_fields,
  matchedRunbooks: raw.matched_runbooks,
  correlatedIncidents: raw.correlated_incidents,
  evidenceCatalog: raw.evidence_catalog,
  aiSummary: raw.ai_summary,
  summarySource: raw.summary_source,
  routingDecision: raw.routing_decision,
  dispatchedTo: raw.dispatched_to,
  pipelineDurationMs: raw.pipeline_duration_ms,
  createdAt: raw.created_at,
  updatedAt: raw.updated_at,
});

/**
 * Validates input for creating a new incident alert record.
 *
 * @throws ValidationError if required fields are missing
 */
export const validateCreateIncidentAlertInput = (input: CreateIncidentAlertInput): void => {
  if (!input.deliveryId?.trim()) {
    throw new ValidationError("deliveryId is required", {
      operation: "validateCreateIncidentAlertInput",
      metadata: { field: "deliveryId" },
    });
  }

  if (!input.source?.trim()) {
    throw new ValidationError("source is required", {
      operation: "validateCreateIncidentAlertInput",
      metadata: { field: "source" },
    });
  }

  if (!input.sourceAlertId?.trim()) {
    throw new ValidationError("sourceAlertId is required", {
      operation: "validateCreateIncidentAlertInput",
      metadata: { field: "sourceAlertId" },
    });
  }

  if (!input.title?.trim()) {
    throw new ValidationError("title is required", {
      operation: "validateCreateIncidentAlertInput",
      metadata: { field: "title" },
    });
  }

  if (!input.receivedAt?.trim()) {
    throw new ValidationError("receivedAt is required", {
      operation: "validateCreateIncidentAlertInput",
      metadata: { field: "receivedAt" },
    });
  }
};

/**
 * Validates an incident alert ID format.
 *
 * @throws ValidationError if ID is empty
 */
export const validateIncidentAlertId = (id: string): void => {
  if (!id?.trim()) {
    throw new ValidationError("id is required", {
      operation: "validateIncidentAlertId",
      metadata: { field: "id" },
    });
  }
};

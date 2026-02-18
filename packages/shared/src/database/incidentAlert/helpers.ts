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

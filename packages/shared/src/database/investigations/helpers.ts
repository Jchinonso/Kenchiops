/**
 * Investigation Helpers
 *
 * Validation functions and row mappers for investigation repository operations.
 *
 * @module database/investigations/helpers
 */

import { ValidationError } from "../common.js";
import type { InvestigationRow, InvestigationRecord, CreateInvestigationInput } from "./types.js";

// ==================== Row Mappers ====================

/**
 * Maps a database row to an InvestigationRecord domain object.
 */
export const mapRowToInvestigation = (row: InvestigationRow): InvestigationRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  initiatedBy: row.initiated_by,
  initiatedFrom: row.initiated_from,
  status: row.status,
  description: row.description,
  serviceName: row.service_name,
  endpoint: row.endpoint,
  symptom: row.symptom,
  environment: row.environment,
  timeRangeFrom: row.time_range_from,
  timeRangeTo: row.time_range_to,
  evidence: row.evidence,
  correlation: row.correlation,
  diagnosis: row.diagnosis,
  durationMs: row.duration_ms,
  errorMessage: row.error_message,
  createdAt: row.created_at,
  completedAt: row.completed_at,
  updatedAt: row.updated_at,
});

// ==================== Validation ====================

/**
 * Validates input for creating a new investigation record.
 *
 * @throws ValidationError if required fields are missing
 */
export const validateCreateInvestigationInput = (input: CreateInvestigationInput): void => {
  if (!input.tenantId?.trim()) {
    throw new ValidationError("tenantId is required", {
      operation: "validateCreateInvestigationInput",
      metadata: { field: "tenantId" },
    });
  }

  if (!input.initiatedBy?.trim()) {
    throw new ValidationError("initiatedBy is required", {
      operation: "validateCreateInvestigationInput",
      metadata: { field: "initiatedBy" },
    });
  }

  if (!input.initiatedFrom?.trim()) {
    throw new ValidationError("initiatedFrom is required", {
      operation: "validateCreateInvestigationInput",
      metadata: { field: "initiatedFrom" },
    });
  }

  if (!input.description?.trim()) {
    throw new ValidationError("description is required", {
      operation: "validateCreateInvestigationInput",
      metadata: { field: "description" },
    });
  }
};

/**
 * Validates an investigation ID format.
 *
 * @throws ValidationError if ID is empty
 */
export const validateInvestigationId = (id: string): void => {
  if (!id?.trim()) {
    throw new ValidationError("id is required", {
      operation: "validateInvestigationId",
      metadata: { field: "id" },
    });
  }
};

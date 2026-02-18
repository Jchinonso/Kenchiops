/**
 * Incident Triage Result Repository
 *
 * Database operations for storing and querying incident triage results.
 *
 * @module database/incidentTriageResult/repository
 */

import {
  query,
  createLogger,
  generateEventId,
  getErrorMessage,
  INCIDENT_TRIAGE_RESULT_QUERIES,
} from "../common.js";
import type {
  IncidentTriageResultRow,
  IncidentTriageResultRecord,
  CreateTriageResultInput,
} from "./types.js";
import { mapRowToTriageResult, validateTriageResultId } from "./helpers.js";

/** ID prefix for generated triage result IDs */
const TRIAGE_RESULT_ID_PREFIX = "tri";

const logger = createLogger("incident-triage-result-repository");

// ==================== Public API ====================

/**
 * Creates a new triage result record in the database.
 *
 * @param input - The triage result data to store
 * @returns The created triage result record
 */
export const createTriageResult = async (
  input: CreateTriageResultInput
): Promise<IncidentTriageResultRecord> => {
  const id = generateEventId(TRIAGE_RESULT_ID_PREFIX);

  try {
    const result = await query<IncidentTriageResultRow>(INCIDENT_TRIAGE_RESULT_QUERIES.INSERT, [
      id,
      input.alertId,
      input.tenantId ?? null,
      input.severityScore,
      input.severityLabel,
      JSON.stringify(input.severityFactors),
      input.pipelineDurationMs,
    ]);

    const record = mapRowToTriageResult(result.rows[0]);

    logger.info("Triage result created", {
      id: record.id,
      alertId: record.alertId,
      severityLabel: record.severityLabel,
      severityScore: record.severityScore,
    });

    return record;
  } catch (error) {
    logger.error("Failed to create triage result", {
      alertId: input.alertId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Retrieves a triage result by its ID.
 *
 * @param id - The triage result ID
 * @returns The triage result record, or null if not found
 */
export const getTriageResultById = async (
  id: string
): Promise<IncidentTriageResultRecord | null> => {
  validateTriageResultId(id);

  try {
    const result = await query<IncidentTriageResultRow>(INCIDENT_TRIAGE_RESULT_QUERIES.GET_BY_ID, [
      id,
    ]);
    return result.rows.length > 0 ? mapRowToTriageResult(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to get triage result by id", {
      id,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Retrieves a triage result by its associated alert ID.
 *
 * @param alertId - The incident alert ID
 * @returns The triage result record, or null if not found
 */
export const getTriageResultByAlertId = async (
  alertId: string
): Promise<IncidentTriageResultRecord | null> => {
  if (!alertId?.trim()) {
    return null;
  }

  try {
    const result = await query<IncidentTriageResultRow>(
      INCIDENT_TRIAGE_RESULT_QUERIES.GET_BY_ALERT_ID,
      [alertId]
    );
    return result.rows.length > 0 ? mapRowToTriageResult(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to get triage result by alert id", {
      alertId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

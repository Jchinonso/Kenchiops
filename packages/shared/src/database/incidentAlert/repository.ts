/**
 * Incident Alert Repository
 *
 * Database operations for storing and querying incident alerts.
 *
 * @module database/incidentAlert/repository
 */

import {
  query,
  createLogger,
  generateEventId,
  getErrorMessage,
  INCIDENT_ALERT_QUERIES,
} from "../common.js";
import type { IncidentAlertRow, IncidentAlertRecord, CreateIncidentAlertInput } from "./types.js";
import {
  mapRowToIncidentAlert,
  validateCreateIncidentAlertInput,
  validateIncidentAlertId,
} from "./helpers.js";

/** ID prefix for generated incident alert IDs */
const INCIDENT_ALERT_ID_PREFIX = "alr";

const logger = createLogger("incident-alert-repository");

// ==================== Public API ====================

/**
 * Creates a new incident alert record in the database.
 *
 * @param input - The incident alert data to store
 * @returns The created incident alert record
 * @throws ValidationError if input validation fails
 */
export const createIncidentAlert = async (
  input: CreateIncidentAlertInput
): Promise<IncidentAlertRecord> => {
  validateCreateIncidentAlertInput(input);

  const id = generateEventId(INCIDENT_ALERT_ID_PREFIX);

  try {
    const result = await query<IncidentAlertRow>(INCIDENT_ALERT_QUERIES.INSERT, [
      id,
      input.tenantId ?? null,
      input.source,
      input.sourceAlertId,
      input.deliveryId,
      input.fingerprint ?? null,
      input.title,
      input.description ?? null,
      input.severity ?? "medium",
      input.status ?? "received",
      input.serviceName ?? null,
      input.environment ?? null,
      input.metrics ? JSON.stringify(input.metrics) : "{}",
      input.labels ? JSON.stringify(input.labels) : "{}",
      JSON.stringify(input.sourcePayload),
      input.receivedAt,
    ]);

    const record = mapRowToIncidentAlert(result.rows[0]);

    logger.info("Incident alert created", {
      id: record.id,
      source: record.source,
      severity: record.severity,
      tenantId: record.tenantId,
    });

    return record;
  } catch (error) {
    logger.error("Failed to create incident alert", {
      deliveryId: input.deliveryId,
      source: input.source,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Retrieves an incident alert by its ID.
 *
 * @param id - The incident alert ID
 * @returns The incident alert record, or null if not found
 * @throws ValidationError if ID is empty
 */
export const getAlertById = async (id: string): Promise<IncidentAlertRecord | null> => {
  validateIncidentAlertId(id);

  try {
    const result = await query<IncidentAlertRow>(INCIDENT_ALERT_QUERIES.GET_BY_ID, [id]);
    return result.rows.length > 0 ? mapRowToIncidentAlert(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to get incident alert by id", {
      id,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Finds an incident alert by its delivery ID (for idempotency checks).
 *
 * @param deliveryId - The webhook delivery ID
 * @returns The incident alert record, or null if not found
 */
export const findAlertByDeliveryId = async (
  deliveryId: string
): Promise<IncidentAlertRecord | null> => {
  if (!deliveryId?.trim()) {
    return null;
  }

  try {
    const result = await query<IncidentAlertRow>(INCIDENT_ALERT_QUERIES.FIND_BY_DELIVERY_ID, [
      deliveryId,
    ]);
    return result.rows.length > 0 ? mapRowToIncidentAlert(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to find incident alert by delivery id", {
      deliveryId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Updates the status of an incident alert.
 *
 * @param id - The incident alert ID
 * @param status - The new status
 * @returns The updated incident alert record, or null if not found
 * @throws ValidationError if ID is empty
 */
export const updateAlertStatus = async (
  id: string,
  status: string
): Promise<IncidentAlertRecord | null> => {
  validateIncidentAlertId(id);

  try {
    const result = await query<IncidentAlertRow>(INCIDENT_ALERT_QUERIES.UPDATE_STATUS, [
      id,
      status,
    ]);
    return result.rows.length > 0 ? mapRowToIncidentAlert(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to update incident alert status", {
      id,
      status,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

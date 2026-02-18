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
import type {
  IncidentAlertRow,
  IncidentAlertRecord,
  CreateIncidentAlertInput,
  ListIncidentFilters,
  PaginatedIncidentAlerts,
  AlertWithTriageRow,
  AlertWithTriageResult,
} from "./types.js";
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

/** Extracts the count from a count query row */
const parseCountRow = (rows: ReadonlyArray<{ readonly count: string }>): number =>
  parseInt(rows[0]?.count ?? "0", 10);

/** Extracts triage JSON from the joined row via destructuring */
const extractTriageJson = ({
  triage_result,
}: AlertWithTriageRow): Readonly<Record<string, unknown>> | null => triage_result;

/**
 * Lists incident alerts with pagination and optional filters.
 *
 * @param filters - Filtering and pagination parameters
 * @returns Paginated list of incident alerts with total count
 */
export const listIncidents = async (
  filters: ListIncidentFilters
): Promise<PaginatedIncidentAlerts> => {
  const { tenantId, status, severity, source, limit, offset } = filters;
  const filterParams = [tenantId, status ?? null, severity ?? null, source ?? null] as const;

  try {
    const [itemsResult, countResult] = await Promise.all([
      query<IncidentAlertRow>(INCIDENT_ALERT_QUERIES.LIST_INCIDENTS, [
        ...filterParams,
        limit,
        offset,
      ]),
      query<{ readonly count: string }>(INCIDENT_ALERT_QUERIES.COUNT_INCIDENTS, [...filterParams]),
    ]);

    const items = itemsResult.rows.map(mapRowToIncidentAlert);
    const total = parseCountRow(countResult.rows);

    logger.info("Listed incident alerts", {
      tenantId,
      resultCount: items.length,
      total,
      limit,
      offset,
    });

    return { items, total, limit, offset };
  } catch (error) {
    logger.error("Failed to list incident alerts", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Counts incident alerts matching the given filters.
 *
 * @param filters - Filtering parameters (limit/offset ignored)
 * @returns Total count of matching alerts
 */
export const countIncidents = async (
  filters: Pick<ListIncidentFilters, "tenantId" | "status" | "severity" | "source">
): Promise<number> => {
  const { tenantId, status, severity, source } = filters;

  try {
    const result = await query<{ readonly count: string }>(INCIDENT_ALERT_QUERIES.COUNT_INCIDENTS, [
      tenantId,
      status ?? null,
      severity ?? null,
      source ?? null,
    ]);
    return parseCountRow(result.rows);
  } catch (error) {
    logger.error("Failed to count incident alerts", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Retrieves an incident alert with its associated triage result (joined query).
 *
 * @param alertId - The incident alert ID
 * @returns The alert with triage result, or null if alert not found
 */
export const getAlertWithTriageResult = async (
  alertId: string
): Promise<AlertWithTriageResult | null> => {
  validateIncidentAlertId(alertId);

  try {
    const { rows } = await query<AlertWithTriageRow>(INCIDENT_ALERT_QUERIES.GET_ALERT_WITH_TRIAGE, [
      alertId,
    ]);

    const { length: rowCount } = rows;
    if (rowCount === 0) {
      return null;
    }

    const row = rows[0];
    const alert = mapRowToIncidentAlert(row);
    const triageResult = extractTriageJson(row);

    return { alert, triageResult };
  } catch (error) {
    logger.error("Failed to get alert with triage result", {
      alertId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

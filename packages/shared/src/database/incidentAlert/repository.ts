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
  SourceStatsRow,
  SourceStats,
  ActiveCountBySourceRow,
  ActiveCountBySource,
} from "./types.js";
import {
  mapRowToIncidentAlert,
  mapTriageResultKeys,
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
export const getAlertById = async (
  id: string,
  tenantId: string
): Promise<IncidentAlertRecord | null> => {
  validateIncidentAlertId(id);

  try {
    const result = await query<IncidentAlertRow>(INCIDENT_ALERT_QUERIES.GET_BY_ID, [id, tenantId]);
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

/** Extracts triage JSON from the joined row and maps snake_case keys to camelCase */
const extractTriageJson = ({
  triage_result: triageResult,
}: AlertWithTriageRow): Readonly<Record<string, unknown>> | null =>
  triageResult ? mapTriageResultKeys(triageResult) : null;

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
  alertId: string,
  tenantId: string
): Promise<AlertWithTriageResult | null> => {
  validateIncidentAlertId(alertId);

  try {
    const { rows } = await query<AlertWithTriageRow>(INCIDENT_ALERT_QUERIES.GET_ALERT_WITH_TRIAGE, [
      alertId,
      tenantId,
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

/**
 * Finds incident alerts matching a commit SHA via JSONB label search.
 * Checks vercel_commit_sha and netlify_commit_sha labels.
 * Used for cross-pipeline correlation (linking CI/CD analyses to incidents).
 *
 * @param tenantId - The tenant ID
 * @param commitSha - The commit SHA to search for
 * @returns Array of incident alert records matching the commit
 */
export const findIncidentsByCommitSha = async (
  tenantId: string,
  commitSha: string
): Promise<readonly IncidentAlertRecord[]> => {
  if (!tenantId?.trim() || !commitSha?.trim()) {
    return [];
  }

  try {
    const result = await query<IncidentAlertRow>(INCIDENT_ALERT_QUERIES.FIND_BY_COMMIT_SHA, [
      tenantId,
      commitSha,
    ]);

    const alerts = result.rows.map(mapRowToIncidentAlert);

    logger.info("Found incidents by commit SHA", {
      tenantId,
      matchCount: alerts.length,
    });

    return alerts;
  } catch (error) {
    logger.error("Failed to find incidents by commit SHA", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/** Maps a source stats row to the domain type */
const mapSourceStatsRow = (row: SourceStatsRow): SourceStats => ({
  source: row.source,
  eventCount: parseInt(row.event_count, 10),
  lastReceived: row.last_received ? new Date(row.last_received).toISOString() : null,
});

/** Maps an active-count row to the domain type */
const mapActiveCountRow = (row: ActiveCountBySourceRow): ActiveCountBySource => ({
  source: row.source,
  activeCount: row.active_count,
});

/**
 * Retrieves per-source aggregation stats for integration health.
 *
 * @param tenantId - The tenant to query stats for
 * @returns Array of per-source stats with event count and last received time
 */
export const getStatsBySource = async (tenantId: string): Promise<readonly SourceStats[]> => {
  try {
    const result = await query<SourceStatsRow>(INCIDENT_ALERT_QUERIES.GET_STATS_BY_SOURCE, [
      tenantId,
    ]);

    const stats = result.rows.map(mapSourceStatsRow);

    logger.info("Retrieved stats by source", {
      tenantId,
      sourceCount: stats.length,
    });

    return stats;
  } catch (error) {
    logger.error("Failed to get stats by source", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Retrieves active (non-resolved/closed/deduped) alert counts grouped by source.
 *
 * @param tenantId - The tenant to query
 * @returns Array of per-source active alert counts
 */
export const getActiveCountsBySource = async (
  tenantId: string
): Promise<readonly ActiveCountBySource[]> => {
  try {
    const result = await query<ActiveCountBySourceRow>(
      INCIDENT_ALERT_QUERIES.GET_ACTIVE_COUNTS_BY_SOURCE,
      [tenantId]
    );

    const counts = result.rows.map(mapActiveCountRow);

    logger.info("Retrieved active counts by source", {
      tenantId,
      sourceCount: counts.length,
    });

    return counts;
  } catch (error) {
    logger.error("Failed to get active counts by source", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Retrieves a balanced selection of recent incidents across sources.
 * Uses window function to pick top N incidents per source, then limits to maxTotal.
 *
 * @param tenantId - The tenant to query
 * @param perSource - Maximum incidents per source
 * @param maxTotal - Maximum total incidents to return
 * @returns Array of recent incident alerts balanced across sources
 */
export const getBalancedRecentIncidents = async (
  tenantId: string,
  perSource: number,
  maxTotal: number
): Promise<readonly IncidentAlertRecord[]> => {
  try {
    const result = await query<IncidentAlertRow & { readonly rn: number }>(
      INCIDENT_ALERT_QUERIES.GET_BALANCED_RECENT,
      [tenantId, perSource, maxTotal]
    );

    const alerts = result.rows.map(mapRowToIncidentAlert);

    logger.info("Retrieved balanced recent incidents", {
      tenantId,
      perSource,
      maxTotal,
      resultCount: alerts.length,
    });

    return alerts;
  } catch (error) {
    logger.error("Failed to get balanced recent incidents", {
      tenantId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

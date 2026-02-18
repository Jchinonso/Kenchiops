/**
 * Incident Alert Module
 *
 * Database operations for storing and querying incident alert data.
 *
 * @module database/incidentAlert
 */

// Types
export type { IncidentAlertRow, IncidentAlertRecord, CreateIncidentAlertInput } from "./types.js";

// Helpers (includes validation and mappers)
export {
  mapRowToIncidentAlert,
  validateCreateIncidentAlertInput,
  validateIncidentAlertId,
} from "./helpers.js";

// Repository operations
export {
  createIncidentAlert,
  getAlertById,
  findAlertByDeliveryId,
  updateAlertStatus,
} from "./repository.js";

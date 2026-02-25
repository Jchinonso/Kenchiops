/**
 * Data Export Module
 *
 * Database operations for managing data export jobs (GDPR Article 20).
 *
 * @module database/dataExport
 */

// Types
export type { DataExport, DataExportStatus, UpdateExportStatusInput } from "./types.js";

// Repository operations
export { createExportJob, getExportJob, updateExportStatus, listExportJobs } from "./repository.js";

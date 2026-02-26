/**
 * Data Export Types
 *
 * Type definitions for data export operations (GDPR Article 20).
 *
 * @module database/dataExport/types
 */

// ==================== Status Type ====================

export type DataExportStatus = "pending" | "processing" | "completed" | "failed" | "expired";

// ==================== Domain Types ====================

/**
 * Data export job domain object.
 */
export interface DataExport {
  readonly id: string;
  readonly tenantId: string;
  readonly status: DataExportStatus;
  readonly requestedBy: string;
  readonly filePath: string | null;
  readonly downloadUrl: string | null;
  readonly expiresAt: Date | null;
  readonly errorMessage: string | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
}

// ==================== Row Types ====================

/**
 * Database row for data_exports table.
 */
export interface DataExportRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly status: string;
  readonly requested_by: string;
  readonly file_path: string | null;
  readonly download_url: string | null;
  readonly expires_at: Date | null;
  readonly error_message: string | null;
  readonly created_at: Date;
  readonly completed_at: Date | null;
}

// ==================== Input Types ====================

/**
 * Input for updating export job status.
 */
export interface UpdateExportStatusInput {
  readonly id: string;
  readonly tenantId: string;
  readonly status: DataExportStatus;
  readonly filePath?: string;
  readonly downloadUrl?: string;
  readonly expiresAt?: Date;
  readonly errorMessage?: string;
}

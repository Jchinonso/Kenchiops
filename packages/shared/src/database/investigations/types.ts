/**
 * Investigation Types
 *
 * Type definitions for investigation storage and retrieval.
 *
 * @module database/investigations/types
 */

// ==================== Database Row Types ====================

/**
 * Database row type for investigations table.
 */
export interface InvestigationRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly initiated_by: string;
  readonly initiated_from: string;
  readonly status: string;
  readonly description: string;
  readonly service_name: string | null;
  readonly endpoint: string | null;
  readonly symptom: string | null;
  readonly environment: string | null;
  readonly time_range_from: Date | null;
  readonly time_range_to: Date | null;
  readonly evidence: ReadonlyArray<unknown>;
  readonly correlation: Readonly<Record<string, unknown>>;
  readonly diagnosis: Readonly<Record<string, unknown>>;
  readonly duration_ms: number | null;
  readonly error_message: string | null;
  readonly created_at: Date;
  readonly completed_at: Date | null;
  readonly updated_at: Date;
}

// ==================== Domain Types ====================

/**
 * Domain record for an investigation entry.
 */
export interface InvestigationRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly initiatedBy: string;
  readonly initiatedFrom: string;
  readonly status: string;
  readonly description: string;
  readonly serviceName: string | null;
  readonly endpoint: string | null;
  readonly symptom: string | null;
  readonly environment: string | null;
  readonly timeRangeFrom: Date | null;
  readonly timeRangeTo: Date | null;
  readonly evidence: ReadonlyArray<unknown>;
  readonly correlation: Readonly<Record<string, unknown>>;
  readonly diagnosis: Readonly<Record<string, unknown>>;
  readonly durationMs: number | null;
  readonly errorMessage: string | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
  readonly updatedAt: Date;
}

// ==================== Input Types ====================

/**
 * Input for creating a new investigation record.
 */
export interface CreateInvestigationInput {
  readonly tenantId: string;
  readonly initiatedBy: string;
  readonly initiatedFrom: string;
  readonly description: string;
  readonly serviceName?: string | null;
  readonly endpoint?: string | null;
  readonly symptom?: string | null;
  readonly environment?: string | null;
  readonly timeRangeFrom?: Date | null;
  readonly timeRangeTo?: Date | null;
}

/**
 * Input for updating parsed intent fields on an investigation.
 */
export interface UpdateInvestigationIntentInput {
  readonly serviceName?: string | null;
  readonly endpoint?: string | null;
  readonly symptom?: string | null;
  readonly environment?: string | null;
  readonly timeRangeFrom?: Date | null;
  readonly timeRangeTo?: Date | null;
}

// ==================== Query Types ====================

/**
 * Filters for listing investigations.
 */
export interface ListInvestigationFilters {
  readonly tenantId: string;
  readonly status?: string | null;
  readonly limit: number;
  readonly offset: number;
}

/**
 * Paginated list result for investigations.
 */
export interface PaginatedInvestigations {
  readonly items: readonly InvestigationRecord[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

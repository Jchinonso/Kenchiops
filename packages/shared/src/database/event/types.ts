/**
 * Event Types
 *
 * Type definitions for event storage and retrieval.
 *
 * @module database/event/types
 */

// ==================== Database Row Types ====================

/**
 * Database row type for events table.
 */
export interface EventRow {
  readonly id: string;
  readonly type: string;
  readonly source: string;
  readonly severity: string | null;
  readonly timestamp: Date;
  readonly payload: Record<string, unknown>;
  readonly metadata: Record<string, unknown> | null;
  readonly tenant_id: string | null;
  readonly created_at: Date;
}

// ==================== Record Types ====================

/**
 * Domain record for an event.
 */
export interface EventRecord {
  readonly id: string;
  readonly type: string;
  readonly source: string;
  readonly severity: string | null;
  readonly timestamp: Date;
  readonly payload: Record<string, unknown>;
  readonly metadata: Record<string, unknown> | null;
  readonly tenantId: string | null;
  readonly createdAt: Date;
}

// ==================== Count Row Types ====================

/**
 * Database row type for count queries.
 */
export interface EventCountRow {
  readonly count: string;
}

// ==================== Query Options ====================

/**
 * Options for listing events by tenant.
 */
export interface EventListOptions {
  readonly tenantId: string;
  readonly type?: string;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Webhook Activity Types
 *
 * Type definitions for webhook activity storage and retrieval.
 *
 * @module database/webhookActivity/types
 */

// ==================== Database Row Types ====================

/**
 * Database row type for webhook_activity table.
 */
export interface WebhookActivityRow {
  readonly id: string;
  readonly tenant_id: string | null;
  readonly delivery_id: string;
  readonly event_type: string;
  readonly source: string;
  readonly status: string;
  readonly processing_time_ms: number | null;
  readonly error_message: string | null;
  readonly metadata: Record<string, unknown>;
  readonly created_at: Date;
}

// ==================== Record Types ====================

/**
 * Domain record for a webhook activity entry.
 */
export interface WebhookActivityRecord {
  readonly id: string;
  readonly tenantId: string | null;
  readonly deliveryId: string;
  readonly eventType: string;
  readonly source: string;
  readonly status: string;
  readonly processingTimeMs: number | null;
  readonly errorMessage: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
}

// ==================== Count Row Types ====================

/**
 * Database row type for count queries.
 */
export interface WebhookActivityCountRow {
  readonly count: string;
}

// ==================== Input Types ====================

/**
 * Input for creating a new webhook activity record.
 */
export interface CreateWebhookActivityInput {
  readonly tenantId?: string | null;
  readonly deliveryId: string;
  readonly eventType: string;
  readonly source?: string;
  readonly status: string;
  readonly processingTimeMs?: number | null;
  readonly errorMessage?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>> | null;
}

// ==================== Query Options ====================

/**
 * Options for listing webhook activity by tenant.
 */
export interface WebhookActivityListOptions {
  readonly tenantId: string;
  readonly source?: string | null;
  readonly status?: string | null;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Data Retention Types
 *
 * Type definitions for data retention policy operations.
 *
 * @module database/retention/types
 */

// ==================== Domain Types ====================

/**
 * Retention policy for a tenant.
 * TTL values are in days.
 */
export interface RetentionPolicy {
  readonly tenantId: string;
  readonly auditLogDays: number;
  readonly analysisDays: number;
  readonly eventDays: number;
  readonly webhookDays: number;
  readonly updatedAt: Date;
}

// ==================== Row Types ====================

/**
 * Database row for tenant_retention_policies table.
 * tenant_id is the primary key (1:1 with tenants).
 */
export interface RetentionPolicyRow {
  readonly tenant_id: string;
  readonly audit_log_days: number;
  readonly analysis_days: number;
  readonly event_days: number;
  readonly webhook_days: number;
  readonly updated_at: Date;
}

// ==================== Input Types ====================

/**
 * Input for upserting a retention policy.
 * Missing fields use system-wide defaults.
 */
export interface UpsertRetentionPolicyInput {
  readonly tenantId: string;
  readonly auditLogDays?: number;
  readonly analysisDays?: number;
  readonly eventDays?: number;
  readonly webhookDays?: number;
}

// ==================== Result Types ====================

/**
 * Result of a retention enforcement run for a single tenant.
 */
export interface RetentionEnforcementResult {
  readonly tenantId: string;
  readonly auditLogsDeleted: number;
  readonly webhookActivityDeleted: number;
  readonly analysesDeleted: number;
  readonly eventsDeleted: number;
}

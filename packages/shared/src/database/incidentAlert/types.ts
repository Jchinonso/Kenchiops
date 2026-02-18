/**
 * Incident Alert Types
 *
 * Type definitions for incident alert storage and retrieval.
 *
 * @module database/incidentAlert/types
 */

// ==================== Database Row Types ====================

/**
 * Database row type for incident_alerts table.
 */
export interface IncidentAlertRow {
  readonly id: string;
  readonly tenant_id: string | null;
  readonly source: string;
  readonly source_alert_id: string;
  readonly delivery_id: string;
  readonly fingerprint: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly severity: string;
  readonly status: string;
  readonly service_name: string | null;
  readonly environment: string | null;
  readonly metrics: Record<string, unknown>;
  readonly labels: Record<string, string>;
  readonly source_payload: Record<string, unknown>;
  readonly received_at: Date;
  readonly created_at: Date;
  readonly updated_at: Date;
}

// ==================== Domain Types ====================

/**
 * Domain record for an incident alert entry.
 */
export interface IncidentAlertRecord {
  readonly id: string;
  readonly tenantId: string | null;
  readonly source: string;
  readonly sourceAlertId: string;
  readonly deliveryId: string;
  readonly fingerprint: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly severity: string;
  readonly status: string;
  readonly serviceName: string | null;
  readonly environment: string | null;
  readonly metrics: Readonly<Record<string, unknown>>;
  readonly labels: Readonly<Record<string, string>>;
  readonly sourcePayload: Readonly<Record<string, unknown>>;
  readonly receivedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ==================== Input Types ====================

/**
 * Input for creating a new incident alert record.
 */
export interface CreateIncidentAlertInput {
  readonly tenantId?: string | null;
  readonly source: string;
  readonly sourceAlertId: string;
  readonly deliveryId: string;
  readonly fingerprint?: string | null;
  readonly title: string;
  readonly description?: string | null;
  readonly severity?: string;
  readonly status?: string;
  readonly serviceName?: string | null;
  readonly environment?: string | null;
  readonly metrics?: Readonly<Record<string, unknown>> | null;
  readonly labels?: Readonly<Record<string, string>> | null;
  readonly sourcePayload: Readonly<Record<string, unknown>>;
  readonly receivedAt: string;
}

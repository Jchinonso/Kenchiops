/**
 * Dashboard Constants
 *
 * SSE configuration and dashboard event type definitions
 * for real-time dashboard updates.
 *
 * @module constants/dashboard
 */

// ==================== SSE Configuration ====================

/**
 * Server-Sent Events configuration for the dashboard stream endpoint.
 */
export const SSE_CONFIG = {
  /** Heartbeat interval to keep connections alive (ms) */
  HEARTBEAT_INTERVAL_MS: 30_000,
  /** Suggested retry interval sent to EventSource clients (ms) */
  RETRY_MS: 5_000,
} as const;

// ==================== Dashboard Event Types ====================

/**
 * Event type identifiers for dashboard SSE messages.
 */
export const DASHBOARD_EVENT_TYPES = {
  /** New CI failure detected from a check_run webhook */
  NEW_FAILURE: "new_failure",
  /** LLM analysis completed and persisted */
  ANALYSIS_COMPLETE: "analysis_complete",
  /** New incident alert received from a monitoring webhook */
  NEW_INCIDENT: "new_incident",
  /** Incident triage pipeline completed */
  INCIDENT_TRIAGED: "incident_triaged",
  /** Investigation status changed (phase transition, completion, or error) */
  INVESTIGATION_STATUS_CHANGED: "investigation_status_changed",
  /** User's organization list changed (new install, removal, etc.) */
  ORGANIZATION_UPDATED: "organization_updated",
  /** SSE keepalive heartbeat */
  HEARTBEAT: "heartbeat",
} as const;

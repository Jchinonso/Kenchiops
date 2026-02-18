/**
 * Incident Triage Service Configuration
 *
 * Centralized configuration management with validation
 */

import { config, SERVICE_PORTS, SERVICE_NAMES, SERVICE_VERSIONS } from "@kenchi/shared";
import type { IncidentTriageConfig } from "../types/incidentTriageTypes.js";

// Re-export for convenience
export type { IncidentTriageConfig } from "../types/incidentTriageTypes.js";

/**
 * Validated incident triage configuration.
 *
 * PAGERDUTY_WEBHOOK_SECRET is read from the environment via process.env
 * because it is service-specific and not part of the shared config module.
 * This is the only allowed direct process.env access in this service.
 */
export const appConfig: IncidentTriageConfig = {
  port: config.PORT ? parseInt(String(config.PORT), 10) : SERVICE_PORTS.INCIDENT_TRIAGE,
  environment: config.NODE_ENV || "development",
  serviceName: SERVICE_NAMES.INCIDENT_TRIAGE,
  version: SERVICE_VERSIONS.INCIDENT_TRIAGE,
  databaseUrl: config.DATABASE_URL,
  // Service-specific secret not in shared config — direct env access justified
  pagerDutyWebhookSecret: process.env.PAGERDUTY_WEBHOOK_SECRET ?? "",
} as const;

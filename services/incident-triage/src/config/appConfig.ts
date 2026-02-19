/**
 * Incident Triage Service Configuration
 *
 * Centralized configuration management with validation
 */

import {
  config,
  createLogger,
  invariant,
  SERVICE_PORTS,
  SERVICE_NAMES,
  SERVICE_VERSIONS,
  OPENROUTER_DEFAULTS,
} from "@kenchi/shared";
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
  // Service-specific LLM model override — not in shared config
  triageLlmModel: process.env.TRIAGE_LLM_MODEL ?? OPENROUTER_DEFAULTS.MODEL,
  // Service-specific Slack webhook URL for incident notifications — not in shared config
  slackIncidentWebhookUrl: process.env.SLACK_INCIDENT_WEBHOOK_URL ?? "",
} as const;

// ==================== Startup Validation ====================

/** Validates required and optional config values at module load. */
const assertTriageConfig = (cfg: IncidentTriageConfig): void => {
  // Fail fast on missing required config (CLAUDE.md: config validated at startup)
  invariant(cfg.databaseUrl, "DATABASE_URL is required for incident triage service");

  // Warn on missing optional secrets in production — service starts but features will fail
  const env = cfg.environment;
  if (env !== "production") {
    return;
  }

  const startupLogger = createLogger(SERVICE_NAMES.INCIDENT_TRIAGE);
  const pdSecret = cfg.pagerDutyWebhookSecret;
  const slackUrl = cfg.slackIncidentWebhookUrl;

  if (!pdSecret) {
    startupLogger.warn(
      "PAGERDUTY_WEBHOOK_SECRET is empty — webhook signature verification will fail"
    );
  }
  if (!slackUrl) {
    startupLogger.warn("SLACK_INCIDENT_WEBHOOK_URL is empty — Slack dispatch will fail");
  }
};

// Run validation immediately on import
assertTriageConfig(appConfig);

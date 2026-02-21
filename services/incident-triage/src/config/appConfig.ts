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
import { validateBaseUrl } from "../constants/monitoringConstants.js";

// Re-export for convenience
export type { IncidentTriageConfig } from "../types/incidentTriageTypes.js";

/**
 * Validated incident triage configuration.
 *
 * Service-specific secrets (PagerDuty, Datadog, Grafana, Prometheus, Slack, LLM)
 * use process.env because they are not in the shared config module.
 * Vercel/Netlify webhook secrets use shared config (already defined there).
 */
export const appConfig: IncidentTriageConfig = {
  port: config.PORT ? parseInt(String(config.PORT), 10) : SERVICE_PORTS.INCIDENT_TRIAGE,
  environment: config.NODE_ENV || "development",
  serviceName: SERVICE_NAMES.INCIDENT_TRIAGE,
  version: SERVICE_VERSIONS.INCIDENT_TRIAGE,
  databaseUrl: config.DATABASE_URL,
  // Service-specific secrets not in shared config — direct env access justified
  pagerDutyWebhookSecret: process.env.PAGERDUTY_WEBHOOK_SECRET ?? "",
  datadogWebhookSecret: process.env.DATADOG_WEBHOOK_SECRET ?? "",
  grafanaWebhookSecret: process.env.GRAFANA_WEBHOOK_SECRET ?? "",
  prometheusWebhookSecret: process.env.PROMETHEUS_WEBHOOK_SECRET ?? "",
  // Vercel/Netlify secrets available via shared config
  vercelWebhookSecret: config.VERCEL_WEBHOOK_SECRET ?? "",
  netlifyWebhookSecret: config.NETLIFY_WEBHOOK_SECRET ?? "",
  // Service-specific LLM model override — not in shared config
  triageLlmModel: process.env.TRIAGE_LLM_MODEL ?? OPENROUTER_DEFAULTS.MODEL,
  // Service-specific Slack webhook URL for incident notifications — not in shared config
  slackIncidentWebhookUrl: process.env.SLACK_INCIDENT_WEBHOOK_URL ?? "",
  // Monitoring API keys (optional — adapters skip when key is empty) — not in shared config
  datadogApiKey: process.env.DATADOG_API_KEY ?? "",
  datadogAppKey: process.env.DATADOG_APP_KEY ?? "",
  datadogApiBaseUrl: process.env.DATADOG_API_BASE_URL ?? "https://api.datadoghq.com",
  grafanaApiToken: process.env.GRAFANA_API_TOKEN ?? "",
  grafanaApiBaseUrl: process.env.GRAFANA_API_BASE_URL ?? "",
  // Prometheus is typically internal (no auth), only base URL required
  prometheusApiBaseUrl: process.env.PROMETHEUS_API_BASE_URL ?? "",
  pagerdutyApiToken: process.env.PAGERDUTY_API_TOKEN ?? "",
  vercelApiToken: process.env.VERCEL_MONITORING_API_TOKEN ?? "",
  vercelTeamId: process.env.VERCEL_TEAM_ID ?? "",
  netlifyApiToken: process.env.NETLIFY_API_TOKEN ?? "",
  netlifySiteId: process.env.NETLIFY_SITE_ID ?? "",
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
  if (!cfg.datadogWebhookSecret) {
    startupLogger.warn("DATADOG_WEBHOOK_SECRET is empty — Datadog webhook verification will fail");
  }
  if (!cfg.grafanaWebhookSecret) {
    startupLogger.warn("GRAFANA_WEBHOOK_SECRET is empty — Grafana webhook verification will fail");
  }
  if (!cfg.prometheusWebhookSecret) {
    startupLogger.warn(
      "PROMETHEUS_WEBHOOK_SECRET is empty — Prometheus webhook verification will fail"
    );
  }
  if (!cfg.vercelWebhookSecret) {
    startupLogger.warn("VERCEL_WEBHOOK_SECRET is empty — Vercel webhook verification will fail");
  }
  if (!cfg.netlifyWebhookSecret) {
    startupLogger.warn("NETLIFY_WEBHOOK_SECRET is empty — Netlify webhook verification will fail");
  }
  if (!slackUrl) {
    startupLogger.warn("SLACK_INCIDENT_WEBHOOK_URL is empty — Slack dispatch will fail");
  }

  // Monitoring adapters — info-level since these are genuinely optional
  if (!cfg.datadogApiKey) {
    startupLogger.info("DATADOG_API_KEY not set — Datadog monitoring evidence disabled");
  }
  if (!cfg.grafanaApiToken) {
    startupLogger.info("GRAFANA_API_TOKEN not set — Grafana monitoring evidence disabled");
  }
  if (!cfg.prometheusApiBaseUrl) {
    startupLogger.info("PROMETHEUS_API_BASE_URL not set — Prometheus monitoring evidence disabled");
  }
  if (!cfg.pagerdutyApiToken) {
    startupLogger.info("PAGERDUTY_API_TOKEN not set — PagerDuty monitoring evidence disabled");
  }
  if (!cfg.vercelApiToken) {
    startupLogger.info("VERCEL_MONITORING_API_TOKEN not set — Vercel monitoring evidence disabled");
  }
  if (!cfg.netlifyApiToken) {
    startupLogger.info("NETLIFY_API_TOKEN not set — Netlify monitoring evidence disabled");
  }

  // Validate monitoring base URLs to prevent SSRF via misconfigured env vars
  const ddBaseUrl = cfg.datadogApiBaseUrl;
  if (ddBaseUrl && !validateBaseUrl(ddBaseUrl)) {
    startupLogger.warn(
      "DATADOG_API_BASE_URL has invalid format — Datadog monitoring will be disabled"
    );
  }
  const grafanaUrl = cfg.grafanaApiBaseUrl;
  if (grafanaUrl && !validateBaseUrl(grafanaUrl)) {
    startupLogger.warn(
      "GRAFANA_API_BASE_URL has invalid format — Grafana monitoring will be disabled"
    );
  }
  const promUrl = cfg.prometheusApiBaseUrl;
  if (promUrl && !validateBaseUrl(promUrl)) {
    startupLogger.warn(
      "PROMETHEUS_API_BASE_URL has invalid format — Prometheus monitoring will be disabled"
    );
  }
};

// Run validation immediately on import
assertTriageConfig(appConfig);

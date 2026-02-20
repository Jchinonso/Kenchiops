/**
 * Incident Triage Service Type Definitions
 *
 * Types specific to the incident triage service configuration.
 */

/**
 * Incident triage service configuration interface
 */
export interface IncidentTriageConfig {
  readonly port: number;
  readonly environment: string;
  readonly serviceName: string;
  readonly version: string;
  readonly databaseUrl: string;
  readonly pagerDutyWebhookSecret: string;
  readonly datadogWebhookSecret: string;
  readonly grafanaWebhookSecret: string;
  readonly prometheusWebhookSecret: string;
  readonly vercelWebhookSecret: string;
  readonly netlifyWebhookSecret: string;
  readonly triageLlmModel: string;
  readonly slackIncidentWebhookUrl: string;
  readonly datadogApiKey: string;
  readonly datadogAppKey: string;
  readonly datadogApiBaseUrl: string;
  readonly grafanaApiToken: string;
  readonly grafanaApiBaseUrl: string;
  readonly prometheusApiBaseUrl: string;
  readonly pagerdutyApiToken: string;
  readonly vercelApiToken: string;
  readonly vercelTeamId: string;
  readonly netlifyApiToken: string;
  readonly netlifySiteId: string;
}

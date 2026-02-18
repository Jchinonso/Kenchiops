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
  readonly triageLlmModel: string;
  readonly slackIncidentWebhookUrl: string;
}

/**
 * Application configuration for the Slack bot service.
 * Separates configuration from application logic.
 */

import { config, SERVICE_PORTS } from '@kenchi/shared';

/**
 * Application configuration interface
 */
export interface AppConfig {
  readonly httpPort: number;
  readonly slackWebhookPort: number;
  readonly slackBotToken: string;
  readonly slackSigningSecret: string;
  readonly nodeEnv: string;
}

/**
 * Loads and validates application configuration.
 * 
 * @returns Application configuration
 * @throws {Error} If required configuration is missing
 */
export function loadAppConfig(): AppConfig {
  const slackBotToken = config.SLACK_BOT_TOKEN;
  const slackSigningSecret = config.SLACK_SIGNING_SECRET;

  if (!slackBotToken) {
    throw new Error('SLACK_BOT_TOKEN is required');
  }

  if (!slackSigningSecret) {
    throw new Error('SLACK_SIGNING_SECRET is required');
  }

  return {
    httpPort: parseInt(process.env.PORT || String(SERVICE_PORTS.SLACK_BOT_HTTP), 10),
    slackWebhookPort: parseInt(
      process.env.SLACK_WEBHOOK_PORT || String(SERVICE_PORTS.SLACK_BOT_WEBHOOK),
      10
    ),
    slackBotToken,
    slackSigningSecret,
    nodeEnv: config.NODE_ENV || 'development',
  };
}


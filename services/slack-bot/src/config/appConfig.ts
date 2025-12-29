/**
 * Application configuration for the Slack bot service.
 * Separates configuration from application logic.
 */

import { config, SERVICE_PORTS, ValidationError } from "@kenchi/shared";

/**
 * Application configuration interface
 */
export interface AppConfig {
  readonly httpPort: number;
  readonly slackWebhookPort: number;
  readonly slackBotToken: string;
  readonly slackSigningSecret: string;
  readonly slackAppToken: string;
  readonly nodeEnv: string;
}

/**
 * Required configuration fields with error messages
 */
const REQUIRED_CONFIG = [
  {
    key: "SLACK_BOT_TOKEN",
    value: () => config.SLACK_BOT_TOKEN,
    message: "SLACK_BOT_TOKEN is required",
  },
  {
    key: "SLACK_SIGNING_SECRET",
    value: () => config.SLACK_SIGNING_SECRET,
    message: "SLACK_SIGNING_SECRET is required",
  },
  {
    key: "SLACK_APP_LEVEL_TOKEN",
    value: () => config.SLACK_APP_LEVEL_TOKEN,
    message: "SLACK_APP_LEVEL_TOKEN is required for Socket Mode",
  },
] as const;

/**
 * Loads and validates application configuration.
 *
 * @returns Application configuration
 * @throws {ValidationError} If required configuration is missing
 */
export function loadAppConfig(): AppConfig {
  const slackBotToken = config.SLACK_BOT_TOKEN;
  const slackSigningSecret = config.SLACK_SIGNING_SECRET;
  const slackAppToken = config.SLACK_APP_LEVEL_TOKEN;

  // Validate all required config
  const missingConfig = REQUIRED_CONFIG.find((configItem) => !configItem.value());
  if (missingConfig) {
    throw new ValidationError(missingConfig.message);
  }

  return {
    httpPort: parseInt(process.env.PORT || String(SERVICE_PORTS.SLACK_BOT_HTTP), 10),
    slackWebhookPort: parseInt(
      process.env.SLACK_WEBHOOK_PORT || String(SERVICE_PORTS.SLACK_BOT_WEBHOOK),
      10
    ),
    slackBotToken,
    slackSigningSecret,
    slackAppToken,
    nodeEnv: config.NODE_ENV || "development",
  };
}

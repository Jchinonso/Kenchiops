/**
 * Slack Bot Service
 *
 * This service handles Slack interactions using the Slack Bolt framework.
 * It listens for Slack events and commands, and can interact with the shared
 * OpenAI client and other services.
 *
 * SAFETY NOTE: The LLM (OpenAI) provides analysis and suggestions only.
 * All actual decisions and side-effects (like running commands or altering state)
 * are handled by deterministic code after validation.
 */

import { App, type ButtonAction } from '@slack/bolt';
import express from 'express';
import { logger } from '@kenchi/shared';
import { loadAppConfig } from './config/appConfig.js';
import { handleKenchiCommand } from './handlers/commandHandler.js';
import { handleAppMention } from './handlers/mentionHandler.js';
import { handleMessage } from './handlers/messageHandler.js';
import {
  handleActionApproval,
  handleActionRejection,
  handlePositiveFeedback,
  handleNegativeFeedback,
} from './handlers/actionHandler.js';
import { createHttpRoutes } from './routes/httpRoutes.js';

/**
 * Initializes and configures the Slack Bolt app.
 *
 * @param config - Application configuration
 * @returns Configured Slack Bolt app instance
 */
function createSlackApp(config: ReturnType<typeof loadAppConfig>): App {
  return new App({
    token: config.slackBotToken,
    signingSecret: config.slackSigningSecret,
    socketMode: false,
  });
}

/**
 * Sets up Slack event handlers.
 *
 * @param app - Slack Bolt app instance
 */
function setupSlackHandlers(app: App): void {
  // Handle /kenchi slash command
  app.command('/kenchi', async ({ command, ack, respond }) => {
    await handleKenchiCommand(command, ack, respond);
  });

  // Handle message events
  app.message(async ({ message }) => {
    await handleMessage(message);
  });

  // Handle app mentions
  app.event('app_mention', async ({ event, say }) => {
    await handleAppMention(event, say);
  });

  // Handle action button clicks
  app.action(/^approve_action_/, async ({ action, ack, say, body }) => {
    const messageTs = 'message' in body && body.message && 'ts' in body.message
      ? (body.message.ts as string)
      : undefined;
    if (action.type === 'button' && 'action_id' in action && 'value' in action) {
      await handleActionApproval(
        action,
        ack,
        say,
        messageTs
      );
    }
  });

  app.action(/^reject_action_/, async ({ action, ack, say, body }) => {
    const messageTs = 'message' in body && body.message && 'ts' in body.message
      ? (body.message.ts as string)
      : undefined;
    if (action.type === 'button' && 'action_id' in action && 'value' in action) {
      await handleActionRejection(
        action,
        ack,
        say,
        messageTs
      );
    }
  });

  // Handle feedback buttons
  app.action('feedback_helpful', async ({ action, ack }) => {
    if (action.type === 'button' && 'action_id' in action && 'value' in action) {
      await handlePositiveFeedback(
        action as ButtonAction,
        ack
      );
    }
  });

  app.action('feedback_not_helpful', async ({ action, ack }) => {
    if (action.type === 'button' && 'action_id' in action && 'value' in action) {
      await handleNegativeFeedback(
        action as ButtonAction,
        ack
      );
    }
  });
}

/**
 * Initializes and starts the Slack bot service.
 */
async function startService(): Promise<void> {
  try {
    const appConfig = loadAppConfig();

    // Initialize Slack app
    const slackApp = createSlackApp(appConfig);
    setupSlackHandlers(slackApp);

    // Initialize Express app for HTTP endpoints
    const expressApp = express();
    expressApp.use(express.json());
    expressApp.use(createHttpRoutes(slackApp));

    // Start Slack Bolt server for Slack webhooks
    await slackApp.start(appConfig.slackWebhookPort);
    logger.info('Slack bot webhook server started', {
      port: appConfig.slackWebhookPort,
      environment: appConfig.nodeEnv,
    });

    // Start Express server for n8n integration endpoints
    expressApp.listen(appConfig.httpPort, () => {
      logger.info('HTTP server started for n8n integration', {
        port: appConfig.httpPort,
        environment: appConfig.nodeEnv,
      });
    });
  } catch (error) {
    logger.error('Failed to start Slack bot', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Start the service
startService().catch((error) => {
  logger.error('Fatal error starting Slack bot service', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});

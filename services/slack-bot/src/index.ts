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

import pkg from '@slack/bolt';
const { App } = pkg;
import express, { Request, Response } from 'express';
import { config, logger, asyncHandler, validate, validators } from '@kenchi/shared';

// Initialize Express app for n8n endpoints
const expressApp = express();
expressApp.use(express.json());

// Initialize Slack app with tokens from config
// For now, we'll run Slack Bolt separately and Express for n8n endpoints
// In production, you'd configure Slack webhooks to point to /slack/events
const app = new App({
  token: config.SLACK_BOT_TOKEN,
  signingSecret: config.SLACK_SIGNING_SECRET,
  socketMode: false,
  // Don't start server automatically - we'll handle it with Express
});

/**
 * Handle /kenchi slash command
 * TODO: Implement actual command logic with OpenAI integration
 * TODO: Add validation and confidence checking before executing any actions
 */
app.command('/kenchi', async ({ command, ack, respond }) => {
  await ack();
  
  logger.info('Slack command received', { 
    command: command.text, 
    user: command.user_id,
    channel: command.channel_id,
  });
  
  // TODO: Call OpenAI client to analyze the command
  // TODO: Check confidence score before proceeding
  // TODO: Execute deterministic actions based on LLM suggestions
  
  // Placeholder response
  await respond({
    text: `Received command: ${command.text}\n\nTODO: Implement OpenAI analysis and action execution.`,
    response_type: 'ephemeral'
  });
});

/**
 * Handle message events
 * TODO: Implement message analysis and response logic
 * TODO: Add filtering to only respond to mentions or specific channels
 */
app.message(async ({ message, say }) => {
  // Skip bot messages to avoid loops
  if (message.subtype === 'bot_message') {
    return;
  }
  
  // Type guard for messages with text property
  const textMessage = 'text' in message ? message : null;
  if (!textMessage) {
    return;
  }
  
  logger.debug('Slack message received', { 
    text: textMessage.text, 
    user: 'user' in message ? message.user : undefined,
    channel: 'channel' in message ? message.channel : undefined,
  });
  
  // TODO: Check if message mentions the bot or is in a monitored channel
  // TODO: Use OpenAI to analyze message and generate response
  // TODO: Validate confidence before responding
  
  // Placeholder: Just log for now
  // await say(`Analyzing: ${textMessage.text}`);
});

/**
 * Handle app mentions
 * TODO: Implement mention handling with OpenAI integration
 */
app.event('app_mention', async ({ event, say }) => {
  logger.info('Bot mentioned', { 
    text: event.text,
    user: event.user,
    channel: event.channel,
  });
  
  // TODO: Extract command/query from mention
  // TODO: Use OpenAI client to process
  // TODO: Check confidence and respond appropriately
  
  await say({
    text: `I heard you mention me! TODO: Implement analysis for: ${event.text}`,
    thread_ts: event.ts
  });
});

/**
 * HTTP endpoint for posting messages (for n8n workflow)
 * This allows n8n to post messages to Slack without going through Slack events
 */

expressApp.post(
  '/slack/message',
  validate({
    body: {
      channel: (v) => validators.required(v) && validators.string(v),
      message: (v) => validators.required(v) && validators.string(v),
    },
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { channel, message } = req.body as { channel: string; message: string };
    
    logger.info('Slack message request received', { channel });
    
    // TODO: Post message to Slack channel using Slack API
    // For now, just log it
    logger.info('Message to post', { channel, message });
    
    res.status(200).json({ 
      status: 'sent',
      channel,
      message: 'TODO: Implement actual Slack message posting',
    });
  })
);

expressApp.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ 
    status: 'ok', 
    service: 'slack-bot',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV,
  });
});

const HTTP_PORT = parseInt(process.env.PORT || '3001', 10);
const SLACK_WEBHOOK_PORT = parseInt(process.env.SLACK_WEBHOOK_PORT || '3002', 10);

/**
 * Start the Slack app and HTTP server
 * - Slack Bolt runs on SLACK_WEBHOOK_PORT for Slack webhooks
 * - Express runs on HTTP_PORT for n8n integration endpoints
 */
(async () => {
  try {
    // Start Slack Bolt server for Slack webhooks
    await app.start(SLACK_WEBHOOK_PORT);
    logger.info('Slack bot webhook server started', { 
      port: SLACK_WEBHOOK_PORT,
      environment: config.NODE_ENV,
    });
    
    // Start Express server for n8n integration endpoints
    expressApp.listen(HTTP_PORT, () => {
      logger.info('HTTP server started for n8n integration', { 
        port: HTTP_PORT,
        environment: config.NODE_ENV,
      });
    });
  } catch (error) {
    logger.error('Failed to start Slack bot', { error: String(error) });
    process.exit(1);
  }
})();


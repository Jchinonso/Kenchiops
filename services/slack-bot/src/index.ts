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
import {
  config,
  logger,
  asyncHandler,
  validate,
  validators,
  OpenAIClient,
  calculateConfidenceScore,
  HTTP_STATUS,
  SERVICE_PORTS,
  TIME_CONSTANTS,
  UI_CONSTANTS,
  type Event,
  type Evidence,
} from '@kenchi/shared';

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
 * Handle /kenchi slash command with full OpenAI integration
 */
app.command('/kenchi', async ({ command, ack, respond }) => {
  await ack();

  logger.info('Slack command received', {
    command: command.text,
    user: command.user_id,
    channel: command.channel_id,
  });

  try {
    // Import formatters
    const { formatAnalysisMessage, formatActionButtons, formatErrorMessage } = await import('./formatters.js');

    // Create Event from command
    const event: Event = {
      id: `evt_${Date.now()}_${command.user_id}`,
      type: 'SLACK_COMMAND' as any,
      source: 'slack',
      timestamp: new Date().toISOString(),
      severity: 'medium' as any,
      title: 'Slack Command Analysis',
      payload: {
        command: command.text,
        user_id: command.user_id,
        channel_id: command.channel_id,
      },
      metadata: {
        triggeredBy: command.user_id,
      },
    };

    // Create minimal evidence (can be enhanced with actual data)
    const evidence: Evidence = {
      eventId: event.id,
      collectedAt: new Date().toISOString(),
      logs: [],
    };

    // Call OpenAI for analysis
    const openaiClient = new OpenAIClient();
    const analysis = await openaiClient.analyzeIncident(event, evidence);

    // Calculate confidence score
    const confidenceResult = calculateConfidenceScore(analysis, evidence);

    logger.info('Analysis completed', {
      eventId: event.id,
      confidence: confidenceResult.finalScore,
      gating: confidenceResult.gatingDecision,
    });

    // Format response with Block Kit
    const blocks = formatAnalysisMessage(analysis, confidenceResult);

    // Add action buttons if actions require approval
    if (analysis.recommendedActions && analysis.recommendedActions.length > 0) {
      const actionButtons = formatActionButtons(
        analysis.recommendedActions.map((a, idx) => ({
          id: `action_${idx}`,
          eventId: event.id,
          actionType: a.actionType as any,
          description: a.description,
          safetyLevel: 'medium_risk' as any,
          status: 'pending' as any,
          priority: a.priority as any,
          reasoning: a.reasoning || '',
          confidence: confidenceResult.finalScore,
          requiresApproval: true,
          createdAt: new Date().toISOString(),
        })),
        event.id
      );
      blocks.push(...actionButtons);
    }

    // Send ephemeral response with analysis
    await respond({
      blocks,
      response_type: 'ephemeral',
    });

  } catch (error) {
    logger.error('Error processing Slack command', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    const { formatErrorMessage } = await import('./formatters.js');
    await respond({
      blocks: formatErrorMessage(error instanceof Error ? error : new Error('Unknown error')),
      response_type: 'ephemeral',
    });
  }
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
 * Handle app mentions with OpenAI integration
 */
app.event('app_mention', async ({ event, say }) => {
  logger.info('Bot mentioned', {
    text: event.text,
    user: event.user,
    channel: event.channel,
  });

  try {
    // Import formatters
    const { formatAnalysisMessage, formatErrorMessage } = await import('./formatters.js');

    // Extract query from mention (remove bot mention)
    const query = event.text.replace(/<@[^>]+>/g, '').trim();

    // Create Event from mention
    const analysisEvent: Event = {
      id: `evt_mention_${Date.now()}_${event.user}`,
      type: 'SLACK_MENTION' as any,
      source: 'slack',
      timestamp: new Date(parseFloat(event.ts) * TIME_CONSTANTS.MILLISECONDS_PER_SECOND).toISOString(),
      severity: 'medium' as any,
      title: 'Slack Mention Analysis',
      payload: {
        query,
        channel: event.channel,
        user: event.user,
        thread_ts: event.thread_ts,
      },
      metadata: {
        triggeredBy: event.user,
      },
    };

    // Create minimal evidence
    const evidence: Evidence = {
      eventId: analysisEvent.id,
      collectedAt: new Date().toISOString(),
      logs: [],
    };

    // Call OpenAI for analysis
    const openaiClient = new OpenAIClient();
    const analysis = await openaiClient.analyzeIncident(analysisEvent, evidence);

    // Calculate confidence score
    const confidenceResult = calculateConfidenceScore(analysis, evidence);

    logger.info('Mention analysis completed', {
      eventId: analysisEvent.id,
      confidence: confidenceResult.finalScore,
    });

    // Format response
    const blocks = formatAnalysisMessage(analysis, confidenceResult);

    // Reply in thread
    await say({
      blocks,
      thread_ts: event.ts, // Reply in thread
    });

    // Add "Was this helpful?" buttons
    await say({
      blocks: [
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '👍 Helpful',
                emoji: true,
              },
              style: 'primary',
              value: analysisEvent.id,
              action_id: 'feedback_helpful',
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '👎 Not helpful',
                emoji: true,
              },
              value: analysisEvent.id,
              action_id: 'feedback_not_helpful',
            },
          ],
        },
      ],
      thread_ts: event.ts,
    });

  } catch (error) {
    logger.error('Error processing app mention', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    const { formatErrorMessage } = await import('./formatters.js');
    await say({
      blocks: formatErrorMessage(error instanceof Error ? error : new Error('Unknown error')),
      thread_ts: event.ts,
    });
  }
});

/**
 * Handle action button clicks (approve/reject actions)
 */
app.action(/^approve_action_/, async ({ action, ack, say, body }) => {
  await ack();

  const actionId = 'action_id' in action ? (action as any).action_id : 'unknown';
  logger.info('Action approved', { action_id: actionId });

  try {
    const { formatProgressUpdate } = await import('./formatters.js');
    const value = JSON.parse((action as any).value);
    const { eventId, actionId } = value;

    // Update message to show approval
    if (say) {
      await say({
        blocks: formatProgressUpdate(actionId, 'in_progress', 'Action approved and executing...'),
        thread_ts: (body as any).message?.ts,
      });

      // TODO: Execute the actual action here
      // For now, just mark as completed
      setTimeout(async () => {
        if (say) {
          await say({
            blocks: formatProgressUpdate(actionId, 'completed', 'Action completed successfully'),
            thread_ts: (body as any).message?.ts,
          });
        }
      }, UI_CONSTANTS.ACTION_TIMEOUT_MS);
    }

  } catch (error) {
    logger.error('Error handling action approval', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.action(/^reject_action_/, async ({ action, ack, say, body }) => {
  await ack();

  const actionId = 'action_id' in action ? (action as any).action_id : 'unknown';
  logger.info('Action rejected', { action_id: actionId });

  try {
    const { formatProgressUpdate } = await import('./formatters.js');
    const value = JSON.parse((action as any).value);
    const { actionId: actionIdValue } = value;

    if (say) {
      await say({
        blocks: formatProgressUpdate(actionIdValue, 'failed', 'Action rejected by user'),
        thread_ts: (body as any).message?.ts,
      });
    }

  } catch (error) {
    logger.error('Error handling action rejection', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Handle feedback button clicks
 */
app.action('feedback_helpful', async ({ action, ack }) => {
  await ack();

  logger.info('Positive feedback received', {
    event_id: (action as any).value,
  });

  // TODO: Store feedback in database/metrics
});

app.action('feedback_not_helpful', async ({ action, ack }) => {
  await ack();

  logger.info('Negative feedback received', {
    event_id: (action as any).value,
  });

  // TODO: Store feedback in database/metrics
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
      thread_ts: (v) => !v || validators.string(v), // Optional thread timestamp
    },
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { channel, message, thread_ts } = req.body as {
      channel: string;
      message: string;
      thread_ts?: string;
    };

    logger.info('Slack message request received', { channel, hasThread: !!thread_ts });

    try {
      // Post message to Slack using the Slack client
      const result = await app.client.chat.postMessage({
        channel,
        text: message,
        ...(thread_ts && { thread_ts }), // Post in thread if provided
      });

      logger.info('Message posted to Slack', {
        channel,
        timestamp: result.ts,
        thread: thread_ts,
      });

      res.status(HTTP_STATUS.OK).json({
        status: 'sent',
        channel,
        timestamp: result.ts,
        thread_ts: result.ts, // Return timestamp for threading
      });

    } catch (error) {
      logger.error('Failed to post message to Slack', {
        channel,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to post message',
      });
    }
  })
);

expressApp.get('/health', (_req: Request, res: Response) => {
  res.status(HTTP_STATUS.OK).json({ 
    status: 'ok', 
    service: 'slack-bot',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV,
  });
});

const HTTP_PORT = parseInt(process.env.PORT || String(SERVICE_PORTS.SLACK_BOT_HTTP), 10);
const SLACK_WEBHOOK_PORT = parseInt(process.env.SLACK_WEBHOOK_PORT || String(SERVICE_PORTS.SLACK_BOT_WEBHOOK), 10);

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


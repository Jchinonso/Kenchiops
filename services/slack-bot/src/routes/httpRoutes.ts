/**
 * HTTP routes for n8n integration.
 * Provides endpoints for posting messages to Slack without going through Slack events.
 */

import express, { type Request, type Response } from 'express';
import { logger, validate, validators, HTTP_STATUS } from '@kenchi/shared';
import { asyncHandler } from '@kenchi/shared';
import type { App } from '@slack/bolt';

/**
 * Request body structure for message endpoint
 */
interface MessageRequest {
  readonly channel: string;
  readonly message: string;
  readonly thread_ts?: string;
}

/**
 * Response structure for message endpoint
 */
interface MessageResponse {
  readonly status: 'sent' | 'error';
  readonly channel?: string;
  readonly timestamp?: string;
  readonly thread_ts?: string;
  readonly error?: string;
}

/**
 * Creates HTTP routes for the Slack bot service.
 * 
 * @param app - Slack Bolt app instance
 * @returns Express router with routes
 */
export function createHttpRoutes(app: App): express.Router {
  const router = express.Router();

  /**
   * POST /slack/message
   * Post a message to Slack (for n8n workflow integration)
   */
  router.post(
    '/slack/message',
    validate({
      body: {
        channel: (v) => validators.required(v) && validators.string(v),
        message: (v) => validators.required(v) && validators.string(v),
        thread_ts: (v) => !v || validators.string(v),
      },
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { channel, message, thread_ts } = req.body as MessageRequest;

      logger.info('Slack message request received', { channel, hasThread: !!thread_ts });

      try {
        const result = await app.client.chat.postMessage({
          channel,
          text: message,
          ...(thread_ts && { thread_ts }),
        });

        logger.info('Message posted to Slack', {
          channel,
          timestamp: result.ts,
          thread: thread_ts,
        });

        const response: MessageResponse = {
          status: 'sent',
          channel,
          timestamp: result.ts,
          thread_ts: result.ts,
        };

        res.status(HTTP_STATUS.OK).json(response);
      } catch (error) {
        logger.error('Failed to post message to Slack', {
          channel,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        const response: MessageResponse = {
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to post message',
        };

        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(response);
      }
    })
  );

  /**
   * GET /health
   * Health check endpoint
   */
  router.get('/health', (_req: Request, res: Response) => {
    res.status(HTTP_STATUS.OK).json({
      status: 'ok',
      service: 'slack-bot',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    });
  });

  return router;
}


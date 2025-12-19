/**
 * Webhook Routes
 *
 * Handles incoming webhooks from various sources
 */

import { Router } from 'express';
import { asyncHandler, createLogger, HTTP_STATUS } from '@kenchi/shared';
import type { WebhookPayload } from '../types/apiTypes.js';

const router = Router();
const logger = createLogger('api');

/**
 * Generic webhook endpoint
 * POST /webhook/:source
 *
 * TODO: Implement routing to appropriate handlers based on event type
 * TODO: Add authentication/authorization
 */
router.post(
  '/webhook/:source',
  asyncHandler(async (req, res) => {
    const { source } = req.params as { source: string };
    const payload = req.body as WebhookPayload;

    logger.info('Webhook received', {
      source,
      payloadKeys: Object.keys(payload),
    });

    // TODO: Route to appropriate handler based on source
    // TODO: Validate payload
    // TODO: Trigger appropriate workflow or service

    res.status(HTTP_STATUS.OK).json({
      status: 'received',
      source,
      message: 'TODO: Implement webhook processing logic',
    });
  })
);

export { router as webhookRoutes };

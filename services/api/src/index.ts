/**
 * API Service
 * 
 * This service handles incoming webhooks and events from various sources.
 * It can trigger workflows, store events, and coordinate with other services.
 * 
 * SAFETY NOTE: The LLM (OpenAI) provides analysis and suggestions only.
 * All actual decisions and side-effects are handled by deterministic code after validation.
 */

import express, { Request, Response } from 'express';
import { 
  config, 
  type WebhookEvent,
  logger,
  errorHandler,
  asyncHandler,
  requestLogger,
  defaultRateLimiter,
  validate,
  validators,
} from '@kenchi/shared';

const app = express();
app.use(express.json());
app.use(requestLogger);

// Apply rate limiting to all routes
app.use(defaultRateLimiter.middleware());

interface WebhookPayload {
  [key: string]: unknown;
}

/**
 * Generic webhook endpoint
 * TODO: Implement routing to appropriate handlers based on event type
 * TODO: Add authentication/authorization
 */
app.post('/webhook/:source', asyncHandler(async (req, res) => {
  const { source } = req.params as { source: string };
  const payload = req.body as WebhookPayload;
  
  logger.info('Webhook received', { source, payloadKeys: Object.keys(payload) });
  
  // TODO: Route to appropriate handler based on source
  // TODO: Validate payload
  // TODO: Trigger appropriate workflow or service
  
  res.status(200).json({ 
    status: 'received',
    source,
    message: 'TODO: Implement webhook processing logic'
  });
}));

/**
 * Health check endpoint with detailed status
 */
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ 
    status: 'ok', 
    service: 'api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV,
  });
});

/**
 * Event ingestion endpoint
 * TODO: Store events in database or queue
 * TODO: Trigger analysis workflows
 */
app.post(
  '/events',
  validate({
    body: {
      source: (v) => validators.required(v) && validators.string(v),
      type: (v) => validators.required(v) && validators.string(v),
    },
  }),
  asyncHandler(async (req, res) => {
    const event = req.body as WebhookEvent;
    
    logger.info('Event received', { 
      source: event.source, 
      type: event.type,
      timestamp: event.timestamp,
    });
    
    // TODO: Validate event schema
    // TODO: Store in database/vector store
    // TODO: Trigger appropriate analysis workflow
    
    res.status(200).json({ 
      status: 'accepted',
      message: 'TODO: Implement event processing and storage'
    });
  })
);

/**
 * CI Failure Analysis endpoint (for n8n workflow)
 * Analyzes CI failure logs using OpenAI
 */
app.post(
  '/api/analyze',
  validate({
    body: {
      failure_log: (v) => validators.required(v) && validators.string(v),
      repository: (v) => validators.required(v) && validators.string(v),
    },
  }),
  asyncHandler(async (req, res) => {
    const { failure_log, repository } = req.body as { failure_log: string; repository: string };
    
    logger.info('CI failure analysis requested', { repository });
    
    // TODO: Use OpenAI client to analyze the failure
    // For now, return a placeholder analysis
    const analysis = `Analysis for ${repository}:\n\nFailure log indicates a test error. TODO: Implement OpenAI analysis.`;
    
    res.status(200).json({ 
      analysis,
      repository,
      confidence: 0.5, // Placeholder
    });
  })
);

// Error handling middleware (must be last)
app.use(errorHandler);

const PORT = config.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`API service started`, { port: PORT, environment: config.NODE_ENV });
});


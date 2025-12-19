/**
 * API Service Entry Point
 *
 * This service handles incoming webhooks and events from various sources.
 * It can trigger workflows, store events, and coordinate with other services.
 *
 * SAFETY NOTE: The LLM (OpenAI) provides analysis and suggestions only.
 * All actual decisions and side-effects are handled by deterministic code after validation.
 */

import express from 'express';
import {
  createLogger,
  errorHandler,
  requestLogger,
  defaultRateLimiter,
} from '@kenchi/shared';
import { registerRoutes } from './routes/index.js';
import { appConfig } from './config/appConfig.js';

const logger = createLogger('api');

/**
 * Create and configure Express application
 */
const createApp = (): express.Express => {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(requestLogger);
  app.use(defaultRateLimiter.middleware());

  // Register all routes
  registerRoutes(app);

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
};

/**
 * Start the API service
 */
const startServer = (): void => {
  const app = createApp();

  app.listen(appConfig.port, () => {
    logger.info('API service started', {
      port: appConfig.port,
      environment: appConfig.environment,
    });
  });
};

// Start the server
startServer();

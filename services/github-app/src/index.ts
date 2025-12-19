/**
 * GitHub App Service Entry Point
 *
 * This service handles GitHub webhook events (PRs, CI checks, etc.)
 * and can post comments or update status based on AI analysis.
 *
 * SAFETY NOTE: The LLM (OpenAI) provides analysis and suggestions only.
 * All actual decisions and side-effects (like posting comments or updating status)
 * are handled by deterministic code after validation.
 */

import express from 'express';
import {
  createLogger,
  errorHandler,
  requestLogger,
} from '@kenchi/shared';
import { registerRoutes } from './routes/index.js';
import { appConfig } from './config/appConfig.js';

const logger = createLogger('github-app');

/**
 * Create and configure Express application
 */
const createApp = (): express.Express => {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(requestLogger);

  // Register all routes
  registerRoutes(app);

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
};

/**
 * Start the GitHub App service
 */
const startServer = (): void => {
  const app = createApp();

  app.listen(appConfig.port, () => {
    logger.info('GitHub App service started', {
      port: appConfig.port,
      environment: appConfig.environment,
    });
  });
};

// Start the server
startServer();

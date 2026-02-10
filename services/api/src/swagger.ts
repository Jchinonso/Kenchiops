/**
 * OpenAPI/Swagger documentation setup.
 *
 * Note: Install swagger-ui-express and swagger-jsdoc for full functionality
 * npm install swagger-ui-express swagger-jsdoc
 * npm install --save-dev @types/swagger-ui-express @types/swagger-jsdoc
 */

import type { Express } from "express";
import {
  createLogger,
  SERVICE_PORTS,
  SERVICE_NAMES,
  HTTP_STATUS,
  SWAGGER_ROUTES,
  HEALTH_STATUS,
  API_RESPONSE_STATUS,
} from "@kenchi/shared";

const logger = createLogger(SERVICE_NAMES.API);

/**
 * Basic OpenAPI 3.0 specification.
 * This is a placeholder - in production, use swagger-jsdoc to generate from JSDoc comments.
 */
export const openApiSpec = {
  openapi: "3.0.0",
  info: {
    title: "Kenchi API",
    version: "0.1.0",
    description: "API service for AI-driven DevOps assistant",
  },
  servers: [
    {
      url: `http://localhost:${SERVICE_PORTS.API}`,
      description: "Development server",
    },
  ],
  paths: {
    [SWAGGER_ROUTES.HEALTH]: {
      get: {
        summary: "Health check",
        description: "Returns the health status of the API service",
        responses: {
          [String(HTTP_STATUS.OK)]: {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: HEALTH_STATUS.OK },
                    service: { type: "string", example: "api" },
                    timestamp: { type: "string", format: "date-time" },
                    uptime: { type: "number" },
                    environment: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    [SWAGGER_ROUTES.WEBHOOK]: {
      post: {
        summary: "Generic webhook endpoint",
        description: "Receives webhooks from various sources",
        parameters: [
          {
            name: "source",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Source of the webhook",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: true,
              },
            },
          },
        },
        responses: {
          [String(HTTP_STATUS.OK)]: {
            description: "Webhook received",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: API_RESPONSE_STATUS.RECEIVED },
                    source: { type: "string" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    [SWAGGER_ROUTES.EVENTS]: {
      post: {
        summary: "Event ingestion",
        description: "Ingest events for processing and storage",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["source", "type"],
                properties: {
                  source: { type: "string", example: "github" },
                  type: { type: "string", example: "pull_request" },
                  payload: { type: "object", additionalProperties: true },
                  timestamp: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
        responses: {
          [String(HTTP_STATUS.OK)]: {
            description: "Event accepted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: API_RESPONSE_STATUS.ACCEPTED },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          [String(HTTP_STATUS.BAD_REQUEST)]: {
            description: "Validation error",
          },
        },
      },
    },
  },
};

/**
 * Setup Swagger UI (placeholder - requires swagger-ui-express).
 *
 * To enable, uncomment and install dependencies:
 *
 * import swaggerUi from 'swagger-ui-express';
 *
 * export function setupSwagger(app: Express): void {
 *   app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
 * }
 */
export const setupSwagger = (_app: Express): void => {
  // Placeholder - implement when swagger-ui-express is installed
  logger.info("Swagger documentation available at /api-docs (when implemented)");
};

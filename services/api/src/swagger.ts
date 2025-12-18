/**
 * OpenAPI/Swagger documentation setup.
 * 
 * TODO: Install swagger-ui-express and swagger-jsdoc for full functionality
 * npm install swagger-ui-express swagger-jsdoc
 * npm install --save-dev @types/swagger-ui-express @types/swagger-jsdoc
 */

import { Express } from "express";
import { logger } from "@kenchi/shared";

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
      url: "http://localhost:3000",
      description: "Development server",
    },
  ],
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        description: "Returns the health status of the API service",
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
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
    "/webhook/{source}": {
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
          "200": {
            description: "Webhook received",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string" },
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
    "/events": {
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
          "200": {
            description: "Event accepted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "accepted" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          "400": {
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
 * TODO: Uncomment and install dependencies:
 * 
 * import swaggerUi from 'swagger-ui-express';
 * 
 * export function setupSwagger(app: Express): void {
 *   app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
 * }
 */
export function setupSwagger(_app: Express): void {
  // TODO: Implement when swagger-ui-express is installed
  logger.info("Swagger documentation available at /api-docs (when implemented)");
}


/**
 * OpenAPI/Swagger Documentation Assembly
 *
 * Assembles the complete OpenAPI 3.0.3 spec from modular path definitions
 * and serves interactive Swagger UI at /api-docs.
 *
 * @module swagger
 */

import type { Express } from "express";
import swaggerUi from "swagger-ui-express";
import { createLogger, SERVICE_NAMES, SERVICE_PORTS } from "@kenchi/shared";
import { components, tags } from "./components.js";
import { corePaths } from "./corePaths.js";
import { dashboardPaths } from "./dashboardPaths.js";
import { ragPaths } from "./ragPaths.js";
import { managementPaths } from "./managementPaths.js";

const logger = createLogger(SERVICE_NAMES.API);

const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Kenchi API",
    version: "1.0.0",
    description:
      "AI-driven DevOps assistant API. Provides CI failure analysis, RAG-powered knowledge search, fine-tuning management, risk assessment, and real-time dashboard.",
    contact: { name: "Kenchi Team" },
  },
  servers: [
    {
      url: `http://localhost:${SERVICE_PORTS.API}`,
      description: "Local development",
    },
  ],
  tags,
  paths: {
    ...corePaths,
    ...dashboardPaths,
    ...ragPaths,
    ...managementPaths,
  },
  components,
};

/**
 * Mounts Swagger UI and JSON spec endpoint on the Express app.
 *
 * - GET /api-docs — Interactive Swagger UI
 * - GET /api-docs.json — Raw OpenAPI spec
 */
export const setupSwagger = (app: Express): void => {
  app.get("/api-docs.json", (_req, res) => {
    res.json(openApiSpec);
  });

  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

  logger.info("Swagger UI mounted", {
    ui: "/api-docs",
    json: "/api-docs.json",
  });
};

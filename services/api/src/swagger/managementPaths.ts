/**
 * Management API Paths - Fine-Tuning, Risk Rules, Integrations
 *
 * @module swagger/managementPaths
 */

import { bearerAuth, paginationParams, tenantQueryParam } from "./components.js";

export const managementPaths = {
  // ==================== Fine-Tuning Dataset ====================
  "/api/fine-tuning/dataset/extract": {
    post: {
      tags: ["Fine-Tuning - Dataset"],
      summary: "Extract training dataset",
      description: "Extracts a training dataset from user feedback data in JSONL format.",
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                tenantId: { type: "string" },
                startDate: { type: "string", format: "date-time" },
                endDate: { type: "string", format: "date-time" },
                minFeedbackCount: { type: "integer" },
                limit: { type: "integer" },
              },
            },
          },
        },
      },
      responses: { "200": { description: "Extracted dataset statistics" } },
    },
  },
  "/api/fine-tuning/stats": {
    get: {
      tags: ["Fine-Tuning - Dataset"],
      summary: "Get fine-tuning statistics",
      parameters: [tenantQueryParam],
      responses: { "200": { description: "Fine-tuning statistics" } },
    },
  },

  // ==================== Fine-Tuning Jobs ====================
  "/api/fine-tuning/jobs": {
    post: {
      tags: ["Fine-Tuning - Jobs"],
      summary: "Start fine-tuning job",
      description:
        "Starts a new fine-tuning job. Extracts dataset, validates, uploads, and initiates training.",
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                tenantId: { type: "string" },
                epochs: { type: "integer" },
                suffix: { type: "string", description: "Custom model name suffix" },
                dryRun: { type: "boolean", default: false },
              },
            },
          },
        },
      },
      responses: {
        "201": { description: "Job started" },
        "400": { description: "Validation failed" },
      },
    },
    get: {
      tags: ["Fine-Tuning - Jobs"],
      summary: "List fine-tuning jobs",
      parameters: [{ name: "limit", in: "query", schema: { type: "integer", default: 10 } }],
      responses: { "200": { description: "Job list" } },
    },
  },
  "/api/fine-tuning/jobs/{jobId}": {
    get: {
      tags: ["Fine-Tuning - Jobs"],
      summary: "Get fine-tuning job status",
      parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "Job details" }, "404": { description: "Job not found" } },
    },
  },
  "/api/fine-tuning/jobs/{jobId}/cancel": {
    post: {
      tags: ["Fine-Tuning - Jobs"],
      summary: "Cancel fine-tuning job",
      parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": { description: "Job cancelled" },
        "400": { description: "Cannot cancel" },
      },
    },
  },
  "/api/fine-tuning/scheduler/status": {
    get: {
      tags: ["Fine-Tuning - Jobs"],
      summary: "Get scheduler status",
      responses: { "200": { description: "Scheduler status" } },
    },
  },
  "/api/fine-tuning/scheduler/start": {
    post: {
      tags: ["Fine-Tuning - Jobs"],
      summary: "Start scheduler",
      description: "Starts the automatic fine-tuning scheduler. Requires admin or owner role.",
      security: bearerAuth,
      responses: {
        "200": { description: "Scheduler started" },
        "403": { description: "Insufficient permissions" },
      },
    },
  },
  "/api/fine-tuning/scheduler/stop": {
    post: {
      tags: ["Fine-Tuning - Jobs"],
      summary: "Stop scheduler",
      description: "Stops the automatic fine-tuning scheduler. Requires admin or owner role.",
      security: bearerAuth,
      responses: {
        "200": { description: "Scheduler stopped" },
        "403": { description: "Insufficient permissions" },
      },
    },
  },

  // ==================== Fine-Tuning Models ====================
  "/api/fine-tuning/models": {
    get: {
      tags: ["Fine-Tuning - Models"],
      summary: "List model versions",
      responses: { "200": { description: "Model version list" } },
    },
  },
  "/api/fine-tuning/models/active": {
    get: {
      tags: ["Fine-Tuning - Models"],
      summary: "Get active model",
      parameters: [tenantQueryParam],
      responses: { "200": { description: "Active model details" } },
    },
  },
  "/api/fine-tuning/models/{versionId}/activate": {
    post: {
      tags: ["Fine-Tuning - Models"],
      summary: "Activate model version",
      description: "Promotes a model version to active. Requires admin or owner role.",
      security: bearerAuth,
      parameters: [{ name: "versionId", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": { description: "Model activated" },
        "400": { description: "Activation failed" },
        "403": { description: "Insufficient permissions" },
      },
    },
  },
  "/api/fine-tuning/models/rollback": {
    post: {
      tags: ["Fine-Tuning - Models"],
      summary: "Rollback to baseline model",
      security: bearerAuth,
      responses: {
        "200": { description: "Rolled back to baseline" },
        "400": { description: "Rollback failed" },
        "403": { description: "Insufficient permissions" },
      },
    },
  },
  "/api/fine-tuning/models/ab-test": {
    post: {
      tags: ["Fine-Tuning - Models"],
      summary: "Configure A/B test",
      description: "Sets up an A/B test between two model versions. Requires admin or owner role.",
      security: bearerAuth,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["controlVersion", "treatmentVersion", "treatmentPercentage"],
              properties: {
                controlVersion: { type: "string" },
                treatmentVersion: { type: "string" },
                treatmentPercentage: { type: "number", minimum: 0, maximum: 100 },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "A/B test configured" },
        "400": { description: "Configuration failed" },
        "403": { description: "Insufficient permissions" },
      },
    },
  },
  "/api/fine-tuning/evaluate/{versionId}": {
    get: {
      tags: ["Fine-Tuning - Models"],
      summary: "Evaluate model version",
      parameters: [
        { name: "versionId", in: "path", required: true, schema: { type: "string" } },
        tenantQueryParam,
      ],
      responses: { "200": { description: "Evaluation metrics" } },
    },
  },
  "/api/fine-tuning/compare": {
    post: {
      tags: ["Fine-Tuning - Models"],
      summary: "Compare two model versions",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["controlVersionId", "treatmentVersionId"],
              properties: {
                controlVersionId: { type: "string" },
                treatmentVersionId: { type: "string" },
                tenantId: { type: "string" },
              },
            },
          },
        },
      },
      responses: { "200": { description: "Model comparison results" } },
    },
  },

  // ==================== Risk Rules ====================
  "/api/risk-rules": {
    get: {
      tags: ["Risk Rules"],
      summary: "List custom risk rules",
      description: "Returns risk rules for a tenant with optional filters.",
      parameters: [
        { ...tenantQueryParam, required: true },
        { name: "actionType", in: "query", schema: { type: "string" } },
        {
          name: "environment",
          in: "query",
          schema: { type: "string", enum: ["production", "staging", "development"] },
        },
        { name: "enabledOnly", in: "query", schema: { type: "boolean", default: true } },
        ...paginationParams,
      ],
      responses: {
        "200": {
          description: "Risk rules list",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  rules: { type: "array", items: { $ref: "#/components/schemas/RiskRule" } },
                  count: { type: "integer" },
                  tenantId: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    post: {
      tags: ["Risk Rules"],
      summary: "Create custom risk rule",
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/CreateRiskRuleRequest" } },
        },
      },
      responses: {
        "201": { description: "Risk rule created" },
        "400": { description: "Validation error" },
      },
    },
  },
  "/api/risk-rules/{ruleId}": {
    get: {
      tags: ["Risk Rules"],
      summary: "Get risk rule by ID",
      parameters: [
        { name: "ruleId", in: "path", required: true, schema: { type: "string" } },
        { ...tenantQueryParam, required: true },
      ],
      responses: { "200": { description: "Risk rule" }, "404": { description: "Rule not found" } },
    },
    patch: {
      tags: ["Risk Rules"],
      summary: "Update risk rule",
      description: "Partial updates supported.",
      parameters: [{ name: "ruleId", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                actionTypes: { type: "array", items: { type: "string" } },
                environment: { type: "string" },
                enabled: { type: "boolean" },
                priority: { type: "integer" },
                tenantId: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Updated risk rule" },
        "404": { description: "Rule not found" },
      },
    },
    delete: {
      tags: ["Risk Rules"],
      summary: "Delete risk rule",
      parameters: [
        { name: "ruleId", in: "path", required: true, schema: { type: "string" } },
        { ...tenantQueryParam, required: true },
      ],
      responses: {
        "204": { description: "Rule deleted" },
        "404": { description: "Rule not found" },
      },
    },
  },
  "/api/risk-assessments": {
    get: {
      tags: ["Risk Rules"],
      summary: "Query risk assessment audit trail",
      parameters: [
        { ...tenantQueryParam, required: true },
        { name: "actionProposalId", in: "query", schema: { type: "string" } },
        { name: "actionType", in: "query", schema: { type: "string" } },
        { name: "fromDate", in: "query", schema: { type: "string", format: "date-time" } },
        { name: "toDate", in: "query", schema: { type: "string", format: "date-time" } },
        ...paginationParams,
      ],
      responses: { "200": { description: "Risk assessment list" } },
    },
  },

  // ==================== Integrations ====================
  "/integrations": {
    get: {
      tags: ["Integrations"],
      summary: "List integration connections",
      description:
        "Returns all CI provider integration connections for the authenticated user's tenant.",
      security: bearerAuth,
      responses: {
        "200": { description: "Integration connections" },
        "401": { description: "Authentication required" },
      },
    },
  },
  "/integrations/{provider}/connect": {
    get: {
      tags: ["Integrations"],
      summary: "Initiate integration OAuth",
      security: bearerAuth,
      parameters: [
        {
          name: "provider",
          in: "path",
          required: true,
          schema: { type: "string", enum: ["vercel", "netlify"] },
        },
      ],
      responses: {
        "302": { description: "Redirect to provider OAuth" },
        "400": { description: "Invalid provider" },
        "401": { description: "Authentication required" },
      },
    },
  },
  "/integrations/{provider}/callback": {
    get: {
      tags: ["Integrations"],
      summary: "Integration OAuth callback",
      parameters: [
        {
          name: "provider",
          in: "path",
          required: true,
          schema: { type: "string", enum: ["vercel", "netlify"] },
        },
        { name: "code", in: "query", schema: { type: "string" } },
        { name: "state", in: "query", schema: { type: "string" } },
      ],
      responses: { "302": { description: "Redirect to dashboard with status" } },
    },
  },
  "/integrations/{connectionId}": {
    delete: {
      tags: ["Integrations"],
      summary: "Disconnect integration",
      security: bearerAuth,
      parameters: [
        { name: "connectionId", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "Disconnected" },
        "401": { description: "Authentication required" },
      },
    },
  },
};

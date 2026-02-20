/**
 * Core API Paths - Health, Auth, Analysis, Webhooks, Events
 *
 * @module swagger/corePaths
 */

import { bearerAuth, successEnvelope } from "./components.js";

export const corePaths = {
  // ==================== Health ====================
  "/health": {
    get: {
      tags: ["Health"],
      summary: "Comprehensive health check",
      description: "Returns detailed component health status including Redis and circuit breakers.",
      responses: {
        "200": {
          description: "Service is healthy or degraded",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/HealthResponse" } },
          },
        },
        "503": { description: "Service is unhealthy" },
      },
    },
  },
  "/live": {
    get: {
      tags: ["Health"],
      summary: "Liveness probe",
      description: "Simple check that the process is running (Kubernetes liveness probe).",
      responses: {
        "200": {
          description: "Process is alive",
          content: {
            "application/json": {
              schema: { type: "object", properties: { status: { type: "string", example: "ok" } } },
            },
          },
        },
      },
    },
  },
  "/ready": {
    get: {
      tags: ["Health"],
      summary: "Readiness probe",
      description:
        "Checks if service can accept traffic (Kubernetes readiness probe). Verifies Redis connectivity.",
      responses: {
        "200": { description: "Service is ready" },
        "503": { description: "Service is not ready" },
      },
    },
  },

  // ==================== Auth ====================
  "/auth/{provider}/login": {
    get: {
      tags: ["Auth"],
      summary: "Initiate OAuth login",
      description:
        "Generates CSRF state and redirects to the OAuth provider's authorization URL. Supports GitHub, GitLab, Bitbucket, and Azure DevOps.",
      parameters: [
        {
          name: "provider",
          in: "path",
          required: true,
          schema: { type: "string", enum: ["github", "gitlab", "bitbucket", "azure_devops"] },
        },
        {
          name: "instance_url",
          in: "query",
          schema: { type: "string", format: "uri" },
          description: "Self-hosted instance URL (validated for SSRF prevention)",
        },
        {
          name: "redirect_after",
          in: "query",
          schema: { type: "string" },
          description: "URL to redirect to after successful login",
        },
      ],
      responses: {
        "302": { description: "Redirect to OAuth provider authorization URL" },
        "400": { description: "Invalid provider or missing configuration" },
      },
    },
  },
  "/auth/{provider}/callback": {
    get: {
      tags: ["Auth"],
      summary: "OAuth callback",
      description:
        "Exchanges authorization code for tokens, creates/finds user, issues JWT pair as httpOnly cookies, and redirects to frontend.",
      parameters: [
        {
          name: "provider",
          in: "path",
          required: true,
          schema: { type: "string", enum: ["github", "gitlab", "bitbucket", "azure_devops"] },
        },
        {
          name: "code",
          in: "query",
          schema: { type: "string" },
          description: "Authorization code",
        },
        { name: "state", in: "query", schema: { type: "string" }, description: "CSRF state token" },
        { name: "error", in: "query", schema: { type: "string" }, description: "OAuth error code" },
      ],
      responses: { "302": { description: "Redirect to frontend with auth cookies set" } },
    },
  },
  "/auth/refresh": {
    post: {
      tags: ["Auth"],
      summary: "Refresh token pair",
      description:
        "Rotates refresh token and issues new access/refresh token pair. Rate limited: 20 requests per 15 minutes.",
      security: bearerAuth,
      responses: {
        "200": {
          description: "New token pair issued (via httpOnly cookies)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  expires_in: { type: "integer", description: "Access token TTL in seconds" },
                  token_type: { type: "string", example: "Bearer" },
                },
              },
            },
          },
        },
        "400": { description: "Missing refresh token" },
        "401": { description: "Invalid or expired refresh token" },
      },
    },
  },
  "/auth/logout": {
    post: {
      tags: ["Auth"],
      summary: "Logout",
      description: "Revokes the refresh token family and clears auth cookies. Idempotent.",
      security: bearerAuth,
      responses: {
        "200": {
          description: "Logged out",
          content: {
            "application/json": {
              schema: { type: "object", properties: { success: { type: "boolean" } } },
            },
          },
        },
      },
    },
  },
  "/auth/me": {
    get: {
      tags: ["Auth"],
      summary: "Get current user profile",
      description: "Returns the authenticated user's profile and linked OAuth providers.",
      security: bearerAuth,
      responses: {
        "200": {
          description: "User profile",
          content: {
            "application/json": {
              schema: successEnvelope({ $ref: "#/components/schemas/UserProfile" }),
            },
          },
        },
        "401": { description: "Authentication required" },
        "404": { description: "User not found" },
      },
    },
    delete: {
      tags: ["Auth"],
      summary: "Delete account",
      description:
        'Permanently deletes the authenticated user\'s account. Requires confirmation: { confirmation: "DELETE" }.',
      security: bearerAuth,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["confirmation"],
              properties: { confirmation: { type: "string", enum: ["DELETE"] } },
            },
          },
        },
      },
      responses: {
        "200": { description: "Account deleted" },
        "400": { description: "Missing confirmation" },
        "401": { description: "Authentication required" },
      },
    },
  },

  // ==================== Analysis ====================
  "/api/analyze": {
    post: {
      tags: ["Analysis"],
      summary: "Submit CI failure for analysis",
      description: "Creates an async analysis job. Returns 202 with job ID for polling.",
      security: bearerAuth,
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/AnalyzeRequest" } },
        },
      },
      responses: {
        "202": {
          description: "Job created",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  job_id: { type: "string", format: "uuid" },
                  status: { type: "string", example: "pending" },
                },
              },
            },
          },
        },
        "400": { description: "Validation error" },
      },
    },
  },
  "/api/jobs/{id}": {
    get: {
      tags: ["Analysis"],
      summary: "Get analysis job status",
      description: "Poll for job status. Returns result when completed or error when failed.",
      security: bearerAuth,
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
      ],
      responses: {
        "200": {
          description: "Job status",
          content: { "application/json": { schema: { $ref: "#/components/schemas/JobStatus" } } },
        },
        "404": { description: "Job not found" },
      },
    },
  },

  // ==================== Webhooks & Events ====================
  "/webhook/{source}": {
    post: {
      tags: ["Webhooks"],
      summary: "Receive webhook",
      description: "Generic webhook endpoint for receiving events from various sources.",
      parameters: [
        {
          name: "source",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "Source identifier (github, datadog, pagerduty)",
        },
      ],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
      },
      responses: {
        "200": {
          description: "Webhook received",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: { type: "string", example: "received" },
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
      tags: ["Events"],
      summary: "Ingest event",
      description: "Ingest events for processing and storage.",
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
        "400": { description: "Validation error" },
      },
    },
  },
};

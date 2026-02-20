/**
 * Dashboard & SSE API Paths
 *
 * @module swagger/dashboardPaths
 */

import { bearerAuth, paginationParams } from "./components.js";

export const dashboardPaths = {
  "/api/v1/dashboard/tenant": {
    get: {
      tags: ["Dashboard"],
      summary: "Get tenant info",
      description: "Returns organization/tenant details for the authenticated user.",
      security: bearerAuth,
      responses: {
        "200": { description: "Tenant info" },
        "403": { description: "No organization linked" },
      },
    },
  },
  "/api/v1/dashboard/stats": {
    get: {
      tags: ["Dashboard"],
      summary: "Get dashboard statistics",
      description:
        "Returns aggregate statistics: total analyses, success rate, average confidence.",
      security: bearerAuth,
      responses: {
        "200": { description: "Dashboard statistics" },
        "403": { description: "No organization linked" },
      },
    },
  },
  "/api/v1/dashboard/stats/confidence-distribution": {
    get: {
      tags: ["Dashboard"],
      summary: "Get confidence distribution",
      description: "Returns histogram of analysis confidence scores for charting.",
      security: bearerAuth,
      responses: { "200": { description: "Confidence distribution data" } },
    },
  },
  "/api/v1/dashboard/stats/confidence-trend": {
    get: {
      tags: ["Dashboard"],
      summary: "Get confidence trend over time",
      description: "Returns time-series confidence data bucketed by day or week.",
      security: bearerAuth,
      parameters: [
        {
          name: "bucket",
          in: "query",
          schema: { type: "string", enum: ["day", "week"], default: "day" },
        },
        {
          name: "since",
          in: "query",
          schema: { type: "string", format: "date-time" },
          description: "Start date (defaults to 30 days ago)",
        },
      ],
      responses: { "200": { description: "Confidence trend data" } },
    },
  },
  "/api/v1/dashboard/repositories": {
    get: {
      tags: ["Dashboard"],
      summary: "List repositories",
      description: "Returns all repositories with analysis data for the tenant.",
      security: bearerAuth,
      responses: { "200": { description: "Repository list" } },
    },
  },
  "/api/v1/dashboard/analyses": {
    get: {
      tags: ["Dashboard"],
      summary: "List analyses",
      description: "Returns paginated list of analyses with optional filters.",
      security: bearerAuth,
      parameters: [
        ...paginationParams,
        {
          name: "repository",
          in: "query",
          schema: { type: "string" },
          description: "Filter by repository",
        },
        {
          name: "minConfidence",
          in: "query",
          schema: { type: "number" },
          description: "Minimum confidence (0-1)",
        },
        {
          name: "maxConfidence",
          in: "query",
          schema: { type: "number" },
          description: "Maximum confidence (0-1)",
        },
        { name: "since", in: "query", schema: { type: "string", format: "date-time" } },
        { name: "until", in: "query", schema: { type: "string", format: "date-time" } },
      ],
      responses: { "200": { description: "Paginated analyses" } },
    },
  },
  "/api/v1/dashboard/analyses/{id}": {
    get: {
      tags: ["Dashboard"],
      summary: "Get analysis detail",
      description: "Returns full analysis detail including LLM output, confidence, and metadata.",
      security: bearerAuth,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": { description: "Analysis detail" },
        "400": { description: "Invalid ID" },
        "404": { description: "Analysis not found" },
      },
    },
  },
  "/api/v1/dashboard/analyses/by-events": {
    post: {
      tags: ["Dashboard"],
      summary: "Get analysis status by event IDs",
      description:
        "Batch lookup of analysis status for given event IDs. Maximum 100 IDs per request.",
      security: bearerAuth,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["eventIds"],
              properties: { eventIds: { type: "array", items: { type: "string" }, maxItems: 100 } },
            },
          },
        },
      },
      responses: {
        "200": { description: "Map of eventId to analysis status" },
        "400": { description: "Missing or empty eventIds" },
      },
    },
  },
  "/api/v1/dashboard/failures": {
    get: {
      tags: ["Dashboard"],
      summary: "List failures",
      description: "Returns paginated list of CI failures with optional filters.",
      security: bearerAuth,
      parameters: [
        ...paginationParams,
        { name: "repository", in: "query", schema: { type: "string" } },
        { name: "severity", in: "query", schema: { type: "string" } },
        { name: "since", in: "query", schema: { type: "string", format: "date-time" } },
        { name: "until", in: "query", schema: { type: "string", format: "date-time" } },
      ],
      responses: { "200": { description: "Paginated failures" } },
    },
  },
  "/api/v1/dashboard/webhook-activity": {
    get: {
      tags: ["Dashboard"],
      summary: "List webhook activity",
      description:
        "Returns paginated webhook delivery history with optional source/status filters.",
      security: bearerAuth,
      parameters: [
        ...paginationParams,
        {
          name: "source",
          in: "query",
          schema: { type: "string" },
          description: "Filter by source (github, slack)",
        },
        {
          name: "status",
          in: "query",
          schema: { type: "string" },
          description: "Filter by status",
        },
      ],
      responses: { "200": { description: "Webhook activity list" } },
    },
  },
  "/api/v1/dashboard/events/stream": {
    get: {
      tags: ["SSE"],
      summary: "Real-time dashboard event stream",
      description:
        "Server-Sent Events stream for real-time dashboard updates. Tenant-isolated. Connection limits: 10 per tenant, 200 global.",
      security: bearerAuth,
      responses: {
        "200": {
          description: "SSE event stream",
          content: { "text/event-stream": { schema: { type: "string" } } },
        },
        "403": { description: "No organization linked" },
        "429": { description: "Too many active connections" },
      },
    },
  },
};

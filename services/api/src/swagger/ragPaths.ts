/**
 * RAG API Paths - Core, Purge, Health, Cost, Drift
 *
 * @module swagger/ragPaths
 */

import { bearerAuth, tenantQueryParam } from "./components.js";

export const ragPaths = {
  // ==================== Core ====================
  "/api/rag/ingest": {
    post: {
      tags: ["RAG - Core"],
      summary: "Ingest knowledge document",
      description: "Ingests a knowledge document, chunks it, and creates embeddings.",
      security: bearerAuth,
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/IngestRequest" } } },
      },
      responses: {
        "201": {
          description: "Document ingested",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      documentId: { type: "string" },
                      chunksCreated: { type: "integer" },
                      chunksEmbedded: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
        "400": { description: "Validation error" },
      },
    },
  },
  "/api/rag/search": {
    post: {
      tags: ["RAG - Core"],
      summary: "Search RAG documents",
      description:
        "Searches across diff chunks and knowledge documents using vector similarity. Tenant-isolated for non-admin users.",
      security: bearerAuth,
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/SearchRequest" } } },
      },
      responses: {
        "200": {
          description: "Search results",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      diffChunks: { type: "array", items: { type: "object" } },
                      knowledgeDocs: { type: "array", items: { type: "object" } },
                      queryTokens: { type: "integer" },
                      cacheHit: { type: "boolean" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "/api/rag/stats": {
    get: {
      tags: ["RAG - Core"],
      summary: "Get RAG statistics",
      description: "Returns document counts by type and optional tenant-specific stats.",
      parameters: [tenantQueryParam],
      responses: { "200": { description: "RAG statistics" } },
    },
  },
  "/api/rag/sync": {
    post: {
      tags: ["RAG - Core"],
      summary: "Sync external sources",
      description: "Triggers synchronization of due external knowledge sources.",
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                limit: { type: "integer" },
                maxDocsPerSource: { type: "integer" },
                minCredibility: { type: "number" },
              },
            },
          },
        },
      },
      responses: { "200": { description: "Sync results" } },
    },
  },

  // ==================== Purge ====================
  "/api/rag/tenant/{tenantId}": {
    delete: {
      tags: ["RAG - Purge"],
      summary: "Purge tenant RAG data",
      description: "Deletes all RAG data for a tenant. Requires admin or owner role.",
      security: bearerAuth,
      parameters: [{ name: "tenantId", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": { description: "Purge result" },
        "403": { description: "Insufficient permissions" },
      },
    },
  },
  "/api/rag/pr/{repository}/{prNumber}": {
    delete: {
      tags: ["RAG - Purge"],
      summary: "Purge PR diff chunks",
      description: "Deletes all diff chunks for a specific PR. Requires admin or owner role.",
      security: bearerAuth,
      parameters: [
        { name: "repository", in: "path", required: true, schema: { type: "string" } },
        { name: "prNumber", in: "path", required: true, schema: { type: "integer" } },
      ],
      responses: {
        "200": { description: "Purge result" },
        "400": { description: "Invalid parameters" },
      },
    },
  },
  "/api/rag/doc/{parentId}": {
    delete: {
      tags: ["RAG - Purge"],
      summary: "Purge knowledge document",
      description: "Deletes a knowledge document and all its chunks. Requires admin or owner role.",
      security: bearerAuth,
      parameters: [{ name: "parentId", in: "path", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "Purge result" } },
    },
  },

  // ==================== Health ====================
  "/api/rag/health": {
    get: {
      tags: ["RAG - Health"],
      summary: "RAG system health check",
      description: "Checks health of RAG subsystems.",
      responses: { "200": { description: "RAG health status" } },
    },
  },
  "/api/rag/metrics": {
    get: {
      tags: ["RAG - Health"],
      summary: "RAG metrics snapshot",
      description: "Returns current RAG performance metrics.",
      responses: { "200": { description: "RAG metrics" } },
    },
  },
  "/api/rag/evaluation": {
    get: {
      tags: ["RAG - Health"],
      summary: "RAG evaluation metrics",
      description: "Returns RAG quality evaluation metrics for a given time window.",
      parameters: [
        { name: "windowMinutes", in: "query", schema: { type: "integer", default: 60 } },
      ],
      responses: { "200": { description: "Evaluation metrics" } },
    },
  },
  "/api/rag/cleanup": {
    post: {
      tags: ["RAG - Health"],
      summary: "Cleanup expired documents",
      description: "Triggers cleanup of expired diff chunks and knowledge documents.",
      responses: { "200": { description: "Cleanup result" } },
    },
  },

  // ==================== Cost ====================
  "/api/rag/tenant/{tenantId}/tier": {
    get: {
      tags: ["RAG - Cost"],
      summary: "Get tenant tier config",
      description: "Returns embedding tier configuration for a tenant.",
      security: bearerAuth,
      parameters: [{ name: "tenantId", in: "path", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "Tier configuration" } },
    },
    put: {
      tags: ["RAG - Cost"],
      summary: "Update tenant tier config",
      description: "Updates embedding tier preferences.",
      security: bearerAuth,
      parameters: [{ name: "tenantId", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                preferredTier: { type: "string", enum: ["LITE", "STANDARD", "PREMIUM"] },
                monthlyBudgetUsd: { type: "number" },
                allowPremium: { type: "boolean" },
                degradeOnBudgetWarning: { type: "boolean" },
              },
            },
          },
        },
      },
      responses: { "200": { description: "Updated tier configuration" } },
    },
  },
  "/api/rag/cache/stats": {
    get: {
      tags: ["RAG - Cost"],
      summary: "Get embedding cache statistics",
      responses: { "200": { description: "Cache statistics" } },
    },
  },
  "/api/rag/cache/clear": {
    post: {
      tags: ["RAG - Cost"],
      summary: "Clear embedding cache",
      description: "Admin/owner only. Use expiredOnly: true to only clear expired entries.",
      security: bearerAuth,
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { expiredOnly: { type: "boolean", default: false } },
            },
          },
        },
      },
      responses: {
        "200": { description: "Cache cleared" },
        "403": { description: "Insufficient permissions" },
      },
    },
  },
  "/api/rag/cost/estimate": {
    post: {
      tags: ["RAG - Cost"],
      summary: "Estimate embedding cost",
      description:
        "Estimates cost for a given token count. Can project monthly cost and recommend tiers.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["tokenCount"],
              properties: {
                tokenCount: { type: "integer" },
                tier: { type: "string", enum: ["LITE", "STANDARD", "PREMIUM"] },
                dailyTokens: { type: "integer" },
                monthlyBudget: { type: "number" },
              },
            },
          },
        },
      },
      responses: { "200": { description: "Cost estimate" } },
    },
  },
  "/api/rag/cost-stats": {
    get: {
      tags: ["RAG - Cost"],
      summary: "Get cost tracking stats",
      security: bearerAuth,
      parameters: [{ ...tenantQueryParam, required: true }],
      responses: {
        "200": { description: "Cost stats" },
        "400": { description: "Missing tenantId" },
      },
    },
  },

  // ==================== Drift ====================
  "/api/rag/test-suite": {
    post: {
      tags: ["RAG - Drift"],
      summary: "Run RAG test suite",
      security: bearerAuth,
      requestBody: {
        content: {
          "application/json": {
            schema: { type: "object", properties: { tenantId: { type: "string" } } },
          },
        },
      },
      responses: { "200": { description: "Test suite results" } },
    },
  },
  "/api/rag/drift-report": {
    get: {
      tags: ["RAG - Drift"],
      summary: "Get drift report",
      security: bearerAuth,
      parameters: [tenantQueryParam],
      responses: { "200": { description: "Drift report" } },
    },
    post: {
      tags: ["RAG - Drift"],
      summary: "Run drift detection with alerts",
      security: bearerAuth,
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                tenantId: { type: "string" },
                skipAlertDispatch: { type: "boolean", default: false },
              },
            },
          },
        },
      },
      responses: { "200": { description: "Detection results with alert counts" } },
    },
  },
  "/api/rag/check-metric": {
    post: {
      tags: ["RAG - Drift"],
      summary: "Check metric bounds",
      security: bearerAuth,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["metricType", "currentValue"],
              properties: {
                metricType: { type: "string" },
                currentValue: { type: "number" },
                tenantId: { type: "string" },
              },
            },
          },
        },
      },
      responses: { "200": { description: "Metric bounds check result" } },
    },
  },
  "/api/rag/staleness": {
    get: {
      tags: ["RAG - Drift"],
      summary: "Get staleness statistics",
      responses: { "200": { description: "Staleness statistics" } },
    },
  },
  "/api/rag/staleness/documents": {
    get: {
      tags: ["RAG - Drift"],
      summary: "Get stale documents",
      parameters: [{ name: "limit", in: "query", schema: { type: "integer", default: 100 } }],
      responses: { "200": { description: "Stale document list" } },
    },
  },
  "/api/rag/reembed": {
    post: {
      tags: ["RAG - Drift"],
      summary: "Trigger re-embedding",
      security: bearerAuth,
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                tenantId: { type: "string" },
                batchSize: { type: "integer", default: 100 },
              },
            },
          },
        },
      },
      responses: { "200": { description: "Re-embedding results" } },
    },
  },
  "/api/rag/seed-test-cases": {
    post: {
      tags: ["RAG - Drift"],
      summary: "Seed RAG test cases",
      security: bearerAuth,
      requestBody: {
        content: {
          "application/json": {
            schema: { type: "object", properties: { tenantId: { type: "string" } } },
          },
        },
      },
      responses: { "200": { description: "Seed results" } },
    },
  },
  "/api/rag/detect-relationships": {
    post: {
      tags: ["RAG - Drift"],
      summary: "Detect document relationships",
      description:
        "Analyzes a document and creates semantic relationships with existing documents.",
      security: bearerAuth,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["docId", "docType", "title", "content"],
              properties: {
                docId: { type: "string" },
                docType: { type: "string" },
                title: { type: "string" },
                content: { type: "string" },
                repository: { type: "string" },
                filePath: { type: "string" },
                tenantId: { type: "string" },
              },
            },
          },
        },
      },
      responses: { "200": { description: "Relationship detection results" } },
    },
  },
};

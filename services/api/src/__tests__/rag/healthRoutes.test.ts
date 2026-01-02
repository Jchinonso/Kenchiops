/**
 * Unit tests for RAG Health Routes
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import request from "supertest";
import express, { type Express } from "express";

// Mock functions
const mockCheckRAGHealth = jest.fn();
const mockGetRAGMetricsSnapshot = jest.fn();
const mockGetRAGEvaluationMetrics = jest.fn();
const mockCleanupExpired = jest.fn();

// Mock dependencies
jest.mock("@kenchi/shared", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  SERVICE_NAMES: { API: "api" },
  HTTP_STATUS: {
    OK: 200,
    INTERNAL_SERVER_ERROR: 500,
  },
  API_ROUTES: {
    RAG_HEALTH: "/health",
    RAG_METRICS: "/metrics",
    RAG_EVALUATION: "/evaluation",
    RAG_CLEANUP: "/cleanup",
  },
  RAG_EVALUATION_CONFIG: {
    DEFAULT_WINDOW_MINUTES: 60,
  },
  checkRAGHealth: mockCheckRAGHealth,
  getRAGMetricsSnapshot: mockGetRAGMetricsSnapshot,
  getRAGEvaluationMetrics: mockGetRAGEvaluationMetrics,
  cleanupExpired: mockCleanupExpired,
  asyncHandler:
    (fn: (req: unknown, res: unknown, next: unknown) => Promise<unknown>) =>
    async (req: unknown, res: unknown, next: unknown) => {
      try {
        await fn(req, res, next);
      } catch (error) {
        (next as (err: unknown) => void)(error);
      }
    },
}));

describe("RAG Health Routes", () => {
  let app: Express;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default mock implementations
    mockCheckRAGHealth.mockResolvedValue({
      status: "healthy",
      components: {
        embedding: { status: "healthy", latencyMs: 50 },
        vectorStore: { status: "healthy", latencyMs: 10 },
        database: { status: "healthy", latencyMs: 5 },
      },
      lastChecked: new Date().toISOString(),
    });

    mockGetRAGMetricsSnapshot.mockReturnValue({
      totalQueries: 1000,
      avgLatencyMs: 200,
      cacheHitRate: 0.75,
      embeddingRequests: 5000,
      documentsIndexed: 500,
    });

    mockGetRAGEvaluationMetrics.mockResolvedValue({
      windowMinutes: 60,
      queryCount: 100,
      avgRelevanceScore: 0.85,
      avgLatencyMs: 180,
      p95LatencyMs: 500,
      successRate: 0.98,
    });

    mockCleanupExpired.mockResolvedValue({
      diffChunksDeleted: 50,
      knowledgeDocsDeleted: 10,
      diffChunksMarkedStale: 20,
      knowledgeDocsMarkedStale: 5,
    });

    const { ragHealthRoutes } = await import("../../routes/rag/healthRoutes.js");
    app = express();
    app.use(express.json());
    app.use(ragHealthRoutes);
  });

  describe("GET /health", () => {
    it("should return RAG health status", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe("healthy");
    });

    it("should include component health", async () => {
      const response = await request(app).get("/health");

      expect(response.body.data.components.embedding.status).toBe("healthy");
      expect(response.body.data.components.vectorStore.status).toBe("healthy");
      expect(response.body.data.components.database.status).toBe("healthy");
    });

    it("should include component latencies", async () => {
      const response = await request(app).get("/health");

      expect(response.body.data.components.embedding.latencyMs).toBe(50);
      expect(response.body.data.components.vectorStore.latencyMs).toBe(10);
    });

    it("should include last checked timestamp", async () => {
      const response = await request(app).get("/health");

      expect(response.body.data.lastChecked).toBeDefined();
      expect(new Date(response.body.data.lastChecked).getTime()).not.toBeNaN();
    });

    it("should report degraded status", async () => {
      mockCheckRAGHealth.mockResolvedValue({
        status: "degraded",
        components: {
          embedding: { status: "degraded", latencyMs: 500 },
          vectorStore: { status: "healthy", latencyMs: 10 },
          database: { status: "healthy", latencyMs: 5 },
        },
        lastChecked: new Date().toISOString(),
      });

      const response = await request(app).get("/health");

      expect(response.body.data.status).toBe("degraded");
    });

    it("should report unhealthy status", async () => {
      mockCheckRAGHealth.mockResolvedValue({
        status: "unhealthy",
        components: {
          embedding: { status: "unhealthy", error: "API error" },
          vectorStore: { status: "unhealthy", error: "Connection failed" },
          database: { status: "healthy", latencyMs: 5 },
        },
        lastChecked: new Date().toISOString(),
      });

      const response = await request(app).get("/health");

      expect(response.body.data.status).toBe("unhealthy");
    });
  });

  describe("GET /metrics", () => {
    it("should return RAG metrics snapshot", async () => {
      const response = await request(app).get("/metrics");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalQueries).toBe(1000);
      expect(response.body.data.avgLatencyMs).toBe(200);
    });

    it("should include cache statistics", async () => {
      const response = await request(app).get("/metrics");

      expect(response.body.data.cacheHitRate).toBe(0.75);
    });

    it("should include embedding and indexing stats", async () => {
      const response = await request(app).get("/metrics");

      expect(response.body.data.embeddingRequests).toBe(5000);
      expect(response.body.data.documentsIndexed).toBe(500);
    });

    it("should handle empty metrics", async () => {
      mockGetRAGMetricsSnapshot.mockReturnValue({
        totalQueries: 0,
        avgLatencyMs: 0,
        cacheHitRate: 0,
        embeddingRequests: 0,
        documentsIndexed: 0,
      });

      const response = await request(app).get("/metrics");

      expect(response.status).toBe(200);
      expect(response.body.data.totalQueries).toBe(0);
    });
  });

  describe("GET /evaluation", () => {
    it("should return evaluation metrics", async () => {
      const response = await request(app).get("/evaluation");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.avgRelevanceScore).toBe(0.85);
      expect(response.body.data.successRate).toBe(0.98);
    });

    it("should use default window when not specified", async () => {
      await request(app).get("/evaluation");

      expect(mockGetRAGEvaluationMetrics).toHaveBeenCalledWith(60);
    });

    it("should respect custom window parameter", async () => {
      await request(app).get("/evaluation?windowMinutes=120");

      expect(mockGetRAGEvaluationMetrics).toHaveBeenCalledWith(120);
    });

    it("should include latency percentiles", async () => {
      const response = await request(app).get("/evaluation");

      expect(response.body.data.avgLatencyMs).toBe(180);
      expect(response.body.data.p95LatencyMs).toBe(500);
    });

    it("should include query count", async () => {
      const response = await request(app).get("/evaluation");

      expect(response.body.data.queryCount).toBe(100);
    });
  });

  describe("POST /cleanup", () => {
    it("should trigger cleanup", async () => {
      const response = await request(app).post("/cleanup").send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockCleanupExpired).toHaveBeenCalled();
    });

    it("should return deleted counts", async () => {
      const response = await request(app).post("/cleanup").send({});

      expect(response.body.data.diffChunksDeleted).toBe(50);
      expect(response.body.data.knowledgeDocsDeleted).toBe(10);
    });

    it("should return stale marker counts", async () => {
      const response = await request(app).post("/cleanup").send({});

      expect(response.body.data.diffChunksMarkedStale).toBe(20);
      expect(response.body.data.knowledgeDocsMarkedStale).toBe(5);
    });

    it("should handle cleanup with no items", async () => {
      mockCleanupExpired.mockResolvedValue({
        diffChunksDeleted: 0,
        knowledgeDocsDeleted: 0,
        diffChunksMarkedStale: 0,
        knowledgeDocsMarkedStale: 0,
      });

      const response = await request(app).post("/cleanup").send({});

      expect(response.status).toBe(200);
      expect(response.body.data.diffChunksDeleted).toBe(0);
    });
  });

  describe("error handling", () => {
    it("should handle health check errors", async () => {
      mockCheckRAGHealth.mockRejectedValue(new Error("Health check failed"));

      const response = await request(app).get("/health");

      expect(response.status).toBe(500);
    });

    it("should handle metrics errors", async () => {
      mockGetRAGMetricsSnapshot.mockImplementation(() => {
        throw new Error("Metrics unavailable");
      });

      const response = await request(app).get("/metrics");

      expect(response.status).toBe(500);
    });

    it("should handle evaluation errors", async () => {
      mockGetRAGEvaluationMetrics.mockRejectedValue(new Error("Evaluation failed"));

      const response = await request(app).get("/evaluation");

      expect(response.status).toBe(500);
    });

    it("should handle cleanup errors", async () => {
      mockCleanupExpired.mockRejectedValue(new Error("Cleanup failed"));

      const response = await request(app).post("/cleanup").send({});

      expect(response.status).toBe(500);
    });
  });

  describe("concurrent requests", () => {
    it("should handle concurrent health checks", async () => {
      const requests = Array.from({ length: 5 }, () => request(app).get("/health"));

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    it("should handle concurrent metrics requests", async () => {
      const requests = Array.from({ length: 5 }, () => request(app).get("/metrics"));

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });
  });
});

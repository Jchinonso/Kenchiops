/**
 * Unit tests for RAG Drift Routes
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import request from "supertest";
import express, { type Express } from "express";

// Mock functions
const mockRunTestSuite = jest.fn();
const mockGenerateDriftReport = jest.fn();
const mockCheckMetricBounds = jest.fn();
const mockRunDriftDetectionWithAlerts = jest.fn();
const mockCheckStaleness = jest.fn();
const mockGetStaleDocuments = jest.fn();
const mockTriggerReembedding = jest.fn();
const mockSeedTestCases = jest.fn();
const mockGetSeedCategories = jest.fn();
const mockDetectAndCreateRelationships = jest.fn();

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
    BAD_REQUEST: 400,
    INTERNAL_SERVER_ERROR: 500,
  },
  API_ROUTES: {
    RAG_TEST_SUITE: "/test-suite",
    RAG_DRIFT_REPORT: "/drift-report",
    RAG_CHECK_METRIC: "/check-metric",
    RAG_STALENESS: "/staleness",
    RAG_REEMBED: "/reembed",
    RAG_SEED_TEST_CASES: "/seed-test-cases",
    RAG_DETECT_RELATIONSHIPS: "/detect-relationships",
  },
  RAG_QUERY_DEFAULTS: {
    STALE_DOCS_LIMIT: 100,
  },
  runTestSuite: mockRunTestSuite,
  generateDriftReport: mockGenerateDriftReport,
  checkMetricBounds: mockCheckMetricBounds,
  runDriftDetectionWithAlerts: mockRunDriftDetectionWithAlerts,
  checkStaleness: mockCheckStaleness,
  getStaleDocuments: mockGetStaleDocuments,
  triggerReembedding: mockTriggerReembedding,
  seedTestCases: mockSeedTestCases,
  getSeedCategories: mockGetSeedCategories,
  detectAndCreateRelationships: mockDetectAndCreateRelationships,
  asyncHandler:
    (fn: (req: unknown, res: unknown, next: unknown) => Promise<unknown>) =>
    async (req: unknown, res: unknown, next: unknown) => {
      try {
        await fn(req, res, next);
      } catch (error) {
        (next as (err: unknown) => void)(error);
      }
    },
  validate: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  validators: {
    required: (value: unknown) => value !== undefined && value !== null,
    string: (value: unknown) => typeof value === "string",
  },
  requireTenantMatch: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

describe("RAG Drift Routes", () => {
  let app: Express;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default mock implementations
    mockRunTestSuite.mockResolvedValue({
      totalTests: 10,
      passed: 8,
      failed: 2,
      passRate: 0.8,
      avgLatencyMs: 250,
      failedTests: [
        { name: "test-1", reason: "Low recall" },
        { name: "test-2", reason: "High latency" },
      ],
    });

    mockGenerateDriftReport.mockResolvedValue({
      overallHealth: "good",
      metrics: {
        relevanceScore: 0.85,
        latencyP50Ms: 200,
        latencyP99Ms: 800,
      },
      alerts: [],
      recommendations: [],
    });

    mockCheckMetricBounds.mockResolvedValue({
      inBounds: true,
      lowerBound: 0.7,
      upperBound: 1.0,
    });

    mockRunDriftDetectionWithAlerts.mockResolvedValue({
      report: { overallHealth: "good", alerts: [] },
      alertsDispatched: 0,
      dispatchErrors: [],
    });

    mockCheckStaleness.mockResolvedValue({
      diffChunks: { stale: 10, total: 100 },
      knowledgeDocs: { stale: 5, total: 50 },
    });

    mockGetStaleDocuments.mockResolvedValue({
      diffChunks: [{ id: "chunk-1", age: 30 }],
      knowledgeDocs: [{ id: "doc-1", age: 60 }],
    });

    mockTriggerReembedding.mockResolvedValue({
      success: true,
      processedCount: 15,
      errors: [],
    });

    mockSeedTestCases.mockResolvedValue({
      success: true,
      created: 10,
      skipped: 2,
      errors: [],
    });

    mockGetSeedCategories.mockReturnValue(["ci_failure", "security", "performance"]);

    mockDetectAndCreateRelationships.mockResolvedValue({
      detected: 5,
      created: 3,
      errors: [],
    });

    const { ragDriftRoutes } = await import("../../routes/rag/driftRoutes.js");
    app = express();
    app.use(express.json());
    app.use(ragDriftRoutes);
  });

  describe("POST /test-suite", () => {
    it("should run test suite", async () => {
      const response = await request(app).post("/test-suite").send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalTests).toBe(10);
      expect(response.body.data.passed).toBe(8);
      expect(response.body.data.passRate).toBe(0.8);
    });

    it("should run test suite for specific tenant", async () => {
      await request(app).post("/test-suite").send({ tenantId: "tenant-1" });

      expect(mockRunTestSuite).toHaveBeenCalledWith("tenant-1");
    });

    it("should include failed test details", async () => {
      const response = await request(app).post("/test-suite").send({});

      expect(response.body.data.failedTests).toHaveLength(2);
      expect(response.body.data.failedTests[0].name).toBe("test-1");
    });
  });

  describe("GET /drift-report", () => {
    it("should generate drift report", async () => {
      const response = await request(app).get("/drift-report");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.overallHealth).toBe("good");
    });

    it("should filter by tenant", async () => {
      await request(app).get("/drift-report?tenantId=tenant-1");

      expect(mockGenerateDriftReport).toHaveBeenCalledWith("tenant-1");
    });

    it("should include metrics", async () => {
      const response = await request(app).get("/drift-report");

      expect(response.body.data.metrics.relevanceScore).toBe(0.85);
      expect(response.body.data.metrics.latencyP50Ms).toBe(200);
    });
  });

  describe("POST /drift-report", () => {
    it("should run drift detection with alerts", async () => {
      const response = await request(app).post("/drift-report").send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.alertsDispatched).toBe(0);
    });

    it("should skip alert dispatch when requested", async () => {
      await request(app).post("/drift-report").send({ skipAlertDispatch: true });

      expect(mockRunDriftDetectionWithAlerts).toHaveBeenCalledWith(undefined, {
        skipAlertDispatch: true,
      });
    });

    it("should include dispatch errors", async () => {
      mockRunDriftDetectionWithAlerts.mockResolvedValue({
        report: { overallHealth: "degraded", alerts: [{ type: "high_latency" }] },
        alertsDispatched: 1,
        dispatchErrors: ["Slack API error"],
      });

      const response = await request(app).post("/drift-report").send({});

      expect(response.body.data.dispatchErrors).toHaveLength(1);
    });
  });

  describe("POST /check-metric", () => {
    it("should check metric bounds", async () => {
      const response = await request(app).post("/check-metric").send({
        metricType: "relevance_score",
        currentValue: 0.85,
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.inBounds).toBe(true);
    });

    it("should include metric details in response", async () => {
      const response = await request(app).post("/check-metric").send({
        metricType: "latency_p50",
        currentValue: 250,
      });

      expect(response.body.data.metricType).toBe("latency_p50");
      expect(response.body.data.currentValue).toBe(250);
    });

    it("should detect out of bounds", async () => {
      mockCheckMetricBounds.mockResolvedValue({
        inBounds: false,
        lowerBound: 0.7,
        upperBound: 1.0,
      });

      const response = await request(app).post("/check-metric").send({
        metricType: "relevance_score",
        currentValue: 0.5,
      });

      expect(response.body.data.inBounds).toBe(false);
    });
  });

  describe("GET /staleness", () => {
    it("should return staleness statistics", async () => {
      const response = await request(app).get("/staleness");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.diffChunks.stale).toBe(10);
      expect(response.body.data.knowledgeDocs.stale).toBe(5);
    });
  });

  describe("GET /staleness/documents", () => {
    it("should return stale documents", async () => {
      const response = await request(app).get("/staleness/documents");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.diffChunkCount).toBe(1);
      expect(response.body.data.knowledgeDocCount).toBe(1);
    });

    it("should respect limit parameter", async () => {
      await request(app).get("/staleness/documents?limit=50");

      expect(mockGetStaleDocuments).toHaveBeenCalledWith(50);
    });

    it("should default limit to 100", async () => {
      await request(app).get("/staleness/documents");

      expect(mockGetStaleDocuments).toHaveBeenCalledWith(100);
    });
  });

  describe("POST /reembed", () => {
    it("should trigger reembedding", async () => {
      const response = await request(app).post("/reembed").send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.processedCount).toBe(15);
    });

    it("should pass tenant and batch size", async () => {
      await request(app).post("/reembed").send({
        tenantId: "tenant-1",
        batchSize: 50,
      });

      expect(mockTriggerReembedding).toHaveBeenCalledWith({
        tenantId: "tenant-1",
        batchSize: 50,
      });
    });

    it("should include errors in response", async () => {
      mockTriggerReembedding.mockResolvedValue({
        success: false,
        processedCount: 10,
        errors: ["Embedding API timeout"],
      });

      const response = await request(app).post("/reembed").send({});

      expect(response.body.success).toBe(false);
      expect(response.body.data.errors).toHaveLength(1);
    });
  });

  describe("POST /seed-test-cases", () => {
    it("should seed test cases", async () => {
      const response = await request(app).post("/seed-test-cases").send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.created).toBe(10);
      expect(response.body.data.skipped).toBe(2);
    });

    it("should include categories", async () => {
      const response = await request(app).post("/seed-test-cases").send({});

      expect(response.body.data.categories).toContain("ci_failure");
      expect(response.body.data.categories).toContain("security");
    });

    it("should seed for specific tenant", async () => {
      await request(app).post("/seed-test-cases").send({ tenantId: "tenant-1" });

      expect(mockSeedTestCases).toHaveBeenCalledWith("tenant-1");
    });
  });

  describe("POST /detect-relationships", () => {
    it("should detect document relationships", async () => {
      const response = await request(app).post("/detect-relationships").send({
        docId: "doc-123",
        docType: "troubleshooting",
        title: "Fix Redis Connection",
        content: "Guide to fixing Redis connections...",
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.detected).toBe(5);
      expect(response.body.data.created).toBe(3);
    });

    it("should include optional context fields", async () => {
      await request(app).post("/detect-relationships").send({
        docId: "doc-123",
        docType: "troubleshooting",
        title: "Test",
        content: "Content",
        repository: "owner/repo",
        filePath: "docs/test.md",
        tenantId: "tenant-1",
      });

      expect(mockDetectAndCreateRelationships).toHaveBeenCalledWith({
        docId: "doc-123",
        docType: "troubleshooting",
        title: "Test",
        content: "Content",
        repository: "owner/repo",
        filePath: "docs/test.md",
        tenantId: "tenant-1",
      });
    });

    it("should indicate failure when errors occur", async () => {
      mockDetectAndCreateRelationships.mockResolvedValue({
        detected: 3,
        created: 1,
        errors: ["Failed to create relationship"],
      });

      const response = await request(app).post("/detect-relationships").send({
        docId: "doc-123",
        docType: "runbook",
        title: "Title",
        content: "Content",
      });

      expect(response.body.success).toBe(false);
      expect(response.body.data.errors).toHaveLength(1);
    });
  });

  describe("error handling", () => {
    it("should handle test suite errors", async () => {
      mockRunTestSuite.mockRejectedValue(new Error("Test suite failed"));

      const response = await request(app).post("/test-suite").send({});

      expect(response.status).toBe(500);
    });

    it("should handle drift report errors", async () => {
      mockGenerateDriftReport.mockRejectedValue(new Error("Report generation failed"));

      const response = await request(app).get("/drift-report");

      expect(response.status).toBe(500);
    });
  });
});

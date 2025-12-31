import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  recordEmbeddingOperation,
  recordIngestionOperation,
  getEmbeddingMetrics,
  getIngestionMetrics,
  getRAGMetricsSnapshot,
  checkRAGAlerts,
  resetMetrics,
} from "../../rag/metrics.js";

describe("RAG Metrics Module", () => {
  beforeEach(() => {
    // Reset all metrics before each test
    resetMetrics();
  });

  describe("recordEmbeddingOperation", () => {
    it("should record a successful embedding operation", () => {
      recordEmbeddingOperation(100, 500, true);

      const metrics = getEmbeddingMetrics();
      expect(metrics.totalOperations).toBe(1);
      expect(metrics.totalTokens).toBe(100);
      expect(metrics.totalErrors).toBe(0);
    });

    it("should record a failed embedding operation", () => {
      recordEmbeddingOperation(0, 1000, false);

      const metrics = getEmbeddingMetrics();
      expect(metrics.totalOperations).toBe(1);
      expect(metrics.totalErrors).toBe(1);
    });

    it("should accumulate multiple operations", () => {
      recordEmbeddingOperation(100, 500, true);
      recordEmbeddingOperation(200, 600, true);
      recordEmbeddingOperation(50, 300, false);

      const metrics = getEmbeddingMetrics();
      expect(metrics.totalOperations).toBe(3);
      expect(metrics.totalTokens).toBe(350);
      expect(metrics.totalErrors).toBe(1);
    });
  });

  describe("recordIngestionOperation", () => {
    it("should record a diff ingestion operation", () => {
      recordIngestionOperation("diff", 10, 8, 2);

      const metrics = getIngestionMetrics();
      expect(metrics.diffChunksCreated).toBe(10);
      expect(metrics.diffChunksEmbedded).toBe(8);
      expect(metrics.diffIngestionErrors).toBe(2);
    });

    it("should record a knowledge ingestion operation", () => {
      recordIngestionOperation("knowledge", 5, 5, 0);

      const metrics = getIngestionMetrics();
      expect(metrics.knowledgeDocsCreated).toBe(5);
      expect(metrics.knowledgeDocsEmbedded).toBe(5);
      expect(metrics.knowledgeIngestionErrors).toBe(0);
    });

    it("should accumulate operations by type", () => {
      recordIngestionOperation("diff", 10, 8, 2);
      recordIngestionOperation("diff", 20, 15, 1);
      recordIngestionOperation("knowledge", 5, 5, 0);

      const metrics = getIngestionMetrics();
      expect(metrics.diffChunksCreated).toBe(30);
      expect(metrics.diffChunksEmbedded).toBe(23);
      expect(metrics.diffIngestionErrors).toBe(3);
      expect(metrics.knowledgeDocsCreated).toBe(5);
      expect(metrics.knowledgeDocsEmbedded).toBe(5);
      expect(metrics.knowledgeIngestionErrors).toBe(0);
    });
  });

  describe("getEmbeddingMetrics", () => {
    it("should return zero metrics when no operations recorded", () => {
      const metrics = getEmbeddingMetrics();

      expect(metrics.totalOperations).toBe(0);
      expect(metrics.totalTokens).toBe(0);
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.averageLatencyMs).toBe(0);
      expect(metrics.operationsPerMinute).toBe(0);
      expect(metrics.estimatedCostUsd).toBe(0);
    });

    it("should calculate average latency correctly", () => {
      recordEmbeddingOperation(100, 500, true);
      recordEmbeddingOperation(100, 300, true);
      recordEmbeddingOperation(100, 700, true);

      const metrics = getEmbeddingMetrics();
      expect(metrics.averageLatencyMs).toBe(500);
    });

    it("should only include successful operations in latency calculation", () => {
      recordEmbeddingOperation(100, 500, true);
      recordEmbeddingOperation(0, 10000, false); // Failed - should not affect latency
      recordEmbeddingOperation(100, 300, true);

      const metrics = getEmbeddingMetrics();
      expect(metrics.averageLatencyMs).toBe(400); // (500 + 300) / 2
    });

    it("should calculate estimated cost based on tokens", () => {
      // Cost is $0.00002 per 1K tokens
      recordEmbeddingOperation(1000, 500, true);

      const metrics = getEmbeddingMetrics();
      expect(metrics.estimatedCostUsd).toBeCloseTo(0.00002, 8);
    });

    it("should respect window parameter", () => {
      recordEmbeddingOperation(100, 500, true);

      // With a large window, should include the operation
      const largeWindowMetrics = getEmbeddingMetrics(1440); // 24 hours
      expect(largeWindowMetrics.totalOperations).toBe(1);

      // With default window (60 min), should also include recent operation
      const defaultMetrics = getEmbeddingMetrics();
      expect(defaultMetrics.totalOperations).toBe(1);
    });
  });

  describe("getIngestionMetrics", () => {
    it("should return zero metrics when no operations recorded", () => {
      const metrics = getIngestionMetrics();

      expect(metrics.diffChunksCreated).toBe(0);
      expect(metrics.diffChunksEmbedded).toBe(0);
      expect(metrics.diffIngestionErrors).toBe(0);
      expect(metrics.knowledgeDocsCreated).toBe(0);
      expect(metrics.knowledgeDocsEmbedded).toBe(0);
      expect(metrics.knowledgeIngestionErrors).toBe(0);
    });

    it("should correctly separate diff and knowledge metrics", () => {
      recordIngestionOperation("diff", 10, 10, 0);
      recordIngestionOperation("knowledge", 5, 5, 0);

      const metrics = getIngestionMetrics();
      expect(metrics.diffChunksCreated).toBe(10);
      expect(metrics.knowledgeDocsCreated).toBe(5);
    });
  });

  describe("getRAGMetricsSnapshot", () => {
    it("should return complete snapshot with timestamp", () => {
      recordEmbeddingOperation(100, 500, true);
      recordIngestionOperation("diff", 10, 10, 0);

      const snapshot = getRAGMetricsSnapshot();

      expect(snapshot.embedding).toBeDefined();
      expect(snapshot.ingestion).toBeDefined();
      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.windowMinutes).toBe(60); // Default window
    });

    it("should include all embedding metrics", () => {
      recordEmbeddingOperation(100, 500, true);

      const snapshot = getRAGMetricsSnapshot();

      expect(snapshot.embedding.totalOperations).toBe(1);
      expect(snapshot.embedding.totalTokens).toBe(100);
    });

    it("should include all ingestion metrics", () => {
      recordIngestionOperation("diff", 10, 8, 2);

      const snapshot = getRAGMetricsSnapshot();

      expect(snapshot.ingestion.diffChunksCreated).toBe(10);
      expect(snapshot.ingestion.diffChunksEmbedded).toBe(8);
    });

    it("should respect custom window", () => {
      const snapshot = getRAGMetricsSnapshot(30);
      expect(snapshot.windowMinutes).toBe(30);
    });

    it("should have valid ISO timestamp", () => {
      const snapshot = getRAGMetricsSnapshot();
      const timestamp = new Date(snapshot.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
    });
  });

  describe("checkRAGAlerts", () => {
    it("should return empty array when no alerts", () => {
      recordEmbeddingOperation(100, 500, true);
      recordIngestionOperation("diff", 10, 10, 0);

      const alerts = checkRAGAlerts();
      expect(alerts).toHaveLength(0);
    });

    it("should alert on high embedding error rate", () => {
      // Record 20% error rate (above 10% threshold)
      recordEmbeddingOperation(100, 500, true);
      recordEmbeddingOperation(100, 500, true);
      recordEmbeddingOperation(100, 500, true);
      recordEmbeddingOperation(100, 500, true);
      recordEmbeddingOperation(0, 1000, false); // 1 failure out of 5 = 20%

      const alerts = checkRAGAlerts();
      expect(alerts.some((alert) => alert.includes("embedding error rate"))).toBe(true);
    });

    it("should alert on high embedding latency", () => {
      // Record latency above 5000ms threshold
      recordEmbeddingOperation(100, 6000, true);

      const alerts = checkRAGAlerts();
      expect(alerts.some((alert) => alert.includes("latency"))).toBe(true);
    });

    it("should alert on high diff ingestion error rate", () => {
      // Record 50% error rate for diff ingestion
      recordIngestionOperation("diff", 10, 5, 5);

      const alerts = checkRAGAlerts();
      expect(alerts.some((alert) => alert.includes("diff ingestion"))).toBe(true);
    });

    it("should alert on high knowledge doc ingestion error rate", () => {
      // Record 50% error rate for knowledge ingestion
      recordIngestionOperation("knowledge", 10, 5, 5);

      const alerts = checkRAGAlerts();
      expect(alerts.some((alert) => alert.includes("knowledge doc"))).toBe(true);
    });

    it("should return multiple alerts when multiple issues exist", () => {
      // High error rate
      recordEmbeddingOperation(0, 1000, false);
      recordEmbeddingOperation(0, 1000, false);

      // High latency
      recordEmbeddingOperation(100, 10000, true);

      const alerts = checkRAGAlerts();
      expect(alerts.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("resetMetrics", () => {
    it("should clear all embedding metrics", () => {
      recordEmbeddingOperation(100, 500, true);
      recordEmbeddingOperation(200, 600, true);

      resetMetrics();

      const metrics = getEmbeddingMetrics();
      expect(metrics.totalOperations).toBe(0);
    });

    it("should clear all ingestion metrics", () => {
      recordIngestionOperation("diff", 10, 10, 0);
      recordIngestionOperation("knowledge", 5, 5, 0);

      resetMetrics();

      const metrics = getIngestionMetrics();
      expect(metrics.diffChunksCreated).toBe(0);
      expect(metrics.knowledgeDocsCreated).toBe(0);
    });

    it("should allow recording after reset", () => {
      recordEmbeddingOperation(100, 500, true);
      resetMetrics();
      recordEmbeddingOperation(200, 600, true);

      const metrics = getEmbeddingMetrics();
      expect(metrics.totalOperations).toBe(1);
      expect(metrics.totalTokens).toBe(200);
    });
  });

  describe("integration scenarios", () => {
    it("should handle rapid metric recording", () => {
      // Record 100 operations rapidly
      Array.from({ length: 100 }).forEach((_, index) => {
        recordEmbeddingOperation(100, 500 + index, true);
      });

      const metrics = getEmbeddingMetrics();
      expect(metrics.totalOperations).toBe(100);
      expect(metrics.totalTokens).toBe(10000);
    });

    it("should handle mixed operation types", () => {
      recordEmbeddingOperation(100, 500, true);
      recordIngestionOperation("diff", 10, 8, 2);
      recordEmbeddingOperation(200, 600, true);
      recordIngestionOperation("knowledge", 5, 5, 0);

      const snapshot = getRAGMetricsSnapshot();

      expect(snapshot.embedding.totalOperations).toBe(2);
      expect(snapshot.ingestion.diffChunksCreated).toBe(10);
      expect(snapshot.ingestion.knowledgeDocsCreated).toBe(5);
    });

    it("should maintain accuracy under load", () => {
      const expectedTokens = 50000;
      const operationCount = 500;
      const tokensPerOp = expectedTokens / operationCount;

      Array.from({ length: operationCount }).forEach(() => {
        recordEmbeddingOperation(tokensPerOp, 500, true);
      });

      const metrics = getEmbeddingMetrics();
      expect(metrics.totalTokens).toBe(expectedTokens);
    });
  });
});

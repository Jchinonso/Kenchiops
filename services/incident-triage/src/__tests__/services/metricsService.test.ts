/**
 * Metrics Service Tests
 *
 * Tests for the pure mapStatsToMetrics function that converts
 * raw triage stats to the pipeline metrics response DTO.
 */

import { describe, it, expect } from "@jest/globals";
import { mapStatsToMetrics } from "../../services/metricsService.js";
import type { TriageStats } from "@kenchi/shared";

// ==================== Test Fixtures ====================

const createTestStats = (overrides: Partial<TriageStats> = {}): TriageStats => ({
  severityDistribution: [
    { severityLabel: "critical", count: 5 },
    { severityLabel: "high", count: 15 },
    { severityLabel: "medium", count: 30 },
  ],
  totalTriaged: 50,
  avgDurationMs: 2500,
  p50DurationMs: 2000,
  p95DurationMs: 5000,
  aiSummaryCount: 40,
  fallbackSummaryCount: 10,
  dispatchedCount: 45,
  routedCount: 50,
  totalAlerts: 100,
  dedupedCount: 20,
  ...overrides,
});

// ==================== Tests ====================

describe("mapStatsToMetrics", () => {
  it("should map all stats fields to response DTO", () => {
    const stats = createTestStats();

    const result = mapStatsToMetrics(stats);

    expect(result.severityDistribution).toEqual(stats.severityDistribution);
    expect(result.pipeline.totalTriaged).toBe(50);
    expect(result.pipeline.avgDurationMs).toBe(2500);
    expect(result.pipeline.p50DurationMs).toBe(2000);
    expect(result.pipeline.p95DurationMs).toBe(5000);
  });

  it("should compute AI rate correctly", () => {
    const stats = createTestStats({
      aiSummaryCount: 40,
      fallbackSummaryCount: 10,
    });

    const result = mapStatsToMetrics(stats);

    expect(result.summarySource.aiCount).toBe(40);
    expect(result.summarySource.fallbackCount).toBe(10);
    // 40 / (40 + 10) = 0.8
    expect(result.summarySource.aiRate).toBe(0.8);
  });

  it("should return aiRate=null when no summaries exist", () => {
    const stats = createTestStats({
      aiSummaryCount: 0,
      fallbackSummaryCount: 0,
    });

    const result = mapStatsToMetrics(stats);

    expect(result.summarySource.aiRate).toBeNull();
  });

  it("should compute dispatch rate correctly", () => {
    const stats = createTestStats({
      dispatchedCount: 45,
      routedCount: 50,
    });

    const result = mapStatsToMetrics(stats);

    expect(result.dispatch.dispatchedCount).toBe(45);
    expect(result.dispatch.routedCount).toBe(50);
    // 45 / 50 = 0.9
    expect(result.dispatch.dispatchRate).toBe(0.9);
  });

  it("should return dispatchRate=null when routedCount is 0", () => {
    const stats = createTestStats({
      dispatchedCount: 0,
      routedCount: 0,
    });

    const result = mapStatsToMetrics(stats);

    expect(result.dispatch.dispatchRate).toBeNull();
  });

  it("should compute dedup rate correctly", () => {
    const stats = createTestStats({
      totalAlerts: 100,
      dedupedCount: 20,
    });

    const result = mapStatsToMetrics(stats);

    expect(result.dedup.totalAlerts).toBe(100);
    expect(result.dedup.dedupedCount).toBe(20);
    // 20 / 100 = 0.2
    expect(result.dedup.dedupRate).toBe(0.2);
  });

  it("should return dedupRate=null when totalAlerts is 0", () => {
    const stats = createTestStats({
      totalAlerts: 0,
      dedupedCount: 0,
    });

    const result = mapStatsToMetrics(stats);

    expect(result.dedup.dedupRate).toBeNull();
  });

  it("should handle null duration values", () => {
    const stats = createTestStats({
      avgDurationMs: null,
      p50DurationMs: null,
      p95DurationMs: null,
    });

    const result = mapStatsToMetrics(stats);

    expect(result.pipeline.avgDurationMs).toBeNull();
    expect(result.pipeline.p50DurationMs).toBeNull();
    expect(result.pipeline.p95DurationMs).toBeNull();
  });

  it("should not mutate input stats", () => {
    const stats = Object.freeze(createTestStats());

    expect(() => mapStatsToMetrics(stats)).not.toThrow();
  });

  it("should handle empty severity distribution", () => {
    const stats = createTestStats({
      severityDistribution: [],
    });

    const result = mapStatsToMetrics(stats);

    expect(result.severityDistribution).toEqual([]);
  });
});

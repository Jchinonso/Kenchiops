/**
 * Triage Worker Helpers Tests
 *
 * Tests for the pure helper functions used by the triage worker pipeline.
 */

import { describe, it, expect } from "@jest/globals";
import type { IncidentAlertRecord } from "@kenchi/shared";
import {
  toNormalizedAlert,
  buildEmbeddingText,
  serializeSeverityFactors,
  createJobContext,
  incrementCounter,
  stopWorker,
  createStatsSnapshot,
} from "../../workers/triageWorkerHelpers.js";
import type { TriageWorkerState } from "../../types/severityTypes.js";

// ==================== Test Fixtures ====================

const createTestRecord = (overrides: Partial<IncidentAlertRecord> = {}): IncidentAlertRecord => ({
  id: "record-1",
  tenantId: "tenant-1",
  source: "pagerduty",
  sourceAlertId: "PD-12345",
  deliveryId: "delivery-abc",
  fingerprint: "fp-hash-123",
  title: "High CPU on payments-api",
  description: "CPU utilization is at 95%",
  severity: "high",
  status: "received",
  serviceName: "payments-api",
  environment: "production",
  metrics: { cpu_percent: 95 },
  labels: { region: "us-east-1" },
  sourcePayload: { event: { id: "e1" } },
  receivedAt: new Date("2026-02-19T14:00:00.000Z"),
  createdAt: new Date("2026-02-19T14:00:01.000Z"),
  updatedAt: new Date("2026-02-19T14:00:01.000Z"),
  ...overrides,
});

const createWorkerState = (overrides: Partial<TriageWorkerState> = {}): TriageWorkerState => ({
  running: true,
  totalProcessed: 0,
  totalErrors: 0,
  totalDeduped: 0,
  ...overrides,
});

// ==================== Tests ====================

describe("toNormalizedAlert", () => {
  it("should map all IncidentAlertRecord fields to NormalizedAlert", () => {
    const record = createTestRecord();

    const result = toNormalizedAlert(record);

    expect(result.sourceAlertId).toBe("PD-12345");
    expect(result.deliveryId).toBe("delivery-abc");
    expect(result.source).toBe("pagerduty");
    expect(result.title).toBe("High CPU on payments-api");
    expect(result.description).toBe("CPU utilization is at 95%");
    expect(result.severity).toBe("high");
    expect(result.fingerprint).toBe("fp-hash-123");
    expect(result.serviceName).toBe("payments-api");
    expect(result.environment).toBe("production");
    expect(result.metrics).toEqual({ cpu_percent: 95 });
    expect(result.labels).toEqual({ region: "us-east-1" });
    expect(result.sourcePayload).toEqual({ event: { id: "e1" } });
  });

  it("should convert receivedAt Date to ISO string", () => {
    const record = createTestRecord({
      receivedAt: new Date("2026-02-19T14:00:00.000Z"),
    });

    const result = toNormalizedAlert(record);

    expect(result.receivedAt).toBe("2026-02-19T14:00:00.000Z");
  });

  it("should use current date when receivedAt is an invalid Date", () => {
    const record = createTestRecord({
      receivedAt: new Date("invalid-date"),
    });

    const before = new Date().toISOString();
    const result = toNormalizedAlert(record);
    const after = new Date().toISOString();

    // Should be a valid ISO string between before and after
    expect(result.receivedAt).toBeTruthy();
    expect(result.receivedAt >= before).toBe(true);
    expect(result.receivedAt <= after).toBe(true);
  });

  it("should default severity to medium when null", () => {
    const record = createTestRecord({ severity: null as unknown as string });

    const result = toNormalizedAlert(record);

    expect(result.severity).toBe("medium");
  });

  it("should default fingerprint to empty string when null", () => {
    const record = createTestRecord({ fingerprint: null });

    const result = toNormalizedAlert(record);

    expect(result.fingerprint).toBe("");
  });

  it("should preserve null description", () => {
    const record = createTestRecord({ description: null });

    const result = toNormalizedAlert(record);

    expect(result.description).toBeNull();
  });

  it("should preserve null serviceName", () => {
    const record = createTestRecord({ serviceName: null });

    const result = toNormalizedAlert(record);

    expect(result.serviceName).toBeNull();
  });

  it("should preserve null environment", () => {
    const record = createTestRecord({ environment: null });

    const result = toNormalizedAlert(record);

    expect(result.environment).toBeNull();
  });
});

describe("buildEmbeddingText", () => {
  it("should combine title and description with separator", () => {
    const alert = toNormalizedAlert(createTestRecord());

    const result = buildEmbeddingText(alert);

    expect(result).toBe("High CPU on payments-api - CPU utilization is at 95%");
  });

  it("should return only title when description is null", () => {
    const alert = toNormalizedAlert(createTestRecord({ description: null }));

    const result = buildEmbeddingText(alert);

    expect(result).toBe("High CPU on payments-api");
  });

  it("should return only title when description is empty string", () => {
    const alert = toNormalizedAlert(createTestRecord({ description: "" }));

    const result = buildEmbeddingText(alert);

    // empty string is falsy, so description is omitted
    expect(result).toBe("High CPU on payments-api");
  });
});

describe("serializeSeverityFactors", () => {
  it("should serialize factors to plain objects", () => {
    const factors = [
      { name: "source_severity", weight: 25, score: 18, maxScore: 25, reason: "high maps to 70" },
      { name: "environment", weight: 20, score: 20, maxScore: 20, reason: "production env" },
    ];

    const result = serializeSeverityFactors(factors);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: "source_severity",
      weight: 25,
      score: 18,
      maxScore: 25,
      reason: "high maps to 70",
    });
  });

  it("should return empty array for empty input", () => {
    const result = serializeSeverityFactors([]);

    expect(result).toEqual([]);
  });

  it("should not mutate input factors", () => {
    const factors = Object.freeze([
      Object.freeze({ name: "test", weight: 10, score: 5, maxScore: 10, reason: "test" }),
    ]);

    expect(() => serializeSeverityFactors(factors)).not.toThrow();
  });
});

describe("createJobContext", () => {
  it("should create a RequestContext with requestId, tenantId, and actor", () => {
    const record = createTestRecord({ tenantId: "tenant-xyz" });

    const result = createJobContext(record);

    expect(result.requestId).toBeDefined();
    expect(typeof result.requestId).toBe("string");
    expect(result.requestId.length).toBeGreaterThan(0);
    expect(result.tenantId).toBe("tenant-xyz");
    expect(result.actor).toBe("triage-worker");
  });

  it("should default tenantId to system when record tenantId is null", () => {
    const record = createTestRecord({ tenantId: null });

    const result = createJobContext(record);

    expect(result.tenantId).toBe("system");
  });

  it("should generate unique requestIds across calls", () => {
    const record = createTestRecord();

    const result1 = createJobContext(record);
    const result2 = createJobContext(record);

    expect(result1.requestId).not.toBe(result2.requestId);
  });
});

describe("incrementCounter", () => {
  it("should increment totalProcessed by 1", () => {
    const state = createWorkerState({ totalProcessed: 5 });

    incrementCounter(state, "totalProcessed");

    expect(state.totalProcessed).toBe(6);
  });

  it("should increment totalErrors by 1", () => {
    const state = createWorkerState({ totalErrors: 2 });

    incrementCounter(state, "totalErrors");

    expect(state.totalErrors).toBe(3);
  });

  it("should increment totalDeduped by 1", () => {
    const state = createWorkerState({ totalDeduped: 0 });

    incrementCounter(state, "totalDeduped");

    expect(state.totalDeduped).toBe(1);
  });

  it("should handle incrementing from 0", () => {
    const state = createWorkerState({ totalProcessed: 0 });

    incrementCounter(state, "totalProcessed");

    expect(state.totalProcessed).toBe(1);
  });
});

describe("stopWorker", () => {
  it("should set running to false", () => {
    const state = createWorkerState({ running: true });

    stopWorker(state);

    expect(state.running).toBe(false);
  });

  it("should be idempotent when already stopped", () => {
    const state = createWorkerState({ running: false });

    stopWorker(state);

    expect(state.running).toBe(false);
  });
});

describe("createStatsSnapshot", () => {
  it("should create a frozen snapshot of worker state", () => {
    const state = createWorkerState({
      running: true,
      totalProcessed: 42,
      totalErrors: 3,
      totalDeduped: 7,
    });

    const result = createStatsSnapshot(state);

    expect(result).toEqual({
      totalProcessed: 42,
      totalErrors: 3,
      totalDeduped: 7,
      isRunning: true,
    });
  });

  it("should map running to isRunning", () => {
    const stateRunning = createWorkerState({ running: true });
    const stateStopped = createWorkerState({ running: false });

    expect(createStatsSnapshot(stateRunning).isRunning).toBe(true);
    expect(createStatsSnapshot(stateStopped).isRunning).toBe(false);
  });

  it("should not be affected by subsequent state mutations", () => {
    const state = createWorkerState({ totalProcessed: 10 });

    const snapshot = createStatsSnapshot(state);
    incrementCounter(state, "totalProcessed");

    expect(snapshot.totalProcessed).toBe(10);
    expect(state.totalProcessed).toBe(11);
  });
});

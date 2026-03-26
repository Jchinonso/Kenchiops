/**
 * Tests for Alert Context Token Truncation Cascade
 *
 * @module alertContext/truncation.test
 */

import { describe, it, expect } from "@jest/globals";

import {
  ALERT_CONTEXT_BUDGET,
  TRUNCATION_LIMITS,
  estimateAlertContextTokens,
  truncateRelatedAlerts,
  truncateBreadcrumbs,
  filterErrorTraceSpans,
  truncateLogSnippets,
  downsampleMetrics,
  truncateStackFrames,
  truncateAlertContext,
} from "./truncation.js";

import type {
  AlertContext,
  AlertEvidence,
  BreadcrumbEvent,
  LogSnippet,
  MetricDataPoint,
  MetricSnapshot,
  RelatedAlert,
  StackFrame,
  TraceSpan,
} from "./types.js";

// ==================== Test Factories ====================

const createTestRelatedAlert = (overrides: Partial<RelatedAlert> = {}): RelatedAlert => ({
  alertId: "alert-1",
  title: "High error rate",
  severity: "warning",
  triggeredAt: "2026-03-26T10:00:00Z",
  source: "datadog",
  correlation: "temporal",
  ...overrides,
});

const createTestBreadcrumb = (overrides: Partial<BreadcrumbEvent> = {}): BreadcrumbEvent => ({
  timestamp: "2026-03-26T10:00:00Z",
  category: "http",
  message: "GET /api/health 200",
  level: "info",
  ...overrides,
});

const createTestTraceSpan = (overrides: Partial<TraceSpan> = {}): TraceSpan => ({
  traceId: "trace-1",
  spanId: "span-1",
  operationName: "GET /api/data",
  serviceName: "api-service",
  startTime: "2026-03-26T10:00:00Z",
  duration: 150,
  status: "ok",
  ...overrides,
});

const createTestLogSnippet = (overrides: Partial<LogSnippet> = {}): LogSnippet => ({
  timestamp: "2026-03-26T10:00:00Z",
  level: "info",
  message: "Request processed",
  ...overrides,
});

const createTestMetricDataPoint = (overrides: Partial<MetricDataPoint> = {}): MetricDataPoint => ({
  timestamp: "2026-03-26T10:00:00Z",
  value: 42,
  ...overrides,
});

const createTestMetricSnapshot = (
  overrides: Partial<MetricSnapshot> & {
    readonly valueCount?: number;
  } = {}
): MetricSnapshot => {
  const { valueCount, ...rest } = overrides;
  const count = valueCount ?? 5;
  const values = Array.from({ length: count }, (_, idx) =>
    createTestMetricDataPoint({
      timestamp: `2026-03-26T10:${String(idx).padStart(2, "0")}:00Z`,
      value: idx * 10,
    })
  );
  return {
    metricName: "http.request_duration",
    values,
    unit: "ms",
    ...rest,
    // Ensure values from factory are used unless explicitly overridden
    ...(rest.values !== undefined ? {} : { values }),
  };
};

const createTestStackFrame = (overrides: Partial<StackFrame> = {}): StackFrame => ({
  filename: "app.ts",
  function: "handleRequest",
  lineno: 42,
  inApp: true,
  ...overrides,
});

const createTestEvidence = (overrides: Partial<AlertEvidence> = {}): AlertEvidence => ({
  metrics: [],
  logs: [],
  traces: [],
  stackTraces: [],
  breadcrumbs: [],
  relatedAlerts: [],
  ...overrides,
});

const createTestAlertContext = (overrides: Partial<AlertContext> = {}): AlertContext => ({
  source: "datadog",
  alertId: "ctx-alert-1",
  severity: "critical",
  title: "High error rate on api-service",
  description: "Error rate exceeded 5% threshold",
  triggeredAt: "2026-03-26T10:00:00Z",
  resolvedAt: null,
  timeWindow: { start: "2026-03-26T09:55:00Z", end: "2026-03-26T10:05:00Z" },
  evidence: createTestEvidence(),
  providerMetadata: {},
  ...overrides,
});

// ==================== estimateAlertContextTokens ====================

describe("estimateAlertContextTokens", () => {
  it("should return a positive integer for a minimal context", () => {
    const context = createTestAlertContext();
    const tokens = estimateAlertContextTokens(context);

    expect(tokens).toBeGreaterThan(0);
    expect(Number.isInteger(tokens)).toBe(true);
  });

  it("should return higher token count for larger contexts", () => {
    const small = createTestAlertContext();
    const large = createTestAlertContext({
      evidence: createTestEvidence({
        logs: Array.from({ length: 100 }, (_, idx) =>
          createTestLogSnippet({ message: `Log line ${idx} with some content` })
        ),
      }),
    });

    expect(estimateAlertContextTokens(large)).toBeGreaterThan(estimateAlertContextTokens(small));
  });

  it("should use CHARS_PER_TOKEN = 3.5 for estimation", () => {
    const context = createTestAlertContext();
    const jsonLength = JSON.stringify(context).length;
    const expected = Math.ceil(jsonLength / 3.5);

    expect(estimateAlertContextTokens(context)).toBe(expected);
  });

  it("should not mutate the input context", () => {
    const context = Object.freeze(createTestAlertContext());
    estimateAlertContextTokens(context);
    // If it tried to mutate, Object.freeze would throw
  });
});

// ==================== truncateRelatedAlerts ====================

describe("truncateRelatedAlerts", () => {
  it("should return the same array when length is under limit", () => {
    const alerts = [
      createTestRelatedAlert({ alertId: "a1" }),
      createTestRelatedAlert({ alertId: "a2" }),
    ];

    const result = truncateRelatedAlerts(alerts, 5);

    expect(result).toBe(alerts);
  });

  it("should return the same array when length equals limit", () => {
    const alerts = [
      createTestRelatedAlert({ alertId: "a1" }),
      createTestRelatedAlert({ alertId: "a2" }),
    ];

    const result = truncateRelatedAlerts(alerts, 2);

    expect(result).toBe(alerts);
  });

  it("should keep the N most severe alerts", () => {
    const alerts = [
      createTestRelatedAlert({ alertId: "info-1", severity: "info" }),
      createTestRelatedAlert({ alertId: "crit-1", severity: "critical" }),
      createTestRelatedAlert({ alertId: "warn-1", severity: "warning" }),
      createTestRelatedAlert({ alertId: "crit-2", severity: "critical" }),
      createTestRelatedAlert({ alertId: "info-2", severity: "info" }),
    ];

    const result = truncateRelatedAlerts(alerts, 3);

    expect(result).toHaveLength(3);
    expect(result[0].alertId).toBe("crit-1");
    expect(result[1].alertId).toBe("crit-2");
    expect(result[2].alertId).toBe("warn-1");
  });

  it("should treat unknown severity as lowest priority", () => {
    const alerts = [
      createTestRelatedAlert({
        alertId: "unknown",
        severity: "unknown" as "info",
      }),
      createTestRelatedAlert({ alertId: "info-1", severity: "info" }),
      createTestRelatedAlert({ alertId: "crit-1", severity: "critical" }),
    ];

    const result = truncateRelatedAlerts(alerts, 2);

    expect(result).toHaveLength(2);
    expect(result[0].alertId).toBe("crit-1");
    expect(result[1].alertId).toBe("info-1");
  });

  it("should not mutate the input array", () => {
    const alerts = Object.freeze([
      createTestRelatedAlert({ alertId: "a1", severity: "info" }),
      createTestRelatedAlert({ alertId: "a2", severity: "critical" }),
      createTestRelatedAlert({ alertId: "a3", severity: "warning" }),
    ]);

    const result = truncateRelatedAlerts(alerts, 2);

    expect(result).not.toBe(alerts);
    expect(result).toHaveLength(2);
  });

  it("should handle empty array", () => {
    const result = truncateRelatedAlerts([], 3);

    expect(result).toEqual([]);
  });

  it("should handle limit of 1", () => {
    const alerts = [
      createTestRelatedAlert({ alertId: "warn-1", severity: "warning" }),
      createTestRelatedAlert({ alertId: "crit-1", severity: "critical" }),
    ];

    const result = truncateRelatedAlerts(alerts, 1);

    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("critical");
  });
});

// ==================== truncateBreadcrumbs ====================

describe("truncateBreadcrumbs", () => {
  it("should return the same array when length is under limit", () => {
    const breadcrumbs = [
      createTestBreadcrumb({ message: "b1" }),
      createTestBreadcrumb({ message: "b2" }),
    ];

    const result = truncateBreadcrumbs(breadcrumbs, 5);

    expect(result).toBe(breadcrumbs);
  });

  it("should return the same array when length equals limit", () => {
    const breadcrumbs = [
      createTestBreadcrumb({ message: "b1" }),
      createTestBreadcrumb({ message: "b2" }),
    ];

    const result = truncateBreadcrumbs(breadcrumbs, 2);

    expect(result).toBe(breadcrumbs);
  });

  it("should keep the last N breadcrumbs (most recent)", () => {
    const breadcrumbs = [
      createTestBreadcrumb({ message: "oldest" }),
      createTestBreadcrumb({ message: "middle" }),
      createTestBreadcrumb({ message: "recent" }),
      createTestBreadcrumb({ message: "newest" }),
    ];

    const result = truncateBreadcrumbs(breadcrumbs, 2);

    expect(result).toHaveLength(2);
    expect(result[0].message).toBe("recent");
    expect(result[1].message).toBe("newest");
  });

  it("should handle empty array", () => {
    const result = truncateBreadcrumbs([], 5);

    expect(result).toEqual([]);
  });

  it("should handle limit of 1", () => {
    const breadcrumbs = [
      createTestBreadcrumb({ message: "first" }),
      createTestBreadcrumb({ message: "last" }),
    ];

    const result = truncateBreadcrumbs(breadcrumbs, 1);

    expect(result).toHaveLength(1);
    expect(result[0].message).toBe("last");
  });

  it("should not mutate the input array", () => {
    const breadcrumbs = Object.freeze([
      createTestBreadcrumb({ message: "a" }),
      createTestBreadcrumb({ message: "b" }),
      createTestBreadcrumb({ message: "c" }),
    ]);

    truncateBreadcrumbs(breadcrumbs, 2);
    // Object.freeze would throw if mutation was attempted
  });
});

// ==================== filterErrorTraceSpans ====================

describe("filterErrorTraceSpans", () => {
  it("should keep root spans (no parentSpanId)", () => {
    const spans = [createTestTraceSpan({ spanId: "root", parentSpanId: undefined })];

    const result = filterErrorTraceSpans(spans);

    expect(result).toHaveLength(1);
    expect(result[0].spanId).toBe("root");
  });

  it("should keep error spans regardless of parentSpanId", () => {
    const spans = [
      createTestTraceSpan({
        spanId: "child-err",
        parentSpanId: "root",
        status: "error",
      }),
    ];

    const result = filterErrorTraceSpans(spans);

    expect(result).toHaveLength(1);
    expect(result[0].spanId).toBe("child-err");
  });

  it("should remove non-root, non-error spans", () => {
    const spans = [
      createTestTraceSpan({
        spanId: "root",
        parentSpanId: undefined,
        status: "ok",
      }),
      createTestTraceSpan({
        spanId: "child-ok",
        parentSpanId: "root",
        status: "ok",
      }),
      createTestTraceSpan({
        spanId: "child-timeout",
        parentSpanId: "root",
        status: "timeout",
      }),
      createTestTraceSpan({
        spanId: "child-err",
        parentSpanId: "root",
        status: "error",
      }),
    ];

    const result = filterErrorTraceSpans(spans);

    expect(result).toHaveLength(2);
    const spanIds = result.map((s) => s.spanId);
    expect(spanIds).toContain("root");
    expect(spanIds).toContain("child-err");
    expect(spanIds).not.toContain("child-ok");
    expect(spanIds).not.toContain("child-timeout");
  });

  it("should keep a span that is both root and error", () => {
    const spans = [
      createTestTraceSpan({
        spanId: "root-err",
        parentSpanId: undefined,
        status: "error",
      }),
    ];

    const result = filterErrorTraceSpans(spans);

    expect(result).toHaveLength(1);
  });

  it("should return empty array when no spans match", () => {
    const spans = [
      createTestTraceSpan({
        spanId: "child-ok",
        parentSpanId: "root",
        status: "ok",
      }),
    ];

    const result = filterErrorTraceSpans(spans);

    expect(result).toHaveLength(0);
  });

  it("should handle empty array", () => {
    const result = filterErrorTraceSpans([]);

    expect(result).toEqual([]);
  });

  it("should not mutate the input array", () => {
    const spans = Object.freeze([
      createTestTraceSpan({ spanId: "root", parentSpanId: undefined }),
      createTestTraceSpan({ spanId: "child", parentSpanId: "root" }),
    ]);

    filterErrorTraceSpans(spans);
  });
});

// ==================== truncateLogSnippets ====================

describe("truncateLogSnippets", () => {
  it("should return the same array when length is under first + last", () => {
    const logs = Array.from({ length: 5 }, (_, idx) =>
      createTestLogSnippet({ message: `log-${idx}` })
    );

    const result = truncateLogSnippets(logs, 3, 3);

    expect(result).toBe(logs);
  });

  it("should return the same array when length equals first + last", () => {
    const logs = Array.from({ length: 6 }, (_, idx) =>
      createTestLogSnippet({ message: `log-${idx}` })
    );

    const result = truncateLogSnippets(logs, 3, 3);

    expect(result).toBe(logs);
  });

  it("should keep first N and last M entries", () => {
    const logs = Array.from({ length: 10 }, (_, idx) =>
      createTestLogSnippet({ message: `log-${idx}` })
    );

    const result = truncateLogSnippets(logs, 2, 3);

    expect(result).toHaveLength(5);
    expect(result[0].message).toBe("log-0");
    expect(result[1].message).toBe("log-1");
    expect(result[2].message).toBe("log-7");
    expect(result[3].message).toBe("log-8");
    expect(result[4].message).toBe("log-9");
  });

  it("should handle overlapping head and tail when first + last > length", () => {
    // 7 logs, first=5, last=5 => 10 > 7, so return original
    const logs = Array.from({ length: 7 }, (_, idx) =>
      createTestLogSnippet({ message: `log-${idx}` })
    );

    const result = truncateLogSnippets(logs, 5, 5);

    expect(result).toBe(logs);
  });

  it("should handle first = 0", () => {
    const logs = Array.from({ length: 5 }, (_, idx) =>
      createTestLogSnippet({ message: `log-${idx}` })
    );

    const result = truncateLogSnippets(logs, 0, 2);

    expect(result).toHaveLength(2);
    expect(result[0].message).toBe("log-3");
    expect(result[1].message).toBe("log-4");
  });

  it("should return only head when last = 0", () => {
    const logs = Array.from({ length: 5 }, (_, idx) =>
      createTestLogSnippet({ message: `log-${idx}` })
    );

    const result = truncateLogSnippets(logs, 2, 0);

    // last=0 means no tail, so only head is returned
    expect(result).toHaveLength(2);
    expect(result[0].message).toBe("log-0");
    expect(result[1].message).toBe("log-1");
  });

  it("should handle empty array", () => {
    const result = truncateLogSnippets([], 5, 5);

    expect(result).toEqual([]);
  });

  it("should not mutate the input array", () => {
    const logs = Object.freeze(
      Array.from({ length: 10 }, (_, idx) => createTestLogSnippet({ message: `log-${idx}` }))
    );

    truncateLogSnippets(logs, 2, 2);
  });

  it("should produce duplicates when head and tail overlap in result", () => {
    // 8 logs, first=5, last=5 => 10 > 8 so no-op (returns original)
    // But first=5, last=4 => 9 > 8 so no-op
    // first=6, last=4 => 10 > 8 so no-op
    // Need logs.length > first + last for truncation to occur
    // 8 logs, first=4, last=3 => 7 < 8, so truncation happens
    // head=[0,1,2,3] tail=[5,6,7] => no overlap
    // But with first=5, last=4 on 8 items => 9 > 8 => no-op
    // Test the case where slice regions overlap: not possible with the guard
    // The function guards totalKeep so there's no overlap in the sliced output
    // Let's verify that edge case: length=7, first=4, last=4 => 8 > 7 => no-op
    // length=9, first=5, last=3 => 8 < 9 => head=[0..4], tail=[6,7,8]
    const logs = Array.from({ length: 9 }, (_, idx) =>
      createTestLogSnippet({ message: `log-${idx}` })
    );

    const result = truncateLogSnippets(logs, 5, 3);

    expect(result).toHaveLength(8);
    expect(result[0].message).toBe("log-0");
    expect(result[4].message).toBe("log-4");
    expect(result[5].message).toBe("log-6");
    expect(result[7].message).toBe("log-8");
  });
});

// ==================== downsampleMetrics ====================

describe("downsampleMetrics", () => {
  it("should return the same metric when values are under limit", () => {
    const metrics = [createTestMetricSnapshot({ valueCount: 5 })];

    const result = downsampleMetrics(metrics, 10);

    expect(result[0]).toBe(metrics[0]);
  });

  it("should return the same metric when values equal limit", () => {
    const metrics = [createTestMetricSnapshot({ valueCount: 10 })];

    const result = downsampleMetrics(metrics, 10);

    expect(result[0]).toBe(metrics[0]);
  });

  it("should downsample values to the specified count", () => {
    const metrics = [createTestMetricSnapshot({ valueCount: 50 })];

    const result = downsampleMetrics(metrics, 10);

    expect(result[0].values).toHaveLength(10);
  });

  it("should preserve the first and last data points", () => {
    const values: readonly MetricDataPoint[] = Array.from({ length: 20 }, (_, idx) =>
      createTestMetricDataPoint({
        timestamp: `2026-03-26T10:${String(idx).padStart(2, "0")}:00Z`,
        value: idx,
      })
    );
    const metrics: readonly MetricSnapshot[] = [{ metricName: "test", values }];

    const result = downsampleMetrics(metrics, 5);

    expect(result[0].values[0]).toEqual(values[0]);
    expect(result[0].values[result[0].values.length - 1]).toEqual(values[values.length - 1]);
  });

  it("should produce uniformly spaced samples", () => {
    // 10 items sampled to 4: indices should be 0, 3, 6, 9
    const values: readonly MetricDataPoint[] = Array.from({ length: 10 }, (_, idx) =>
      createTestMetricDataPoint({ value: idx })
    );
    const metrics: readonly MetricSnapshot[] = [{ metricName: "test", values }];

    const result = downsampleMetrics(metrics, 4);

    // step = (10-1)/(4-1) = 3, indices: 0, round(3)=3, round(6)=6, 9
    expect(result[0].values.map((p) => p.value)).toEqual([0, 3, 6, 9]);
  });

  it("should handle multiple metrics independently", () => {
    const metrics = [
      createTestMetricSnapshot({ metricName: "small", valueCount: 3 }),
      createTestMetricSnapshot({ metricName: "large", valueCount: 50 }),
    ];

    const result = downsampleMetrics(metrics, 10);

    expect(result[0].values).toHaveLength(3); // Unchanged
    expect(result[1].values).toHaveLength(10); // Downsampled
  });

  it("should handle empty metrics array", () => {
    const result = downsampleMetrics([], 10);

    expect(result).toEqual([]);
  });

  it("should handle metric with empty values", () => {
    const metrics: readonly MetricSnapshot[] = [{ metricName: "empty", values: [] }];

    const result = downsampleMetrics(metrics, 10);

    expect(result[0].values).toEqual([]);
  });

  it("should not mutate the input metrics array", () => {
    const metrics = Object.freeze([createTestMetricSnapshot({ valueCount: 20 })]);

    const result = downsampleMetrics(metrics, 5);

    expect(result[0]).not.toBe(metrics[0]);
    expect(result[0].metricName).toBe(metrics[0].metricName);
  });

  it("should return original items array when count < 2", () => {
    // uniformSample returns items unchanged when count < 2
    const values: readonly MetricDataPoint[] = Array.from({ length: 10 }, (_, idx) =>
      createTestMetricDataPoint({ value: idx })
    );
    const metrics: readonly MetricSnapshot[] = [{ metricName: "test", values }];

    const result = downsampleMetrics(metrics, 1);

    // count < 2 triggers early return in uniformSample
    expect(result[0].values).toHaveLength(10);
  });

  it("should correctly sample to count = 2 (first + last only)", () => {
    const values: readonly MetricDataPoint[] = Array.from({ length: 10 }, (_, idx) =>
      createTestMetricDataPoint({ value: idx })
    );
    const metrics: readonly MetricSnapshot[] = [{ metricName: "test", values }];

    const result = downsampleMetrics(metrics, 2);

    expect(result[0].values).toHaveLength(2);
    expect(result[0].values[0].value).toBe(0);
    expect(result[0].values[1].value).toBe(9);
  });
});

// ==================== truncateStackFrames ====================

describe("truncateStackFrames", () => {
  it("should return the same array when length is under top + bottom", () => {
    const frames = [
      createTestStackFrame({ function: "f1" }),
      createTestStackFrame({ function: "f2" }),
    ];

    const result = truncateStackFrames(frames, 3, 3);

    expect(result).toBe(frames);
  });

  it("should return the same array when length equals top + bottom", () => {
    const frames = Array.from({ length: 6 }, (_, idx) =>
      createTestStackFrame({ function: `f${idx}` })
    );

    const result = truncateStackFrames(frames, 3, 3);

    expect(result).toBe(frames);
  });

  it("should keep top N and bottom M frames, dropping the middle", () => {
    const frames = Array.from({ length: 10 }, (_, idx) =>
      createTestStackFrame({ function: `f${idx}`, lineno: idx })
    );

    const result = truncateStackFrames(frames, 2, 2);

    expect(result).toHaveLength(4);
    expect(result[0].function).toBe("f0");
    expect(result[1].function).toBe("f1");
    expect(result[2].function).toBe("f8");
    expect(result[3].function).toBe("f9");
  });

  it("should handle top = 0", () => {
    const frames = Array.from({ length: 5 }, (_, idx) =>
      createTestStackFrame({ function: `f${idx}` })
    );

    const result = truncateStackFrames(frames, 0, 2);

    expect(result).toHaveLength(2);
    expect(result[0].function).toBe("f3");
    expect(result[1].function).toBe("f4");
  });

  it("should return only top frames when bottom = 0", () => {
    const frames = Array.from({ length: 5 }, (_, idx) =>
      createTestStackFrame({ function: `f${idx}` })
    );

    const result = truncateStackFrames(frames, 2, 0);

    // bottom=0 means no tail, so only top frames are returned
    expect(result).toHaveLength(2);
    expect(result[0].function).toBe("f0");
    expect(result[1].function).toBe("f1");
  });

  it("should handle empty array", () => {
    const result = truncateStackFrames([], 3, 3);

    expect(result).toEqual([]);
  });

  it("should not mutate the input array", () => {
    const frames = Object.freeze(
      Array.from({ length: 10 }, (_, idx) => createTestStackFrame({ function: `f${idx}` }))
    );

    truncateStackFrames(frames, 2, 2);
  });
});

// ==================== truncateAlertContext (full cascade) ====================

describe("truncateAlertContext", () => {
  it("should return the context unchanged when already under budget", () => {
    const context = createTestAlertContext();
    const tokens = estimateAlertContextTokens(context);

    const result = truncateAlertContext(context, tokens + 1000);

    // Fast path returns the same reference
    expect(result).toBe(context);
  });

  it("should return the context unchanged when exactly at budget", () => {
    const context = createTestAlertContext();
    const tokens = estimateAlertContextTokens(context);

    const result = truncateAlertContext(context, tokens);

    expect(result).toBe(context);
  });

  it("should never truncate core fields (alertId, title, severity, timestamps)", () => {
    const context = createTestAlertContext({
      alertId: "unique-alert-id",
      title: "Specific title for test",
      severity: "critical",
      triggeredAt: "2026-03-26T10:00:00Z",
      description: "Important description",
      evidence: createTestEvidence({
        relatedAlerts: Array.from({ length: 50 }, (_, idx) =>
          createTestRelatedAlert({ alertId: `alert-${idx}` })
        ),
        breadcrumbs: Array.from({ length: 100 }, (_, idx) =>
          createTestBreadcrumb({ message: `bc-${idx}` })
        ),
        logs: Array.from({ length: 200 }, (_, idx) =>
          createTestLogSnippet({
            message: `Log message with content ${idx} ${"x".repeat(50)}`,
          })
        ),
      }),
    });

    // Use a very tight budget to force aggressive truncation
    const result = truncateAlertContext(context, 500);

    expect(result.alertId).toBe("unique-alert-id");
    expect(result.title).toBe("Specific title for test");
    expect(result.severity).toBe("critical");
    expect(result.triggeredAt).toBe("2026-03-26T10:00:00Z");
    expect(result.description).toBe("Important description");
  });

  it("should truncate related alerts first (lowest priority)", () => {
    // Build a context that's over budget, where truncating related alerts
    // alone is enough to bring it under
    const relatedAlerts = Array.from({ length: 50 }, (_, idx) =>
      createTestRelatedAlert({
        alertId: `alert-${idx}`,
        title: `Related alert number ${idx} with long description ${"x".repeat(100)}`,
        severity: idx < 10 ? "critical" : idx < 25 ? "warning" : "info",
      })
    );

    const context = createTestAlertContext({
      evidence: createTestEvidence({ relatedAlerts }),
    });

    const tokensOriginal = estimateAlertContextTokens(context);
    // Set budget just below original but enough to fit with truncated alerts
    const budgetForTruncatedAlerts = tokensOriginal - 1000;

    const result = truncateAlertContext(context, budgetForTruncatedAlerts);

    // Related alerts should be reduced
    expect(result.evidence.relatedAlerts.length).toBeLessThan(relatedAlerts.length);
    expect(result.evidence.relatedAlerts.length).toBeLessThanOrEqual(
      TRUNCATION_LIMITS.relatedAlerts
    );
  });

  it("should truncate breadcrumbs when related alerts truncation is insufficient", () => {
    const context = createTestAlertContext({
      evidence: createTestEvidence({
        relatedAlerts: Array.from({ length: 10 }, (_, idx) =>
          createTestRelatedAlert({ alertId: `alert-${idx}` })
        ),
        breadcrumbs: Array.from({ length: 100 }, (_, idx) =>
          createTestBreadcrumb({
            message: `Breadcrumb ${idx} with details ${"y".repeat(80)}`,
          })
        ),
      }),
    });

    const result = truncateAlertContext(context, 800);

    expect(result.evidence.breadcrumbs.length).toBeLessThan(100);
    expect(result.evidence.breadcrumbs.length).toBeLessThanOrEqual(TRUNCATION_LIMITS.breadcrumbs);
  });

  it("should filter trace spans to only root and error spans", () => {
    const traces: readonly TraceSpan[] = [
      createTestTraceSpan({
        spanId: "root",
        parentSpanId: undefined,
        status: "ok",
      }),
      createTestTraceSpan({
        spanId: "child-ok",
        parentSpanId: "root",
        status: "ok",
      }),
      createTestTraceSpan({
        spanId: "child-err",
        parentSpanId: "root",
        status: "error",
      }),
      ...Array.from({ length: 50 }, (_, idx) =>
        createTestTraceSpan({
          spanId: `child-${idx}`,
          parentSpanId: "root",
          status: "ok",
          operationName: `operation-${idx} ${"z".repeat(100)}`,
        })
      ),
    ];

    const context = createTestAlertContext({
      evidence: createTestEvidence({ traces }),
    });

    const result = truncateAlertContext(context, 500);

    // All non-root, non-error spans should be removed
    const resultSpanIds = result.evidence.traces.map((s) => s.spanId);
    expect(resultSpanIds).not.toContain("child-ok");
    // child-ok spans removed, but root and error kept
    result.evidence.traces.forEach((span) => {
      expect(span.parentSpanId === undefined || span.status === "error").toBe(true);
    });
  });

  it("should apply iterative reduction when first pass is insufficient", () => {
    // Create a context that is very large and needs multiple rounds
    const largeLogs = Array.from({ length: 500 }, (_, idx) =>
      createTestLogSnippet({
        message: `Very long log message ${idx} ${"x".repeat(200)}`,
      })
    );
    const largeMetrics = Array.from({ length: 20 }, (_, idx) =>
      createTestMetricSnapshot({
        metricName: `metric-${idx}`,
        valueCount: 100,
      })
    );
    const largeFrames = Array.from({ length: 100 }, (_, idx) =>
      createTestStackFrame({
        function: `frame_${idx}`,
        filename: `file_${idx}.ts`,
        context: [`line ${idx} context ${"c".repeat(50)}`],
      })
    );

    const context = createTestAlertContext({
      evidence: createTestEvidence({
        logs: largeLogs,
        metrics: largeMetrics,
        stackTraces: largeFrames,
        relatedAlerts: Array.from({ length: 20 }, (_, idx) =>
          createTestRelatedAlert({
            alertId: `alert-${idx}`,
            title: `Alert ${idx} ${"a".repeat(100)}`,
          })
        ),
        breadcrumbs: Array.from({ length: 50 }, (_, idx) =>
          createTestBreadcrumb({
            message: `BC ${idx} ${"b".repeat(100)}`,
          })
        ),
      }),
      providerMetadata: {
        extraField: "x".repeat(500),
        anotherField: "y".repeat(500),
      },
    });

    const originalTokens = estimateAlertContextTokens(context);
    expect(originalTokens).toBeGreaterThan(20_000);

    // Use a tight budget that forces iterative reduction
    const result = truncateAlertContext(context, 2000);

    const resultTokens = estimateAlertContextTokens(result);

    // Should be significantly reduced
    expect(resultTokens).toBeLessThan(originalTokens);

    // Evidence should be aggressively truncated
    expect(result.evidence.logs.length).toBeLessThan(largeLogs.length);
    expect(result.evidence.stackTraces.length).toBeLessThan(largeFrames.length);
  });

  it("should drop provider metadata as last resort", () => {
    const context = createTestAlertContext({
      providerMetadata: {
        hugeField: "x".repeat(5000),
      },
      evidence: createTestEvidence({
        logs: Array.from({ length: 200 }, (_, idx) =>
          createTestLogSnippet({
            message: `Log ${idx} ${"m".repeat(100)}`,
          })
        ),
      }),
    });

    // Very tight budget
    const result = truncateAlertContext(context, 500);

    // Provider metadata should be empty when budget is very tight
    expect(Object.keys(result.providerMetadata)).toHaveLength(0);
  });

  it("should use ALERT_CONTEXT_BUDGET.MAX_TOKENS as default budget", () => {
    const context = createTestAlertContext();
    const tokens = estimateAlertContextTokens(context);

    // Minimal context is well under 20K, so it should be returned unchanged
    expect(tokens).toBeLessThan(ALERT_CONTEXT_BUDGET.MAX_TOKENS);

    const result = truncateAlertContext(context);

    expect(result).toBe(context);
  });

  it("should not mutate the input context", () => {
    const evidence = createTestEvidence({
      relatedAlerts: Array.from({ length: 20 }, (_, idx) =>
        createTestRelatedAlert({
          alertId: `alert-${idx}`,
          title: `Alert ${idx} ${"a".repeat(200)}`,
        })
      ),
      logs: Array.from({ length: 100 }, (_, idx) =>
        createTestLogSnippet({
          message: `Log ${idx} ${"m".repeat(200)}`,
        })
      ),
    });
    const context = createTestAlertContext({ evidence });
    const originalRelatedCount = context.evidence.relatedAlerts.length;
    const originalLogCount = context.evidence.logs.length;

    truncateAlertContext(context, 500);

    // Original should be unchanged
    expect(context.evidence.relatedAlerts.length).toBe(originalRelatedCount);
    expect(context.evidence.logs.length).toBe(originalLogCount);
  });

  it("should preserve source and timeWindow fields", () => {
    const context = createTestAlertContext({
      source: "prometheus",
      timeWindow: {
        start: "2026-03-26T09:00:00Z",
        end: "2026-03-26T10:00:00Z",
      },
      evidence: createTestEvidence({
        logs: Array.from({ length: 500 }, (_, idx) =>
          createTestLogSnippet({
            message: `Log ${idx} ${"m".repeat(200)}`,
          })
        ),
      }),
    });

    const result = truncateAlertContext(context, 500);

    expect(result.source).toBe("prometheus");
    expect(result.timeWindow).toEqual({
      start: "2026-03-26T09:00:00Z",
      end: "2026-03-26T10:00:00Z",
    });
  });
});

// ==================== Constants ====================

describe("ALERT_CONTEXT_BUDGET", () => {
  it("should define MAX_TOKENS as 20000", () => {
    expect(ALERT_CONTEXT_BUDGET.MAX_TOKENS).toBe(20_000);
  });
});

describe("TRUNCATION_LIMITS", () => {
  it("should define expected default limits", () => {
    expect(TRUNCATION_LIMITS.relatedAlerts).toBe(3);
    expect(TRUNCATION_LIMITS.breadcrumbs).toBe(10);
    expect(TRUNCATION_LIMITS.logSnippets).toEqual({ first: 20, last: 10 });
    expect(TRUNCATION_LIMITS.metricPoints).toBe(30);
    expect(TRUNCATION_LIMITS.stackFrames).toEqual({ top: 3, bottom: 3 });
  });
});

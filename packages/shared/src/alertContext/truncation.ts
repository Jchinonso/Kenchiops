/**
 * Alert Context Token Truncation Cascade
 *
 * Pure functions for truncating AlertContext evidence to fit within
 * the Pipeline B token budget (20K tokens). Truncation follows a
 * priority order — lowest-priority evidence is removed first.
 *
 * @module alertContext/truncation
 */

import { TOKEN_ESTIMATION } from "../constants/chunkingPipeline.js";

import type {
  AlertContext,
  AlertEvidence,
  BreadcrumbEvent,
  LogSnippet,
  MetricSnapshot,
  RelatedAlert,
  StackFrame,
  TraceSpan,
} from "./types.js";

// ==================== Constants ====================

/**
 * Token budget for AlertContext before RAG enrichment.
 * From LOG_PROCESSING_STRATEGY.md: hard-capped at 20K tokens.
 */
export const ALERT_CONTEXT_BUDGET = {
  MAX_TOKENS: 20_000,
} as const;

/**
 * Truncation limits for each evidence category.
 * Applied in priority order (lowest priority truncated first).
 */
export const TRUNCATION_LIMITS = {
  relatedAlerts: 3,
  breadcrumbs: 10,
  logSnippets: { first: 20, last: 10 },
  metricPoints: 30,
  stackFrames: { top: 3, bottom: 3 },
} as const;

/**
 * Maximum iterations for iterative reduction to prevent infinite loops.
 */
const MAX_REDUCTION_ITERATIONS = 3;

/**
 * Divisor for halving limits during iterative reduction.
 */
const LIMIT_HALVING_DIVISOR = 2;

// ==================== Token Estimation ====================

/**
 * Estimate the token count for an AlertContext using character-based heuristic.
 * Uses the same CHARS_PER_TOKEN ratio as Pipeline A for consistency.
 */
export const estimateAlertContextTokens = (context: Readonly<AlertContext>): number => {
  const jsonString = JSON.stringify(context);
  return Math.ceil(jsonString.length / TOKEN_ESTIMATION.CHARS_PER_TOKEN);
};

// ==================== Per-Category Truncation Helpers ====================

/**
 * Truncate related alerts to the N most relevant, sorted by severity.
 * Severity order: critical > warning > info.
 */
export const truncateRelatedAlerts = (
  alerts: readonly RelatedAlert[],
  limit: number
): readonly RelatedAlert[] => {
  if (alerts.length <= limit) {
    return alerts;
  }

  const severityRank: Readonly<Record<string, number>> = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  const sorted = [...alerts].sort(
    (first, second) => (severityRank[first.severity] ?? 3) - (severityRank[second.severity] ?? 3)
  );

  return sorted.slice(0, limit);
};

/**
 * Truncate breadcrumbs to keep only the most recent N entries.
 * Recent breadcrumbs are most relevant to the triggering alert.
 */
export const truncateBreadcrumbs = (
  breadcrumbs: readonly BreadcrumbEvent[],
  limit: number
): readonly BreadcrumbEvent[] => {
  if (breadcrumbs.length <= limit) {
    return breadcrumbs;
  }

  return breadcrumbs.slice(-limit);
};

/**
 * Filter trace spans to keep only entry spans and error spans.
 * Entry span: a span with no parentSpanId (root of the trace).
 * Error span: a span with status === "error".
 */
export const filterErrorTraceSpans = (spans: readonly TraceSpan[]): readonly TraceSpan[] =>
  spans.filter((span) => span.status === "error" || span.parentSpanId === undefined);

/**
 * Truncate log snippets keeping first N and last M entries.
 * First entries capture initial context; last entries capture final errors.
 */
export const truncateLogSnippets = (
  logs: readonly LogSnippet[],
  first: number,
  last: number
): readonly LogSnippet[] => {
  const totalKeep = first + last;
  if (logs.length <= totalKeep) {
    return logs;
  }

  const head = logs.slice(0, first);
  const tail = last > 0 ? logs.slice(-last) : [];

  return [...head, ...tail];
};

/**
 * Downsample metric data points to maxPointsPerMetric per metric.
 * Uses uniform sampling to preserve the shape of the time series.
 */
export const downsampleMetrics = (
  metrics: readonly MetricSnapshot[],
  maxPointsPerMetric: number
): readonly MetricSnapshot[] =>
  metrics.map((metric) => {
    if (metric.values.length <= maxPointsPerMetric) {
      return metric;
    }

    const sampled = uniformSample(metric.values, maxPointsPerMetric);

    return { ...metric, values: sampled };
  });

/**
 * Truncate stack frames keeping top N and bottom M, dropping middle frames.
 * Top frames show the immediate cause; bottom frames show the entry point.
 */
export const truncateStackFrames = (
  frames: readonly StackFrame[],
  top: number,
  bottom: number
): readonly StackFrame[] => {
  const totalKeep = top + bottom;
  if (frames.length <= totalKeep) {
    return frames;
  }

  const topFrames = frames.slice(0, top);
  const bottomFrames = bottom > 0 ? frames.slice(-bottom) : [];

  return [...topFrames, ...bottomFrames];
};

// ==================== Uniform Sampling Helper ====================

/**
 * Sample N points uniformly from an array, always including first and last.
 */
const uniformSample = <T>(items: readonly T[], count: number): readonly T[] => {
  if (items.length <= count || count < 2) {
    return items;
  }

  const result: T[] = [items[0]];
  const step = (items.length - 1) / (count - 1);

  // let: loop counter for uniform interval stepping
  for (let idx = 1; idx < count - 1; idx++) {
    const index = Math.round(idx * step);
    result.push(items[index]);
  }

  result.push(items[items.length - 1]);

  return result;
};

// ==================== Truncation Cascade ====================

/**
 * Internal type for mutable limits during iterative reduction.
 */
interface ReductionLimits {
  /** Maximum related alerts to keep */
  relatedAlerts: number;
  /** Maximum breadcrumbs to keep */
  breadcrumbs: number;
  /** Log snippet limits: first N and last M */
  logSnippets: { readonly first: number; readonly last: number };
  /** Maximum metric data points per metric */
  metricPoints: number;
  /** Stack frame limits: top N and bottom M */
  stackFrames: { readonly top: number; readonly bottom: number };
}

/**
 * Apply a single pass of the truncation cascade with given limits.
 * Returns early as soon as the context fits within budget.
 */
const applyCascadePass = (
  context: Readonly<AlertContext>,
  limits: Readonly<ReductionLimits>,
  maxTokens: number
): AlertContext => {
  const { evidence } = context;

  // Step 1: Related alerts (lowest priority)
  const truncatedRelated = truncateRelatedAlerts(evidence.relatedAlerts, limits.relatedAlerts);
  const afterStep1 = buildContext(context, {
    ...evidence,
    relatedAlerts: truncatedRelated,
  });
  if (estimateAlertContextTokens(afterStep1) <= maxTokens) {
    return afterStep1;
  }

  // Step 2: Breadcrumbs
  const truncatedBreadcrumbs = truncateBreadcrumbs(
    afterStep1.evidence.breadcrumbs,
    limits.breadcrumbs
  );
  const afterStep2 = buildContext(afterStep1, {
    ...afterStep1.evidence,
    breadcrumbs: truncatedBreadcrumbs,
  });
  if (estimateAlertContextTokens(afterStep2) <= maxTokens) {
    return afterStep2;
  }

  // Step 3: Trace spans (keep entry + error only)
  const filteredSpans = filterErrorTraceSpans(afterStep2.evidence.traces);
  const afterStep3 = buildContext(afterStep2, {
    ...afterStep2.evidence,
    traces: filteredSpans,
  });
  if (estimateAlertContextTokens(afterStep3) <= maxTokens) {
    return afterStep3;
  }

  // Step 4: Log snippets
  const truncatedLogs = truncateLogSnippets(
    afterStep3.evidence.logs,
    limits.logSnippets.first,
    limits.logSnippets.last
  );
  const afterStep4 = buildContext(afterStep3, {
    ...afterStep3.evidence,
    logs: truncatedLogs,
  });
  if (estimateAlertContextTokens(afterStep4) <= maxTokens) {
    return afterStep4;
  }

  // Step 5: Metric data points
  const downsampledMetrics = downsampleMetrics(afterStep4.evidence.metrics, limits.metricPoints);
  const afterStep5 = buildContext(afterStep4, {
    ...afterStep4.evidence,
    metrics: downsampledMetrics,
  });
  if (estimateAlertContextTokens(afterStep5) <= maxTokens) {
    return afterStep5;
  }

  // Step 6: Stack frames
  const truncatedFrames = truncateStackFrames(
    afterStep5.evidence.stackTraces,
    limits.stackFrames.top,
    limits.stackFrames.bottom
  );
  const afterStep6 = buildContext(afterStep5, {
    ...afterStep5.evidence,
    stackTraces: truncatedFrames,
  });
  if (estimateAlertContextTokens(afterStep6) <= maxTokens) {
    return afterStep6;
  }

  // Step 7: Provider metadata (last resort — drop entirely)
  return {
    ...afterStep6,
    providerMetadata: {},
  };
};

/**
 * Build a new AlertContext with updated evidence.
 */
const buildContext = (context: Readonly<AlertContext>, evidence: AlertEvidence): AlertContext => ({
  ...context,
  evidence,
});

/**
 * Halve reduction limits for iterative reduction.
 */
const halveLimits = (limits: Readonly<ReductionLimits>): ReductionLimits => ({
  relatedAlerts: Math.max(1, Math.floor(limits.relatedAlerts / LIMIT_HALVING_DIVISOR)),
  breadcrumbs: Math.max(1, Math.floor(limits.breadcrumbs / LIMIT_HALVING_DIVISOR)),
  logSnippets: {
    first: Math.max(1, Math.floor(limits.logSnippets.first / LIMIT_HALVING_DIVISOR)),
    last: Math.max(1, Math.floor(limits.logSnippets.last / LIMIT_HALVING_DIVISOR)),
  },
  metricPoints: Math.max(1, Math.floor(limits.metricPoints / LIMIT_HALVING_DIVISOR)),
  stackFrames: {
    top: Math.max(1, Math.floor(limits.stackFrames.top / LIMIT_HALVING_DIVISOR)),
    bottom: Math.max(1, Math.floor(limits.stackFrames.bottom / LIMIT_HALVING_DIVISOR)),
  },
});

/**
 * Truncate an AlertContext to fit within the token budget.
 *
 * Applies truncation in priority order (lowest priority first):
 *   1. Related alerts -> keep N most relevant (highest severity)
 *   2. Breadcrumbs -> keep last N
 *   3. Trace spans -> keep entry + error spans only
 *   4. Log snippets -> keep first N + last M
 *   5. Metric data points -> downsample to N per metric
 *   6. Stack frames -> keep top N + bottom M
 *   7. Provider metadata -> drop entirely
 *
 * If still over budget after all steps, halves limits and re-runs
 * (max 3 iterations to prevent infinite loops).
 *
 * Never truncates: alertId, title, severity, timestamps, description.
 */
export const truncateAlertContext = (
  context: Readonly<AlertContext>,
  maxTokens: number = ALERT_CONTEXT_BUDGET.MAX_TOKENS
): AlertContext => {
  // Fast path: already within budget
  if (estimateAlertContextTokens(context) <= maxTokens) {
    return context;
  }

  // Initial limits from constants
  // let: iterative reduction requires mutable limits across loop iterations
  let currentLimits: ReductionLimits = {
    relatedAlerts: TRUNCATION_LIMITS.relatedAlerts,
    breadcrumbs: TRUNCATION_LIMITS.breadcrumbs,
    logSnippets: TRUNCATION_LIMITS.logSnippets,
    metricPoints: TRUNCATION_LIMITS.metricPoints,
    stackFrames: TRUNCATION_LIMITS.stackFrames,
  };

  // let: result updated each iteration until within budget or max iterations
  let result = applyCascadePass(context, currentLimits, maxTokens);

  // Iterative reduction: halve limits and re-run if still over budget
  // let: loop counter for bounded iteration
  for (let iteration = 0; iteration < MAX_REDUCTION_ITERATIONS; iteration++) {
    if (estimateAlertContextTokens(result) <= maxTokens) {
      return result;
    }

    currentLimits = halveLimits(currentLimits);
    result = applyCascadePass(result, currentLimits, maxTokens);
  }

  return result;
};

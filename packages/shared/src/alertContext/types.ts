/**
 * Alert Context Evidence Model Types
 *
 * Type definitions for Pipeline B: Alert Context Analysis.
 * Represents structured evidence gathered from observability tools.
 *
 * @module alertContext/types
 */

// ==================== Source Types ====================

/**
 * Alert context source — the observability provider that generated the alert.
 */
export type AlertContextSource =
  | "sentry"
  | "datadog"
  | "prometheus"
  | "grafana"
  | "pagerduty"
  | "opsgenie"
  | "newrelic";

/**
 * Alert severity level.
 */
export type AlertSeverity = "critical" | "warning" | "info";

// ==================== Evidence Sub-Types ====================

/**
 * Time-series metric snapshot around the alert window.
 */
export interface MetricSnapshot {
  readonly metricName: string;
  readonly values: readonly MetricDataPoint[];
  readonly unit?: string;
  readonly query?: string;
  readonly threshold?: number;
}

/**
 * Single data point in a metric time series.
 */
export interface MetricDataPoint {
  readonly timestamp: string;
  readonly value: number;
}

/**
 * Log snippet from the alert time window.
 */
export interface LogSnippet {
  readonly timestamp: string;
  readonly level: "debug" | "info" | "warn" | "error" | "fatal";
  readonly message: string;
  readonly source?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Distributed trace span from APM data.
 */
export interface TraceSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly operationName: string;
  readonly serviceName: string;
  readonly startTime: string;
  readonly duration: number;
  readonly status: "ok" | "error" | "timeout";
  readonly tags?: Readonly<Record<string, string>>;
  readonly errorMessage?: string;
}

/**
 * Stack frame from an error stack trace.
 */
export interface StackFrame {
  readonly filename: string;
  readonly function: string;
  readonly lineno: number;
  readonly colno?: number;
  readonly context?: readonly string[];
  readonly inApp: boolean;
}

/**
 * Breadcrumb event — user or system action preceding the error.
 */
export interface BreadcrumbEvent {
  readonly timestamp: string;
  readonly category: string;
  readonly message: string;
  readonly level: "debug" | "info" | "warning" | "error";
  readonly data?: Readonly<Record<string, unknown>>;
}

/**
 * Related alert that fired in the same time window.
 */
export interface RelatedAlert {
  readonly alertId: string;
  readonly title: string;
  readonly severity: AlertSeverity;
  readonly triggeredAt: string;
  readonly source: AlertContextSource;
  readonly correlation: "causal" | "temporal" | "service";
}

// ==================== Evidence Grouping ====================

/**
 * Grouped evidence collected for an alert.
 */
export interface AlertEvidence {
  readonly metrics: readonly MetricSnapshot[];
  readonly logs: readonly LogSnippet[];
  readonly traces: readonly TraceSpan[];
  readonly stackTraces: readonly StackFrame[];
  readonly breadcrumbs: readonly BreadcrumbEvent[];
  readonly relatedAlerts: readonly RelatedAlert[];
}

// ==================== Time Window ====================

/**
 * Time window for context fetching around the alert.
 */
export interface AlertTimeWindow {
  readonly start: string;
  readonly end: string;
}

// ==================== Alert Context ====================

/**
 * Full alert context assembled from an observability provider.
 * This is the primary input to Pipeline B's LLM analysis step.
 */
export interface AlertContext {
  readonly source: AlertContextSource;
  readonly alertId: string;
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly description: string;
  readonly triggeredAt: string;
  readonly resolvedAt: string | null;
  readonly timeWindow: AlertTimeWindow;
  readonly evidence: AlertEvidence;
  readonly providerMetadata: Readonly<Record<string, unknown>>;
}

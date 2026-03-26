/**
 * Alert Context Evidence Model
 *
 * Types and utilities for Pipeline B: Alert Context Analysis from observability tools.
 *
 * @module alertContext
 */

export type {
  // Source and severity
  AlertContextSource,
  AlertSeverity,
  // Evidence sub-types
  MetricSnapshot,
  MetricDataPoint,
  LogSnippet,
  TraceSpan,
  StackFrame,
  BreadcrumbEvent,
  RelatedAlert,
  // Evidence grouping
  AlertEvidence,
  // Time window
  AlertTimeWindow,
  // Main context type
  AlertContext,
} from "./types.js";

// Truncation cascade (Pipeline B token budget enforcement)
export {
  ALERT_CONTEXT_BUDGET,
  TRUNCATION_LIMITS,
  truncateAlertContext,
  estimateAlertContextTokens,
  truncateRelatedAlerts,
  truncateBreadcrumbs,
  filterErrorTraceSpans,
  truncateLogSnippets,
  downsampleMetrics,
  truncateStackFrames,
} from "./truncation.js";

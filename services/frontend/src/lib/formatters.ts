/**
 * Shared formatting utilities for CI/CD dashboard pages.
 *
 * Pure helper functions for confidence labels, severity styles,
 * timestamps, text truncation, and payload extraction.
 */

import { formatDistanceToNow } from "date-fns";

// ==================== Confidence ====================

export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.8,
  MEDIUM: 0.5,
} as const;

export const getConfidenceLabel = (confidence: number): string =>
  confidence >= CONFIDENCE_THRESHOLDS.HIGH
    ? "High"
    : confidence >= CONFIDENCE_THRESHOLDS.MEDIUM
      ? "Medium"
      : "Low";

export const getConfidenceStyle = (confidence: number): string =>
  confidence >= CONFIDENCE_THRESHOLDS.HIGH
    ? "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-200 border-green-200 dark:border-green-800"
    : confidence >= CONFIDENCE_THRESHOLDS.MEDIUM
      ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-200 border-amber-200 dark:border-amber-800"
      : "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-200 border-red-200 dark:border-red-800";

// ==================== Severity ====================

export const SEVERITY_STYLES: Readonly<Record<string, string>> = {
  critical:
    "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-200 border-purple-200 dark:border-purple-800",
  high: "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-200 border-red-200 dark:border-red-800",
  medium:
    "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-200 border-amber-200 dark:border-amber-800",
  low: "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-200 border-blue-200 dark:border-blue-800",
  info: "bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-200 border-sky-200 dark:border-sky-800",
  default:
    "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700",
} as const;

export const getSeverityStyle = (severity: string | null): string =>
  SEVERITY_STYLES[severity ?? "default"] ?? SEVERITY_STYLES.default;

// ==================== General ====================

export const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? "--"
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};

export const formatRelativeTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "--" : formatDistanceToNow(date, { addSuffix: true });
};

export const titleCase = (text: string): string =>
  text.length === 0 ? text : `${text[0].toUpperCase()}${text.slice(1).toLowerCase()}`;

export const truncateText = (text: string, maxLength: number): string =>
  text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;

export const extractRepoFromKey = (
  key: string | null,
  fullAnalysis?: Readonly<Record<string, unknown>>
): string => {
  if (key) {
    const colonIndex = key.indexOf(":");
    return colonIndex > 0 ? key.slice(0, colonIndex) : key;
  }
  // Fallback: check fullAnalysis JSONB for repository field
  if (typeof fullAnalysis?.repository === "string" && fullAnalysis.repository.length > 0) {
    return fullAnalysis.repository;
  }
  return "--";
};

export const getPayloadString = (
  payload: Readonly<Record<string, unknown>>,
  key: string
): string => (typeof payload[key] === "string" ? String(payload[key]) : "--");

/** Safely format a primitive value for display. */
export const formatSignalValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "--";
  }
  if (typeof value === "number") {
    return value % 1 === 0 ? String(value) : value.toFixed(3);
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[complex value]";
    }
  }
  return String(value);
};

/**
 * Flattens nested confidence signal objects into a flat list of
 * key-value pairs suitable for display. Nested objects get
 * expanded into "parent.child" keys.
 */
export const flattenSignalEntries = (
  signals: Readonly<Record<string, unknown>>
): ReadonlyArray<readonly [string, string]> => {
  const result: Array<readonly [string, string]> = [];

  const walk = (obj: Readonly<Record<string, unknown>>, prefix: string): void => {
    Object.entries(obj).forEach(([key, value]) => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        walk(value as Readonly<Record<string, unknown>>, fullKey);
      } else {
        result.push([fullKey, formatSignalValue(value)] as const);
      }
    });
  };

  walk(signals, "");
  return result;
};

// ==================== Incident Status ====================

export const INCIDENT_STATUS_STYLES: Readonly<Record<string, string>> = {
  received:
    "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700",
  processing:
    "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-200 border-blue-200 dark:border-blue-800",
  deduped:
    "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
  triaged:
    "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800",
  escalated:
    "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-200 border-red-200 dark:border-red-800",
  acknowledged:
    "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-200 border-amber-200 dark:border-amber-800",
  resolved:
    "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-200 border-green-200 dark:border-green-800",
  closed:
    "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
  default:
    "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700",
} as const;

export const getIncidentStatusStyle = (status: string): string =>
  INCIDENT_STATUS_STYLES[status] ?? INCIDENT_STATUS_STYLES.default;

// ==================== Alert Source ====================

export const SOURCE_LABELS: Readonly<Record<string, string>> = {
  pagerduty: "PagerDuty",
  datadog: "Datadog",
  cloudwatch: "CloudWatch",
  prometheus: "Prometheus",
  custom: "Custom",
} as const;

export const getSourceLabel = (source: string): string =>
  SOURCE_LABELS[source] ?? titleCase(source);

// ==================== Incident Severity Rank ====================

const SEVERITY_RANKS: Readonly<Record<string, number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
} as const;

export const getIncidentSeverityRank = (severity: string): number => SEVERITY_RANKS[severity] ?? 5;

// ==================== Investigation Status ====================

export const INVESTIGATION_STATUS_STYLES: Readonly<Record<string, string>> = {
  queued:
    "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700",
  gathering:
    "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-200 border-blue-200 dark:border-blue-800",
  analyzing:
    "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800",
  completed:
    "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-200 border-green-200 dark:border-green-800",
  failed:
    "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-200 border-red-200 dark:border-red-800",
  default:
    "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700",
} as const;

export const getInvestigationStatusStyle = (status: string): string =>
  INVESTIGATION_STATUS_STYLES[status] ?? INVESTIGATION_STATUS_STYLES.default;

// ==================== Evidence Source Labels ====================

export const EVIDENCE_SOURCE_LABELS: Readonly<Record<string, string>> = {
  past_incidents: "Past Incidents",
  ci_analyses: "CI Analyses",
  triage_results: "Triage Results",
  datadog_metrics: "Datadog Metrics",
  datadog_events: "Datadog Events",
  grafana_alerts: "Grafana Alerts",
  prometheus_alerts: "Prometheus Alerts",
  pagerduty_incidents: "PagerDuty Incidents",
  vercel_deployments: "Vercel Deployments",
  netlify_deploys: "Netlify Deploys",
} as const;

export const getEvidenceSourceLabel = (source: string): string =>
  EVIDENCE_SOURCE_LABELS[source] ?? titleCase(source.replace(/_/g, " "));

// ==================== Duration Formatting ====================

export const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
};

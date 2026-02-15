/**
 * Shared formatting utilities for CI/CD dashboard pages.
 *
 * Pure helper functions for confidence labels, severity styles,
 * timestamps, text truncation, and payload extraction.
 */

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
    ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
    : confidence >= CONFIDENCE_THRESHOLDS.MEDIUM
      ? "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
      : "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800";

// ==================== Severity ====================

export const SEVERITY_STYLES: Readonly<Record<string, string>> = {
  high: "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
  medium:
    "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  low: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  default:
    "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700",
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

/** Safely format an unknown value for display. Objects/arrays become JSON. */
export const formatSignalValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "--";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
};

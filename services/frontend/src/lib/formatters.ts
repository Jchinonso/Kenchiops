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
    ? "bg-green-100 text-green-700 border-green-200"
    : confidence >= CONFIDENCE_THRESHOLDS.MEDIUM
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : "bg-red-100 text-red-700 border-red-200";

// ==================== Severity ====================

export const SEVERITY_STYLES: Readonly<Record<string, string>> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
  default: "bg-gray-100 text-gray-700 border-gray-200",
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

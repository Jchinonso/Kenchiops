/**
 * CSV Export Utilities
 *
 * Pure helper functions for generating and downloading CSV files
 * from dashboard data (analyses and failure events).
 */

import { toast } from "sonner";
import { extractRepoFromKey, getPayloadString } from "@/lib/formatters";

// ==================== Types ====================

interface AnalysisExportRecord {
  readonly createdAt: string;
  readonly aggregationKey: string | null;
  readonly fullAnalysis: Readonly<Record<string, unknown>>;
  readonly summary: string;
  readonly identifiedCause: string | null;
  readonly diagnosisConfidence: number;
  readonly actionConfidence: number | null;
  readonly recommendedActions: readonly string[] | null;
  readonly eventId: string | null;
}

interface FailureExportRecord {
  readonly timestamp: string;
  readonly severity: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

// ==================== Core Helpers ====================

/** Characters that trigger formula interpretation in spreadsheet applications (DDE injection). */
const FORMULA_TRIGGER_CHARS = new Set(["=", "+", "-", "@", "\t", "\r"]);

const escapeCSVField = (field: string): string => {
  // Defense-in-depth: prefix formula-triggering characters with a single quote
  // to prevent DDE/formula injection when opened in Excel/LibreOffice.
  const sanitized = field.length > 0 && FORMULA_TRIGGER_CHARS.has(field[0]) ? `'${field}` : field;
  const needsQuoting =
    sanitized.includes(",") || sanitized.includes('"') || sanitized.includes("\n");
  return needsQuoting ? `"${sanitized.replace(/"/g, '""')}"` : sanitized;
};

const generateCSV = (headers: readonly string[], rows: ReadonlyArray<readonly string[]>): string =>
  [headers, ...rows].map((row) => row.map(escapeCSVField).join(",")).join("\n");

const downloadCSV = (filename: string, content: string): void => {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  Object.assign(link, { href: url, download: filename });
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// ==================== Domain Exporters ====================

const ANALYSIS_HEADERS = [
  "Timestamp",
  "Repository",
  "Summary",
  "Root Cause",
  "Diagnosis Confidence",
  "Action Confidence",
  "Recommended Actions",
  "Event ID",
] as const;

export const exportAnalysesToCSV = (analyses: readonly AnalysisExportRecord[]): void => {
  const rows = analyses.map((analysis) => [
    analysis.createdAt,
    extractRepoFromKey(analysis.aggregationKey, analysis.fullAnalysis),
    analysis.summary,
    analysis.identifiedCause ?? "",
    `${Math.round(analysis.diagnosisConfidence * 100)}%`,
    analysis.actionConfidence !== null ? `${Math.round(analysis.actionConfidence * 100)}%` : "",
    (analysis.recommendedActions ?? []).join("; "),
    analysis.eventId ?? "",
  ]);
  const filename = `kenchi-analyses-${new Date().toISOString().slice(0, 10)}.csv`;
  downloadCSV(filename, generateCSV(ANALYSIS_HEADERS, rows));
  toast.success(`Exported ${analyses.length} analyses`, { description: filename });
};

const FAILURE_HEADERS = [
  "Timestamp",
  "Repository",
  "Check Name",
  "Workflow",
  "Branch",
  "Severity",
  "Conclusion",
  "Commit SHA",
] as const;

export const exportFailuresToCSV = (failures: readonly FailureExportRecord[]): void => {
  const rows = failures.map((event) => [
    event.timestamp,
    getPayloadString(event.payload, "repository"),
    getPayloadString(event.payload, "checkName"),
    getPayloadString(event.payload, "workflowName"),
    getPayloadString(event.payload, "branch"),
    event.severity ?? "unknown",
    getPayloadString(event.payload, "conclusion"),
    getPayloadString(event.payload, "headSha"),
  ]);
  const filename = `kenchi-failures-${new Date().toISOString().slice(0, 10)}.csv`;
  downloadCSV(filename, generateCSV(FAILURE_HEADERS, rows));
  toast.success(`Exported ${failures.length} failures`, { description: filename });
};

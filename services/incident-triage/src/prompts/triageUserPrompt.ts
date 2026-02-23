/**
 * Triage User Prompt
 *
 * Template for building the user prompt with all evidence sections
 * injected from the evidence catalog and pipeline outputs.
 *
 * @module prompts/triageUserPrompt
 */

import { truncateText } from "@kenchi/shared";
import type { NormalizedAlert } from "../types/incidentTypes.js";
import type { SeverityScore } from "../types/severityTypes.js";
import type { RunbookMatch } from "../types/runbookTypes.js";
import type { CorrelatedIncident } from "../types/correlationTypes.js";
import type { EvidenceCatalog, EvidenceItem } from "../types/evidenceTypes.js";
import type { TriageUserPromptInput } from "../types/summaryTypes.js";

// ==================== Helpers ====================

const formatSimilarity = (value: number): string => value.toFixed(3);

const isEmpty = (arr: readonly unknown[]): boolean => {
  const { length: count } = arr;
  return count === 0;
};

// ==================== Section Builders ====================

/**
 * Formats the normalized alert section of the prompt.
 */
const formatAlertSection = (alert: NormalizedAlert): string => {
  const { title, source, severity, serviceName, environment, description, metrics, labels } = alert;

  const base = [
    `Title: ${title}`,
    `Source: ${source}`,
    `Source Severity: ${severity}`,
    `Service: ${serviceName ?? "unknown"}`,
    `Environment: ${environment ?? "unknown"}`,
  ];

  const descBlock = description ? [`Description: ${truncateText(description, 500)}`] : [];

  const metricKeys = Object.keys(metrics);
  const metricsBlock =
    metricKeys.length > 0
      ? [
          "Metrics:",
          ...metricKeys.slice(0, 10).map((key) => `  ${key}: ${JSON.stringify(metrics[key])}`),
        ]
      : [];

  const labelKeys = Object.keys(labels);
  const labelsBlock =
    labelKeys.length > 0
      ? ["Labels:", ...labelKeys.slice(0, 10).map((key) => `  ${key}: ${labels[key]}`)]
      : [];

  return [base[0], ...descBlock, ...base.slice(1), ...metricsBlock, ...labelsBlock].join("\n");
};

/**
 * Formats the severity classification section.
 */
const formatSeveritySection = (severity: SeverityScore): string => {
  const { label, total, factors } = severity;

  const factorLines = factors.map(
    ({ name, score, maxScore, weight, reason }) =>
      `  - ${name}: ${score}/${maxScore} (weight: ${weight}) - ${reason}`
  );

  return [`Label: ${label}`, `Total Score: ${total}/100`, "Factors:", ...factorLines].join("\n");
};

/**
 * Formats a single runbook match entry.
 */
const formatRunbookEntry = (rb: RunbookMatch, idx: number): string => {
  const { title, similarity, sourceUrl } = rb;
  const sim = formatSimilarity(similarity);
  const urlSuffix = sourceUrl ? ` [${sourceUrl}]` : "";
  return `  RB-${idx}: "${title}" (similarity: ${sim})${urlSuffix}`;
};

/**
 * Formats the matched runbooks section.
 */
const formatRunbooksSection = (runbooks: readonly RunbookMatch[]): string =>
  isEmpty(runbooks) ? "No matching runbooks found." : runbooks.map(formatRunbookEntry).join("\n");

/**
 * Formats a single correlated incident entry.
 */
const formatCorrelationEntry = (corr: CorrelatedIncident, idx: number): string => {
  const { correlationType, similarity, severityLabel, serviceName } = corr;
  const sim = formatSimilarity(similarity);
  const sev = severityLabel ?? "unknown";
  const svc = serviceName ?? "unknown";
  return `  INC-${idx}: ${correlationType} (similarity: ${sim}, severity: ${sev}, service: ${svc})`;
};

/**
 * Formats the correlated incidents section.
 */
const formatCorrelationsSection = (correlations: readonly CorrelatedIncident[]): string =>
  isEmpty(correlations)
    ? "No correlated incidents found."
    : correlations.map(formatCorrelationEntry).join("\n");

/**
 * Formats a single evidence item for the catalog section.
 */
const formatEvidenceEntry = (item: EvidenceItem): string => {
  const { id, label, value, source: src } = item;
  const valueStr =
    typeof value === "object"
      ? truncateText(JSON.stringify(value), 200)
      : truncateText(String(value), 200);
  return `  ${id}: ${label} -- ${valueStr} [source: ${src}]`;
};

/**
 * Formats the evidence catalog section (all evidence IDs and their values).
 */
const formatEvidenceCatalogSection = (catalog: EvidenceCatalog): string => {
  const entries = Object.values(catalog.items);
  return isEmpty(entries)
    ? "No evidence items collected."
    : entries.map(formatEvidenceEntry).join("\n");
};

/**
 * Formats the computed values section (values the AI must not override).
 */
const formatComputedValues = (severity: SeverityScore, catalog: EvidenceCatalog): string => {
  const { label: sevLabel, total: sevTotal } = severity;
  const { total: confTotal } = catalog.confidence;
  const { total: compTotal } = catalog.completeness;
  return [
    `Severity Label: ${sevLabel}`,
    `Severity Score: ${sevTotal}`,
    `Confidence: ${confTotal}`,
    `Completeness: ${compTotal}`,
  ].join("\n");
};

// ==================== Public API ====================

// Re-export for backward compatibility with existing consumers
export type { TriageUserPromptInput } from "../types/summaryTypes.js";

/**
 * Builds the user prompt for the AI summarizer.
 *
 * Pure function -- all values injected from the evidence catalog and pipeline outputs.
 *
 * @param input - All pipeline stage outputs
 * @returns Formatted user prompt string
 */
export const buildTriageUserPrompt = (input: TriageUserPromptInput): string => {
  const { alert, severity, runbooks, correlations, evidenceCatalog } = input;

  return [
    "## NORMALIZED ALERT",
    formatAlertSection(alert),
    "",
    "## COMPUTED SEVERITY",
    formatSeveritySection(severity),
    "",
    "## MATCHED RUNBOOKS",
    formatRunbooksSection(runbooks),
    "",
    "## RELATED INCIDENTS",
    formatCorrelationsSection(correlations),
    "",
    "## EVIDENCE CATALOG",
    formatEvidenceCatalogSection(evidenceCatalog),
    "",
    "## COMPUTED VALUES (DO NOT OVERRIDE)",
    formatComputedValues(severity, evidenceCatalog),
    "",
    "Generate a structured incident summary based ONLY on the evidence above.",
  ].join("\n");
};

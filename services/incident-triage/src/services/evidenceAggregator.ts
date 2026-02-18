/**
 * Evidence Aggregator Service
 *
 * Pure function that assembles an evidence catalog from all triage pipeline
 * stages (alert, severity, runbooks, correlations). Computes confidence
 * and completeness scores deterministically.
 *
 * No I/O -- all inputs provided as arguments.
 *
 * @module services/evidenceAggregator
 */

import type { NormalizedAlert } from "../types/incidentTypes.js";
import type { SeverityScore, SeverityFactor } from "../types/severityTypes.js";
import type { RunbookMatch } from "../types/runbookTypes.js";
import type { CorrelatedIncident } from "../types/correlationTypes.js";
import type {
  AggregateEvidenceInput,
  EvidenceCatalog,
  EvidenceItem,
  EvidenceIdPrefix,
  ConfidenceScore,
  ConfidenceSignal,
  ConfidenceSignalName,
  CompletenessScore,
} from "../types/evidenceTypes.js";
import { CONFIDENCE_WEIGHTS, COMPLETENESS_FIELDS } from "../constants/triageConstants.js";

// ==================== Evidence ID Builders ====================

const alertEvidenceId = (field: string): string => `ALT-${field}`;
const severityEvidenceId = (detail: string): string => `SEV-${detail}`;
const runbookEvidenceId = (index: number): string => `RB-${index}`;
const incidentEvidenceId = (index: number): string => `INC-${index}`;

// ==================== Evidence Item Builders ====================

const createEvidenceItem = (
  id: string,
  prefix: EvidenceIdPrefix,
  label: string,
  value: unknown,
  source: string
): EvidenceItem => ({
  id,
  prefix,
  label,
  value,
  source,
});

// ==================== Alert Evidence ====================

const collectAlertEvidence = (alert: NormalizedAlert): readonly EvidenceItem[] => {
  const items: readonly EvidenceItem[] = [
    createEvidenceItem(alertEvidenceId("title"), "ALT", "Alert Title", alert.title, "alert"),
    createEvidenceItem(alertEvidenceId("source"), "ALT", "Alert Source", alert.source, "alert"),
    createEvidenceItem(
      alertEvidenceId("severity"),
      "ALT",
      "Source Severity",
      alert.severity,
      "alert"
    ),
    createEvidenceItem(
      alertEvidenceId("fingerprint"),
      "ALT",
      "Alert Fingerprint",
      alert.fingerprint,
      "alert"
    ),
    createEvidenceItem(
      alertEvidenceId("receivedAt"),
      "ALT",
      "Received At",
      alert.receivedAt,
      "alert"
    ),
  ];

  const conditionalItems: readonly EvidenceItem[] = [
    ...(alert.description !== null
      ? [
          createEvidenceItem(
            alertEvidenceId("description"),
            "ALT",
            "Alert Description",
            alert.description,
            "alert"
          ),
        ]
      : []),
    ...(alert.serviceName !== null
      ? [
          createEvidenceItem(
            alertEvidenceId("serviceName"),
            "ALT",
            "Service Name",
            alert.serviceName,
            "alert"
          ),
        ]
      : []),
    ...(alert.environment !== null
      ? [
          createEvidenceItem(
            alertEvidenceId("environment"),
            "ALT",
            "Environment",
            alert.environment,
            "alert"
          ),
        ]
      : []),
  ];

  const hasMetricKeys = Object.keys(alert.metrics).length > 0;
  const metricsItems: readonly EvidenceItem[] = hasMetricKeys
    ? [
        createEvidenceItem(
          alertEvidenceId("metrics"),
          "ALT",
          "Alert Metrics",
          alert.metrics,
          "alert"
        ),
      ]
    : [];

  const hasLabelKeys = Object.keys(alert.labels).length > 0;
  const labelsItems: readonly EvidenceItem[] = hasLabelKeys
    ? [createEvidenceItem(alertEvidenceId("labels"), "ALT", "Alert Labels", alert.labels, "alert")]
    : [];

  return [...items, ...conditionalItems, ...metricsItems, ...labelsItems];
};

// ==================== Severity Evidence ====================

const collectSeverityEvidence = (severity: SeverityScore): readonly EvidenceItem[] => {
  const baseItems: readonly EvidenceItem[] = [
    createEvidenceItem(
      severityEvidenceId("total"),
      "SEV",
      "Severity Total Score",
      severity.total,
      "classifier"
    ),
    createEvidenceItem(
      severityEvidenceId("label"),
      "SEV",
      "Severity Label",
      severity.label,
      "classifier"
    ),
  ];

  const factorItems: readonly EvidenceItem[] = severity.factors.map((factor: SeverityFactor) =>
    createEvidenceItem(
      severityEvidenceId(factor.name),
      "SEV",
      `Severity Factor: ${factor.name}`,
      {
        weight: factor.weight,
        score: factor.score,
        maxScore: factor.maxScore,
        reason: factor.reason,
      },
      "classifier"
    )
  );

  return [...baseItems, ...factorItems];
};

// ==================== Runbook Evidence ====================

const collectRunbookEvidence = (runbooks: readonly RunbookMatch[]): readonly EvidenceItem[] =>
  runbooks.map((match, index) =>
    createEvidenceItem(
      runbookEvidenceId(index),
      "RB",
      `Matched Runbook: ${match.title}`,
      { docId: match.docId, similarity: match.similarity, sourceUrl: match.sourceUrl },
      "runbook-matcher"
    )
  );

// ==================== Correlation Evidence ====================

const collectCorrelationEvidence = (
  correlations: readonly CorrelatedIncident[]
): readonly EvidenceItem[] =>
  correlations.map((corr, index) =>
    createEvidenceItem(
      incidentEvidenceId(index),
      "INC",
      `Correlated Incident (${corr.correlationType})`,
      {
        triageResultId: corr.triageResultId,
        alertId: corr.alertId,
        similarity: corr.similarity,
        correlationType: corr.correlationType,
        severityLabel: corr.severityLabel,
      },
      "incident-correlator"
    )
  );

// ==================== Confidence Scoring ====================

const hasNonEmptyMetrics = (alert: NormalizedAlert): boolean =>
  Object.keys(alert.metrics).length > 0;

const hasNonEmptyLabels = (alert: NormalizedAlert): boolean => Object.keys(alert.labels).length > 0;

/**
 * Computes a weighted confidence score from signal presence/absence.
 * Pure function.
 */
const computeConfidence = (
  alert: NormalizedAlert,
  runbooks: readonly RunbookMatch[],
  correlations: readonly CorrelatedIncident[]
): ConfidenceScore => {
  const signalChecks: ReadonlyArray<{
    readonly name: ConfidenceSignalName;
    readonly present: boolean;
    readonly reason: string;
  }> = [
    {
      name: "has_metrics",
      present: hasNonEmptyMetrics(alert),
      reason: hasNonEmptyMetrics(alert)
        ? "Alert includes metric data"
        : "No metrics attached to alert",
    },
    {
      name: "has_runbook",
      present: runbooks.length > 0,
      reason:
        runbooks.length > 0
          ? `${runbooks.length} matching runbook(s) found`
          : "No matching runbooks found",
    },
    {
      name: "has_similar_incident",
      present: correlations.length > 0,
      reason:
        correlations.length > 0
          ? `${correlations.length} similar past incident(s) found`
          : "No similar past incidents found",
    },
    {
      name: "service_known",
      present: alert.serviceName !== null,
      reason:
        alert.serviceName !== null
          ? `Service identified: ${alert.serviceName}`
          : "Service name not provided",
    },
    {
      name: "environment_known",
      present: alert.environment !== null,
      reason:
        alert.environment !== null
          ? `Environment identified: ${alert.environment}`
          : "Environment not provided",
    },
    {
      name: "has_description",
      present: alert.description !== null && alert.description.length > 0,
      reason:
        alert.description !== null && alert.description.length > 0
          ? "Alert includes description"
          : "No description provided",
    },
    {
      name: "has_labels",
      present: hasNonEmptyLabels(alert),
      reason: hasNonEmptyLabels(alert) ? "Alert includes labels" : "No labels attached to alert",
    },
  ];

  const signals: readonly ConfidenceSignal[] = signalChecks.map((check) => ({
    name: check.name,
    weight: CONFIDENCE_WEIGHTS[check.name],
    present: check.present,
    reason: check.reason,
  }));

  const total = signals.reduce((sum, signal) => sum + (signal.present ? signal.weight : 0), 0);

  return { total: Math.round(total * 10000) / 10000, signals };
};

// ==================== Completeness Scoring ====================

/**
 * Checks if a named field is "present" (non-null, non-empty) on the alert
 * or within the enrichment data. Pure function.
 */
const isFieldPresent = (
  fieldName: string,
  alert: NormalizedAlert,
  runbooks: readonly RunbookMatch[],
  correlations: readonly CorrelatedIncident[]
): boolean => {
  const fieldChecks: Readonly<Record<string, () => boolean>> = {
    title: () => alert.title.length > 0,
    source: () => alert.source.length > 0,
    severity: () => alert.severity.length > 0,
    fingerprint: () => alert.fingerprint.length > 0,
    serviceName: () => alert.serviceName !== null,
    environment: () => alert.environment !== null,
    description: () => alert.description !== null && alert.description.length > 0,
    metrics: () => Object.keys(alert.metrics).length > 0,
    labels: () => Object.keys(alert.labels).length > 0,
    runbooks: () => runbooks.length > 0,
    correlatedIncidents: () => correlations.length > 0,
  };

  const checker = fieldChecks[fieldName];
  return checker !== undefined ? checker() : false;
};

/**
 * Computes a weighted completeness score based on field coverage.
 * Required fields weighted 3x, expected 2x, optional 1x.
 * Pure function.
 */
const computeCompleteness = (
  alert: NormalizedAlert,
  runbooks: readonly RunbookMatch[],
  correlations: readonly CorrelatedIncident[]
): CompletenessScore => {
  const requiredFields = COMPLETENESS_FIELDS.required;
  const expectedFields = COMPLETENESS_FIELDS.expected;
  const optionalFields = COMPLETENESS_FIELDS.optional;

  const requiredPresent = requiredFields.filter((field) =>
    isFieldPresent(field, alert, runbooks, correlations)
  ).length;

  const expectedPresent = expectedFields.filter((field) =>
    isFieldPresent(field, alert, runbooks, correlations)
  ).length;

  const optionalPresent = optionalFields.filter((field) =>
    isFieldPresent(field, alert, runbooks, correlations)
  ).length;

  const allFields = [...requiredFields, ...expectedFields, ...optionalFields];
  const missingFields = allFields.filter(
    (field) => !isFieldPresent(field, alert, runbooks, correlations)
  );

  // Weighted score: required=3x, expected=2x, optional=1x
  const requiredWeight = 3;
  const expectedWeight = 2;
  const optionalWeight = 1;

  const totalWeight =
    requiredFields.length * requiredWeight +
    expectedFields.length * expectedWeight +
    optionalFields.length * optionalWeight;

  const achievedWeight =
    requiredPresent * requiredWeight +
    expectedPresent * expectedWeight +
    optionalPresent * optionalWeight;

  const total = totalWeight > 0 ? Math.round((achievedWeight / totalWeight) * 10000) / 10000 : 0;

  return {
    total,
    requiredPresent,
    requiredTotal: requiredFields.length,
    expectedPresent,
    expectedTotal: expectedFields.length,
    optionalPresent,
    optionalTotal: optionalFields.length,
    missingFields,
  };
};

// ==================== Public API ====================

// Re-export for backward compatibility with existing consumers
export type { AggregateEvidenceInput } from "../types/evidenceTypes.js";

/**
 * Aggregates all evidence from the triage pipeline into a single catalog
 * with confidence and completeness scoring.
 *
 * This is a pure function -- no I/O, no side effects, fully deterministic.
 *
 * @param input - All pipeline stage outputs
 * @returns Complete evidence catalog with scores
 */
export const aggregateEvidence = (input: AggregateEvidenceInput): EvidenceCatalog => {
  const { alert, severity, runbooks, correlations } = input;

  // Collect all evidence items
  const allItems: readonly EvidenceItem[] = [
    ...collectAlertEvidence(alert),
    ...collectSeverityEvidence(severity),
    ...collectRunbookEvidence(runbooks),
    ...collectCorrelationEvidence(correlations),
  ];

  // Build lookup map by evidence ID
  const items = allItems.reduce<Readonly<Record<string, EvidenceItem>>>(
    (acc, item) => ({ ...acc, [item.id]: item }),
    {}
  );

  // Compute scores
  const confidence = computeConfidence(alert, runbooks, correlations);
  const completeness = computeCompleteness(alert, runbooks, correlations);

  return {
    items,
    confidence,
    completeness,
    collectedAt: new Date().toISOString(),
  };
};

/**
 * Fallback Summary Generator
 *
 * Template-based summary generator used as a kill-switch when AI
 * validation fails. Produces a valid IncidentSummaryResponse from
 * the evidence catalog using pure string interpolation -- no LLM involved.
 *
 * Pure function -- no I/O, no side effects, fully deterministic.
 *
 * @module services/fallbackSummary
 */

import { truncateText } from "@kenchi/shared";
import type { EvidenceCatalog } from "../types/evidenceTypes.js";
import type { NormalizedAlert } from "../types/incidentTypes.js";
import type { RunbookMatch } from "../types/runbookTypes.js";
import type { SeverityScore } from "../types/severityTypes.js";
import type {
  FallbackSummaryInput,
  IncidentSummaryResponse,
  SuggestedAction,
} from "../types/summaryTypes.js";

// ==================== Helpers ====================

const capitalize = (text: string): string =>
  text.length > 0 ? text.charAt(0).toUpperCase() + text.slice(1) : text;

/**
 * Collects evidence IDs referenced in the fallback summary.
 */
const collectFallbackCitations = (
  catalog: EvidenceCatalog,
  runbooks: readonly RunbookMatch[]
): readonly string[] => {
  const baseIds = ["ALT-title", "ALT-source", "ALT-severity", "SEV-label", "SEV-total"];

  const optionalIds = [
    "ALT-serviceName",
    "ALT-environment",
    "ALT-description",
    "ALT-metrics",
  ].filter((id) => catalog.items[id] !== undefined);

  const runbookIds = runbooks.map((_, idx) => `RB-${idx}`);

  return [
    ...baseIds.filter((id) => catalog.items[id] !== undefined),
    ...optionalIds,
    ...runbookIds,
  ];
};

// ==================== Summary Builders ====================

/**
 * Builds the headline from alert and severity data.
 */
const buildHeadline = (alert: NormalizedAlert, severity: SeverityScore): string => {
  const { label } = severity;
  const { serviceName, environment, title } = alert;
  const svc = serviceName ?? "unknown service";
  const env = environment ?? "unknown environment";
  return truncateText(`${capitalize(label)} alert on ${svc} in ${env}: ${title}`, 200);
};

/**
 * Builds the root cause summary from alert description and severity factors.
 */
const buildRootCauseSummary = (alert: NormalizedAlert, severity: SeverityScore): string => {
  const { description, title } = alert;
  const descExcerpt = description ? truncateText(description, 300) : title;

  const topFactors = severity.factors
    .filter(({ score }) => score > 0)
    .slice(0, 3)
    .map(({ name, reason }) => `${name}: ${reason}`)
    .join(". ");

  const factorSuffix = topFactors ? ` Contributing factors: ${topFactors}.` : "";
  return truncateText(`Alert triggered: ${descExcerpt}.${factorSuffix}`, 1000);
};

/**
 * Builds the impact assessment from alert metadata.
 */
const buildImpactAssessment = (alert: NormalizedAlert, severity: SeverityScore): string => {
  const { serviceName, environment, severity: sourceSev } = alert;
  const { label, total } = severity;
  const svc = serviceName ?? "unknown service";
  const env = environment ?? "unknown environment";
  return truncateText(
    `${capitalize(label)} severity (score: ${total}/100) affecting ${svc} in ${env}. Source severity: ${sourceSev}.`,
    500
  );
};

/**
 * Builds suggested actions based on available evidence.
 */
const buildFallbackActions = (
  alert: NormalizedAlert,
  severity: SeverityScore,
  runbooks: readonly RunbookMatch[]
): readonly SuggestedAction[] => {
  const { label } = severity;
  const isHighSeverity = label === "critical" || label === "high";

  // Always: investigate the alert
  const investigateAction: SuggestedAction = {
    action: `Investigate the ${alert.title} alert on ${alert.serviceName ?? "the affected service"}`,
    reasoning: `Alert received from ${alert.source} with ${label} computed severity (SEV-label, ALT-title)`,
    priority: isHighSeverity ? "immediate" : "short_term",
  };

  // If runbooks matched, suggest following them
  const { length: runbookCount } = runbooks;
  const runbookAction: SuggestedAction | null =
    runbookCount > 0
      ? {
          action: `Follow runbook: ${truncateText(runbooks[0].title, 200)}`,
          reasoning: `Matched runbook with similarity ${runbooks[0].similarity.toFixed(3)} (RB-0)`,
          priority: "immediate",
        }
      : null;

  // If critical, suggest escalation
  const escalateAction: SuggestedAction | null =
    label === "critical"
      ? {
          action: "Escalate to on-call engineering lead",
          reasoning: `Critical severity computed (SEV-label, SEV-total: ${severity.total})`,
          priority: "immediate",
        }
      : null;

  return [
    investigateAction,
    ...(runbookAction ? [runbookAction] : []),
    ...(escalateAction ? [escalateAction] : []),
  ];
};

// ==================== Public API ====================

/**
 * Generates a template-based incident summary without any LLM involvement.
 *
 * Used as a kill-switch when AI output fails validation. Always produces
 * a valid IncidentSummaryResponse from the evidence catalog.
 *
 * Pure function -- no I/O, no side effects, fully deterministic.
 *
 * @param input - Alert, severity, runbooks, and evidence catalog
 * @returns A valid IncidentSummaryResponse with summarySource "fallback"
 */
export const generateFallbackSummary = (input: FallbackSummaryInput): IncidentSummaryResponse => {
  const { alert, severity, runbooks, evidenceCatalog } = input;

  return {
    headline: buildHeadline(alert, severity),
    rootCauseSummary: buildRootCauseSummary(alert, severity),
    impactAssessment: buildImpactAssessment(alert, severity),
    suggestedActions: buildFallbackActions(alert, severity, runbooks),
    evidencesCited: collectFallbackCitations(evidenceCatalog, runbooks),
    summarySource: "fallback",
  };
};
